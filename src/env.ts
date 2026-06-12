import { parseAnswerStepLimit } from './answer-limit.ts'

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const env = {
  TELEGRAM_BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
  FIREWORKS_API_KEY: required('FIREWORKS_API_KEY'),
  FIREWORKS_MODEL: required('FIREWORKS_MODEL'),
  // Vision-capable model, used only when the request includes an image.
  // FIREWORKS_MODEL stays the default for text/tool work.
  FIREWORKS_VISION_MODEL: process.env.FIREWORKS_VISION_MODEL ?? 'mimo-v2.5',
  LLM_BASE_URL: (
    process.env.LLM_BASE_URL ?? 'https://api.fireworks.ai/inference/v1'
  ).replace(/\/+$/, ''),
  SEARXNG_URL: (process.env.SEARXNG_URL ?? 'http://localhost:8080').replace(
    /\/+$/,
    '',
  ),
  SEARCH_TOP_N: Number(process.env.SEARCH_TOP_N ?? 3),
  IMAGE_SEARCH_TOP_N: Number(process.env.IMAGE_SEARCH_TOP_N ?? 6),
  ANSWER_STEP_LIMIT: parseAnswerStepLimit(process.env.ANSWER_STEP_LIMIT),
}
