import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seedVisionProviders } from '../lib/router.js'
import { SEEDED_VISION_PROVIDERS } from '../lib/schema.js'

/** Fake settings service recording updates. */
function fakeSettings(initial) {
  const section = structuredClone(initial)
  const updates = []
  return {
    section,
    updates,
    get(ns) {
      assert.equal(ns, 'llm-pi-ai')
      return section
    },
    async update(ns, patch) {
      assert.equal(ns, 'llm-pi-ai')
      updates.push(structuredClone(patch))
      for (const [key, value] of Object.entries(patch.providers ?? {})) {
        section.providers[key] = value
      }
    },
  }
}

test('seedVisionProviders: seeds missing providers only, once', async () => {
  const settings = fakeSettings({ providers: {} })
  const ctx = { get: (name) => (name === 'settings' ? settings : undefined) }

  await seedVisionProviders(ctx)
  assert.deepEqual(Object.keys(settings.section.providers).sort(), ['ovh-vision', 'zhipu-vision'])
  assert.equal(settings.updates.length, 1)
  const patch = settings.updates[0]
  assert.deepEqual(Object.keys(patch.providers).sort(), ['ovh-vision', 'zhipu-vision'])

  // second run: idempotent, no update
  await seedVisionProviders(ctx)
  assert.equal(settings.updates.length, 1)
})

test('seedVisionProviders: never touches existing providers', async () => {
  const existing = { providers: { 'my-route': { api: 'openai-completions', baseURL: 'https://x' } } }
  const settings = fakeSettings(existing)
  const ctx = { get: (name) => (name === 'settings' ? settings : undefined) }

  await seedVisionProviders(ctx)
  assert.ok(settings.section.providers['my-route'])
  assert.deepEqual(Object.keys(settings.section.providers).sort(), ['my-route', 'ovh-vision', 'zhipu-vision'])
})

test('seedVisionProviders: user-configured vision route blocks the seed', async () => {
  const settings = fakeSettings({ providers: { 'ovh-vision': { displayName: 'user version' } } })
  const ctx = { get: (name) => (name === 'settings' ? settings : undefined) }

  await seedVisionProviders(ctx)
  assert.equal(settings.section.providers['ovh-vision'].displayName, 'user version')
  // only zhipu was missing
  assert.equal(settings.updates.length, 1)
  assert.deepEqual(Object.keys(settings.updates[0].providers), ['zhipu-vision'])
})

test('seedVisionProviders: absent settings service skips silently', async () => {
  const ctx = { get: () => undefined }
  await seedVisionProviders(ctx) // must not throw
})

test('seedVisionProviders: update failure is contained (logged, not thrown)', async () => {
  const settings = {
    get: () => ({ providers: {} }),
    async update() {
      throw new Error('read-only provider')
    },
  }
  const ctx = {
    get: (name) => (name === 'settings' ? settings : undefined),
    logger: { warn: () => {} },
  }
  await seedVisionProviders(ctx) // must not throw
  assert.ok(SEEDED_VISION_PROVIDERS['ovh-vision'])
})
