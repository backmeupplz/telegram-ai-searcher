import type { ImageSearchResult } from './image-search-results'

export const MAX_TELEGRAM_IMAGE_RESULTS = 3

const TELEGRAM_CAPTION_MAX_CHARS = 1024
const TELEGRAM_TEXT_MAX_CHARS = 4096

export function imageResultCaption(
  result: ImageSearchResult,
  index: number,
  total: number,
): string {
  const sourceUrl = result.pageUrl ?? result.imageUrl
  const prefix = total > 1 ? `${index + 1}/${total}: ` : ''
  const source = result.source || hostLabel(sourceUrl)
  const sourcePart =
    sourceUrl.length <= 700
      ? `<a href="${escapeHtml(sourceUrl)}">${escapeHtml(truncatePlain(source, 120))}</a>`
      : escapeHtml(truncatePlain(source, 120))
  const titleBudget = Math.max(
    24,
    TELEGRAM_CAPTION_MAX_CHARS -
      prefix.length -
      sourcePart.length -
      '<b></b>\nSource: '.length,
  )
  return `${prefix}<b>${escapeHtml(truncatePlain(result.title, titleBudget))}</b>\nSource: ${sourcePart}`
}

export function imageResultsFallbackHtml(
  query: string,
  results: ImageSearchResult[],
): string {
  if (results.length === 0) {
    return `No image results found for <b>${escapeHtml(query)}</b>.`
  }

  const lines = results
    .slice(0, MAX_TELEGRAM_IMAGE_RESULTS)
    .map((result, index) => {
      const sourceUrl = result.pageUrl ?? result.imageUrl
      const title = escapeHtml(truncatePlain(result.title, 120))
      const source = escapeHtml(result.source || hostLabel(sourceUrl))
      if (sourceUrl.length > 900) return `${index + 1}. ${title} - ${source}`
      return `${index + 1}. <a href="${escapeHtml(sourceUrl)}">${title}</a> - ${source}`
    })
  const header = `Image results for <b>${escapeHtml(query)}</b>:`
  while (
    lines.length > 1 &&
    `${header}\n${lines.join('\n')}`.length > TELEGRAM_TEXT_MAX_CHARS
  ) {
    lines.pop()
  }

  const body = `${header}\n${lines.join('\n')}`
  return body.length <= TELEGRAM_TEXT_MAX_CHARS
    ? body
    : `Image results found for <b>${escapeHtml(query)}</b>, but the source links are too long to display safely.`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncatePlain(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value
}

function hostLabel(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
}
