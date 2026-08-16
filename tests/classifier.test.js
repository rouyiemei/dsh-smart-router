import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLASSIFIER_SYSTEM_PROMPT,
  classifyDifficulty,
  classifierInput,
  classifierRoute,
  parseClassifierReply,
} from '../lib/classifier.js'

test('heuristic: trivial greeting → easy', () => {
  const { level, reasons } = classifyDifficulty('你好，谢谢！')
  assert.equal(level, 'easy')
  assert.ok(reasons.length > 0)
})

test('heuristic: short thanks → easy', () => {
  assert.equal(classifyDifficulty('thanks!').level, 'easy')
  assert.equal(classifyDifficulty('好的，继续').level, 'easy')
})

test('heuristic: cross-file refactor request → hard', () => {
  const text = [
    '请重构 src/ 下的模块，把 user-service.js 和 order-service.js 的公共逻辑抽出来，',
    '调整 auth.js 的架构，优化数据库索引和缓存策略，性能瓶颈要定位根因。',
    '涉及 src/api/route.ts、src/db/pool.ts、src/utils/cache.ts 三个文件。',
  ].join('')
  const { level } = classifyDifficulty(text)
  assert.equal(level, 'hard')
})

test('heuristic: heavy code block → at least normal (code signal)', () => {
  const text = '```js\n' + 'const x = 1;\n'.repeat(200) + '```\n帮我看看这段代码'
  const { level, score } = classifyDifficulty(text)
  assert.ok(score >= 2)
  assert.ok(level === 'hard' || level === 'normal')
})

test('heuristic: normal single-file task', () => {
  const { level } = classifyDifficulty('在 index.js 里加一个简单的排序函数')
  assert.equal(level, 'normal')
})

test('heuristic: empty text → normal (fail-open)', () => {
  assert.equal(classifyDifficulty('').level, 'normal')
  assert.equal(classifyDifficulty(undefined).level, 'normal')
})

test('heuristic: deterministic (pure function)', () => {
  const text = '重构 service 层，涉及 a.ts b.ts c.ts 三个文件'
  const first = classifyDifficulty(text)
  const second = classifyDifficulty(text)
  assert.deepEqual(first, second)
})

test('parseClassifierReply: strict JSON', () => {
  assert.deepEqual(parseClassifierReply('{"level": "hard", "reason": "refactor"}'), {
    level: 'hard',
    reason: 'refactor',
  })
})

test('parseClassifierReply: regex fallback inside prose', () => {
  assert.deepEqual(parseClassifierReply('Here: {"level": "easy", "reason": "hi"}'), {
    level: 'easy',
    reason: 'hi',
  })
})

test('parseClassifierReply: unknown level rejected', () => {
  assert.equal(parseClassifierReply('{"level": "insane"}'), undefined)
  assert.equal(parseClassifierReply(''), undefined)
  assert.equal(parseClassifierReply('totally broken'), undefined)
})

test('classifierRoute: explicit beats easy tier', () => {
  const settings = {
    llmClassifierProvider: 'p1',
    llmClassifierModel: 'm1',
    easyProvider: 'p2',
    easyModel: 'm2',
  }
  assert.deepEqual(classifierRoute(settings), { provider: 'p1', model: 'm1' })
})

test('classifierRoute: falls back to easy tier, then undefined', () => {
  assert.deepEqual(classifierRoute({ easyProvider: 'p2', easyModel: 'm2' }), { provider: 'p2', model: 'm2' })
  assert.equal(classifierRoute({}), undefined)
})

test('classifierInput: bounded and stable', () => {
  const long = 'x'.repeat(5000)
  assert.equal(classifierInput(long).length, 2000)
  assert.equal(classifierInput('  hi  '), 'hi')
})

test('classifier prompt exists and names three tiers', () => {
  assert.ok(CLASSIFIER_SYSTEM_PROMPT.includes('hard'))
  assert.ok(CLASSIFIER_SYSTEM_PROMPT.includes('normal'))
  assert.ok(CLASSIFIER_SYSTEM_PROMPT.includes('easy'))
})
