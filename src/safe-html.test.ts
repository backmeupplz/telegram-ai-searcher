import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeHtmlStream } from './safe-html.ts'

async function collect(source: AsyncIterable<string>): Promise<string> {
  let output = ''
  for await (const chunk of safeHtmlStream(source)) output += chunk
  return output
}

async function* chunks(values: string[]): AsyncGenerator<string> {
  for (const value of values) yield value
}

test('safe HTML stream drops leading blank answer lines', async () => {
  const html = await collect(chunks(['\n\n  ', 'Answer starts here.']))

  assert.equal(html, 'Answer starts here.')
})

test('safe HTML stream preserves whitespace after answer starts', async () => {
  const html = await collect(chunks(['<b>Answer</b>', '\n\nNext paragraph.']))

  assert.equal(html, '<b>Answer</b>\n\nNext paragraph.')
})
