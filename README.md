# telegram-ai-searcher

Telegram bot that answers free-form questions by searching the web and streaming the reply live into chat. Built with [grammY](https://grammy.dev), [Vercel AI SDK](https://sdk.vercel.ai), [Fireworks AI](https://fireworks.ai), and self-hosted [SearXNG](https://github.com/searxng/searxng).

- Runs on [Bun](https://bun.sh)
- Answers stream token-by-token via [`@grammyjs/stream`](https://grammy.dev/plugins/stream)
- Only replies when the bot is `@mentioned` or a message is a reply to the bot (in private chats it always responds)
- Web search goes through your own SearXNG instance; top results are fetched and passed through Mozilla Readability before being handed to the model
- Sends `typing` chat action while preparing the answer

## Requirements

- [Bun](https://bun.sh) 1.1+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A [Fireworks AI](https://fireworks.ai) API key and the full model id you want to use
- A running [SearXNG](https://github.com/searxng/searxng) instance with the JSON format enabled

## Running SearXNG locally

Run it in a separate container — not part of this repo:

```bash
docker run --rm -d --name searxng \
  -p 8080:8080 \
  -e BASE_URL=http://localhost:8080/ \
  -e INSTANCE_NAME=local \
  searxng/searxng
```

After it starts, enable JSON output by editing the generated `settings.yml` inside the container (or mount your own) and adding `json` to `search.formats`. The bot expects `${SEARXNG_URL}/search?format=json` to return `{ results: [...] }`.

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

1. User sends a message in a chat where the bot is present. In a group it must `@mention` the bot or reply to one of its messages.
2. The bot sends a `typing` action and invokes Fireworks via the Vercel AI SDK with a single `web_search` tool.
3. When the model calls `web_search`, the bot hits SearXNG, fetches the top N URLs, and extracts clean text via [`@mozilla/readability`](https://github.com/mozilla/readability) before returning it to the model.
4. The model synthesizes an answer, which is streamed token-by-token back to Telegram using `ctx.replyWithStream`.

## License

MIT
