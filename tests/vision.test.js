import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  VISION_PROMPT,
  collectImageBlocks,
  imagePlaceholder,
  messagesHaveImage,
  parseVisionReply,
  renderVisionEvidence,
  replaceImages,
} from '../lib/vision.js'

const imageBlock = (id) => ({ type: 'image', attachment: { id, mediaType: 'image/png' } })
const textBlock = (text) => ({ type: 'text', text })

function messagesWithImage() {
  return [
    { role: 'user', content: [textBlock('看图'), imageBlock('sha256:aaa')], source: { kind: 'user' } },
    { role: 'user', content: [textBlock('纯文本')], source: { kind: 'user' } },
  ]
}

test('messagesHaveImage / collectImageBlocks', () => {
  assert.equal(messagesHaveImage(messagesWithImage()), true)
  assert.equal(messagesHaveImage([{ role: 'user', content: [textBlock('x')] }]), false)
  assert.equal(messagesHaveImage(undefined), false)
  const blocks = collectImageBlocks(messagesWithImage())
  assert.equal(blocks.length, 1)
  assert.deepEqual(blocks[0], { messageIndex: 0, blockIndex: 1, id: 'sha256:aaa' })
})

test('parseVisionReply: strict JSON', () => {
  const parsed = parseVisionReply('{"summary":"s","ocr":{"full_text":"t","lines":[]}}')
  assert.equal(parsed.summary, 's')
  assert.equal(parsed.ocr.full_text, 't')
})

test('parseVisionReply: brace-balanced extraction from prose/fences', () => {
  const raw = 'Here you go:\n```json\n{"summary":"s","nested":{"a":[1,{"b":"c"}]}}\n```\nDone.'
  const parsed = parseVisionReply(raw)
  assert.equal(parsed.summary, 's')
  assert.equal(parsed.nested.a[1].b, 'c')
})

test('parseVisionReply: rejects garbage and empty', () => {
  assert.equal(parseVisionReply(''), undefined)
  assert.equal(parseVisionReply('totally not json'), undefined)
  assert.equal(parseVisionReply('{broken'), undefined)
})

test('renderVisionEvidence: renders sections and skips empty ones', () => {
  const parsed = {
    summary: '一张截图',
    ocr: { full_text: 'Hello\nWorld', lines: [] },
    layout: { regions: [
      { type: 'title', reading_order: 1, text: '标题' },
      { type: 'paragraph', reading_order: 2, text: '正文' },
    ] },
    semantics: { scene: 'ui', entities: [{ name: '按钮', type: 'button' }] },
    visual: { dominant_colors: ['#fff'], style: 'dark' },
    uncertainty: ['右下角模糊'],
  }
  const text = renderVisionEvidence(parsed)
  assert.ok(text.includes('摘要：一张截图'))
  assert.ok(text.includes('OCR 全文'))
  assert.ok(text.includes('Hello\nWorld'))
  assert.ok(text.includes('[title] 标题'))
  assert.ok(text.includes('[paragraph] 正文'))
  assert.ok(text.includes('实体：按钮'))
  assert.ok(text.includes('主色调：#fff'))
  assert.ok(text.includes('不确定项：右下角模糊'))
})

test('renderVisionEvidence: empty evidence yields empty string', () => {
  assert.equal(renderVisionEvidence({}), '')
})

test('imagePlaceholder', () => {
  assert.ok(imagePlaceholder('sha256:aaa').includes('sha256:aaa'))
})

// ---------- replaceImages with a fake llm ----------

function fakeVisionLlm(repliesByModel, failModels = []) {
  const calls = []
  const llm = {
    calls,
    async prepareCall(config, signal) {
      calls.push({ config, signal })
      const key = `${config.provider}/${config.model}`
      if (failModels.includes(key)) throw new Error(`prepare ${key} failed`)
      const reply = repliesByModel[key] ?? ''
      const resolvedConfig = {
        provider: config.provider,
        model: config.model,
        ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
      }
      return {
        config: resolvedConfig,
        async *stream(forwarded) {
          yield { type: 'text-delta', index: 0, text: reply }
        },
      }
    },
  }
  return llm
}

function fakeCache(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    get: (key) => map.get(key),
    set: (key, value) => { map.set(key, value) },
    map,
  }
}

const JSON_REPLY = '{"summary":"一张猫的图片","ocr":{"full_text":"MEOW","lines":[{"text":"MEOW"}]},"layout":{"regions":[]},"semantics":{"scene":"cat","entities":[]},"visual":{"dominant_colors":["#fff"]},"uncertainty":[]}'

