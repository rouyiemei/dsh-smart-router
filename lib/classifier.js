/**
 * Difficulty classifier: pure heuristic scoring plus an optional LLM
 * classifier, both producing the same three-tier vocabulary
 * (`hard | normal | easy`).
 *
 * The heuristic is the default: zero cost, zero latency, deterministic and
 * unit-tested. The LLM classifier (参考 llm-adaptive 的判定标准) is opt-in via
 * `classifier: 'llm'` and reuses the model configured for the easy tier (or
 * the explicit `llmClassifierProvider/Model`), cached by request text.
 */

/** Strong social signals: greetings, thanks, acknowledgements, wrap-ups. */
const EASY_SOCIAL = [
  // zh
  '你好', '您好', '嗨', '哈喽', '谢谢', '感谢', '好的', '嗯', '继续', '收尾',
  // en
  'hello', 'hi', 'thanks', 'thank you', 'ok', 'okay', 'continue', 'wrap up',
]

/** Soft easy signals: only count when no task verb is present. */
const EASY_SOFT = [
  // zh
  '总结一下', '简单', '简短', '随便', '翻译', '解释一下', '介绍一下',
  '是什么', '怎么用', '小问题', '快速',
  // en
  'summarize', 'brief', 'short', 'translate', 'explain', 'what is', 'how do i', 'quick',
]

/** Action verbs: a message that contains one is a task, floored at normal. */
const TASK_VERBS = [
  // zh
  '加', '写', '改', '修', '实现', '创建', '删除', '更新', '移动', '跑',
  '测试', '安装', '配置', '部署', '重构', '优化', '调试', '修复', '增加',
  '添加', '去掉', '移除', '调整', '完成', '设计', '开发', '搭建', '编写',
  // en
  'add', 'write', 'fix', 'implement', 'create', 'delete', 'update', 'move',
  'run', 'test', 'install', 'configure', 'deploy', 'refactor', 'optimize',
  'debug', 'build', 'develop', 'change',
]

/** Hard signals: architecture, debugging, optimization, migrations, scale. */
const HARD_WORDS = [
  // zh
  '重构', '架构', '设计', '优化', '性能', '安全', '调试', '根因', '迁移',
  '大规模', '算法', '并发', '分布式', '多线程', '异步', '缓存', '数据库',
  '索引', '复杂', '疑难', '跨模块', '跨文件', '系统设计', '代码评审',
  '瓶颈', '死锁', '内存泄漏', '兼容性', '回归', '单元测试', '测试框架',
  '构建', '发布', '上线', '监控', '容灾',
  // en
  'refactor', 'refactoring', 'architecture', 'architect', 'design',
  'optimize', 'optimization', 'performance', 'security', 'debug', 'debugging',
  'root cause', 'migrat', 'scale', 'scalab', 'concurr', 'distributed',
  'thread', 'async', 'cache', 'database', 'complex', 'algorithm',
  'deadlock', 'memory leak', 'regression', 'code review', 'test suite',
  'bottleneck', 'failover',
]

