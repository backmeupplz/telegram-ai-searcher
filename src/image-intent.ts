export type ImageSearchIntent = {
  query: string
}

const ACTION = String.raw`(?:find|search(?:\s+for)?|show|send|get|look\s+up)`
const IMAGE_NOUN = String.raw`(?:images?|photos?|pictures?|pics?)`
const PREFIX = String.raw`^(?:please\s+)?`

const PATTERNS = [
  new RegExp(
    `${PREFIX}${ACTION}(?:\\s+me)?(?:\\s+(?:some|a few|the|an?|good))?\\s+${IMAGE_NOUN}(?:\\s+(?:of|for|about))?\\s+(.+)$`,
    'i',
  ),
  new RegExp(
    `${PREFIX}${ACTION}(?:\\s+me)?\\s+(.+?)\\s+${IMAGE_NOUN}$`,
    'i',
  ),
  new RegExp(`${PREFIX}${IMAGE_NOUN}\\s+(?:of|for|about)\\s+(.+)$`, 'i'),
]

export function detectImageSearchIntent(
  text: string,
): ImageSearchIntent | null {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return null

  for (const pattern of PATTERNS) {
    const match = normalized.match(pattern)
    const query = cleanQuery(match?.[1] ?? '')
    if (query) return { query }
  }

  return null
}

function cleanQuery(value: string): string {
  const query = value
    .replace(/^["']+|["'.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!query) return ''
  if (/^(?:this|that|it|the attached|attached image)$/i.test(query)) return ''
  return query
}
