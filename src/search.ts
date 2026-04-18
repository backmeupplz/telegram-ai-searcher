import { JSDOM, VirtualConsole } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { env } from './env'

export type SearchResult = {
  title: string
  url: string
  snippet: string
  content: string
}

export type FetchedPage = {
  url: string
  title: string
  content: string
}

type SearxngRawResult = {
  title?: string
  url?: string
  content?: string
}

const FETCH_TIMEOUT_MS = 30000
const MAX_CONTENT_CHARS = 4000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua':
    '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  Referer: 'https://www.google.com/',
}

async function queryWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function searxng(query: string): Promise<SearxngRawResult[]> {
  const url = new URL(`${env.SEARXNG_URL}/search`)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('safesearch', '0')
  url.searchParams.set('engines', 'google,bing,duckduckgo,startpage,qwant')

  const res = await queryWithTimeout(
    url.toString(),
    { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
    FETCH_TIMEOUT_MS,
  )
  if (!res.ok) {
    throw new Error(
      `SearXNG ${res.status}: ${await res.text().catch(() => '')}`,
    )
  }
  const data = (await res.json()) as { results?: SearxngRawResult[] }
  return data.results ?? []
}

async function extractReadable(
  url: string,
): Promise<{ title: string; content: string }> {
  const res = await queryWithTimeout(
    url,
    { headers: BROWSER_HEADERS, redirect: 'follow' },
    FETCH_TIMEOUT_MS,
  )
  if (!res.ok) throw new Error(`fetch ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('text/html')) throw new Error(`non-html: ${ct}`)

  const html = await res.text()
  const virtualConsole = new VirtualConsole()
  const dom = new JSDOM(html, { url, virtualConsole })
  const article = new Readability(dom.window.document).parse()
  const text = article?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  if (!text) throw new Error('no readable content')
  return {
    title: article?.title?.trim() ?? '',
    content: text.slice(0, MAX_CONTENT_CHARS),
  }
}

export async function fetchUrl(rawUrl: string): Promise<FetchedPage> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`invalid URL: ${rawUrl}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`unsupported protocol: ${parsed.protocol}`)
  }
  const { title, content } = await extractReadable(parsed.toString())
  return { url: parsed.toString(), title, content }
}

export async function webSearch(query: string): Promise<SearchResult[]> {
  const raw = await searxng(query)
  const top = raw
    .filter((r): r is SearxngRawResult & { url: string; title: string } =>
      Boolean(r.url && r.title),
    )
    .slice(0, env.SEARCH_TOP_N)

  return await Promise.all(
    top.map(async (r) => {
      let content = ''
      try {
        content = (await extractReadable(r.url)).content
      } catch {
        content = r.content ?? ''
      }
      return {
        title: r.title,
        url: r.url,
        snippet: r.content ?? '',
        content,
      }
    }),
  )
}
