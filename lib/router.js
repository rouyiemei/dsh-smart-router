/**
 * Smart Router core: a virtual LLM provider that routes every request.
 *
 * Architecture (参考 llm-adaptive / dsh-vision-mix 的 adapter 级路由):
 * - 注册一个虚拟 provider `smart-router` + 模型 `smart`，模型声明
 *   `inputModalities: ['text', 'image']`，因此 DSH 的图片准入
 *   （MODEL_DOES_NOT_SUPPORT_IMAGES）在 preflight 阶段直接放行；
 * - `stream(options)` 在每次请求时：消息含图 → 视觉档；否则 → 难度分类
 *   （启发式默认 / LLM 可选）→ 对应档位模型；
 * - 转发统一走 `ctx.llm.prepareCall({provider, model}).stream(forwarded)`，
 *   透传 DSH 的流式 chunk 协议；档位缺失按阶梯回退，最后回退默认模型，
 *   全部失败才产出 error finish chunk（fail-open，绝不静默吞错）。
 */

import { LlmAdapter, contentHasImage } from '@deepseek-ai/dsh-llm'
import {
  DEFAULTS, MODEL, PROVIDER, SEEDED_VISION_PROVIDERS, TIER_ORDER,
  fallbackRoute, normalizeRoute, routeConfigured, tierRoute,
} from './schema.js'
import { CLASSIFIER_SYSTEM_PROMPT, classifierRoute, classifierUserPrompt, classifyDifficulty, parseClassifierReply } from './classifier.js'

/** In-memory route statistics, surfaced by the settings card. */
export function createStats() {
  const counts = { hard: 0, normal: 0, easy: 0, vision: 0, fallback: 0, error: 0 }
  const errors = []
  return {
    counts,
    record(kind) {
      if (kind in counts) counts[kind] += 1
    },
    /**
     * Record one route failure (prepare-time throw OR a terminal error chunk
     * the delegated adapter streamed back). Bounded ring buffer so the
     * settings card and the stats API can show the most recent failures.
     */
    recordError(target, message) {
      errors.push({
        at: new Date().toISOString(),
        target: String(target ?? ''),
        message: String(message ?? '').slice(0, 300),
      })
      if (errors.length > 8) errors.shift()
    },
    snapshot() {
      return { ...counts, errors: [...errors] }
    },
  }
}

/** Small bounded LRU-ish cache for LLM classification decisions. */
export function createDecisionCache(ttlMs = 120_000, maxEntries = 200) {
  const entries = new Map()
  return {
    get(key) {
      const hit = entries.get(key)
      if (hit === undefined) return undefined
      if (Date.now() - hit.at > ttlMs) {
        entries.delete(key)
        return undefined
      }
      return hit.value
    },
    set(key, value) {
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value)
      entries.set(key, { value, at: Date.now() })
    },
  }
}

/** Extract the latest user message from a request's message array. */
export function lastUserMessage(messages) {
  if (!Array.isArray(messages)) return undefined
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message && message.role === 'user' && Array.isArray(message.content)) return message
  }
  return undefined
}

