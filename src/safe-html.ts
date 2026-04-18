const VOID_TAGS = new Set(['br', 'hr', 'img'])

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
    if (next[next.length - 1] === name) next.pop()
    else return { stack: next, cursor: lt, aborted: true }
  } else if (!tag.endsWith('/')) {
    const name = tag.split(/\s/)[0]?.toLowerCase() ?? ''
    if (!VOID_TAGS.has(name)) next.push(name)
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
      yield pending.slice(0, n)
      pending = pending.slice(n)
    }
  }
  if (pending) yield closeOpenTags(pending)
}
