import type { Chat, Message, PhotoSize, User } from 'grammy/types'
import type { ReplyContext } from './mention'

export type GuestMessage = Message & {
  guest_query_id?: string
  guest_bot_caller_user?: User
  guest_bot_caller_chat?: Chat
}

export type GuestUpdate = {
  guest_message?: GuestMessage
}

export type BotIdentity = {
  id: number
  username: string
}

export type GuestInteraction = {
  queryId: string
  cleanedText: string
  replyContext: ReplyContext | null
  imageFileId: string | null
  messageId: number
  chatId: number | string
  senderId: number | null
  senderIsBot: boolean
}

export type GuestDecision =
  | { ok: true }
  | { ok: false; reason: 'duplicate' | 'bot-sender' | 'rate-limited' }

const GUEST_QUERY_TTL_MS = 10 * 60 * 1000
const GUEST_MIN_SENDER_INTERVAL_MS = 5_000
const GUEST_CACHE_MAX = 500

const seenGuestQueries = new Map<string, number>()
const guestSenderLastReply = new Map<string, number>()

export function detectGuestInteraction(
  update: GuestUpdate,
  bot: BotIdentity,
): GuestInteraction | null {
  const message = update.guest_message
  const queryId = message?.guest_query_id
  if (!message || !queryId) return null

  const text = message.text ?? message.caption ?? ''
  const hasPhoto = !!message.photo?.length
  const replyContext = extractReplyContext(message, bot)
  if (
    !text.trim() &&
    !hasPhoto &&
    !replyContext?.text &&
    !replyContext?.imageFileId
  ) {
    return null
  }

  return {
    queryId,
    cleanedText: cleanBotMention(text, message, bot),
    replyContext,
    imageFileId: pickLargestPhoto(message),
    messageId: message.message_id,
    chatId: message.chat.id,
    senderId: message.from?.id ?? null,
    senderIsBot: message.from?.is_bot === true,
  }
}

export function evaluateGuestInteraction(
  interaction: GuestInteraction,
  now = Date.now(),
): GuestDecision {
  pruneGuestCache(seenGuestQueries, now, GUEST_QUERY_TTL_MS)
  pruneGuestCache(guestSenderLastReply, now, GUEST_QUERY_TTL_MS)

  if (seenGuestQueries.has(interaction.queryId)) {
    return { ok: false, reason: 'duplicate' }
  }

  if (interaction.senderIsBot) {
    seenGuestQueries.set(interaction.queryId, now)
    trimGuestCache(seenGuestQueries)
    return { ok: false, reason: 'bot-sender' }
  }

  const senderKey = guestSenderKey(interaction)
  const lastReplyAt = guestSenderLastReply.get(senderKey)
  if (
    typeof lastReplyAt === 'number' &&
    now - lastReplyAt < GUEST_MIN_SENDER_INTERVAL_MS
  ) {
    seenGuestQueries.set(interaction.queryId, now)
    trimGuestCache(seenGuestQueries)
    return { ok: false, reason: 'rate-limited' }
  }

  seenGuestQueries.set(interaction.queryId, now)
  guestSenderLastReply.set(senderKey, now)
  trimGuestCache(seenGuestQueries)
  trimGuestCache(guestSenderLastReply)
  return { ok: true }
}

export function resetGuestSafeguardsForTest() {
  seenGuestQueries.clear()
  guestSenderLastReply.clear()
}

function extractReplyContext(
  message: GuestMessage,
  bot: BotIdentity,
): ReplyContext | null {
  const reply = message.reply_to_message
  if (!reply) return null
  const text = reply.text ?? reply.caption ?? ''
  const imageFileId = pickLargestPhoto(reply)
  if (!text.trim() && !imageFileId) return null
  const from = reply.from
  const isBot = from?.id === bot.id
  const author = isBot
    ? 'the assistant (you)'
    : from?.username
      ? `@${from.username}`
      : (from?.first_name ?? 'someone')
  return { author, isBot, text: text.trim(), imageFileId }
}

function cleanBotMention(
  text: string,
  message: GuestMessage,
  bot: BotIdentity,
): string {
  const entities = message.entities ?? message.caption_entities ?? []
  let cleaned = text
  for (const entity of entities) {
    if (entity.type === 'mention') {
      const handle = text
        .slice(entity.offset, entity.offset + entity.length)
        .toLowerCase()
      if (handle === `@${bot.username.toLowerCase()}`) {
        cleaned = stripSlice(cleaned, entity.offset, entity.length)
      }
    } else if (entity.type === 'text_mention' && entity.user?.id === bot.id) {
      cleaned = stripSlice(cleaned, entity.offset, entity.length)
    }
  }
  return cleaned.replace(/\s+/g, ' ').trim()
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

function guestSenderKey(interaction: GuestInteraction): string {
  if (interaction.senderId !== null) return `user:${interaction.senderId}`
  return `chat:${interaction.chatId}`
}

function pruneGuestCache(
  cache: Map<string, number>,
  now: number,
  ttlMs: number,
) {
  for (const [key, timestamp] of cache) {
    if (now - timestamp > ttlMs) cache.delete(key)
  }
}

function trimGuestCache(cache: Map<string, number>) {
  while (cache.size > GUEST_CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (!oldest) return
    cache.delete(oldest)
  }
}
