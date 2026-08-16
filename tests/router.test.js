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

test('resolveChain: vision request routes to vision tier first', () => {
  const router = adapter({
    visionProvider: 'zhipu-vision',
    visionModel: 'glm-4v-flash',
    easyProvider: 'deepseek-official',
    easyModel: 'deepseek-chat',
  })
  const resolved = router.resolveChain(optionsFor('看看这张图', { withImage: true }))
  assert.equal(resolved.kind, 'vision')
  assert.equal(resolved.hasImage, true)
  assert.equal(resolved.chain[0].provider, 'zhipu-vision')
  assert.equal(resolved.chain[0].model, 'glm-4v-flash')
})

test('resolveChain: text request classified hard → hard tier, then ladder', () => {
  const router = adapter({
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
    normalProvider: 'deepseek-official',
    normalModel: 'deepseek-chat',
  })
  const resolved = router.resolveChain(optionsFor('重构整个 service 层，涉及 a.ts b.ts c.ts 三处架构调整'))
  assert.equal(resolved.level, 'hard')
  assert.equal(resolved.chain[0].provider, 'deepseek-official')
  assert.equal(resolved.chain[0].model, 'deepseek-v4-pro')
  // ladder: normal tier second
  assert.equal(resolved.chain[1].model, 'deepseek-chat')
})

test('resolveChain: missing tier falls back through ladder to default model', () => {
  const router = adapter(
    { easyProvider: 'deepseek-official', easyModel: 'deepseek-chat' },
    { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  )
  const resolved = router.resolveChain(optionsFor('修复这个 bug'))
  assert.equal(resolved.level, 'normal')
  assert.deepEqual(resolved.chain.map((c) => c.model), ['deepseek-chat', 'deepseek-v4-pro'])
})

test('resolveChain: no tiers at all → session default model only', () => {
  const router = adapter({}, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
  const resolved = router.resolveChain(optionsFor('你好'))
  assert.equal(resolved.chain.length, 1)
  assert.equal(resolved.chain[0].provider, 'deepseek-official')
  assert.equal(resolved.chain[0].model, 'deepseek-v4-pro')
})

test('resolveChain: disabled → no routing chain (stream delegates to default)', () => {
  const router = adapter({ enabled: false })
  const resolved = router.resolveChain(optionsFor('hi'))
  assert.equal(resolved.kind, 'disabled')
})

test('resolveChain: anti-recursion — session default equal to router is ignored', () => {
  const router = adapter({}, { provider: 'smart-router', model: 'smart' })
  const resolved = router.resolveChain(optionsFor('hi'))
  assert.equal(resolved.chain.length, 0)
  assert.equal(resolved.kind, 'text')
})

test('resolveChain: vision fallbacks appended after vision tier', () => {
  const router = adapter({
    visionProvider: 'ovh-vision',
    visionModel: 'Qwen2.5-VL-72B-Instruct',
    visionFallbacks: [{ provider: 'zhipu-vision', model: 'glm-4v-flash' }],
  }, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
  const resolved = router.resolveChain(optionsFor('看图', { withImage: true }))
  assert.deepEqual(resolved.chain.map((c) => `${c.provider}/${c.model}`), [
    'ovh-vision/Qwen2.5-VL-72B-Instruct',
    'zhipu-vision/glm-4v-flash',
    'deepseek-official/deepseek-v4-pro',
  ])
})

test('resolveChain: deduplicates repeated routes in the chain', () => {
  const router = adapter({
    hardProvider: 'deepseek-official',
    hardModel: 'deepseek-v4-pro',
    normalProvider: 'deepseek-official',
    normalModel: 'deepseek-v4-pro',
  })
  const resolved = router.resolveChain(optionsFor('修复这个 bug'))
  const keys = resolved.chain.map((c) => `${c.provider}/${c.model}`)
  assert.equal(new Set(keys).size, keys.length)
})

test('lastUserMessage: picks the latest user message with content', () => {
  const messages = [
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
    { role: 'user', content: [{ type: 'text', text: 'first' }], source: { kind: 'user' } },
    { role: 'user', content: [{ type: 'text', text: 'second' }], source: { kind: 'user' } },
  ]
  assert.equal(blocksText(lastUserMessage(messages).content), 'second')
  assert.equal(lastUserMessage([]), undefined)
  assert.equal(lastUserMessage(undefined), undefined)
})

test('failureChunk: error finish chunk shape', () => {
  const chunk = failureChunk('boom', 'NO_ROUTE')
  assert.equal(chunk.type, 'finish')
  assert.equal(chunk.reason.kind, 'error')
  assert.equal(chunk.reason.failure.code, 'NO_ROUTE')
  assert.equal(chunk.reason.failure.message, 'boom')
})

test('stats: records per-kind counters', () => {
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

// ---------- stream() integration with a fake llm service ----------

/** A fake llm service recording prepareCall configs and streaming chunks back. */
function fakeLlm(streamsByKey, failPrepare = []) {
  const calls = []
  const llm = {
    calls,
    async prepareCall(config, signal) {
      calls.push({ config, signal })
      const key = `${config.provider}/${config.model}`
      if (failPrepare.includes(key)) throw new Error(`prepare ${key} failed`)
      const chunks = streamsByKey[key] ?? [{ type: 'text-delta', index: 0, text: '?' }]
      return {
        async *stream(forwarded) {
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
