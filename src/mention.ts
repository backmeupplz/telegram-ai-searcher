import type { Context } from 'grammy'

export type ReplyContext = {
  author: string
  isBot: boolean
  text: string
}

export type Trigger = {
  triggered: boolean
  cleanedText: string
  replyContext: ReplyContext | null
}

export function detectTrigger(ctx: Context): Trigger {
  const message = ctx.message
  const text = message?.text ?? message?.caption ?? ''
  const empty: Trigger = {
    triggered: false,
    cleanedText: '',
    replyContext: null,
  }
  if (!message || !text.trim()) return empty

  if (ctx.chat?.type === 'private') {
    return {
      triggered: true,
      cleanedText: text.trim(),
      replyContext: extractReplyContext(ctx),
    }
  }

  const botId = ctx.me.id
  const botUsername = ctx.me.username.toLowerCase()

  const repliedToBot = message.reply_to_message?.from?.id === botId
  const entities = message.entities ?? message.caption_entities ?? []

  let mentioned = false
  let cleaned = text
  for (const entity of entities) {
    if (entity.type === 'text_mention' && entity.user?.id === botId) {
      mentioned = true
      cleaned = stripSlice(cleaned, entity.offset, entity.length)
    } else if (entity.type === 'mention') {
      const handle = text
        .slice(entity.offset, entity.offset + entity.length)
        .toLowerCase()
      if (handle === `@${botUsername}`) {
        mentioned = true
        cleaned = stripSlice(cleaned, entity.offset, entity.length)
      }
    }
  }

  if (!mentioned && !repliedToBot) return empty

  return {
    triggered: true,
    cleanedText: cleaned.replace(/\s+/g, ' ').trim(),
    replyContext: extractReplyContext(ctx),
  }
}

function extractReplyContext(ctx: Context): ReplyContext | null {
  const reply = ctx.message?.reply_to_message
  if (!reply) return null
  const text = reply.text ?? reply.caption ?? ''
  if (!text.trim()) return null
  const from = reply.from
  const isBot = from?.id === ctx.me.id
  const author = isBot
    ? 'the assistant (you)'
    : from?.username
      ? `@${from.username}`
      : (from?.first_name ?? 'someone')
  return { author, isBot, text: text.trim() }
}

function stripSlice(text: string, offset: number, length: number): string {
  return text.slice(0, offset) + ' '.repeat(length) + text.slice(offset + length)
}