/** Join the text blocks of a message content array. */
export function blocksText(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/** Stable cache key for one classification input. */
export function cacheKeyFor(text) {
  return String(text ?? '').slice(0, 120)
}

/** Error finish chunk in the DSH stream vocabulary (mirrors adapterFailureChunk). */
export function failureChunk(message, code = 'TRANSPORT', signal) {
  const failure = { message, code }
  return {
    type: 'finish',
    reason: signal && signal.aborted
      ? { kind: 'aborted', failure }
      : { kind: 'error', failure },
  }
}

/** The virtual router adapter. */
export class SmartRouterAdapter extends LlmAdapter {
  constructor(ctx, getSettings, options = {}) {
    super()
    this.ctx = ctx
    this.getSettings = getSettings
    this.stats = options.stats ?? createStats()
    this.cache = options.cache ?? createDecisionCache()
    this.log = options.log ?? ((...args) => ctx.logger?.info?.(...args))
  }

  providerInfo(provider) {
    return { id: provider, name: 'Smart Router（智能路由）' }
  }

  listModels(provider) {
    return Promise.resolve([
      {
        provider,
        id: MODEL,
        name: 'Smart Router（自动路由）',
        description: '三级难度（困难/一般/简单）+ 视觉任务自动路由，模型在「设置 → 智能路由」中配置',
        inputModalities: ['text', 'image'],
      },
    ])
  }

  resolveModel(provider, model, _signal) {
    return Promise.resolve({
      provider,
      id: model,
      name: 'Smart Router（自动路由）',
      description: '三级难度（困难/一般/简单）+ 视觉任务自动路由',
      inputModalities: ['text', 'image'],
      // Generic effort ids so a persisted reasoningEffort from an earlier
      // request never fails capability resolution; the router decides which
      // effort (if any) reaches the delegated tier model.
      reasoning: {
        efforts: [
          { id: 'off', name: 'Off', description: 'No extended reasoning' },
          { id: 'high', name: 'High', description: 'High reasoning effort' },
          { id: 'max', name: 'Max', description: 'Maximum reasoning effort' },
        ],
        defaultEffort: 'off',
      },
    })
  }

  /** Resolved settings (schema defaults + entry base + user section). */
  config() {
    return this.getSettings() ?? DEFAULTS
  }

  /** Build the ordered delegation chain for one request. */
  async resolveChain(options) {
    const settings = this.config()
    const messages = options.messages ?? []
    const last = lastUserMessage(messages)
    const text = last === undefined ? '' : blocksText(last.content)
    // The request carries the FULL conversation history, so a session that
    // ever received an image keeps image blocks in every later request.
    // Routing must treat that as a vision request too: a text-only tier model
    // would otherwise reject the whole history ("does not support image
    // input"), which is exactly the failure seen when a text message follows
    // an earlier image in the same session.
    const hasImage = Array.isArray(messages) && messages.some(
      (message) => Array.isArray(message?.content) && contentHasImage(message.content),
    )

    if (!settings.enabled) return { kind: 'disabled', hasImage }

    const defaultRoute = normalizeRoute(
      routeConfigured(fallbackRoute(settings))
        ? fallbackRoute(settings)
        : this.sessionDefaultRoute(),
    )
    /** Never route back into the router itself (would recurse forever). */
    const pushIfRoutable = (route, reason) => {
      const normalized = normalizeRoute(route)
      if (!routeConfigured(normalized)) return
      if (normalized.provider === PROVIDER) return
      if (chain.some((c) => c.provider === normalized.provider && c.model === normalized.model)) return
      chain.push({ ...normalized, reason })
    }
    const chain = []

    if (hasImage) {
      // vision: configured vision tier → explicit vision fallbacks → default
      pushIfRoutable(tierRoute(settings, 'vision'), 'vision tier')
      for (const fb of Array.isArray(settings.visionFallbacks) ? settings.visionFallbacks : []) {
        pushIfRoutable(fb, 'vision fallback')
      }
      pushIfRoutable(defaultRoute, 'default model')
      return { kind: 'vision', level: 'vision', chain, text, hasImage }
    }

    // text: classify difficulty → tier chain → default
    let level = 'normal'
    let cause = 'no text'
    if (text !== '') {
      if (String(settings.classifier) === 'llm') {
        // classifyWithLlm is async: awaiting here is what makes the LLM
        // classifier's level actually reach the chain (a missed await used to
        // leave `level` undefined and silently route every request to the
        // hard tier).
        const llm = await this.classifyWithLlm(text, options.signal)
        if (llm !== undefined) {
          level = llm.level
          cause = llm.reason || 'llm classifier'
        } else {
          const heuristic = classifyDifficulty(text)
          level = heuristic.level
          cause = 'llm classifier unavailable → heuristic'
        }
      } else {
        const heuristic = classifyDifficulty(text)
        level = heuristic.level
        cause = heuristic.reasons.join('; ')
      }
    }

    const requested = normalizeRoute(tierRoute(settings, level))
    pushIfRoutable(requested, `${level} tier`)
    for (const tier of TIER_ORDER) {
      if (tier === level) continue
      pushIfRoutable(tierRoute(settings, tier), `${tier} tier (fallback)`)
    }
    pushIfRoutable(defaultRoute, 'default model')
    return { kind: 'text', level, cause, chain, text, hasImage }
  }

  /** The session default model, when it is not the router itself. */
  sessionDefaultRoute() {
    try {
      const service = this.ctx.get?.('agentDefaultModel')
      const selection = service?.currentSelection?.()
      if (selection && selection.provider && selection.provider !== PROVIDER) {
        return { provider: selection.provider, model: selection.model, effort: '' }
      }
    } catch { /* service absent */ }
    return { provider: '', model: '', effort: '' }
  }

  /** LLM classification, cached; falls back to undefined (caller → heuristic). */
  async classifyWithLlm(text, signal) {
    const settings = this.config()
    const route = classifierRoute(settings)
    if (route === undefined) return undefined
    const key = cacheKeyFor(text)
    const cached = this.cache.get(key)
    if (cached !== undefined) return cached
    try {
      const prepared = await this.ctx.llm.prepareCall(
        { provider: route.provider, model: route.model, maxTokens: 200 },
        signal,
      )
      let raw = ''
      // Config fields must mirror prepared.config exactly (the target adapter
      // may materialize a default reasoningEffort, which `callConfigEquals`
      // would otherwise reject with INVALID_PREPARED_CALL).
      const forwarded = {
        provider: prepared.config.provider,
        model: prepared.config.model,
        messages: [
          {
            role: 'system',
            content: [{ type: 'text', text: CLASSIFIER_SYSTEM_PROMPT }],
            source: { kind: 'plugin', plugin: 'dsh-smart-router' },
          },
          {
            role: 'user',
            content: [{ type: 'text', text: classifierUserPrompt(text) }],
            source: { kind: 'plugin', plugin: 'dsh-smart-router' },
          },
        ],
        ...(prepared.config.reasoningEffort === undefined ? {} : { reasoningEffort: prepared.config.reasoningEffort }),
        ...(prepared.config.maxTokens === undefined ? {} : { maxTokens: prepared.config.maxTokens }),
        signal,
      }
      for await (const chunk of prepared.stream(forwarded)) {
        if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') raw += chunk.text
      }
      const parsed = parseClassifierReply(raw)
      if (parsed !== undefined) {
        this.cache.set(key, parsed)
        return parsed
      }
      return undefined
    } catch (error) {
      this.log(`smart-router: llm classifier failed (${route.provider}/${route.model}): ${String(error)}`)
      return undefined
    }
  }

  /** The router stream: classify → delegate along the chain. */
  async *stream(options) {
    const settings = this.config()
    const resolved = await this.resolveChain(options)
    let kind = resolved.kind
    if (resolved.kind === 'disabled') {
      const pass = this.sessionDefaultRoute()
      if (routeConfigured(pass)) {
        yield* this.delegate(options, { ...pass, reason: 'router disabled → default' })
        return
      }
      kind = 'error'
    }

    if (kind === 'error' || resolved.chain.length === 0) {
      this.stats.record('error')
      const message = resolved.kind === 'disabled'
        ? 'smart-router: disabled and no default model configured; pick a model in Settings → Smart Router or the model selector'
        : `smart-router: no model configured for ${resolved.level ?? 'this request'}; configure tiers in Settings → Smart Router`
      yield failureChunk(message, 'NO_ROUTE', options.signal)
      return
    }

    if (resolved.hasImage) this.stats.record('vision')
    else if (resolved.level) this.stats.record(resolved.level)

    let lastError
    for (const target of resolved.chain) {
      try {
        this.log(`smart-router: ${resolved.hasImage ? 'vision' : resolved.level ?? 'text'} → ${target.provider}/${target.model} (${target.reason})`)
        yield* this.delegate(options, target)
        return
      } catch (error) {
        lastError = error
        // Chunk-level failures are already recorded inside delegate (they
        // carry `routeFailure`); only record prepare-time throws here.
        if (!error?.routeFailure) {
          this.stats.recordError(`${target.provider}/${target.model}`, String(error))
        }
        this.log(`smart-router: route ${target.provider}/${target.model} failed: ${String(error)}`)
      }
    }
    this.stats.record('error')
    yield failureChunk(
      `smart-router: every route failed (${resolved.chain.map((t) => `${t.provider}/${t.model}`).join(', ')}): ${String(lastError)}`,
      'ROUTE_FAILED',
      options.signal,
    )
  }

  /**
   * Delegate one request to a concrete provider/model via the prepared-call
   * contract.
   *
   * The forwarded request's config fields MUST equal the config the adapter
   * resolved during `prepareCall` (provider/model/reasoningEffort/maxTokens/
   * temperature/stop are compared by `callConfigEquals`; a mismatch throws
   * `INVALID_PREPARED_CALL`). The original request may carry a maxTokens or a
   * reasoningEffort from the smart-model seat, and the target adapter may
   * materialize its own defaults — so the forwarded config is rebuilt from
   * `prepared.config` instead of copied from `options`.
   */
  async *delegate(options, target) {
    const { reasoningEffort: _e, maxTokens: _mt, temperature: _t, stop: _s, ...rest } = options
    const config = {
      provider: target.provider,
      model: target.model,
      ...(target.effort !== '' ? { reasoningEffort: target.effort } : {}),
    }
    const prepared = await this.ctx.llm.prepareCall(config, options.signal)
    const forwarded = {
      ...rest,
      provider: prepared.config.provider,
      model: prepared.config.model,
      ...(prepared.config.reasoningEffort === undefined ? {} : { reasoningEffort: prepared.config.reasoningEffort }),
      ...(prepared.config.maxTokens === undefined ? {} : { maxTokens: prepared.config.maxTokens }),
      ...(prepared.config.temperature === undefined ? {} : { temperature: prepared.config.temperature }),
      ...(prepared.config.stop === undefined ? {} : { stop: prepared.config.stop }),
    }
    // Terminal error chunks from the delegated adapter do NOT throw (the LLM
    // runtime converts them into finish/error chunks), so the chain fallback
    // can never catch them. When the adapter fails BEFORE producing any
    // output, convert the failure into a throw so the chain tries the next
    // route; once content has been produced, pass chunks through untouched
    // (falling back mid-stream would duplicate partial output).
    let produced = false
    for await (const chunk of prepared.stream(forwarded)) {
      if (chunk && chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
        this.stats.recordError(
          `${target.provider}/${target.model}`,
          chunk.reason.failure?.message ?? 'delegated stream failed',
        )
        if (!produced) {
          const failure = chunk.reason.failure
          throw Object.assign(
            new Error(`route ${target.provider}/${target.model} failed before any output: ${failure?.message ?? 'unknown'}`),
            { routeFailure: failure },
          )
        }
      }
      produced = true
      yield chunk
    }
  }
}

/**
 * Seed the free vision provider routes into the `llm-pi-ai` settings
 * namespace. Additive and idempotent: only missing provider keys are written,
 * existing user configuration is never touched. Best-effort — a deployment
 * without a settings service or without the pi-ai namespace skips silently.
 *
 * 参考 dsh-media-skills 的 zhipu-vision seed 模式。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export async function seedVisionProviders(ctx) {
  const settings = ctx.get('settings')
  if (settings === undefined) return
  try {
    const section = settings.get('llm-pi-ai')
    const providers =
      section !== null && typeof section === 'object' &&
      section.providers !== null && typeof section.providers === 'object'
        ? section.providers
        : {}
    const missing = {}
    for (const [name, seed] of Object.entries(SEEDED_VISION_PROVIDERS)) {
      if (providers[name] === undefined) missing[name] = seed
    }
    if (Object.keys(missing).length === 0) return
    await settings.update('llm-pi-ai', { providers: missing })
  } catch (error) {
    ctx.logger?.warn?.(`dsh-smart-router: free vision provider seeding skipped: ${String(error)}`)
  }
}
