/**
 * dsh-smart-router client bundle: the "Smart Router" settings section.
 *
 * Hand-written `window.__ModuleLoader__` bundle (no build step): registers a
 * `settings.section` slot whose page reads the live model catalog and the
 * resolved configuration from the host (`/smart-router/api/*`) and writes
 * changes back through the same API. The host-side settings service is used
 * directly instead of the client settings wire, because the host only
 * exposes allow-listed namespaces to configuration clients.
 */
window.__ModuleLoader__.load({
  id: 'dsh-smart-router',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')
    const {
      createElement: h,
      Fragment,
      useEffect,
      useMemo,
      useState,
    } = react

    const NS = 'dsh-smart-router'
    const TIERS = [
      { key: 'hard', labelKey: 'tier.hard', hintKey: 'tier.hard.hint' },
      { key: 'normal', labelKey: 'tier.normal', hintKey: 'tier.normal.hint' },
      { key: 'easy', labelKey: 'tier.easy', hintKey: 'tier.easy.hint' },
    ]
    const VISION = { key: 'vision', labelKey: 'tier.vision', hintKey: 'tier.vision.hint' }

    // ---------- locale ----------
    const zh = {
      nav: '智能路由',
      intro:
        '把虚拟模型「Smart Router（自动路由）」选为会话模型后，每次请求都会自动分类：' +
        '图片/截图 → 视觉档；其余按难度 → 困难/一般/简单档。各档模型从「设置 → 模型」已配置的模型中选取。',
      sameVendor:
        '提示：建议三个难度档选择同一供应商的同一系列模型（如同一家的 pro/flash 版），' +
        '前缀缓存命中率更高、成本更低。',
      enable: '启用路由',
      'enable.hint': '关闭后请求直接走默认模型（会话当前模型）。',
      classifier: '分类方式',
      'classifier.heuristic': '启发式（零成本，默认）',
      'classifier.llm': 'LLM 分类（更准，多一次小模型调用）',
      'classifier.llm.hint': 'LLM 分类默认复用「简单任务」档的模型，也可在下方单独指定。',
      'section.tiers': '各档模型',
      'section.fallback': '默认回退',
      'fallback.hint': '留空 = 使用会话当前默认模型。档位缺失时按 困难→一般→简单→默认 回退。',
      'section.llm': 'LLM 分类器（可选）',
      'llm.hint': '留空 = 复用「简单任务」档模型。',
      'tier.hard': '困难任务',
      'tier.hard.hint': '架构设计、跨文件重构、疑难 bug 根因、性能/安全专项',
      'tier.normal': '一般任务',
      'tier.normal.hint': '单文件改动、常规功能实现、写测试、普通调试',
      'tier.easy': '简单任务',
      'tier.easy.hint': '闲聊、确认、收尾、简短翻译/解释、读单文件',
      'tier.vision': '视觉任务',
      'tier.vision.hint': '图片/截图/OCR 等含图请求自动走此档',
      provider: '提供方',
      model: '模型',
      effort: '思考档位',
      'effort.hint':
        '对话框模型选择器上的思考强度（Off / High）是总开关：' +
        '选择 Off 则所有难度等级都不使用思考模式；' +
        '选择 High 则各难度等级使用上方配置的推理强度。',
      reset: '重置',
      'reset.all': '恢复默认设置',
      'vision.ok': '支持图片',
      'vision.unknown': '能力未知',
      'vision.novision': '不支持图片',
      'vision.ovhBadge': '免费 · 匿名免 Key · 限流',
      'vision.rowHint': '视觉模型只做辅助：图片会先交给它返回结构化证据（摘要/OCR/版面），' +
        '替换回文本后再由三级难度模型作答；默认内置免费匿名视觉模型（OVHcloud，限流 2 次/分/IP）。',
      'vision.mode': '视觉处理方式',
      'vision.mode.replace': '结构化替换（默认）',
      'vision.mode.route': '整段路由到视觉模型',
      'vision.mode.hint': '「结构化替换」：图块 → 视觉模型结构化证据 → 替换为文本 → 难度分类；' +
        '「整段路由」：带图请求整体交给视觉模型（旧行为）。',
      inactive: '未激活',
      stats: '路由统计',
      'stats.hard': '困难',
      'stats.normal': '一般',
      'stats.easy': '简单',
      'stats.vision': '视觉档',
      'stats.visionBridge': '视觉分析',
      'stats.error': '错误',
      defaultModel: '当前默认模型',
      empty: '（未配置）',
      loading: '加载中…',
      loadError: '加载失败',
      saveError: '保存失败',
      saving: '保存中…',
      readOnly: '当前设置为只读，无法保存',
    }
    const en = {
      nav: 'Smart Router',
      intro:
        'Pick the virtual model "Smart Router (auto route)" as your session model: ' +
        'every request is classified automatically — images/screenshots go to the vision tier, ' +
        'everything else is routed by difficulty (hard / normal / easy). Tier models are picked ' +
        'from the models you already configured under Settings → Models.',
      sameVendor:
        'Tip: pick hard/normal/easy models from the same vendor family (e.g. pro and flash ' +
        'editions of one series) to maximize prefix-cache hit rates and lower cost.',
      enable: 'Enable routing',
      'enable.hint': 'When off, requests go to the session default model unchanged.',
      classifier: 'Classifier',
      'classifier.heuristic': 'Heuristic (zero cost, default)',
      'classifier.llm': 'LLM classifier (more accurate, costs one small call)',
      'classifier.llm.hint': 'The LLM classifier reuses the easy-tier model by default; you can pin one below.',
      'section.tiers': 'Tier models',
      'section.fallback': 'Default fallback',
      'fallback.hint': 'Empty = the session default model. Missing tiers fall back hard → normal → easy → default.',
      'section.llm': 'LLM classifier (optional)',
      'llm.hint': 'Empty = reuse the easy-tier model.',
      'tier.hard': 'Hard tasks',
      'tier.hard.hint': 'Architecture, cross-file refactoring, tricky root-cause analysis, performance/security',
      'tier.normal': 'Normal tasks',
      'tier.normal.hint': 'Single-file changes, small features, writing tests, routine debugging',
      'tier.easy': 'Easy tasks',
      'tier.easy.hint': 'Small talk, confirmations, wrap-ups, short translation/explanation, reading one file',
      'tier.vision': 'Vision tasks',
      'tier.vision.hint': 'Requests with images (screenshots, OCR, …) go here automatically',
      provider: 'Provider',
      model: 'Model',
      effort: 'Effort',
      'effort.hint':
        'The reasoning effort in the chat input model selector (Off / High) is the master switch: ' +
        'Off disables reasoning for all tiers; ' +
        'High lets each tier use the effort configured above.',
      reset: 'Reset',
      'reset.all': 'Restore defaults',
      'vision.ok': 'Vision',
      'vision.unknown': 'Capability unknown',
      'vision.novision': 'No image input',
      'vision.ovhBadge': 'Free · anonymous · rate-limited',
      'vision.rowHint':
        'The vision model is only an assistant: images are analyzed into structured evidence ' +
        '(summary/OCR/layout) which replaces the image block as text, then the difficulty tiers answer. ' +
        'Default is a built-in free anonymous vision model (OVHcloud, ~2 req/min/IP).',
      'vision.mode': 'Vision handling',
      'vision.mode.replace': 'Structured replace (default)',
      'vision.mode.route': 'Route whole turn to vision model',
      'vision.mode.hint': '"Structured replace": image → structured evidence from the vision model → ' +
        'replaced by text → difficulty classification. "Route": image requests go to the vision tier whole (legacy).',
      inactive: 'inactive',
      stats: 'Route stats',
      'stats.hard': 'Hard',
      'stats.normal': 'Normal',
      'stats.easy': 'Easy',
      'stats.vision': 'Vision tier',
      'stats.visionBridge': 'Vision analyses',
      'stats.error': 'Errors',
      defaultModel: 'Current default model',
      empty: '(not set)',
      loading: 'Loading…',
      loadError: 'Load failed',
      saveError: 'Save failed',
      saving: 'Saving…',
      readOnly: 'Settings are read-only; changes cannot be saved',
    }

    // ---------- minimal dark-friendly styling (alpha-based, theme-agnostic) ----------
    const S = {
      card: {
        border: '1px solid rgba(128,128,128,.3)',
        borderRadius: 8,
        padding: '10px 12px',
        margin: '10px 0',
        background: 'rgba(128,128,128,.07)',
      },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        margin: '8px 0',
      },
      label: {
        minWidth: 96,
        fontWeight: 600,
        fontSize: 13,
      },
      hint: {
        fontSize: 12,
        opacity: 0.65,
        margin: '4px 0',
        lineHeight: 1.5,
      },
      select: {
        background: 'transparent',
        color: 'inherit',
        border: '1px solid rgba(128,128,128,.4)',
        borderRadius: 6,
        padding: '4px 6px',
        fontSize: 13,
        maxWidth: 220,
      },
      badge: {
        fontSize: 11,
        padding: '1px 6px',
        borderRadius: 999,
        border: '1px solid rgba(128,128,128,.4)',
        marginLeft: 6,
        whiteSpace: 'nowrap',
      },
      badgeGreen: {
        border: '1px solid rgba(64,200,120,.6)',
        color: 'rgba(64,200,120,1)',
      },
      badgeYellow: {
        border: '1px solid rgba(220,180,60,.6)',
        color: 'rgba(220,180,60,1)',
      },
      button: {
        background: 'transparent',
        color: 'inherit',
        border: '1px solid rgba(128,128,128,.4)',
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 12,
        cursor: 'pointer',
      },
      title: { fontSize: 13, fontWeight: 700, margin: '14px 0 2px' },
      stat: { fontSize: 12, opacity: 0.75, marginRight: 10 },
      switchRow: { display: 'flex', alignItems: 'center', gap: 8 },
    }

    // ---------- helpers ----------
    const fieldPath = (tierKey, field) => `${tierKey}${field[0].toUpperCase()}${field.slice(1)}`
    const tierValue = (snapshot, tierKey) => ({
      provider: String(snapshot?.[fieldPath(tierKey, 'provider')] ?? ''),
      model: String(snapshot?.[fieldPath(tierKey, 'model')] ?? ''),
      effort: String(snapshot?.[fieldPath(tierKey, 'effort')] ?? ''),
    })
    const labelOf = (groups, provider) => {
      const group = groups.find((g) => g.id === provider)
      return group !== undefined ? group.name : provider
    }
    /** Provider groups the pickers may offer (never the router itself). */
    const pickableGroups = (groups) => (groups ?? []).filter((g) => g.id !== 'smart-router')
    /**
     * Clear the model field when the new provider no longer lists the current
     * model (or the provider was cleared), so the UI never shows a provider
     * "not set" next to a stale model name.
     */
    const syncModel = (groups, provider, currentModel, onClear) => {
      if (currentModel === '') return
      const group = groups.find((g) => g.id === provider)
      const stillValid = provider !== '' &&
        (group?.models ?? []).some((m) => m.id === currentModel)
      if (!stillValid) onClear()
    }

    function Option({ value, label }) {
      // Native dropdown lists do not reliably follow `color-scheme` inside
      // this page (dark theme still rendered a white list with light text).
      // Pin option colors explicitly so every option stays readable on any
      // theme: white list, dark text, dark hover highlight.
      return h('option', {
        value,
        style: { color: '#1b1b1f', background: '#ffffff' },
      }, label)
    }

    /** Provider + model + effort selects for one tier row. */
    function RouteRow({ t, tier, value, catalog, onChange, visionOnly, colorScheme, disabled }) {
      const groups = pickableGroups(catalog.groups)
      const providerOptions = useMemo(() => {
        const list = groups
          .map((g) => ({ id: g.id, name: g.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
        if (value.provider !== '' && !list.some((p) => p.id === value.provider)) {
          list.push({ id: value.provider, name: `${value.provider} (${t('inactive')})` })
        }
        return list
      }, [groups, value.provider, t])

      const chosen = groups.find((g) => g.id === value.provider)
      const modelOptions = useMemo(() => {
        const models = chosen !== undefined ? (chosen.models ?? []) : []
        const list = models
          .filter((m) => !visionOnly || m.vision !== false)
          .map((m) => ({ id: m.id, name: m.name, vision: m.vision }))
        // Only keep a stored model id that is not in the catalog when the
        // provider is actually set; with no provider the model select shows
        // "not set" instead of a stale model name. A vision row must never
        // surface a model that explicitly rejects image input.
        if (value.provider !== '' && value.model !== '' && !list.some((m) => m.id === value.model)) {
          const known = models.find((m) => m.id === value.model)
          if (!visionOnly || known?.vision !== false) {
            list.push({ id: value.model, name: value.model, vision: null })
          }
        }
        return list
      }, [chosen, value.provider, value.model, visionOnly])

      const chosenModel = modelOptions.find((m) => m.id === value.model)
      const effortOptions = useMemo(() => {
        const efforts = chosen !== undefined
          ? chosen.models?.find((m) => m.id === value.model)?.reasoningEfforts
          : undefined
        return Array.isArray(efforts) ? efforts : []
      }, [chosen, value.model])

      const selectStyle = { ...S.select, colorScheme }
      const visionBadge = (m) => {
        if (m === undefined) return null
        if (m.vision === true) {
          const free = value.provider === 'ovh-vision' || value.provider === 'zhipu-vision'
          return h('span', {
            style: { ...S.badge, ...(free ? S.badgeGreen : {}) },
          }, free ? t('vision.ovhBadge') : `✓ ${t('vision.ok')}`)
        }
        if (m.vision === null) return h('span', { style: { ...S.badge, ...S.badgeYellow } }, t('vision.unknown'))
        return h('span', { style: { ...S.badge } }, t('vision.novision'))
      }

      return h('div', { style: { margin: '8px 0' } },
        h('div', { style: S.row },
          h('div', { style: { ...S.label, minWidth: 72 } }, t(tier.labelKey)),
          h('select', {
            style: selectStyle,
            value: value.provider,
            disabled,
            onChange: (e) => {
              const next = e.target.value
              onChange('provider', next)
              // Keep model/effort only when the chosen provider still lists
              // the current model; otherwise reset them to "not set" so a
              // provider/model pair never shows a stale combination.
              const group = groups.find((g) => g.id === next)
              const stillValid = next !== '' &&
                value.model !== '' &&
                (group?.models ?? []).some((m) => m.id === value.model)
              if (!stillValid) {
                if (value.model !== '') onChange('model', '')
                if (value.effort !== '') onChange('effort', '')
              }
            },
          },
            h(Option, { value: '', label: t('empty') }),
            providerOptions.map((p) => h(Option, { key: p.id, value: p.id, label: p.name })),
          ),
          h('select', {
            style: { ...selectStyle, maxWidth: 260 },
            value: value.provider === '' ? '' : value.model,
            disabled: disabled || value.provider === '',
            onChange: (e) => onChange('model', e.target.value),
          },
            h(Option, { value: '', label: t('empty') }),
            modelOptions.map((m) => h(Option, { key: m.id, value: m.id, label: m.name })),
          ),
          visionBadge(chosenModel),
          effortOptions.length > 0
            ? h('select', {
                style: { ...selectStyle, maxWidth: 120 },
                value: value.effort,
                disabled: disabled || value.model === '',
                onChange: (e) => onChange('effort', e.target.value),
              },
                h(Option, { value: '', label: `${t('effort')}: ${t('empty')}` }),
                effortOptions.map((e) => h(Option, { key: e.id, value: e.id, label: String(e.name ?? e.id) })),
              )
            : null,
          h('button', {
            style: S.button,
            disabled,
            onClick: () => {
              onChange('provider', '')
              onChange('model', '')
              onChange('effort', '')
            },
          }, t('reset')),
        ),
        tier.hintKey !== undefined
          ? h('div', { style: { ...S.hint, marginLeft: 80 } }, t(tier.hintKey))
          : null,
      )
    }

    /** The settings section body; all data flows through the host API. */
    function SmartRouterSection({ t, colorScheme }) {
      const [config, setConfig] = useState(null)
      const [writable, setWritable] = useState(true)
      const [catalog, setCatalog] = useState({ groups: [], failures: [], defaultModel: null })
      const [catalogError, setCatalogError] = useState(false)
      const [stats, setStats] = useState(null)
      const [saving, setSaving] = useState(false)
      const [saveFailed, setSaveFailed] = useState(false)

      const loadConfig = async () => {
        try {
          const res = await fetch('/smart-router/api/config')
          if (!res.ok) throw new Error(String(res.status))
          const data = await res.json()
          setConfig(data.config ?? data.defaults ?? {})
          setWritable(data.writable !== false)
        } catch { /* keep last config */ }
      }

      useEffect(() => {
        let alive = true
        const load = async () => {
          try {
            const res = await fetch('/smart-router/api/models')
            if (!res.ok) throw new Error(String(res.status))
            const data = await res.json()
            if (alive) {
              setCatalog(data)
              setCatalogError(false)
            }
          } catch {
            if (alive) setCatalogError(true)
          }
          try {
            const res = await fetch('/smart-router/api/stats')
            if (res.ok) {
              const data = await res.json()
              if (alive) setStats(data.stats ?? null)
            }
          } catch { /* stats are optional */ }
        }
        void loadConfig()
        void load()
        const timer = setInterval(() => {
          void (async () => {
            try {
              const res = await fetch('/smart-router/api/stats')
              if (res.ok) {
                const data = await res.json()
                if (alive) setStats(data.stats ?? null)
              }
            } catch { /* ignore */ }
          })()
        }, 5000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [])

      const write = async (field, fieldValue) => {
        if (!writable) return
        setSaving(true)
        setSaveFailed(false)
        try {
          const res = await fetch('/smart-router/api/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ field, value: fieldValue === '' ? null : fieldValue }),
          })
          const data = await res.json()
          if (!res.ok || data.ok !== true) {
            setSaveFailed(true)
            return
          }
          if (data.config !== undefined && data.config !== null) setConfig(data.config)
        } catch {
          setSaveFailed(true)
        } finally {
          setSaving(false)
        }
      }
      const tierOnChange = (tierKey) => (field, fieldValue) => {
        void write(fieldPath(tierKey, field), fieldValue)
      }

      const value = config ?? {}
      const fallbackValue = {
        provider: String(value.fallbackProvider ?? ''),
        model: String(value.fallbackModel ?? ''),
      }
      const llmValue = {
        provider: String(value.llmClassifierProvider ?? ''),
        model: String(value.llmClassifierModel ?? ''),
      }
      const defaultModel = catalog.defaultModel
      const groups = pickableGroups(catalog.groups)
      // Provider select for the standalone rows (vision / fallback / llm
      // classifier). `onModelReset` runs when the provider changes so a stale
      // model name never survives a provider switch.
      const groupSelect = (current, onProviderChange, onModelReset) => h('select', {
        style: { ...S.select, colorScheme },
        value: current,
        disabled: !writable,
        onChange: (e) => {
          const next = e.target.value
          onProviderChange(next)
          onModelReset(next)
        },
      },
        h(Option, { value: '', label: t('empty') }),
        groups
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((g) => h(Option, { key: g.id, value: g.id, label: g.name })),
      )
      const modelSelect = (provider, current, onChange, visionOnly) => h('select', {
        style: { ...S.select, maxWidth: 260, colorScheme },
        value: provider === '' ? '' : current,
        disabled: !writable || provider === '',
        onChange: (e) => onChange(e.target.value),
      },
        h(Option, { value: '', label: t('empty') }),
        (() => {
          const group = groups.find((g) => g.id === provider)
          let models = (group?.models ?? []).filter((m) => !visionOnly || m.vision !== false)
          if (provider !== '' && current !== '' && !models.some((m) => m.id === current)) {
            const known = (group?.models ?? []).find((m) => m.id === current)
            if (!visionOnly || known?.vision !== false) {
              models = models.concat({ id: current, name: current, vision: null })
            }
          }
          return models.map((m) => h(Option, { key: m.id, value: m.id, label: m.name }))
        })(),
      )

      const resetAll = () => {
        const fields = []
        for (const tier of [...TIERS, VISION]) {
          fields.push(fieldPath(tier.key, 'provider'), fieldPath(tier.key, 'model'), fieldPath(tier.key, 'effort'))
        }
        fields.push('fallbackProvider', 'fallbackModel', 'llmClassifierProvider', 'llmClassifierModel', 'visionFallbacks')
        fields.push('classifier')
        for (const field of fields) void write(field, '')
      }

      return h(Fragment, {},
        h('div', { style: S.hint }, t('intro')),
        h('div', { style: S.card },
          h('div', { style: S.switchRow },
            h('input', {
              type: 'checkbox',
              checked: value.enabled !== false,
              disabled: !writable,
              onChange: (e) => void write('enabled', e.target.checked),
            }),
            h('label', { style: { fontSize: 13, fontWeight: 600 } }, t('enable')),
          ),
          h('div', { style: S.hint }, t('enable.hint')),
        ),
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('div', { style: { ...S.label, minWidth: 72 } }, t('classifier')),
            h('select', {
              style: { ...S.select, colorScheme },
              value: String(value.classifier ?? 'heuristic'),
              disabled: !writable,
              onChange: (e) => void write('classifier', e.target.value),
            },
              h(Option, { value: 'heuristic', label: t('classifier.heuristic') }),
              h(Option, { value: 'llm', label: t('classifier.llm') }),
            ),
          ),
          h('div', { style: S.hint }, t('classifier.llm.hint')),
        ),
        h('div', { style: S.title }, t('section.tiers')),
        h('div', { style: S.card },
          h('div', { style: S.hint }, t('sameVendor')),
          h('div', { style: S.hint }, t('effort.hint')),
          TIERS.map((tier) => h(RouteRow, {
            key: tier.key,
            t,
            tier,
            value: tierValue(value, tier.key),
            catalog,
            onChange: tierOnChange(tier.key),
            visionOnly: false,
            colorScheme,
            disabled: !writable,
          })),
        ),
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('div', { style: { ...S.label, minWidth: 72 } }, t('tier.vision')),
            groupSelect(
              String(value.visionProvider ?? ''),
              (v) => void write('visionProvider', v),
              (next) => syncModel(groups, next, String(value.visionModel ?? ''), () => void write('visionModel', '')),
            ),
            modelSelect(String(value.visionProvider ?? ''), String(value.visionModel ?? ''), (v) => void write('visionModel', v), true),
            (() => {
              const group = groups.find((g) => g.id === value.visionProvider)
              const model = (group?.models ?? []).find((m) => m.id === value.visionModel)
              if (model === undefined) return null
              const free = value.visionProvider === 'ovh-vision' || value.visionProvider === 'zhipu-vision'
              if (model.vision === true) {
                return h('span', {
                  style: { ...S.badge, ...(free ? S.badgeGreen : {}) },
                }, free ? t('vision.ovhBadge') : `✓ ${t('vision.ok')}`)
              }
              if (model.vision === null) return h('span', { style: { ...S.badge, ...S.badgeYellow } }, t('vision.unknown'))
              return h('span', { style: { ...S.badge } }, t('vision.novision'))
            })(),
            h('button', {
              style: S.button,
              disabled: !writable,
              onClick: () => {
                void write('visionProvider', '')
                void write('visionModel', '')
              },
            }, t('reset')),
          ),
          h('div', { style: S.row },
            h('div', { style: { ...S.label, minWidth: 72 } }, t('vision.mode')),
            h('select', {
              style: { ...S.select, colorScheme },
              value: String(value.visionMode ?? 'replace'),
              disabled: !writable,
              onChange: (e) => void write('visionMode', e.target.value),
            },
              h(Option, { value: 'replace', label: t('vision.mode.replace') }),
              h(Option, { value: 'route', label: t('vision.mode.route') }),
            ),
          ),
          h('div', { style: S.hint }, t('vision.mode.hint')),
          h('div', { style: S.hint }, t('vision.rowHint')),
        ),
        h('div', { style: S.title }, t('section.fallback')),
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('div', { style: { ...S.label, minWidth: 72 } }, '↳'),
            groupSelect(
              fallbackValue.provider,
              (v) => void write('fallbackProvider', v),
              (next) => syncModel(groups, next, fallbackValue.model, () => void write('fallbackModel', '')),
            ),
            modelSelect(fallbackValue.provider, fallbackValue.model, (v) => void write('fallbackModel', v), false),
          ),
          h('div', { style: S.hint },
            defaultModel !== null && defaultModel.provider
              ? `${t('defaultModel')}: ${labelOf(groups, defaultModel.provider)} / ${defaultModel.model}`
              : null,
            h('span', {}, ` — ${t('fallback.hint')}`),
          ),
        ),
        String(value.classifier) === 'llm'
          ? h(Fragment, {},
              h('div', { style: S.title }, t('section.llm')),
              h('div', { style: S.card },
                h('div', { style: S.row },
                  groupSelect(
                    llmValue.provider,
                    (v) => void write('llmClassifierProvider', v),
                    (next) => syncModel(groups, next, llmValue.model, () => void write('llmClassifierModel', '')),
                  ),
                  modelSelect(llmValue.provider, llmValue.model, (v) => void write('llmClassifierModel', v), false),
                ),
                h('div', { style: S.hint }, t('llm.hint')),
              ),
            )
          : null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 } },
          h('button', { style: S.button, disabled: !writable || saving, onClick: resetAll }, t('reset.all')),
          saving ? h('span', { style: S.stat }, t('saving')) : null,
          saveFailed ? h('span', { style: { ...S.stat, color: 'rgba(220,80,80,1)' } }, t('saveError')) : null,
          !writable ? h('span', { style: { ...S.stat, color: 'rgba(220,180,60,1)' } }, t('readOnly')) : null,
          stats !== null
            ? h(Fragment, {},
                h('span', { style: S.stat }, `${t('stats')}:`),
                h('span', { style: S.stat }, `${t('stats.hard')} ${stats.hard ?? 0}`),
                h('span', { style: S.stat }, `${t('stats.normal')} ${stats.normal ?? 0}`),
                h('span', { style: S.stat }, `${t('stats.easy')} ${stats.easy ?? 0}`),
                h('span', { style: S.stat }, `${t('stats.vision')} ${stats.vision ?? 0}`),
                h('span', { style: S.stat }, `${t('stats.visionBridge')} ${stats.visionBridge ?? 0}`),
                h('span', { style: S.stat }, `${t('stats.error')} ${stats.error ?? 0}`),
              )
            : null,
          catalogError ? h('span', { style: { ...S.stat, color: 'rgba(220,80,80,1)' } }, t('loadError')) : null,
        ),
      )
    }

    // ---------- plugin entry ----------
    const name = 'dsh-smart-router'

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-smart-router: locale')
      const t = ctx.locale.bind(NS)
      // Native select dropdowns inherit the page color scheme; force the
      // dropdown list to match the active theme so options stay readable
      // (dark theme → dark list with light text).
      let colorScheme = 'dark'
      try {
        const theme = ctx.theme?.getTheme?.()
        if (theme === 'light') colorScheme = 'light'
      } catch { /* keep default */ }
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'smart-router',
        order: 42,
        label: () => t('nav'),
        locale: NS,
        inject: () => ({ t }),
      }, () => h(SmartRouterSection, {
        t,
        colorScheme,
      })))
    }

    exports.name = name
    exports.inject = ['slots', 'locale', 'theme']
    exports.apply = apply
    return module.exports
  },
})