test('replaceImages: replaces the image block with rendered evidence', async () => {
  const ctx = { llm: fakeVisionLlm({ 'ovh-vision/Qwen2.5-VL-72B-Instruct': JSON_REPLY }) }
  const settings = { visionProvider: 'ovh-vision', visionModel: 'Qwen2.5-VL-72B-Instruct', visionCacheTtl: 3600 }
  const cache = fakeCache()
  const stats = { record: () => {} }
  const out = await replaceImages(ctx, settings, messagesWithImage(), undefined, cache, stats, () => {})
  assert.equal(out[0].content.length, 2)
  assert.equal(out[0].content[0].type, 'text')
  assert.equal(out[0].content[0].text, '看图')
  assert.equal(out[0].content[1].type, 'text')
  assert.ok(out[0].content[1].text.includes('摘要：一张猫的图片'))
  assert.ok(out[0].content[1].text.includes('MEOW'))
  // pure text message untouched
  assert.equal(out[1].content[0].text, '纯文本')
  // input not mutated
  assert.equal(messagesWithImage()[0].content[1].type, 'image')
  // cached for the next request
  assert.ok(cache.map.has('sha256:aaa'))
})

test('replaceImages: cache hit skips the vision call', async () => {
  let calls = 0
  const ctx = { llm: fakeVisionLlm({ 'ovh-vision/Qwen2.5-VL-72B-Instruct': JSON_REPLY }) }
  const settings = { visionProvider: 'ovh-vision', visionModel: 'Qwen2.5-VL-72B-Instruct', visionCacheTtl: 3600 }
  const cache = fakeCache({ 'sha256:aaa': 'cached evidence' })
  const stats = { record: () => { calls += 1 } }
  const out = await replaceImages(ctx, settings, messagesWithImage(), undefined, cache, stats, () => {})
  assert.equal(out[0].content[1].text, 'cached evidence')
  assert.equal(ctx.llm.calls.length, 0)
  assert.equal(calls, 0)
})

test('replaceImages: unparseable reply becomes a placeholder', async () => {
  const ctx = { llm: fakeVisionLlm({ 'ovh-vision/Qwen2.5-VL-72B-Instruct': 'I cannot see anything' }) }
  const settings = { visionProvider: 'ovh-vision', visionModel: 'Qwen2.5-VL-72B-Instruct', visionCacheTtl: 3600 }
  const cache = fakeCache()
  const stats = { record: () => {} }
  const out = await replaceImages(ctx, settings, messagesWithImage(), undefined, cache, stats, () => {})
  assert.ok(out[0].content[1].text.includes('视觉模型返回无法解析'))
})

test('replaceImages: no vision model configured → placeholder, request still proceeds', async () => {
  const ctx = { llm: fakeVisionLlm({}) }
  const settings = { visionProvider: '', visionModel: '', visionCacheTtl: 3600 }
  const cache = fakeCache()
  const out = await replaceImages(ctx, settings, messagesWithImage(), undefined, cache, {}, () => {})
  assert.ok(out[0].content[1].text.includes('未配置视觉模型'))
  assert.equal(ctx.llm.calls.length, 0)
})

test('replaceImages: vision call failure → placeholder with reason', async () => {
  const ctx = { llm: fakeVisionLlm({}, ['ovh-vision/Qwen2.5-VL-72B-Instruct']) }
  const settings = { visionProvider: 'ovh-vision', visionModel: 'Qwen2.5-VL-72B-Instruct', visionCacheTtl: 3600 }
  const cache = fakeCache()
  const out = await replaceImages(ctx, settings, messagesWithImage(), undefined, cache, {}, () => {})
  assert.ok(out[0].content[1].text.includes('视觉分析失败'))
})

test('replaceImages: visionCacheTtl 0 disables caching', async () => {
  const ctx = { llm: fakeVisionLlm({ 'ovh-vision/Qwen2.5-VL-72B-Instruct': JSON_REPLY }) }
  const settings = { visionProvider: 'ovh-vision', visionModel: 'Qwen2.5-VL-72B-Instruct', visionCacheTtl: 0 }
  const cache = fakeCache()
  await replaceImages(ctx, settings, messagesWithImage(), undefined, cache, {}, () => {})
  assert.equal(cache.map.has('sha256:aaa'), false)
})

test('VISION_PROMPT exists and asks for structured evidence', () => {
  assert.ok(VISION_PROMPT.includes('structured evidence'))
  assert.ok(VISION_PROMPT.includes('uncertainty'))
  assert.ok(VISION_PROMPT.includes('"summary"'))
})
