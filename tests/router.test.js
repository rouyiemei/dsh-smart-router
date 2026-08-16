import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SmartRouterAdapter, createStats, lastUserMessage, blocksText, failureChunk } from '../lib/router.js'
import { DEFAULTS } from '../lib/schema.js'

/** A settings object: schema defaults overridden per test. */
function settings(overrides = {}) {
  return { ...DEFAULTS, ...overrides }
}

/** A fake ctx exposing just what resolveChain touches. */
function fakeCtx(defaultSelection) {
  const service = defaultSelection === undefined
    ? undefined
    : { currentSelection: () => defaultSelection }
  return {
    get: (name) => (name === 'agentDefaultModel' ? service : undefined),
    llm: {
      prepareCall: async () => { throw new Error('unused') },
    },
  }
}

function adapter(overrides, defaultSelection) {
  const router = new SmartRouterAdapter(fakeCtx(defaultSelection), () => settings(overrides))
  return router
}

/** Build a stream options object with a last user message. */
function optionsFor(text, { withImage = false } = {}) {
  const content = withImage
    ? [
        { type: 'text', text },
        { type: 'image', attachment: { id: 'sha256:abc', mediaType: 'image/png' } },
      ]
    : [{ type: 'text', text }]
  return {
    provider: 'smart-router',
    model: 'smart',
    messages: [
      { role: 'user', content, source: { kind: 'user' } },
    ],
    signal: undefined,
  }
}

test('', async () => {
  const router = adapter({
    visionProvider: 'zhipu-vision',
    visionModel: 'glm-4v-flash',
    easyProvider: 'deepseek-official',
    easyModel: 'deepseek-chat',
  })
  const resolved = await router.resolveChain(optionsFor('看看这张图', { withImage: true }))
  assert.equal(resolved.kind, 'vision')
  assert.equal(resolved.hasImage, true)
  assert.equal(resolved.chain[0].provider, 'zhipu-vision')
  assert.equal(resolved.chain[0].model, 'glm-4v-flash')
})

test('', async () => {
  const router = adapter({
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
    normalProvider: 'deepseek-official',
    normalModel: 'deepseek-chat',
  })
  const resolved = await router.resolveChain(optionsFor('重构整个 service 层，涉及 a.ts b.ts c.ts 三处架构调整'))
  assert.equal(resolved.level, 'hard')
  assert.equal(resolved.chain[0].provider, 'deepseek-official')
  assert.equal(resolved.chain[0].model, 'deepseek-v4-pro')
  // ladder: normal tier second
  assert.equal(resolved.chain[1].model, 'deepseek-chat')
})

