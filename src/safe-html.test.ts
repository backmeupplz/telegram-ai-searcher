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

test('safe HTML stream converts common markdown formatting to Telegram HTML', async () => {
  const html = await collect(
    chunks([
      '\n\n# Heading\n',
      'Use **bold & clear** text, `x < y`, and [source](https://example.com/?a=1&b=2).',
    ]),
  )

  assert.equal(
    html,
    '<b>Heading</b>\nUse <b>bold &amp; clear</b> text, <code>x &lt; y</code>, and <a href="https://example.com/?a=1&amp;b=2">source</a>.',
  )
})

test('safe HTML stream keeps split markdown tokens until they can render', async () => {
  const html = await collect(chunks(['**bo', 'ld** and ', '`co', 'de`']))

  assert.equal(html, '<b>bold</b> and <code>code</code>')
})

test('safe HTML stream escapes text while preserving supported HTML tags', async () => {
  const html = await collect(
    chunks(['Tom & Jerry <b>win</b> with <script>alert(1)</script>.']),
  )

  assert.equal(
    html,
    'Tom &amp; Jerry <b>win</b> with &lt;script&gt;alert(1)&lt;/script&gt;.',
  )
})
