import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  imageResultCaption,
  imageResultsFallbackHtml,
} from './image-results.ts'
import type { ImageSearchResult } from './image-search-results.ts'

const result: ImageSearchResult = {
  title: 'A <nice> image & source',
  imageUrl: 'https://cdn.example.com/photo.jpg',
  thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
  pageUrl: 'https://example.com/gallery?x=1&y=2',
  source: 'example.com',
}

test('formats photo captions with escaped source attribution', () => {
  const caption = imageResultCaption(result, 0, 2)

  assert.match(caption, /^1\/2: <b>A &lt;nice&gt; image &amp; source<\/b>/)
  assert.match(
    caption,
    /Source: <a href="https:\/\/example.com\/gallery\?x=1&amp;y=2">example.com<\/a>/,
  )
  assert.ok(caption.length <= 1024)
})

test('formats inline and guest fallback links without raw image sending', () => {
  const html = imageResultsFallbackHtml('corgis', [result])

  assert.match(html, /Image results for <b>corgis<\/b>:/)
  assert.match(html, /<a href="https:\/\/example.com\/gallery\?x=1&amp;y=2">/)
  assert.ok(html.length <= 4096)
})
