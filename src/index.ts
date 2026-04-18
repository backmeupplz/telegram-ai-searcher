import { autoRetry } from '@grammyjs/auto-retry'
import { run, sequentialize, type RunnerHandle } from '@grammyjs/runner'
import { stream, type StreamFlavor } from '@grammyjs/stream'
import { Bot, type Context } from 'grammy'
import { answer, type BotEvent, type ImageInput } from './ai'
import { env } from './env'
import { detectTrigger } from './mention'
import { safeHtmlStream } from './safe-html'

type AppContext = StreamFlavor<Context>

const bot = new Bot<AppContext>(env.TELEGRAM_BOT_TOKEN)

bot.api.config.use(autoRetry())
bot.use(sequentialize((ctx) => ctx.from?.id.toString()))
bot.use(stream())

const GROUP_EDIT_INTERVAL_MS = 1500
const GROUP_MIN_FIRST_EDIT_CHARS = 15

const START_MESSAGE = `👋 I'm a Telegram bot that answers questions by searching the web and streaming the reply live.

<b>What I do</b>
- Search the web via a self-hosted SearXNG instance
- Fetch and read the top results before replying
- Stream the answer token-by-token, with inline source links
- Understand images you send or reply to

<b>How to use me</b>
- In private chat: just send a question or an image
- In groups: @mention me or reply to one of my messages
- Reply to any message with a question and I'll use it as context
- Write in any language — I'll reply in the same one

I am <b>not</b> ChatGPT, Claude, Gemini, or any other specific assistant — I'm a thin wrapper around whatever open model is configured on the server (currently via Fireworks AI). Source: <a href="https://github.com/backmeupplz/telegram-ai-searcher">github.com/backmeupplz/telegram-ai-searcher</a>`

bot.command('start', async (ctx) => {
  await ctx
    .reply(START_MESSAGE, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })
    .catch(() => undefined)
})

