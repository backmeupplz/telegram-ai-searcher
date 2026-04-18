import type { Context } from 'grammy'

export type Trigger = {
  triggered: boolean
  cleanedText: string
}

export function detectTrigger(ctx: Context): Trigger {
  const message = ctx.message
  const text = message?.text ?? message?.caption ?? ''
  if (!message || !text.trim()) {
    return { triggered: false, cleanedText: '' }
  }

  if (ctx.chat?.type === 'private') {
    return { triggered: true, cleanedText: text.trim() }
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

  if (!mentioned && !repliedToBot) {
    return { triggered: false, cleanedText: '' }
  }

  return { triggered: true, cleanedText: cleaned.replace(/\s+/g, ' ').trim() }
}

function stripSlice(text: string, offset: number, length: number): string {
  return text.slice(0, offset) + ' '.repeat(length) + text.slice(offset + length)
}
