import assert from 'node:assert/strict'
import { test } from 'node:test'

const REQUIRED_ENV = {
  TELEGRAM_BOT_TOKEN: 'test-token',
  FIREWORKS_API_KEY: 'test-key',
  FIREWORKS_MODEL: 'accounts/fireworks/models/test-model',
}

let importId = 0

async function loadEnv(toolStepLimit?: string) {
  const keys = [...Object.keys(REQUIRED_ENV), 'TOOL_STEP_LIMIT']
  const previous = new Map(keys.map((key) => [key, process.env[key]]))

  Object.assign(process.env, REQUIRED_ENV)
  if (toolStepLimit === undefined) {
    delete process.env.TOOL_STEP_LIMIT
  } else {
    process.env.TOOL_STEP_LIMIT = toolStepLimit
  }

  try {
    return await import(`./env.ts?case=${importId++}`)
  } finally {
    for (const key of keys) {
      const value = previous.get(key)
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test('defaults tool step limit to 150', async () => {
  const { env } = await loadEnv()

  assert.equal(env.TOOL_STEP_LIMIT, 150)
})

test('accepts a valid configured tool step limit', async () => {
  const { env } = await loadEnv('200')

  assert.equal(env.TOOL_STEP_LIMIT, 200)
})

test('rejects invalid tool step limits', async () => {
  await assert.rejects(loadEnv('0'), /TOOL_STEP_LIMIT must be a positive integer/)
  await assert.rejects(loadEnv('-1'), /TOOL_STEP_LIMIT must be a positive integer/)
  await assert.rejects(loadEnv('abc'), /TOOL_STEP_LIMIT must be a positive integer/)
  await assert.rejects(loadEnv('301'), /TOOL_STEP_LIMIT must be at most 300/)
})
