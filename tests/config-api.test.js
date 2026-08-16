import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installModelsApi } from '../lib/models-api.js'
import { DEFAULTS } from '../lib/schema.js'

/** Minimal Node http req/res fakes for the webServer handler. */
function fakeReq(method, path, body) {
  return {
    method,
    url: path,
    on(event, cb) {
      if (event === 'data' && body !== undefined) {
        const buf = Buffer.from(JSON.stringify(body), 'utf8')
        queueMicrotask(() => cb(buf))
        return this
      }
      if (event === 'end') {
        queueMicrotask(() => cb())
        return this
      }
      if (event === 'error') return this
      return this
    },
    destroy() {},
  }
}

function fakeRes() {
  const state = { status: 200, headers: {}, body: '' }
  return {
    state,
    writeHead(status, headers) {
      state.status = status
      state.headers = headers
      return this
    },
    end(text) {
      state.body = text
    },
  }
}

/** Fake settings service: section + recorded mutations. */
function fakeSettings(initialSection = {}) {
  const section = structuredClone(initialSection)
  const writes = []
  return {
    section,
    writes,
    writable: true,
    get(ns) {
      assert.equal(ns, 'smart-router')
      return { ...DEFAULTS, ...section }
    },
    async update(ns, patch) {
      assert.equal(ns, 'smart-router')
      writes.push({ kind: 'update', patch })
      Object.assign(section, patch)
    },
    async mutate(ns, ops) {
      assert.equal(ns, 'smart-router')
      writes.push({ kind: 'mutate', ops })
      for (const op of ops) {
        if (op.op === 'unset') delete section[op.path[0]]
      }
    },
  }
}

/** Invoke the handler and return the response state. */
async function invoke(handler, req, res) {
  await handler(req, res)
  return { ...res.state, json: res.state.body === '' ? undefined : JSON.parse(res.state.body) }
}

test('config GET returns resolved section with defaults', async () => {
  const settings = fakeSettings({ hardProvider: 'deepseek-official' })
  const ctx = { get: (name) => (name === 'settings' ? settings : undefined), llm: { listProviders: () => [], listConfigurableProviders: () => [] } }
  const captured = {}
  ctx.webServer = { register: ({ handler }) => { captured.handler = handler; return () => {} } }
  installModelsApi(ctx, () => ({ snapshot: () => ({}) }))
  const res = await invoke(captured.handler, fakeReq('GET', '/smart-router/api/config'), fakeRes())
  assert.equal(res.status, 200)
  assert.equal(res.json.config.hardProvider, 'deepseek-official')
  assert.equal(res.json.config.enabled, true)
  assert.ok(res.json.defaults)
  assert.equal(res.json.writable, true)
})

test('config POST writes a whitelisted field via settings.update', async () => {
  const settings = fakeSettings()
  const ctx = { get: (name) => (name === 'settings' ? settings : undefined), llm: { listProviders: () => [], listConfigurableProviders: () => [] } }
  const captured = {}
  ctx.webServer = { register: ({ handler }) => { captured.handler = handler; return () => {} } }
  installModelsApi(ctx, () => ({ snapshot: () => ({}) }))

  const res = await invoke(captured.handler, fakeReq('POST', '/smart-router/api/config', { field: 'hardProvider', value: 'deepseek-official' }), fakeRes())
  assert.equal(res.status, 200)
  assert.equal(res.json.ok, true)
  assert.equal(res.json.config.hardProvider, 'deepseek-official')
  assert.deepEqual(settings.writes[0], { kind: 'update', patch: { hardProvider: 'deepseek-official' } })
})

test('config POST with null value unsets the field', async () => {
  const settings = fakeSettings({ hardProvider: 'deepseek-official', hardModel: 'deepseek-v4-pro' })
  const ctx = { get: (name) => (name === 'settings' ? settings : undefined), llm: { listProviders: () => [], listConfigurableProviders: () => [] } }
  const captured = {}
  ctx.webServer = { register: ({ handler }) => { captured.handler = handler; return () => {} } }
  installModelsApi(ctx, () => ({ snapshot: () => ({}) }))

  const res = await invoke(captured.handler, fakeReq('POST', '/smart-router/api/config', { field: 'hardProvider', value: null }), fakeRes())
  assert.equal(res.status, 200)
  assert.equal(res.json.ok, true)
  assert.equal(settings.section.hardProvider, undefined)
  assert.equal(settings.section.hardModel, 'deepseek-v4-pro')
  assert.deepEqual(settings.writes[0], { kind: 'mutate', ops: [{ op: 'unset', path: ['hardProvider'] }] })
})

test('config POST rejects unknown fields', async () => {
  const settings = fakeSettings()
  const ctx = { get: (name) => (name === 'settings' ? settings : undefined), llm: { listProviders: () => [], listConfigurableProviders: () => [] } }
  const captured = {}
  ctx.webServer = { register: ({ handler }) => { captured.handler = handler; return () => {} } }
  installModelsApi(ctx, () => ({ snapshot: () => ({}) }))

  const res = await invoke(captured.handler, fakeReq('POST', '/smart-router/api/config', { field: 'evilField', value: 'x' }), fakeRes())
  assert.equal(res.status, 400)
  assert.match(res.json.error, /unknown config field/)
  assert.equal(settings.writes.length, 0)
})

test('config POST surfaces settings validation failures', async () => {
  const settings = fakeSettings()
  settings.update = async () => { throw new Error('schema rejected: not a string') }
  const ctx = { get: (name) => (name === 'settings' ? settings : undefined), llm: { listProviders: () => [], listConfigurableProviders: () => [] } }
  const captured = {}
  ctx.webServer = { register: ({ handler }) => { captured.handler = handler; return () => {} } }
  installModelsApi(ctx, () => ({ snapshot: () => ({}) }))

  const res = await invoke(captured.handler, fakeReq('POST', '/smart-router/api/config', { field: 'hardProvider', value: 42 }), fakeRes())
  assert.equal(res.status, 400)
  assert.match(res.json.error, /config rejected/)
})