const CODE_FENCE_RE = /```[a-z]*\n[\s\S]*?```/g
const INLINE_CODE_RE = /`[^`\n]{2,120}`/g
/** Path-like tokens: extensions that usually mean real file references. */
const PATH_RE = /(?:^|[\s'"(\[])([\w@./\\-]+\.(?:js|ts|jsx|tsx|py|rs|go|java|rb|php|c|h|cpp|hpp|cs|swift|kt|json|ya?ml|toml|md|css|scss|html|sql|sh|ps1|bat|lock))(?::\d+)?/g

/**
 * Classify a request text into a difficulty tier.
 * Pure function: same input, same output; safe for unit tests.
 *
 * @param {string} text - the latest user message text (trimmed).
 * @returns {{ level: 'hard'|'normal'|'easy', score: number, reasons: string[] }}
 */
export function classifyDifficulty(text) {
  const reasons = []
  const input = String(text ?? '').trim()
  const lower = input.toLowerCase()
  if (input === '') return { level: 'normal', score: 0, reasons: ['empty text → normal'] }

  let score = 0
  const len = input.length

  // --- structural signals -------------------------------------------------
  const fences = input.match(CODE_FENCE_RE) ?? []
  const inlineCodes = input.match(INLINE_CODE_RE) ?? []
  const codeChars = fences.join('').length + inlineCodes.join('').length
  const paths = [...input.matchAll(PATH_RE)]
  const pathCount = new Set(paths.map((m) => m[1].toLowerCase())).size

  if (fences.length >= 2 || codeChars > 600) {
    score += 2
    reasons.push(`heavy code (${fences.length} fence(s), ${codeChars} code chars)`)
  } else if (codeChars > 150) {
    score += 1
    reasons.push(`some code (${codeChars} code chars)`)
  }
  if (pathCount >= 3) {
    score += 1
    reasons.push(`${pathCount} file references`)
  } else if (pathCount >= 1) {
    reasons.push(`${pathCount} file reference(s)`)
  }
  if (len > 1500) {
    score += 1
    reasons.push(`long message (${len} chars)`)
  }

  // --- keyword signals ----------------------------------------------------
  let hardHits = 0
  let socialHits = 0
  let softHits = 0
  for (const word of HARD_WORDS) {
    if (lower.includes(word)) hardHits += 1
  }
  for (const word of EASY_SOCIAL) {
    if (lower.includes(word)) socialHits += 1
  }
  for (const word of EASY_SOFT) {
    if (lower.includes(word)) softHits += 1
  }
  if (hardHits > 0) {
    score += Math.min(hardHits, 3)
    reasons.push(`${hardHits} hard signal(s)`)
  }
  if (socialHits > 0 && len < 140) {
    score -= 1
    reasons.push(`social signal(s) in short message`)
  }
  const taskVerb = TASK_VERBS.some((verb) => lower.includes(verb))

  // --- decision -----------------------------------------------------------
  let level
  if (score >= 3) level = 'hard'
  else if (taskVerb && len >= 8) level = 'normal' // a task, even when worded softly
  else if (socialHits > 0 && len < 60) level = 'easy'
  else if (softHits > 0 && !taskVerb && len < 60 && fences.length === 0) level = 'easy'
  else if (score <= -1) level = 'easy'
  else level = 'normal'

  return { level, score, reasons: reasons.length > 0 ? reasons : [`score ${score} → ${level}`] }
}

/**
 * Resolve the classifier route: explicit `llmClassifierProvider/Model` first,
 * then the easy tier, then `undefined` (caller falls back to the default
 * model or to the heuristic).
 *
 * @param {object} settings - resolved smart-router settings.
 * @returns {{provider: string, model: string}|undefined}
 */
export function classifierRoute(settings) {
  const explicit = {
    provider: String(settings.llmClassifierProvider ?? ''),
    model: String(settings.llmClassifierModel ?? ''),
  }
  if (explicit.provider !== '' && explicit.model !== '') return explicit
  const easy = {
    provider: String(settings.easyProvider ?? ''),
    model: String(settings.easyModel ?? ''),
  }
  if (easy.provider !== '' && easy.model !== '') return easy
  return undefined
}

/** Trim the text the LLM classifier sees (bounded, so the cache key is stable). */
export function classifierInput(text) {
  return String(text ?? '').trim().slice(0, 2000)
}

/** Parse the classifier reply: strict JSON first, then a regex fallback. */
export function parseClassifierReply(raw) {
  const text = String(raw ?? '').trim()
  if (text === '') return undefined
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') {
      const level = String(parsed.level ?? '').trim()
      if (level === 'hard' || level === 'normal' || level === 'easy') {
        return {
          level,
          reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '',
        }
      }
    }
  } catch { /* not JSON — fall through */ }
  const match = text.match(/"level"\s*:\s*"(hard|normal|easy)"(?:\s*,\s*"reason"\s*:\s*"([^"]*)")?/)
  if (match) return { level: match[1], reason: match[2] ?? '' }
  // bare single word reply (the prompt asks for JSON only; tolerate anyway)
  if (/^"(hard|normal|easy)"$/.test(text)) return { level: text.slice(1, -1), reason: '' }
  return undefined
}

/**
 * The classifier system prompt (three tiers). 判定标准参考 llm-adaptive 的四级
 * 判定要点，收拢为三级并保持「判不准选 normal」的 fail-open 原则。
 */
export const CLASSIFIER_SYSTEM_PROMPT =
  'You are a request-complexity classifier for an AI coding agent. ' +
  'Reply with ONLY a JSON object, no prose: {"level": "hard|normal|easy", "reason": "one short sentence"}\n' +
  'Rules:\n' +
  '- easy: small talk, greeting, confirmation, reading a single file, wrapping up a task, short translation/explanation\n' +
  '- normal: single-file change, a clear small feature, routine debugging, writing tests (default when unsure)\n' +
  '- hard: cross-file refactoring, architecture changes, root-cause analysis of a tricky bug, performance/security work, continuing a complex task\n' +
  'Context hints: a continuation of an unfinished big task is at least normal; wrap-up/thanks is easy; an error loop (the same problem repeated) is at least hard; when unsure pick normal.'

/** Prompt the user side of the classifier call. */
export function classifierUserPrompt(text) {
  return `Classify this latest user request:\n\n${classifierInput(text)}\n\nReply with the JSON only.`
}