async function resolveImage(
  ctx: AppContext,
  fileId: string,
  source: 'trigger' | 'reply',
): Promise<ImageInput | null> {
  try {
    const file = await ctx.api.getFile(fileId)
    if (!file.file_path) return null
    const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`
    const extension = file.file_path.split('.').pop()?.toLowerCase()
    const mediaType =
      extension === 'png'
        ? 'image/png'
        : extension === 'webp'
          ? 'image/webp'
          : extension === 'gif'
            ? 'image/gif'
            : 'image/jpeg'
    return { url, mediaType, source }
  } catch (error) {
    console.error('getFile failed:', error)
    return null
  }
}

bot.on('message', async (ctx) => {
  const {
    triggered,
    cleanedText,
    replyContext,
    imageFileId,
  } = detectTrigger(ctx)
  if (!triggered) return
  const replyImageFileId = replyContext?.imageFileId ?? null
  if (!cleanedText && !imageFileId && !replyImageFileId) return

  const chatId = ctx.chat.id
  const replyToId = ctx.message.message_id
  const isPrivate = ctx.chat.type === 'private'

  await ctx.replyWithChatAction('typing').catch(() => undefined)

  let statusMsgId: number | null = null
  let lastStatus = ''
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const setStatus = async (text: string) => {
    if (text === lastStatus) return
    lastStatus = text
    const html = `<i>${escapeHtml(text)}</i>`
    if (statusMsgId === null) {
      const m = await ctx.reply(html, {
        parse_mode: 'HTML',
        reply_parameters: { message_id: replyToId },
      })
      statusMsgId = m.message_id
    } else {
      await ctx.api
        .editMessageText(chatId, statusMsgId, html, { parse_mode: 'HTML' })
        .catch(() => undefined)
    }
  }

  try {
    await setStatus('🤔 Thinking…')

    const chosenFileId = imageFileId ?? replyImageFileId
    const chosenSource: 'trigger' | 'reply' | null = imageFileId
      ? 'trigger'
      : replyImageFileId
        ? 'reply'
        : null
    const image = chosenFileId && chosenSource
      ? await resolveImage(ctx, chosenFileId, chosenSource)
      : null

    const iterator = answer(cleanedText, replyContext, image)[
      Symbol.asyncIterator
    ]()
    let firstDelta: string | null = null
    while (true) {
      const step = await iterator.next()
      if (step.done) break
      const ev = step.value as BotEvent
      if (ev.kind === 'status') {
        await setStatus(ev.text)
      } else {
        firstDelta = ev.delta
        break
      }
    }

    if (firstDelta === null) {
      await setStatus('No response.')
      return
    }

    const initial = firstDelta
    const textStream = (async function* () {
      yield initial
      while (true) {
        const step = await iterator.next()
        if (step.done) return
        const ev = step.value as BotEvent
        if (ev.kind === 'text') yield ev.delta
      }
    })()

    if (isPrivate) {
      // Draft-based streaming only works in private chats
      if (statusMsgId !== null) {
        await ctx.api
          .deleteMessage(chatId, statusMsgId)
          .catch(() => undefined)
        statusMsgId = null
      }
      await ctx.replyWithStream(
        safeHtmlStream(textStream),
        { parse_mode: 'HTML' },
        {
          parse_mode: 'HTML',
          reply_parameters: { message_id: replyToId },
          link_preview_options: { is_disabled: true },
        },
      )
    } else {
      // Groups: reuse the status message and edit-stream the answer into it.
      // Keep the italic status visible until we have enough text to avoid a
      // jarring one-character flash, then edit periodically with "…" appended.
      let accumulated = ''
      let lastEditAt = 0
      for await (const piece of safeHtmlStream(textStream)) {
        accumulated += piece
        if (accumulated.length < GROUP_MIN_FIRST_EDIT_CHARS) continue
        const now = Date.now()
        if (
          statusMsgId !== null &&
          now - lastEditAt >= GROUP_EDIT_INTERVAL_MS
        ) {
          lastEditAt = now
          lastStatus = ''
          await ctx.api
            .editMessageText(chatId, statusMsgId, `${accumulated} …`, {
              parse_mode: 'HTML',
              link_preview_options: { is_disabled: true },
            })
            .catch(() => undefined)
        }
      }
      if (accumulated && statusMsgId !== null) {
        lastStatus = ''
        await ctx.api
          .editMessageText(chatId, statusMsgId, accumulated, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          })
          .catch(() => undefined)
      }
    }
  } catch (error) {
    console.error('reply failed:', error)
    const msg = `Sorry, something went wrong: ${
      error instanceof Error ? error.message : String(error)
    }`
    if (statusMsgId !== null) {
      await ctx.api
        .editMessageText(chatId, statusMsgId, msg)
        .catch(() => undefined)
    } else {
      await ctx
        .reply(msg, { reply_parameters: { message_id: replyToId } })
        .catch(() => undefined)
    }
  }
})

bot.catch((err) => {
  console.error('bot error:', err.error)
})

await bot.init()
console.log(`telegram-ai-searcher online as @${bot.botInfo.username}`)

let shuttingDown = false
let currentRunner: RunnerHandle | null = null

const shutdown = async (signal: string) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`received ${signal}, stopping runner…`)
  if (currentRunner?.isRunning()) {
    await currentRunner.stop().catch(() => undefined)
  }
  process.exit(0)
}
process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

// Telegram returns 409 Conflict while another getUpdates session is still held
// open on their side — typically for ~50s after a redeploy. grammY's runner
// treats 409 as unrecoverable and rejects its task, so we wrap it in a restart
// loop with backoff instead of letting the process exit.
let backoffMs = 2_000
while (!shuttingDown) {
  currentRunner = run(bot)
  const task = currentRunner.task()
  try {
    if (task) await task
    backoffMs = 2_000
  } catch (err) {
    console.error('[runner] crashed, will restart:', err)
  }
  if (shuttingDown) break
  await new Promise((r) => setTimeout(r, backoffMs))
  backoffMs = Math.min(backoffMs * 2, 60_000)
}
