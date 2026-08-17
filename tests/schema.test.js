import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULTS, MODEL, NAMESPACE, OVH_VISION_SEED, PROVIDER, SEEDED_VISION_PROVIDERS,
  SETTINGS_SCHEMA, TIER_ORDER, ZHIPU_VISION_SEED, normalizeRoute, routeConfigured, tierRoute,
} from '../lib/schema.js'

test('namespace and provider ids are stable', () => {
  assert.equal(NAMESPACE, 'smart-router')
  assert.equal(PROVIDER, 'smart-router')
  assert.equal(MODEL, 'smart')
  assert.deepEqual(TIER_ORDER, ['hard', 'normal', 'easy'])
})

test('defaults: enabled, heuristic, seeded free vision route, replace mode', () => {
  assert.equal(DEFAULTS.enabled, true)
  assert.equal(DEFAULTS.classifier, 'heuristic')
  assert.equal(DEFAULTS.visionProvider, 'ovh-vision')
  assert.equal(DEFAULTS.visionModel, 'Qwen2.5-VL-72B-Instruct')
  assert.equal(DEFAULTS.visionMode, 'replace')
  assert.equal(DEFAULTS.visionCacheTtl, 3600)
  assert.deepEqual(DEFAULTS.visionFallbacks, [])
  assert.equal(DEFAULTS.hardProvider, '')
})

test('schema: resolves defaults through the section', () => {
  const resolved = SETTINGS_SCHEMA({})
  assert.equal(resolved.enabled, true)
  // schema-level defaults are empty routes; the seeded free vision route
  // lives in the entry base layer (DEFAULTS), which the settings service
  // folds in below the user section.
  assert.equal(resolved.visionProvider, '')
  assert.deepEqual(resolved.visionFallbacks, [])
})

test('schema: accepts a full user section', () => {
  const value = {
    enabled: false,
    classifier: 'llm',
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
    hardEffort: 'max',
    visionProvider: 'zhipu-vision',
    visionModel: 'glm-4v-flash',
    visionFallbacks: [{ provider: 'a', model: 'b' }],
  }
  const resolved = SETTINGS_SCHEMA(value)
  assert.equal(resolved.enabled, false)
  assert.equal(resolved.hardModel, 'deepseek-v4-pro')
  assert.equal(resolved.hardEffort, 'max')
  assert.equal(resolved.visionFallbacks[0].model, 'b')
})

test('tierRoute reads the flat triple', () => {
  const route = tierRoute({ hardProvider: 'p', hardModel: 'm', hardEffort: 'high' }, 'hard')
  assert.deepEqual(route, { provider: 'p', model: 'm', effort: 'high' })
})

test('routeConfigured / normalizeRoute', () => {
  assert.equal(routeConfigured({ provider: 'p', model: 'm', effort: '' }), true)
  assert.equal(routeConfigured({ provider: '', model: 'm', effort: '' }), false)
  assert.equal(routeConfigured({ provider: 'p', model: '', effort: '' }), false)
  assert.deepEqual(normalizeRoute({ provider: ' p ', model: ' m ', effort: '' }), {
    provider: 'p',
    model: 'm',
    effort: '',
  })
  assert.deepEqual(normalizeRoute({ provider: 'p', model: '', effort: 'high' }), {
    provider: '',
    model: '',
    effort: '',
  })
})

test('seeded vision providers: OVH anonymous + Zhipu free, both declare image input', () => {
  const ovh = SEEDED_VISION_PROVIDERS['ovh-vision']
  assert.equal(ovh, OVH_VISION_SEED)
  assert.equal(ovh.api, 'openai-completions')
  assert.equal(ovh.apiKeyEnv, undefined) // anonymous: no key
  assert.equal(ovh.baseURL, 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1')
  assert.ok(ovh.models[0].input.includes('image'))
  assert.ok(ovh.models[0].input.includes('text'))

  const zhipu = SEEDED_VISION_PROVIDERS['zhipu-vision']
  assert.equal(zhipu, ZHIPU_VISION_SEED)
  assert.equal(zhipu.apiKeyEnv, 'GLM_API_KEY')
  assert.equal(zhipu.baseURL, 'https://open.bigmodel.cn/api/paas/v4')
  assert.equal(zhipu.models[0].id, 'glm-4v-flash')
  assert.ok(zhipu.models[0].input.includes('image'))
})
