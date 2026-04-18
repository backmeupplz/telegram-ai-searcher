# telegram-ai-searcher

Telegram bot that answers free-form questions by searching the web and streaming the reply live into chat. Built with [grammY](https://grammy.dev), [Vercel AI SDK](https://sdk.vercel.ai), [Fireworks AI](https://fireworks.ai), and self-hosted [SearXNG](https://github.com/searxng/searxng).

**Live demo:** [@frdy_bot](https://t.me/frdy_bot) — DM it a question, or mention it in a group.

## Features

- Runs on [Bun](https://bun.sh) with TypeScript
- Answers stream token-by-token into Telegram via [`@grammyjs/stream`](https://grammy.dev/plugins/stream)
- Live status message during processing (`Thinking…` → `Searching the web for "…"` → `Generating response…`) that's deleted the moment the streamed answer starts
- `typing` chat action sent on every request
- Only replies when the bot is `@mentioned` or the message is a reply to the bot (in private chats it always responds)
- Web search runs against your own SearXNG instance; top N results are fetched and passed through Mozilla Readability before being handed to the model
- Inline source citations in the answer, with the full URL preserved and only the domain shown as link text
- HTML responses are gated through a stack-balanced stream so partial tags never hit Telegram's parser mid-draft

## Requirements

- [Bun](https://bun.sh) 1.1+
- A Telegram bot token from [@BotFather](https://t.me/BotFather) (turn **Group Privacy** off if you want mentions/replies to work in groups)
- A [Fireworks AI](https://fireworks.ai) API key and the full model id you want to use
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
# fill in TELEGRAM_BOT_TOKEN, FIREWORKS_API_KEY, FIREWORKS_MODEL, SEARXNG_URL
bun run start
```

## Environment

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `FIREWORKS_API_KEY` | Fireworks AI API key |
| `FIREWORKS_MODEL` | Full Fireworks model id, e.g. `accounts/fireworks/models/qwen3-235b-a22b-instruct` |
| `SEARXNG_URL` | Base URL of your SearXNG instance (default `http://localhost:8080`) |
| `SEARCH_TOP_N` | Number of results to fetch and extract per query (default `3`) |

## How it works

1. User sends a message. In a group the bot only reacts when `@mentioned` or the message replies to one of its own.
2. A `typing` action fires and an italic status message is posted: `🤔 Thinking…`.
3. The message goes to Fireworks via the Vercel AI SDK, with a single `web_search` tool available.
4. When the model calls `web_search`, the status edits to `🔎 Searching the web for "<query>"…`; the bot hits SearXNG, fetches the top N URLs, and extracts clean text via [`@mozilla/readability`](https://github.com/mozilla/readability) before returning it.
5. When tool results land, the status edits to `🧠 Generating response…`.
6. As soon as the model emits the first text token, the status message is deleted and `ctx.replyWithStream` takes over, streaming the answer as a live-updating reply.

## Deployment

The repo ships with a `nixpacks.toml`, so any Nixpacks-compatible host (Railway, Coolify, Dokploy, Nixpacks CLI, etc.) builds and runs it with no extra config:

```bash
nixpacks build . --name telegram-ai-searcher
docker run --env-file .env telegram-ai-searcher
```

## License

MIT
