import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectImageSearchIntent } from './image-intent.ts'

test('detects explicit image search requests', () => {
  assert.deepEqual(detectImageSearchIntent('show me photos of corgis'), {
    query: 'corgis',
  })
  assert.deepEqual(detectImageSearchIntent('find cyberpunk city images'), {
    query: 'cyberpunk city',
  })
  assert.deepEqual(detectImageSearchIntent('pictures for rainy Vancouver'), {
    query: 'rainy Vancouver',
  })
})

test('does not hijack normal image-understanding prompts', () => {
  assert.equal(detectImageSearchIntent('what is in this image?'), null)
  assert.equal(detectImageSearchIntent('describe the attached image'), null)
  assert.equal(detectImageSearchIntent('search the web for image models'), null)
})
