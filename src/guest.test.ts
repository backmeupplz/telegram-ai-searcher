import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  detectGuestInteraction,
  evaluateGuestInteraction,
  resetGuestSafeguardsForTest,
  type GuestUpdate,
} from './guest.ts'

const bot = { id: 42, username: 'frdy_bot' }

test('detects a guest mention and strips the bot handle', () => {
  const update: GuestUpdate = {
    guest_message: {
      message_id: 10,
      date: 1,
      chat: { id: -100, type: 'group', title: 'Chat' },
      from: { id: 7, is_bot: false, first_name: 'Nikita' },
      text: '@frdy_bot summarize this',
      entities: [{ type: 'mention', offset: 0, length: 9 }],
      guest_query_id: 'guest-1',
    },
  }

  const interaction = detectGuestInteraction(update, bot)

  assert.equal(interaction?.queryId, 'guest-1')
  assert.equal(interaction?.cleanedText, 'summarize this')
  assert.equal(interaction?.senderIsBot, false)
})

test('uses the replied-to guest message as bounded context', () => {
  const update: GuestUpdate = {
    guest_message: {
      message_id: 11,
      date: 1,
      chat: { id: -100, type: 'group', title: 'Chat' },
      from: { id: 7, is_bot: false, first_name: 'Nikita' },
      text: 'what does this mean?',
      guest_query_id: 'guest-2',
      reply_to_message: {
        message_id: 9,
        date: 1,
        chat: { id: -100, type: 'group', title: 'Chat' },
        from: { id: 8, is_bot: false, first_name: 'Alice' },
        text: 'Telegram launched Guest Mode.',
        reply_to_message: undefined,
      },
    },
  }

  const interaction = detectGuestInteraction(update, bot)

  assert.equal(interaction?.cleanedText, 'what does this mean?')
  assert.deepEqual(interaction?.replyContext, {
    author: 'Alice',
    isBot: false,
    text: 'Telegram launched Guest Mode.',
    imageFileId: null,
  })
})

test('ignores malformed guest updates without a guest query id', () => {
  const update: GuestUpdate = {
    guest_message: {
      message_id: 12,
      date: 1,
      chat: { id: -100, type: 'group', title: 'Chat' },
      from: { id: 7, is_bot: false, first_name: 'Nikita' },
      text: '@frdy_bot hello',
    },
  }

  assert.equal(detectGuestInteraction(update, bot), null)
})

test('deduplicates guest query ids and rate-limits repeated senders', () => {
  resetGuestSafeguardsForTest()
  const interaction = {
    queryId: 'guest-3',
    cleanedText: 'hello',
    replyContext: null,
    imageFileId: null,
    messageId: 13,
    chatId: -100,
    senderId: 7,
    senderIsBot: false,
  }

  assert.deepEqual(evaluateGuestInteraction(interaction, 1_000), { ok: true })
  assert.deepEqual(evaluateGuestInteraction(interaction, 1_001), {
    ok: false,
    reason: 'duplicate',
  })
  assert.deepEqual(
    evaluateGuestInteraction({ ...interaction, queryId: 'guest-4' }, 2_000),
    { ok: false, reason: 'rate-limited' },
  )
  assert.deepEqual(
    evaluateGuestInteraction({ ...interaction, queryId: 'guest-5' }, 7_000),
    { ok: true },
  )
})

test('rejects bot-originated guest messages to prevent bot loops', () => {
  resetGuestSafeguardsForTest()
  const decision = evaluateGuestInteraction(
    {
      queryId: 'guest-6',
      cleanedText: 'hello',
      replyContext: null,
      imageFileId: null,
      messageId: 14,
      chatId: -100,
      senderId: 99,
      senderIsBot: true,
    },
    1_000,
  )

  assert.deepEqual(decision, { ok: false, reason: 'bot-sender' })
})
