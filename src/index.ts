import { autoRetry } from '@grammyjs/auto-retry'
import { stream, type StreamFlavor } from '@grammyjs/stream'
import { Bot, type Context } from 'grammy'
import { answer, type BotEvent } from './ai'
import { env } from './env'
import { detectTrigger } from './mention'
import { safeHtmlStream } from './safe-html'

type AppContext = StreamFlavor<Context>

const bot = new Bot<AppContext>(env.TELEGRAM_BOT_TOKEN)

bot.api.config.use(autoRetry())
bot.use(stream())

bot.on('message', async (ctx) => {
  const { triggered, cleanedText } = detectTrigger(ctx)
  if (!triggered || !cleanedText) return

  const chatId = ctx.chat.id
  const replyToId = ctx.message.message_id

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

    const iterator = answer(cleanedText)[Symbol.asyncIterator]()
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

    if (statusMsgId !== null) {
      await ctx.api
        .deleteMessage(chatId, statusMsgId)
        .catch(() => undefined)
      statusMsgId = null
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

    await ctx.replyWithStream(
      safeHtmlStream(textStream),
      { parse_mode: 'HTML' },
      {
        parse_mode: 'HTML',
        reply_parameters: { message_id: replyToId },
        link_preview_options: { is_disabled: true },
      },
    )
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

await bot.start({
  onStart: (me) => console.log(`telegram-ai-searcher online as @${me.username}`),
})
