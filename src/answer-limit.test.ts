import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_ANSWER_STEP_LIMIT,
  MAX_ANSWER_STEP_LIMIT,
  noTextAnswerReason,
  parseAnswerStepLimit,
} from './answer-limit.ts'

test('defaults answer step limit to 150', () => {
  assert.equal(parseAnswerStepLimit(undefined), DEFAULT_ANSWER_STEP_LIMIT)
  assert.equal(parseAnswerStepLimit('  '), DEFAULT_ANSWER_STEP_LIMIT)
})

test('parses a configured answer step limit', () => {
  assert.equal(parseAnswerStepLimit('42'), 42)
  assert.equal(parseAnswerStepLimit(' 150 '), 150)
})

test('rejects invalid answer step limits', () => {
  for (const value of ['0', '-1', '1.5', 'abc']) {
    assert.throws(
      () => parseAnswerStepLimit(value),
      /ANSWER_STEP_LIMIT must be a positive integer/,
    )
  }

  assert.throws(
    () => parseAnswerStepLimit(String(MAX_ANSWER_STEP_LIMIT + 1)),
    /ANSWER_STEP_LIMIT must be <= 300/,
  )
})

test('reports the configured limit when no text is emitted at the tool limit', () => {
  assert.equal(
    noTextAnswerReason('tool-calls', 42, 42),
    'Hit the 42-step tool-call limit before the model produced an answer. Try a narrower question or ask me to summarise what I already found.',
  )
})
