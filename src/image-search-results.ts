import { isIP } from 'node:net'

export type ImageSearchResult = {
  title: string
  imageUrl: string
  thumbnailUrl: string
  pageUrl: string | null
  source: string
}

export type RawImageSearchResult = {
  title?: string
  url?: string
  content?: string
  img_src?: string
  image_src?: string
  thumbnail?: string
  thumbnail_src?: string
  source?: string
  engine?: string
}

export function sanitizeRemoteImageUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null
  if (!isPublicHost(parsed.hostname)) return null
  parsed.hash = ''
  return parsed.toString()
}

export function parseImageResults(
  raw: RawImageSearchResult[],
  limit: number,
): ImageSearchResult[] {
  const results: ImageSearchResult[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    const imageUrl = sanitizeRemoteImageUrl(item.img_src ?? item.image_src)
    if (!imageUrl || seen.has(imageUrl)) continue

    const thumbnailUrl =
      sanitizeRemoteImageUrl(item.thumbnail_src ?? item.thumbnail) ?? imageUrl
    const pageUrl = sanitizeRemoteImageUrl(item.url)
    const source = pageUrl
      ? hostLabel(pageUrl)
      : item.source?.trim() || item.engine?.trim() || hostLabel(imageUrl)
    const title =
      item.title?.replace(/\s+/g, ' ').trim() ||
      item.content?.replace(/\s+/g, ' ').trim() ||
      source ||
      'Image result'

    results.push({ title, imageUrl, thumbnailUrl, pageUrl, source })
    seen.add(imageUrl)
    if (results.length >= limit) break
  }

  return results
}

function hostLabel(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false
  }

  const ipVersion = isIP(host)
  if (ipVersion === 4) {
    const [a = 0, b = 0] = host.split('.').map((part) => Number(part))
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }
  if (ipVersion === 6) {
    return !(
      host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80:')
    )
  }

  return true
}
