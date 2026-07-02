# telegram-ai-searcher

Telegram bot that answers free-form questions by searching the web and streaming the reply live into chat. It also supports Telegram inline mode, so you can type the bot username plus a question in any chat and send the generated answer. With Telegram Guest Mode enabled, supported chats can summon the bot for a single contextual reply without adding it as a member. Built with [grammY](https://grammy.dev), [Vercel AI SDK](https://sdk.vercel.ai), an OpenAI-compatible LLM endpoint, and self-hosted [SearXNG](https://github.com/searxng/searxng).

**Live demo:** [@frdy_bot](https://t.me/frdy_bot) — DM it a question, mention it in a group, summon it as a guest, or use it inline.

## Features

- Runs on [Bun](https://bun.sh) with TypeScript
- Answers stream token-by-token into Telegram via [`@grammyjs/stream`](https://grammy.dev/plugins/stream)
- Live status message during processing (`Thinking…` → `Searching the web for "…"` → `Generating response…`) that's deleted the moment the streamed answer starts
- `typing` chat action sent on every request
- Only replies when the bot is `@mentioned` or the message is a reply to the bot (in private chats it always responds)
- Answers inline queries with a sendable article result
- Answers Telegram Guest Mode summons with one `answerGuestQuery` reply that is edited while the answer is generated
- Web search runs against your own SearXNG instance; top N results are fetched and passed through Mozilla Readability before being handed to the model
- Explicit image requests search SearXNG's image category and send a small set of Telegram photo results with source captions
- Inline source citations in the answer, with the full URL preserved and only the domain shown as link text
- HTML responses are gated through a stack-balanced stream so partial tags never hit Telegram's parser mid-draft

## Requirements

- [Bun](https://bun.sh) 1.1+
- A Telegram bot token from [@BotFather](https://t.me/BotFather) (turn **Group Privacy** off if you want normal member-bot mentions/replies to work in groups, enable **Inline Mode** plus **Inline Feedback** if you want `@bot query` usage with live edits, and enable **Guest Mode** if you want `@frdy_bot` to be summoned in supported chats without adding it as a member)
- An OpenAI-compatible LLM API key, base URL, and model id
- A running [SearXNG](https://github.com/searxng/searxng) instance with the JSON format enabled

## Running SearXNG locally

Run it separately — it's not part of this repo:

```bash
mkdir -p ~/searxng-config
docker run -d --name searxng \
  -p 8080:8080 \
  -v $HOME/searxng-config:/etc/searxng \
  -e "SEARXNG_SECRET=$(openssl rand -hex 32)" \
  --restart unless-stopped \
  searxng/searxng
```

The first launch populates `~/searxng-config/settings.yml`. Add `- json` under `search.formats` and restart the container. The bot expects `${SEARXNG_URL}/search?format=json` to return `{ results: [...] }`.

## Setup

```bash
git clone https://github.com/backmeupplz/telegram-ai-searcher
cd telegram-ai-searcher
bun install
cp .env.example .env
# fill in TELEGRAM_BOT_TOKEN, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, SEARXNG_URL
bun run start
```

## Environment

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `LLM_API_KEY` | OpenAI-compatible LLM API key |
| `LLM_BASE_URL` | OpenAI-compatible base URL |
| `LLM_MODEL` | Model id for text/tool responses |
| `LLM_MODEL_FALLBACKS` | Optional comma-separated text model ids tried after `LLM_MODEL` when a model errors or produces no answer |
| `LLM_VISION_MODEL` | Optional model id for image understanding (defaults to `LLM_MODEL`) |
| `SEARXNG_URL` | Base URL of your SearXNG instance (default `http://localhost:8080`) |
| `SEARCH_TOP_N` | Number of results to fetch and extract per query (default `3`) |
| `IMAGE_SEARCH_TOP_N` | Number of image results to parse from SearXNG before Telegram delivery filtering (default `6`) |
| `ANSWER_STEP_LIMIT` | Maximum answer-generation tool-call steps before stopping (default `150`, max `300`) |

## How it works

1. User sends a message. In a group the bot only reacts when `@mentioned` or the message replies to one of its own. Inline queries are handled through Telegram's `inline_query` update, and Guest Mode summons are handled through Telegram Bot API 10.0 `guest_message` updates.
2. `src/mention.ts` decides whether a normal chat message should trigger a reply. `src/guest.ts` validates guest updates, strips the bot mention, extracts only the summoning/replied-to context Telegram provided, and rate-limits repeated sender/query handling.
3. A `typing` action fires for normal messages and an italic status message is posted: `🤔 Thinking…`. Guest mode instead sends one immediate `answerGuestQuery` placeholder reply.
4. Explicit image requests such as "show me photos of corgis" bypass the text-answer model path, query SearXNG's image category, sanitize remote image URLs, and send up to three results.
5. Other messages go to the configured LLM via the Vercel AI SDK, with a single `web_search` tool available. If `LLM_MODEL_FALLBACKS` is set, the bot tries those text models in order when the current model errors or finishes without a meaningful answer.
6. When the model calls `web_search`, the status edits to `🔎 Searching the web for "<query>"…`; the bot hits SearXNG, fetches the top N URLs, and extracts clean text via [`@mozilla/readability`](https://github.com/mozilla/readability) before returning it.
7. When tool results land, the status edits to `🧠 Generating response…`.
8. As soon as the model emits the first text token, private chats use `ctx.replyWithStream`, groups edit the status message into the final answer, inline mode edits the chosen inline message, and Guest Mode edits the single guest reply returned by `answerGuestQuery`.

For inline mode, the bot immediately returns a sendable `Thinking...` article. When the user sends it, the message quotes the original prompt and then edits through search/generation updates into the final answer. Telegram only exposes the editable inline message id when inline feedback is enabled and the inline result has an inline keyboard, so the bot attaches a minimal temporary `...` button while working and removes it on the final edit.

For explicit image requests, private and group chats send photo messages with source captions. Inline mode returns Telegram photo results directly. Guest Mode cannot rely on follow-up media sends, so image requests receive a compact source-link fallback in the single `answerGuestQuery` response.

For Guest Mode, enable **Guest Mode** in BotFather for the deployed bot. Telegram sends `guest_message` updates only for each summon and includes only the summoning message plus the replied-to message when present. The bot answers with `answerGuestQuery` once, then edits the returned inline message id for text answers; it does not assume chat history or send follow-up messages. Bot-originated guest messages are ignored and repeated human summons are rate-limited to reduce loop risk.

## Deployment

The repo ships with a `nixpacks.toml`, so any Nixpacks-compatible host (Railway, Coolify, Dokploy, Nixpacks CLI, etc.) builds and runs it with no extra config:

```bash
nixpacks build . --name telegram-ai-searcher
docker run --env-file .env telegram-ai-searcher
```

## License

MIT
