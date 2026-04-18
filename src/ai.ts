import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { stepCountIs, streamText, tool } from 'ai'
import { z } from 'zod'
import { env } from './env'
import { webSearch } from './search'

const fireworks = createOpenAICompatible({
  name: 'fireworks',
  baseURL: 'https://api.fireworks.ai/inference/v1',
  apiKey: env.FIREWORKS_API_KEY,
})

const SYSTEM_PROMPT = `You are a helpful assistant running inside a Telegram chat. The current date is ${new Date().toISOString().slice(0, 10)}.

Your training data is MONTHS OR YEARS old. You MUST use the web_search tool for ANY question that involves:
- current events, news, prices, versions, releases, or anything time-sensitive
- specific products, companies, people, or technologies (including AI models, software, APIs)
- factual claims where recency matters
- anything the user explicitly asks you to "search" or "look up"

Do NOT answer from your own knowledge when the user's question touches any of the above. Call web_search first. You may call it multiple times with different focused queries to cover a topic before answering. Only after you have search results should you synthesize an answer.

CRITICAL rules for FORMULATING the web_search query:
1. NEVER inject specific version numbers, release codenames, or product model names that the user did not write themselves. Any version you "remember" from training is almost certainly outdated. If the user says "opus", your query may include "opus" plus neutral qualifiers like "latest" or "2026", but it must NOT include a specific version like "Opus 3" or "Opus 4" unless the user wrote that version. Same for "gpt" — do NOT expand to "GPT-4o", "GPT-5", etc.
2. You may paraphrase, add synonyms, or include context the user didn't write — but stick to generic, version-neutral phrasing unless you've already learned the current version from a prior search result.
3. If the topic is time-sensitive, include a year or "latest"/"current" in the query (today is ${new Date().toISOString().slice(0, 10)} — year 2026).
4. If early search results surface names or version numbers you didn't expect, TRUST the search results and refine follow-up queries using those — do NOT fall back to pretrained knowledge.

Cite sources inline with a link tag whose href is the EXACT full URL returned by web_search (including path, query string, anchors) and whose visible text is just the domain. Example: if web_search returned https://www.medium.com/@user/why-opus-wins-abc123, cite it as <a href="https://www.medium.com/@user/why-opus-wins-abc123">medium.com</a> — never shorten the href to the bare domain. If the search returns nothing useful, say so instead of guessing.
Keep answers compact and conversational; this is a chat, not an essay.

Formatting rules (IMPORTANT — the message is rendered with Telegram HTML parse mode):
- Use ONLY these HTML tags: <b>bold</b>, <i>italic</i>, <code>inline code</code>, <pre>code block</pre>, <a href="URL">link text</a>.
- Do NOT use markdown syntax like **bold**, *italic*, backticks, or [text](url) — they will appear as literal characters.
- Do NOT use <h1>, <h2>, <ul>, <li>, <br>, <p>, or any other tags — they will break the message.
- Escape literal &, <, > in prose as &amp;, &lt;, &gt;.
- No tables. Use short paragraphs or dash-prefixed lines for lists.`

export type BotEvent =
  | { kind: 'status'; text: string }
  | { kind: 'text'; delta: string }

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export async function* answer(question: string): AsyncGenerator<BotEvent> {
  const result = streamText({
    model: fireworks(env.FIREWORKS_MODEL),
    system: SYSTEM_PROMPT,
    prompt: question,
    stopWhen: stepCountIs(5),
    tools: {
      web_search: tool({
        description:
          'Search the web for current information. Use for anything recent, factual, or outside common knowledge. Returns top results with extracted page content. IMPORTANT: never inject specific version numbers or product codenames the user did not mention; your memory of them is probably stale. Paraphrasing and synonyms are fine.',
        inputSchema: z.object({
          query: z
            .string()
            .min(1)
            .describe(
              'Search query. Paraphrasing is fine, but do NOT invent specific version numbers or product names the user did not write. Add "latest" or the current year for time-sensitive topics.',
            ),
        }),
        execute: async ({ query }) => {
          console.log(`[web_search] ${query}`)
          try {
            const results = await webSearch(query)
            console.log(`[web_search] -> ${results.length} results`)
            if (results.length === 0) {
              return { query, results: [], note: 'No results found.' }
            }
            return { query, results }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            console.log(`[web_search] ERROR: ${message}`)
            return { query, results: [], error: message }
          }
        },
      }),
    },
  })

  let sawToolCallThisStep = false
  for await (const chunk of result.fullStream) {
    if (chunk.type === 'start-step') {
      sawToolCallThisStep = false
    } else if (chunk.type === 'tool-call' && chunk.toolName === 'web_search') {
      sawToolCallThisStep = true
      const query =
        (chunk as unknown as { input?: { query?: string } }).input?.query ?? ''
      yield {
        kind: 'status',
        text: `🔎 Searching the web for "${truncate(query, 80)}"…`,
      }
    } else if (chunk.type === 'tool-result') {
      yield { kind: 'status', text: '🧠 Generating response…' }
    } else if (chunk.type === 'text-delta') {
      if (!sawToolCallThisStep) {
        // Model produced text without searching on this step
      }
      yield { kind: 'text', delta: chunk.text }
    }
  }
}
