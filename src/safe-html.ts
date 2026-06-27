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

function findNextTagStart(s: string, start: number): number {
  let lt = s.indexOf('<', start)
  while (lt !== -1) {
    if (/[A-Za-z/]/.test(s[lt + 1] ?? '')) return lt
    lt = s.indexOf('<', lt + 1)
  }
  return -1
}

function escapeUnsupportedTags(s: string): string {
  let out = ''
  let pos = 0
  while (pos < s.length) {
    const lt = findNextTagStart(s, pos)
    if (lt === -1) {
      out += renderMarkdownText(s.slice(pos))
      break
    }
    out += renderMarkdownText(s.slice(pos, lt))
    const gt = s.indexOf('>', lt)
    if (gt === -1) {
      out += escapeHtmlText(s.slice(lt))
      break
    }
    const inner = s.slice(lt + 1, gt).trim()
    if (ALLOWED_TAGS.has(tagName(inner))) {
      out += s.slice(lt, gt + 1)
    } else {
      out += escapeHtmlText(s.slice(lt, gt + 1))
    }
    pos = gt + 1
  }
  return out
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlAttribute(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function renderMarkdownText(s: string): string {
  const replacements: string[] = []
  const stash = (html: string) => {
    const token = `\u0000${replacements.length}\u0000`
    replacements.push(html)
    return token
  }

  let text = s

  text = text.replace(/(^|\n)#{1,6}[ \t]+([^\n]+)/g, (_, prefix, heading) => {
    return `${prefix}${stash(`<b>${escapeHtmlText(heading.trim())}</b>`)}`
  })

  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    return stash(`<code>${escapeHtmlText(code)}</code>`)
  })

  text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/gi, (match, label, url) => {
    if (!isSafeHttpUrl(url)) return match
    return stash(
      `<a href="${escapeHtmlAttribute(url)}">${escapeHtmlText(label)}</a>`,
    )
  })

  text = text.replace(/\*\*([^*\n]+)\*\*/g, (_, body) => {
    return stash(`<b>${escapeHtmlText(body)}</b>`)
  })

  text = text.replace(
    /(^|[^\w*])\*([^\s*](?:[^*\n]*?[^\s*])?)\*(?=$|[^\w*])/g,
    (_, prefix, body) => `${prefix}${stash(`<i>${escapeHtmlText(body)}</i>`)}`,
  )

  let html = escapeHtmlText(text)
  for (const [index, replacement] of replacements.entries()) {
    html = html.replaceAll(`\u0000${index}\u0000`, replacement)
  }
  return html
}

type TagStep = {
  stack: string[]
  cursor: number
  aborted: boolean
}

function parseNextTag(s: string, start: number, stack: string[]): TagStep {
  const lt = findNextTagStart(s, start)
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
      const lt = findNextTagStart(s, pos)
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
      if (output.indexOf('>', step.cursor) !== -1) {
        output = output.slice(0, step.cursor)
      }
      break
    }
    stack = step.stack
    pos = step.cursor
  }
  return output + stack.reverse().map((name) => `</${name}>`).join('')
}

function trimDanglingEntity(s: string): string {
  const amp = s.lastIndexOf('&')
  if (amp === -1) return s
  const tail = s.slice(amp)
  return tail.includes(';') ? s : s.slice(0, amp)
}

function markdownSafePrefixLen(s: string, limit: number): number {
  let codeStart: number | null = null
  let boldStart: number | null = null
  let pos = 0

  while (pos < limit) {
    const char = s[pos]

    if (char === '`') {
      codeStart = codeStart === null ? pos : null
      pos += 1
      continue
    }

    if (codeStart !== null) {
      pos += 1
      continue
    }

    if (s.startsWith('**', pos)) {
      boldStart = boldStart === null ? pos : null
      pos += 2
      continue
    }

    pos += 1
  }

  if (codeStart !== null) return codeStart
  if (boldStart !== null) return boldStart

  const linkStart = s.lastIndexOf('[', limit - 1)
  if (linkStart !== -1) {
    const linkMiddle = s.indexOf('](', linkStart)
    const linkEnd = linkMiddle === -1 ? -1 : s.indexOf(')', linkMiddle + 2)
    if (linkMiddle !== -1 && (linkEnd === -1 || linkEnd >= limit)) {
      return linkStart
    }
  }

  return limit
}

export function truncateSafeHtml(
  html: string,
  maxChars: number,
  suffix = '<i>... truncated</i>',
): string {
  if (html.length <= maxChars) return html

  const separator = '\n\n'
  let end = Math.max(0, maxChars - separator.length - suffix.length)
  while (end > 0) {
    const prefix = closeOpenTags(trimDanglingEntity(html.slice(0, end)).trimEnd())
    const candidate = `${prefix}${separator}${suffix}`
    if (candidate.length <= maxChars) return candidate
    end -= candidate.length - maxChars
  }

  return suffix.slice(0, maxChars)
}

export async function* safeHtmlStream(
  source: AsyncIterable<string>,
): AsyncGenerator<string> {
  let pending = ''
  let trimmingLeadingWhitespace = true
  for await (const chunk of source) {
    pending += chunk
    if (trimmingLeadingWhitespace) {
      pending = pending.trimStart()
      if (!pending) continue
      trimmingLeadingWhitespace = false
    }
    const n = safePrefixLen(pending)
    const m = markdownSafePrefixLen(pending, n)
    if (m > 0) {
      yield escapeUnsupportedTags(pending.slice(0, m))
      pending = pending.slice(m)
    }
  }
  if (pending) yield escapeUnsupportedTags(closeOpenTags(pending))
}
