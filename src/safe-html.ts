const VOID_TAGS = new Set(['br', 'hr', 'img'])

// Telegram Bot API "HTML" parse_mode whitelist.
// https://core.telegram.org/bots/api#html-style
const ALLOWED_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  'ins',
  's',
  'strike',
  'del',
  'a',
  'code',
  'pre',
  'span',
  'tg-spoiler',
  'tg-emoji',
  'blockquote',
])

function tagName(inner: string): string {
  const trimmed = inner.startsWith('/') ? inner.slice(1) : inner
  return trimmed.replace(/\/$/, '').trim().split(/\s/)[0]?.toLowerCase() ?? ''
}

function escapeUnsupportedTags(s: string): string {
  let out = ''
  let pos = 0
  while (pos < s.length) {
    const lt = s.indexOf('<', pos)
    if (lt === -1) {
      out += s.slice(pos)
      break
    }
    out += s.slice(pos, lt)
    const gt = s.indexOf('>', lt)
    if (gt === -1) {
      out += s.slice(lt).replace(/</g, '&lt;')
      break
    }
    const inner = s.slice(lt + 1, gt).trim()
    if (ALLOWED_TAGS.has(tagName(inner))) {
      out += s.slice(lt, gt + 1)
    } else {
      out += `&lt;${s.slice(lt + 1, gt)}&gt;`
    }
    pos = gt + 1
  }
  return out
}

type TagStep = {
  stack: string[]
  cursor: number
  aborted: boolean
}

function parseNextTag(s: string, start: number, stack: string[]): TagStep {
  const lt = s.indexOf('<', start)
  if (lt === -1) {
    return { stack, cursor: s.length, aborted: false }
  }
  const gt = s.indexOf('>', lt)
  if (gt === -1) {
    return { stack, cursor: lt, aborted: true }
  }
  const tag = s.slice(lt + 1, gt).trim()
  const next = [...stack]
  if (tag.startsWith('/')) {
    const name = tag.slice(1).split(/\s/)[0]?.toLowerCase() ?? ''
    if (!ALLOWED_TAGS.has(name)) {
      // Unsupported close: treat as literal; escaped later.
    } else if (next[next.length - 1] === name) next.pop()
    else return { stack: next, cursor: lt, aborted: true }
  } else if (!tag.endsWith('/')) {
    const name = tag.split(/\s/)[0]?.toLowerCase() ?? ''
    if (!ALLOWED_TAGS.has(name)) {
      // Unsupported open: treat as literal so it doesn't stall the stream.
    } else if (!VOID_TAGS.has(name)) next.push(name)
  }
  return { stack: next, cursor: gt + 1, aborted: false }
}

function safePrefixLen(s: string): number {
  let stack: string[] = []
  let pos = 0
  let safe = 0
  while (pos < s.length) {
    if (stack.length === 0) {
      const lt = s.indexOf('<', pos)
      safe = lt === -1 ? s.length : lt
    }
    const step = parseNextTag(s, pos, stack)
    if (step.aborted) return safe
    stack = step.stack
    pos = step.cursor
    if (stack.length === 0) safe = pos
  }
  return safe
}

function closeOpenTags(s: string): string {
  let stack: string[] = []
  let pos = 0
  let output = s
  while (pos < output.length) {
    const step = parseNextTag(output, pos, stack)
    if (step.aborted) {
      output = output.slice(0, step.cursor)
      break
    }
    stack = step.stack
    pos = step.cursor
  }
  return output + stack.reverse().map((name) => `</${name}>`).join('')
}

export async function* safeHtmlStream(
  source: AsyncIterable<string>,
): AsyncGenerator<string> {
  let pending = ''
  for await (const chunk of source) {
    pending += chunk
    const n = safePrefixLen(pending)
    if (n > 0) {
      yield escapeUnsupportedTags(pending.slice(0, n))
      pending = pending.slice(n)
    }
  }
  if (pending) yield escapeUnsupportedTags(closeOpenTags(pending))
}
