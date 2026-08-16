/**
 * dsh-smart-router settings schema and defaults.
 *
 * The section is deliberately FLAT: the client settings scope (`SettingsScope`)
 * writes one-segment paths (`scope.set('hardProvider', …)`), and a flat YAML
 * section is easy to hand-edit:
 *
 * ```yaml
 * smart-router:
 *   enabled: true
 *   classifier: heuristic        # heuristic | llm
 *   hardProvider: deepseek-official
 *   hardModel: deepseek-v4-pro
 *   ...
 *   visionProvider: ovh-vision    # seeded free anonymous vision route
 *   visionModel: Qwen2.5-VL-72B-Instruct
 * ```
 *
 * An empty route (provider === '' or model === '') means "this tier is not
 * configured": the router falls back to the next tier, then to the default
 * model, and never fails the request silently.
 */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by this plugin. */
export const NAMESPACE = 'smart-router'

/** Provider route id of the virtual router. */
export const PROVIDER = 'smart-router'
/** Model id of the virtual router model. */
export const MODEL = 'smart'

/** A flat route triple: provider route id, model id, optional reasoning effort. */
const routeField = () => z.string().default('')

/** Defaults shared by the composition entry base layer and the schema. */
export const DEFAULTS = Object.freeze({
  enabled: true,
  classifier: 'heuristic', // 'heuristic' | 'llm'
  hardProvider: '',
  hardModel: '',
  hardEffort: '',
  normalProvider: '',
  normalModel: '',
  normalEffort: '',
  easyProvider: '',
  easyModel: '',
  easyEffort: '',
  visionProvider: 'ovh-vision',
  visionModel: 'Qwen2.5-VL-72B-Instruct',
  visionEffort: '',
  visionFallbacks: [],
  fallbackProvider: '',
  fallbackModel: '',
  llmClassifierProvider: '',
  llmClassifierModel: '',
  escalateOnError: true,
})

/** Settings schema for the `smart-router` namespace. */
export const SETTINGS_SCHEMA = z.object({
  enabled: z.boolean().default(true),
  classifier: z.string().default('heuristic'),
  hardProvider: routeField(),
  hardModel: routeField(),
  hardEffort: routeField(),
  normalProvider: routeField(),
  normalModel: routeField(),
  normalEffort: routeField(),
  easyProvider: routeField(),
  easyModel: routeField(),
  easyEffort: routeField(),
  visionProvider: routeField(),
  visionModel: routeField(),
  visionEffort: routeField(),
  visionFallbacks: z.array(z.object({
    provider: z.string().default(''),
    model: z.string().default(''),
  })).default([]),
  fallbackProvider: routeField(),
  fallbackModel: routeField(),
  llmClassifierProvider: routeField(),
  llmClassifierModel: routeField(),
  escalateOnError: z.boolean().default(true),
})

/** Tier names in routing-priority order (hard first). */
export const TIER_ORDER = ['hard', 'normal', 'easy']

/** Read one tier route triple out of a resolved settings object. */
export function tierRoute(settings, tier) {
  return {
    provider: String(settings[`${tier}Provider`] ?? ''),
    model: String(settings[`${tier}Model`] ?? ''),
    effort: String(settings[`${tier}Effort`] ?? ''),
  }
}

/** Read the explicit default route (settings-level fallback). */
export function fallbackRoute(settings) {
  return {
    provider: String(settings.fallbackProvider ?? ''),
    model: String(settings.fallbackModel ?? ''),
    effort: '',
  }
}

/** Whether a route triple names an actual provider+model. */
export function routeConfigured(route) {
  return typeof route.provider === 'string' && route.provider !== '' &&
    typeof route.model === 'string' && route.model !== ''
}

/** Normalize a route triple: trim and drop empty effort. */
export function normalizeRoute(route) {
  const provider = String(route?.provider ?? '').trim()
  const model = String(route?.model ?? '').trim()
  const effort = String(route?.effort ?? '').trim()
  if (provider === '' || model === '') return { provider: '', model: '', effort: '' }
  return { provider, model, effort }
}

/**
 * Free vision provider seeds written into the `llm-pi-ai` settings namespace
 * (additive, idempotent — see `seedVisionProviders`). Both routes are served
 * by the pi-ai adapter; the first is fully anonymous (no API key), the second
 * uses a free-tier Zhipu key the user supplies through Settings → Models.
 */
export const OVH_VISION_SEED = Object.freeze({
  displayName: 'OVHcloud 免费视觉（匿名）',
  api: 'openai-completions',
  baseURL: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
  models: [
    {
      id: 'Qwen2.5-VL-72B-Instruct',
      name: 'OVHcloud Qwen2.5-VL-72B-Instruct（免费匿名）',
      contextWindow: 128000,
      maxTokens: 8192,
      input: ['text', 'image'],
    },
  ],
})

export const ZHIPU_VISION_SEED = Object.freeze({
  apiKeyEnv: 'GLM_API_KEY',
  displayName: '智谱 GLM-4V-Flash（视觉 · 免费额度）',
  api: 'openai-completions',
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  models: [
    {
      id: 'glm-4v-flash',
      name: '智谱 GLM-4V-Flash',
      contextWindow: 16384,
      maxTokens: 4096,
      input: ['text', 'image'],
    },
  ],
})

/** Provider route ids of the seeded vision routes. */
export const SEEDED_VISION_PROVIDERS = Object.freeze({
  'ovh-vision': OVH_VISION_SEED,
  'zhipu-vision': ZHIPU_VISION_SEED,
})
