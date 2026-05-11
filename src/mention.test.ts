import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Context } from 'grammy'
import { detectTrigger } from './mention.ts'

const me = { id: 42, username: 'frdy_bot' }

test('private messages still trigger without an explicit mention', () => {
  const trigger = detectTrigger({
    me,
    chat: { id: 7, type: 'private' },
    message: {
      message_id: 1,
      date: 1,
      chat: { id: 7, type: 'private' },
      from: { id: 7, is_bot: false, first_name: 'Nikita' },
      text: 'search the web',
    },
  } as unknown as Context)

  assert.equal(trigger.triggered, true)
  assert.equal(trigger.cleanedText, 'search the web')
})

test('group messages still require a mention or reply to the bot', () => {
  const ignored = detectTrigger({
    me,
    chat: { id: -100, type: 'group' },
    message: {
      message_id: 2,
      date: 1,
      chat: { id: -100, type: 'group', title: 'Chat' },
      from: { id: 7, is_bot: false, first_name: 'Nikita' },
      text: 'search the web',
    },
  } as unknown as Context)

  assert.equal(ignored.triggered, false)

  const mentioned = detectTrigger({
    me,
    chat: { id: -100, type: 'group' },
    message: {
      message_id: 3,
      date: 1,
      chat: { id: -100, type: 'group', title: 'Chat' },
      from: { id: 7, is_bot: false, first_name: 'Nikita' },
      text: '@frdy_bot search the web',
      entities: [{ type: 'mention', offset: 0, length: 9 }],
    },
  } as unknown as Context)

  assert.equal(mentioned.triggered, true)
  assert.equal(mentioned.cleanedText, 'search the web')
})

test('group replies to the bot still include bounded reply context', () => {
  const trigger = detectTrigger({
    me,
    chat: { id: -100, type: 'group' },
    message: {
      message_id: 4,
      date: 1,
      chat: { id: -100, type: 'group', title: 'Chat' },
      from: { id: 7, is_bot: false, first_name: 'Nikita' },
      text: 'explain this',
      reply_to_message: {
        message_id: 3,
        date: 1,
        chat: { id: -100, type: 'group', title: 'Chat' },
        from: {
          id: 42,
          is_bot: true,
          first_name: 'Friday',
          username: 'frdy_bot',
        },
        text: 'A prior answer from Friday.',
        reply_to_message: undefined,
      },
    },
  } as unknown as Context)

  assert.equal(trigger.triggered, true)
  assert.equal(trigger.cleanedText, 'explain this')
  assert.deepEqual(trigger.replyContext, {
    author: 'the assistant (you)',
    isBot: true,
    text: 'A prior answer from Friday.',
    imageFileId: null,
  })
})
