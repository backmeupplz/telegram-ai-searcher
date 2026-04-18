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

const SYSTEM_PROMPT = `You are a helpful assistant running inside a Telegram chat.

- When a question needs fresh, current, or factual information, call the web_search tool.
- You may call web_search multiple times with different queries to cover a topic.
- Synthesize a clear, direct answer from the search results. Cite sources inline as markdown links using only the domain name, e.g. [wikipedia.org](https://...).
- Keep answers compact and conversational; this is a chat, not an essay.
- Use Telegram-compatible markdown only (bold, italics, inline links). No headings, no tables.`

export function answer(question: string): AsyncIterable<string> {
  const result = streamText({
    model: fireworks(env.FIREWORKS_MODEL),
    system: SYSTEM_PROMPT,
    prompt: question,
    stopWhen: stepCountIs(5),
    tools: {
      web_search: tool({
        description:
          'Search the web for current information. Use for anything recent, factual, or outside common knowledge. Returns top results with extracted page content.',
        inputSchema: z.object({
          query: z
            .string()
            .min(1)
            .describe('A focused search query, as you would type into Google.'),
        }),
        execute: async ({ query }) => {
          try {
            const results = await webSearch(query)
            if (results.length === 0) {
              return { query, results: [], note: 'No results found.' }
            }
            return { query, results }
          } catch (error) {
            return {
              query,
              results: [],
              error: error instanceof Error ? error.message : String(error),
            }
          }
        },
      }),
    },
  })

  return result.textStream
}