test('', async () => {
  const router = adapter(
    { easyProvider: 'deepseek-official', easyModel: 'deepseek-chat' },
    { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  )
  const resolved = await router.resolveChain(optionsFor('修复这个 bug'))
  assert.equal(resolved.level, 'normal')
  assert.deepEqual(resolved.chain.map((c) => c.model), ['deepseek-chat', 'deepseek-v4-pro'])
})

test('', async () => {
  const router = adapter({}, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
  const resolved = await router.resolveChain(optionsFor('你好'))
  assert.equal(resolved.chain.length, 1)
  assert.equal(resolved.chain[0].provider, 'deepseek-official')
  assert.equal(resolved.chain[0].model, 'deepseek-v4-pro')
})

test('', async () => {
  const router = adapter({ enabled: false })
  const resolved = await router.resolveChain(optionsFor('hi'))
  assert.equal(resolved.kind, 'disabled')
})

test('', async () => {
  const router = adapter({}, { provider: 'smart-router', model: 'smart' })
  const resolved = await router.resolveChain(optionsFor('hi'))
  assert.equal(resolved.chain.length, 0)
  assert.equal(resolved.kind, 'text')
})

test('', async () => {
  const router = adapter({
    hardProvider: 'smart-router',
    hardModel: 'smart',
    normalProvider: 'deepseek-official',
    normalModel: 'deepseek-chat',
  })
  const resolved = await router.resolveChain(optionsFor('重构 service 层，涉及 a.ts b.ts c.ts 三处架构调整'))
  assert.ok(resolved.chain.every((c) => c.provider !== 'smart-router'))
  assert.equal(resolved.chain[0].provider, 'deepseek-official')
  assert.equal(resolved.chain[0].model, 'deepseek-chat')
})

test('', async () => {
  const router = adapter({
    visionProvider: 'smart-router',
    visionModel: 'smart',
    visionFallbacks: [{ provider: 'smart-router', model: 'smart' }],
  }, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
  const resolved = await router.resolveChain(optionsFor('看图', { withImage: true }))
  assert.ok(resolved.chain.every((c) => c.provider !== 'smart-router'))
  assert.equal(resolved.chain.length, 1)
  assert.equal(resolved.chain[0].model, 'deepseek-v4-pro')
})

test('', async () => {
  const router = adapter({
    visionProvider: 'ovh-vision',
    visionModel: 'Qwen2.5-VL-72B-Instruct',
    visionFallbacks: [{ provider: 'zhipu-vision', model: 'glm-4v-flash' }],
  }, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
  const resolved = await router.resolveChain(optionsFor('看图', { withImage: true }))
  assert.deepEqual(resolved.chain.map((c) => `${c.provider}/${c.model}`), [
    'ovh-vision/Qwen2.5-VL-72B-Instruct',
    'zhipu-vision/glm-4v-flash',
    'deepseek-official/deepseek-v4-pro',
  ])
})

test('', async () => {
  const router = adapter({
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
    normalProvider: 'deepseek-official',
    normalModel: 'deepseek-v4-pro',
  })
  const resolved = await router.resolveChain(optionsFor('修复这个 bug'))
  const keys = resolved.chain.map((c) => `${c.provider}/${c.model}`)
  assert.equal(new Set(keys).size, keys.length)
})

test('', async () => {
  const messages = [
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
    { role: 'user', content: [{ type: 'text', text: 'first' }], source: { kind: 'user' } },
    { role: 'user', content: [{ type: 'text', text: 'second' }], source: { kind: 'user' } },
  ]
  assert.equal(blocksText(lastUserMessage(messages).content), 'second')
  assert.equal(lastUserMessage([]), undefined)
  assert.equal(lastUserMessage(undefined), undefined)
})

test('', async () => {
  const chunk = failureChunk('boom', 'NO_ROUTE')
  assert.equal(chunk.type, 'finish')
  assert.equal(chunk.reason.kind, 'error')
  assert.equal(chunk.reason.failure.code, 'NO_ROUTE')
  assert.equal(chunk.reason.failure.message, 'boom')
})

test('', async () => {
  const stats = createStats()
  stats.record('hard')
  stats.record('vision')
  stats.record('error')
  const snapshot = stats.snapshot()
  assert.equal(snapshot.hard, 1)
  assert.equal(snapshot.vision, 1)
  assert.equal(snapshot.error, 1)
  assert.equal(snapshot.normal, 0)
})

test('stats: recordError keeps a bounded ring of recent failures', () => {
  const stats = createStats()
  for (let i = 0; i < 12; i += 1) stats.recordError(`p${i}/m${i}`, `err ${i}`)
  const snapshot = stats.snapshot()
  assert.equal(snapshot.errors.length, 8)
  assert.equal(snapshot.errors[0].target, 'p4/m4') // oldest kept
  assert.equal(snapshot.errors[7].target, 'p11/m11') // newest
  assert.ok(snapshot.errors[0].at)
})

// ---------- stream() integration with a fake llm service ----------

/**
 * A fake llm service recording prepareCall configs and streaming chunks back.
 * `defaultsByKey` simulates adapters that materialize a default
 * reasoningEffort/maxTokens during prepareCall. The prepared stream mimics
 * the real `callConfigEquals` guard: a forwarded request whose config fields
 * differ from the resolved config throws INVALID_PREPARED_CALL, exactly like
 * dsh-llm does.
 */
function fakeLlm(streamsByKey, failPrepare = [], defaultsByKey = {}) {
  const calls = []
  const llm = {
    calls,
    async prepareCall(config, signal) {
      calls.push({ config, signal })
      const key = `${config.provider}/${config.model}`
      if (failPrepare.includes(key)) throw new Error(`prepare ${key} failed`)
      const defaults = defaultsByKey[key] ?? {}
      const resolvedConfig = {
        provider: config.provider,
        model: config.model,
        ...(config.reasoningEffort !== undefined
          ? { reasoningEffort: config.reasoningEffort }
          : defaults.reasoningEffort !== undefined
            ? { reasoningEffort: defaults.reasoningEffort }
            : {}),
        ...(config.maxTokens !== undefined
          ? { maxTokens: config.maxTokens }
          : defaults.maxTokens !== undefined
            ? { maxTokens: defaults.maxTokens }
            : {}),
      }
      const chunks = streamsByKey[key] ?? [{ type: 'text-delta', index: 0, text: '?' }]
      return {
        config: resolvedConfig,
        async *stream(forwarded) {
          const eq = (a, b) => a.provider === b.provider && a.model === b.model &&
            a.reasoningEffort === b.reasoningEffort && a.maxTokens === b.maxTokens
          if (!eq(forwarded, resolvedConfig)) {
            throw new Error('INVALID_PREPARED_CALL: prepared LLM call config changed before adapter dispatch')
          }
          yield { type: 'text-delta', index: 0, text: `[${forwarded.provider}/${forwarded.model}]` }
          for (const chunk of chunks) yield chunk
        },
      }
    },
  }
  return llm
}

function collect(stream) {
  return (async () => {
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    return chunks
  })()
}

test('stream: delegates text request to the classified tier and passes chunks through', async () => {
  const llm = fakeLlm({ 'deepseek-official/deepseek-v4-pro': [] })
  const ctx = {
    get: () => undefined,
    llm,
    logger: { info: () => {} },
  }
  const router = new SmartRouterAdapter(ctx, () => settings({
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
  }))
  const chunks = await collect(router.stream(optionsFor('重构 service 层，涉及 a.ts b.ts c.ts 三处架构调整')))
  assert.equal(llm.calls.length, 1)
  assert.deepEqual(llm.calls[0].config, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
  assert.equal(chunks[0].type, 'text-delta')
  assert.equal(chunks[0].text, '[deepseek-official/deepseek-v4-pro]')
})

test('stream: strips inherited reasoningEffort and applies the tier effort', async () => {
  const llm = fakeLlm({ 'deepseek-official/deepseek-v4-pro': [] })
  const ctx = { get: () => undefined, llm, logger: { info: () => {} } }
  const router = new SmartRouterAdapter(ctx, () => settings({
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
    hardEffort: 'max',
  }))
  const options = optionsFor('重构')
  options.reasoningEffort = 'high' // inherited from the smart model selection
  await collect(router.stream(options))
  assert.deepEqual(llm.calls[0].config, {
    provider: 'deepseek-official',
    model: 'deepseek-v4-pro',
    reasoningEffort: 'max',
  })
})

test('stream: vision request delegates to the vision tier', async () => {
  const llm = fakeLlm({ 'ovh-vision/Qwen2.5-VL-72B-Instruct': [] })
  const ctx = { get: () => undefined, llm, logger: { info: () => {} } }
  const router = new SmartRouterAdapter(ctx, () => settings({
    visionProvider: 'ovh-vision',
    visionModel: 'Qwen2.5-VL-72B-Instruct',
  }))
  await collect(router.stream(optionsFor('看图', { withImage: true })))
  assert.equal(llm.calls.length, 1)
  assert.deepEqual(llm.calls[0].config, {
    provider: 'ovh-vision',
    model: 'Qwen2.5-VL-72B-Instruct',
  })
})

test('stream: falls back to the next route when prepareCall fails', async () => {
  const llm = fakeLlm(
    { 'deepseek-official/deepseek-chat': [] },
    ['deepseek-official/deepseek-v4-pro'],
  )
  const ctx = { get: () => undefined, llm, logger: { info: () => {} } }
  const router = new SmartRouterAdapter(ctx, () => settings({
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
    normalProvider: 'deepseek-official',
    normalModel: 'deepseek-chat',
  }))
  const chunks = await collect(router.stream(optionsFor('重构 service 层，涉及 a.ts b.ts c.ts 三处架构调整')))
  assert.equal(llm.calls.length, 2)
  assert.equal(chunks[0].text, '[deepseek-official/deepseek-chat]')
})

test('stream: all routes failing yields an error finish chunk (never hangs)', async () => {
  const llm = fakeLlm({}, ['deepseek-official/deepseek-v4-pro'])
  const ctx = { get: () => undefined, llm, logger: { info: () => {} } }
  const router = new SmartRouterAdapter(ctx, () => settings({
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
  }))
  const chunks = await collect(router.stream(optionsFor('重构 service 层')))
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].type, 'finish')
  assert.equal(chunks[0].reason.kind, 'error')
  assert.equal(chunks[0].reason.failure.code, 'ROUTE_FAILED')
})

test('stream: disabled passes through to the session default', async () => {
  const llm = fakeLlm({ 'deepseek-official/deepseek-v4-pro': [] })
  const ctx = {
    get: (name) => (name === 'agentDefaultModel'
      ? { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }) }
      : undefined),
    llm,
    logger: { info: () => {} },
  }
  const router = new SmartRouterAdapter(ctx, () => settings({ enabled: false }))
  const chunks = await collect(router.stream(optionsFor('hi')))
  assert.equal(llm.calls.length, 1)
  assert.deepEqual(llm.calls[0].config, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
  assert.equal(chunks[0].text, '[deepseek-official/deepseek-v4-pro]')
})

test('stream: inherited maxTokens is not forwarded; prepared defaults are mirrored (no INVALID_PREPARED_CALL)', async () => {
  // The smart seat may carry maxTokens/reasoningEffort, and the target
  // adapter may materialize its own defaults — the forwarded request must
  // mirror prepared.config exactly.
  const llm = fakeLlm(
    { 'deepseek-official/deepseek-v4-pro': [] },
    [],
    { 'deepseek-official/deepseek-v4-pro': { reasoningEffort: 'high', maxTokens: 8192 } },
  )
  const ctx = { get: () => undefined, llm, logger: { info: () => {} } }
  const router = new SmartRouterAdapter(ctx, () => settings({
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
  }))
  const options = optionsFor('重构 service 层，涉及 a.ts b.ts c.ts 三处架构调整')
  options.maxTokens = 4096 // inherited from the smart model seat
  options.reasoningEffort = 'off' // inherited too
  const chunks = await collect(router.stream(options))
  assert.equal(chunks[0].text, '[deepseek-official/deepseek-v4-pro]')
  // prepareCall config stays minimal (no inherited maxTokens/effort)
  assert.deepEqual(llm.calls[0].config, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
})

test('stream: tier effort overrides inherited effort and passes the prepared guard', async () => {
  const llm = fakeLlm(
    { 'deepseek-official/deepseek-v4-pro': [] },
    [],
    { 'deepseek-official/deepseek-v4-pro': { maxTokens: 8192 } },
  )
  const ctx = { get: () => undefined, llm, logger: { info: () => {} } }
  const router = new SmartRouterAdapter(ctx, () => settings({
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
    hardEffort: 'max',
  }))
  const options = optionsFor('重构 service 层，涉及 a.ts b.ts c.ts 三处架构调整')
  options.reasoningEffort = 'high' // inherited; tier effort must win
  const chunks = await collect(router.stream(options))
  assert.equal(chunks[0].text, '[deepseek-official/deepseek-v4-pro]')
  assert.deepEqual(llm.calls[0].config, {
    provider: 'deepseek-official',
    model: 'deepseek-v4-pro',
    reasoningEffort: 'max',
  })
})

test('stream: llm classifier uses prepared.config fields (adapter default effort tolerated)', async () => {
  const llm = fakeLlm(
    { 'deepseek-official/deepseek-chat': [{ type: 'text-delta', index: 0, text: '{"level": "hard", "reason": "refactor"}' }] },
    [],
    { 'deepseek-official/deepseek-chat': { reasoningEffort: 'high' } },
  )
  const ctx = { get: () => undefined, llm, logger: { info: () => {} } }
  const router = new SmartRouterAdapter(ctx, () => settings({
    classifier: 'llm',
    easyProvider: 'deepseek-official',
    easyModel: 'deepseek-chat',
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
  }))
  const chunks = await collect(router.stream(optionsFor('随便聊两句')))
  // classifier call succeeded (no INVALID_PREPARED_CALL) and routed to hard
  assert.equal(llm.calls.length, 2)
  assert.equal(chunks[0].text, '[deepseek-official/deepseek-v4-pro]')
})

test('stream: terminal error chunks from the delegated adapter are recorded for diagnostics', async () => {
  const errorChunk = {
    type: 'finish',
    reason: { kind: 'error', failure: { code: 'QUOTA', message: 'provider quota exceeded' } },
  }
  const llm = fakeLlm({ 'deepseek-official/deepseek-v4-pro': [errorChunk] })
  const stats = createStats()
  const ctx = { get: () => undefined, llm, logger: { info: () => {} } }
  const router = new SmartRouterAdapter(ctx, () => settings({
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
  }), { stats })
  const chunks = await collect(router.stream(optionsFor('重构 service 层，涉及 a.ts b.ts c.ts 三处架构调整')))
  // the error chunk passes through unchanged (after the fake's text-delta prefix)
  assert.equal(chunks.at(-1).type, 'finish')
  assert.equal(chunks.at(-1).reason.failure.code, 'QUOTA')
  // and it lands in the stats ring for the settings card
  assert.equal(stats.snapshot().errors.length, 1)
  assert.equal(stats.snapshot().errors[0].target, 'deepseek-official/deepseek-v4-pro')
  assert.match(stats.snapshot().errors[0].message, /quota exceeded/)
})
