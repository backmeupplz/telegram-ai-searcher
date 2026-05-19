import assert from 'node:assert/strict'
import { test } from 'node:test'
import { noTextReason } from './no-text-reason.ts'

test('reports the configured step limit when no text is emitted', async () => {
  assert.equal(
    noTextReason('tool-calls', 150, 150),
    'Hit the 150-step tool-call limit before the model produced an answer. Try a narrower question or ask me to summarise what I already found.',
  )
})
