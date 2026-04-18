import { autoRetry } from '@grammyjs/auto-retry'
import { stream, type StreamFlavor } from '@grammyjs/stream'
import { Bot, type Context } from 'grammy'
import { answer } from './ai'
import { env } from './env'
import { detectTrigger } from './mention'

type AppContext = StreamFlavor<Context>

const bot = new Bot<AppContext>(env.TELEGRAM_BOT_TOKEN)

bot.api.config.use(autoRetry())
bot.use(stream())

bot.on('message', async (ctx) => {
  const { triggered, cleanedText } = detectTrigger(ctx)
  if (!triggered || !cleanedText) return

  try {
    await ctx.replyWithChatAction('typing')
  } catch {
    // chat_action is best-effort
  }

  try {
    await ctx.replyWithStream(answer(cleanedText), undefined, {
      reply_parameters: { message_id: ctx.message.message_id },
    })
  } catch (error) {
    console.error('reply failed:', error)
    await ctx
      .reply(
        `Sorry, something went wrong: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { reply_parameters: { message_id: ctx.message.message_id } },
      )
      .catch(() => undefined)
  }
})

bot.catch((err) => {
  console.error('bot error:', err.error)
})

await bot.start({
  onStart: (me) => console.log(`telegram-ai-searcher online as @${me.username}`),
})
