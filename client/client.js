/**
 * dsh-smart-router client bundle: the "Smart Router" settings section.
 *
 * Hand-written `window.__ModuleLoader__` bundle (no build step): registers a
 * `settings.section` slot whose page reads the live model catalog from the
 * host (`/smart-router/api/models`) and writes tier selections through the
 * settings scope. Every change applies immediately (host-side hot config).
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
      useSyncExternalStore,
    } = react

    const NAMESPACE = 'smart-router'
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
      provider: '提供方',
      model: '模型',
      effort: '思考档位',
      reset: '重置',
      'reset.all': '恢复默认设置',
      'vision.free': '免费',
      'vision.anonymous': '匿名免 Key',
      'vision.ok': '支持图片',
      'vision.unknown': '能力未知',
      'vision.novision': '不支持图片',
      'vision.ovhBadge': '免费 · 匿名免 Key · 限流',
      'vision.rowHint': '默认使用内置免费匿名视觉模型（OVHcloud，限流 2 次/分/IP）；' +
        '可换成自己配置的任何视觉模型（仅列出声明支持图片输入的模型）。',
      inactive: '未激活',
      stats: '路由统计',
      'stats.hard': '困难',
      'stats.normal': '一般',
      'stats.easy': '简单',
      'stats.vision': '视觉',
      'stats.fallback': '回退',
      'stats.error': '错误',
      defaultModel: '当前默认模型',
      empty: '（未配置）',
      loading: '加载中…',
      loadError: '目录加载失败',
      saveError: '保存失败',
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
      provider: 'Provider',
      model: 'Model',
      effort: 'Effort',
      reset: 'Reset',
      'reset.all': 'Restore defaults',
      'vision.free': 'Free',
      'vision.anonymous': 'Anonymous, no key',
      'vision.ok': 'Vision',
      'vision.unknown': 'Capability unknown',
      'vision.novision': 'No image input',
      'vision.ovhBadge': 'Free · anonymous · rate-limited',
      'vision.rowHint':
        'Default is a built-in free anonymous vision model (OVHcloud, ~2 req/min/IP). ' +
        'Replace it with any vision-capable model you configured (only models declaring image input are listed).',
      inactive: 'inactive',
      stats: 'Route stats',
      'stats.hard': 'Hard',
      'stats.normal': 'Normal',
      'stats.easy': 'Easy',
      'stats.vision': 'Vision',
      'stats.fallback': 'Fallback',
      'stats.error': 'Errors',
      defaultModel: 'Current default model',
      empty: '(not set)',
      loading: 'Loading…',
      loadError: 'Catalog load failed',
      saveError: 'Save failed',
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

    function Option({ value, label }) {
      return h('option', { value }, label)
    }

    /** Provider + model + effort selects for one tier row. */
    function RouteRow({ t, tier, value, catalog, onChange, visionOnly }) {
      const groups = catalog.groups ?? []
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
        if (value.model !== '' && !list.some((m) => m.id === value.model)) {
          list.push({ id: value.model, name: value.model, vision: null })
        }
        return list
      }, [chosen, value.model, visionOnly])

      const chosenModel = modelOptions.find((m) => m.id === value.model)
      const effortOptions = useMemo(() => {
        const efforts = chosen !== undefined
          ? chosen.models?.find((m) => m.id === value.model)?.reasoningEfforts
          : undefined
        return Array.isArray(efforts) ? efforts : []
      }, [chosen, value.model])

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
            style: S.select,
            value: value.provider,
            onChange: (e) => onChange('provider', e.target.value),
          },
            h(Option, { value: '', label: t('empty') }),
            providerOptions.map((p) => h(Option, { key: p.id, value: p.id, label: p.name })),
          ),
          h('select', {
            style: { ...S.select, maxWidth: 260 },
            value: value.model,
            disabled: value.provider === '',
            onChange: (e) => onChange('model', e.target.value),
          },
            h(Option, { value: '', label: t('empty') }),
            modelOptions.map((m) => h(Option, { key: m.id, value: m.id, label: m.name })),
          ),
          visionBadge(chosenModel),
          effortOptions.length > 0
            ? h('select', {
                style: { ...S.select, maxWidth: 120 },
                value: value.effort,
                disabled: value.model === '',
                onChange: (e) => onChange('effort', e.target.value),
              },
                h(Option, { value: '', label: `${t('effort')}: ${t('empty')}` }),
                effortOptions.map((e) => h(Option, { key: e.id, value: e.id, label: String(e.name ?? e.id) })),
              )
            : null,
          h('button', {
            style: S.button,
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

    /** The settings section body. */
    function SmartRouterSection({ t, scope }) {
      const snapshot = useSyncExternalStore(
        (cb) => scope.subscribe(cb),
        () => scope.getSnapshot(),
      )
      const value = snapshot.value ?? {}
      const [catalog, setCatalog] = useState({ groups: [], failures: [], defaultModel: null })
      const [catalogError, setCatalogError] = useState(false)
      const [stats, setStats] = useState(null)
      const [saving, setSaving] = useState(false)

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

      const write = (field, fieldValue) => {
        setSaving(true)
        const promise = fieldValue === ''
          ? scope.unset(field)
          : scope.set(field, fieldValue)
        promise.then(() => setSaving(false), () => setSaving(false))
      }
      const tierOnChange = (tierKey) => (field, fieldValue) => {
        write(fieldPath(tierKey, field), fieldValue)
      }

      const fallbackValue = {
        provider: String(value.fallbackProvider ?? ''),
        model: String(value.fallbackModel ?? ''),
      }
      const llmValue = {
        provider: String(value.llmClassifierProvider ?? ''),
        model: String(value.llmClassifierModel ?? ''),
      }
      const defaultModel = catalog.defaultModel

      const resetAll = () => {
        const fields = []
        for (const tier of [...TIERS, VISION]) {
          fields.push(fieldPath(tier.key, 'provider'), fieldPath(tier.key, 'model'), fieldPath(tier.key, 'effort'))
        }
        fields.push('fallbackProvider', 'fallbackModel', 'llmClassifierProvider', 'llmClassifierModel', 'visionFallbacks')
        for (const field of fields) scope.unset(field)
        write('classifier', 'heuristic')
      }

      return h(Fragment, {},
        h('div', { style: S.hint }, t('intro')),
        h('div', { style: S.card },
          h('div', { style: S.switchRow },
            h('input', {
              type: 'checkbox',
              checked: value.enabled !== false,
              onChange: (e) => write('enabled', e.target.checked),
            }),
            h('label', { style: { fontSize: 13, fontWeight: 600 } }, t('enable')),
          ),
          h('div', { style: S.hint }, t('enable.hint')),
        ),
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('div', { style: { ...S.label, minWidth: 72 } }, t('classifier')),
            h('select', {
              style: S.select,
              value: String(value.classifier ?? 'heuristic'),
              onChange: (e) => write('classifier', e.target.value),
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
          TIERS.map((tier) => h(RouteRow, {
            key: tier.key,
            t,
            tier,
            value: tierValue(value, tier.key),
            catalog,
            onChange: tierOnChange(tier.key),
            visionOnly: false,
          })),
        ),
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('div', { style: { ...S.label, minWidth: 72 } }, t('tier.vision')),
            h('select', {
              style: S.select,
              value: String(value.visionProvider ?? ''),
              onChange: (e) => write('visionProvider', e.target.value),
            },
              h(Option, { value: '', label: t('empty') }),
              (catalog.groups ?? [])
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((g) => h(Option, { key: g.id, value: g.id, label: g.name })),
            ),
            h('select', {
              style: { ...S.select, maxWidth: 280 },
              value: String(value.visionModel ?? ''),
              disabled: String(value.visionProvider ?? '') === '',
              onChange: (e) => write('visionModel', e.target.value),
            },
              h(Option, { value: '', label: t('empty') }),
              (() => {
                const group = (catalog.groups ?? []).find((g) => g.id === value.visionProvider)
                const models = (group?.models ?? []).filter((m) => m.vision !== false)
                if (value.visionModel !== '' && !models.some((m) => m.id === value.visionModel)) {
                  models.push({ id: value.visionModel, name: value.visionModel, vision: null })
                }
                return models.map((m) => h(Option, { key: m.id, value: m.id, label: m.name }))
              })(),
            ),
            (() => {
              const group = (catalog.groups ?? []).find((g) => g.id === value.visionProvider)
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
              onClick: () => {
                write('visionProvider', '')
                write('visionModel', '')
              },
            }, t('reset')),
          ),
          h('div', { style: S.hint }, t('vision.rowHint')),
        ),
        h('div', { style: S.title }, t('section.fallback')),
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('div', { style: { ...S.label, minWidth: 72 } }, '↳'),
            h('select', {
              style: S.select,
              value: fallbackValue.provider,
              onChange: (e) => write('fallbackProvider', e.target.value),
            },
              h(Option, { value: '', label: t('empty') }),
              (catalog.groups ?? [])
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((g) => h(Option, { key: g.id, value: g.id, label: g.name })),
            ),
            h('select', {
              style: { ...S.select, maxWidth: 260 },
              value: fallbackValue.model,
              disabled: fallbackValue.provider === '',
              onChange: (e) => write('fallbackModel', e.target.value),
            },
              h(Option, { value: '', label: t('empty') }),
              (() => {
                const group = (catalog.groups ?? []).find((g) => g.id === fallbackValue.provider)
                return (group?.models ?? []).map((m) => h(Option, { key: m.id, value: m.id, label: m.name }))
              })(),
            ),
          ),
          h('div', { style: S.hint },
            defaultModel !== null
              ? `${t('defaultModel')}: ${labelOf(catalog.groups, defaultModel.provider)} / ${defaultModel.model}`
              : null,
            h('span', {}, ` — ${t('fallback.hint')}`),
          ),
        ),
        String(value.classifier) === 'llm'
          ? h(Fragment, {},
              h('div', { style: S.title }, t('section.llm')),
              h('div', { style: S.card },
                h('div', { style: S.row },
                  h('select', {
                    style: S.select,
                    value: llmValue.provider,
                    onChange: (e) => write('llmClassifierProvider', e.target.value),
                  },
                    h(Option, { value: '', label: t('empty') }),
                    (catalog.groups ?? [])
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((g) => h(Option, { key: g.id, value: g.id, label: g.name })),
                  ),
                  h('select', {
                    style: { ...S.select, maxWidth: 260 },
                    value: llmValue.model,
                    disabled: llmValue.provider === '',
                    onChange: (e) => write('llmClassifierModel', e.target.value),
                  },
                    h(Option, { value: '', label: t('empty') }),
                    (() => {
                      const group = (catalog.groups ?? []).find((g) => g.id === llmValue.provider)
                      return (group?.models ?? []).map((m) => h(Option, { key: m.id, value: m.id, label: m.name }))
                    })(),
                  ),
                ),
                h('div', { style: S.hint }, t('llm.hint')),
              ),
            )
          : null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 } },
          h('button', { style: S.button, onClick: resetAll }, t('reset.all')),
          saving ? h('span', { style: S.stat }, t('saveError')) : null,
          stats !== null
            ? h(Fragment, {},
                h('span', { style: S.stat }, `${t('stats')}:`),
                h('span', { style: S.stat }, `${t('stats.hard')} ${stats.hard ?? 0}`),
                h('span', { style: S.stat }, `${t('stats.normal')} ${stats.normal ?? 0}`),
                h('span', { style: S.stat }, `${t('stats.easy')} ${stats.easy ?? 0}`),
                h('span', { style: S.stat }, `${t('stats.vision')} ${stats.vision ?? 0}`),
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
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'smart-router',
        order: 42,
        label: () => t('nav'),
        locale: NS,
        inject: () => ({ t }),
      }, () => h(SmartRouterSection, {
        t,
        scope: ctx.settingsScope.bind({ namespace: NAMESPACE }),
      })))
    }

    exports.name = name
    exports.inject = ['slots', 'locale', 'settingsScope']
    exports.apply = apply
    return module.exports
  },
})
