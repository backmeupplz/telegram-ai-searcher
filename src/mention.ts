import type { Context } from 'grammy'
import type { Message, PhotoSize } from 'grammy/types'

export type ReplyContext = {
  author: string
  isBot: boolean
  text: string
  imageFileId: string | null
}

export type Trigger = {
  triggered: boolean
  cleanedText: string
  replyContext: ReplyContext | null
  imageFileId: string | null
}

export function detectTrigger(ctx: Context): Trigger {
  const message = ctx.message
  const text = message?.text ?? message?.caption ?? ''
  const empty: Trigger = {
    triggered: false,
    cleanedText: '',
    replyContext: null,
    imageFileId: null,
  }
  const hasPhoto = !!message?.photo?.length
  if (!message || (!text.trim() && !hasPhoto)) return empty

  if (ctx.chat?.type === 'private') {
    return {
      triggered: true,
      cleanedText: text.trim(),
      replyContext: extractReplyContext(ctx),
      imageFileId: pickLargestPhoto(message),
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
    imageFileId: pickLargestPhoto(message),
  }
}

function extractReplyContext(ctx: Context): ReplyContext | null {
  const reply = ctx.message?.reply_to_message
  if (!reply) return null
  const text = reply.text ?? reply.caption ?? ''
  const imageFileId = pickLargestPhoto(reply)
  if (!text.trim() && !imageFileId) return null
  const from = reply.from
  const isBot = from?.id === ctx.me.id
  const author = isBot
    ? 'the assistant (you)'
    : from?.username
      ? `@${from.username}`
      : (from?.first_name ?? 'someone')
  return { author, isBot, text: text.trim(), imageFileId }
}

function pickLargestPhoto(message: Message | undefined): string | null {
  const photo = message?.photo
  if (!photo?.length) return null
  const largest = photo.reduce<PhotoSize>(
    (best, current) =>
      current.width * current.height > best.width * best.height ? current : best,
    photo[0]!,
  )
  return largest.file_id
}

function stripSlice(text: string, offset: number, length: number): string {
  return text.slice(0, offset) + ' '.repeat(length) + text.slice(offset + length)
}
