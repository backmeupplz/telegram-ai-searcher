import assert from 'node:assert/strict'
import { test } from 'node:test'

test('parses SearXNG image results and removes unsafe URLs', async () => {
  const { parseImageResults } = await import('./image-search-results.ts')

  const results = parseImageResults(
    [
      {
        title: 'Safe image',
        url: 'https://example.com/post',
        img_src: 'https://cdn.example.com/image.jpg',
        thumbnail: 'https://cdn.example.com/thumb.jpg',
      },
      {
        title: 'Duplicate image',
        url: 'https://example.com/dupe',
        img_src: 'https://cdn.example.com/image.jpg',
      },
      {
        title: 'Local image',
        url: 'https://example.com/local',
        img_src: 'http://localhost/private.jpg',
      },
      {
        title: 'Private IP',
        img_src: 'https://192.168.1.20/private.jpg',
      },
    ],
    6,
  )

  assert.deepEqual(results, [
    {
      title: 'Safe image',
      imageUrl: 'https://cdn.example.com/image.jpg',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      pageUrl: 'https://example.com/post',
      source: 'example.com',
    },
  ])
})

test('normalizes image result fallbacks from alternate SearXNG fields', async () => {
  const { parseImageResults } = await import('./image-search-results.ts')

  const results = parseImageResults([
    {
      content: 'Untitled image result',
      image_src: 'https://images.example.net/a.png#fragment',
      thumbnail_src: 'https://images.example.net/t.png',
      engine: 'google images',
    },
  ], 6)

  assert.equal(results[0]?.title, 'Untitled image result')
  assert.equal(results[0]?.imageUrl, 'https://images.example.net/a.png')
  assert.equal(results[0]?.source, 'google images')
})
