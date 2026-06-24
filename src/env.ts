import { parseAnswerStepLimit } from './answer-limit.ts'

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const env = {
  TELEGRAM_BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
  LLM_API_KEY: required('LLM_API_KEY'),
  LLM_MODEL: required('LLM_MODEL'),
  // Vision-capable model, used only when the request includes an image.
  // LLM_MODEL stays the default for text/tool work.
  LLM_VISION_MODEL: process.env.LLM_VISION_MODEL ?? required('LLM_MODEL'),
  LLM_BASE_URL: required('LLM_BASE_URL').replace(/\/+$/, ''),
  SEARXNG_URL: (process.env.SEARXNG_URL ?? 'http://localhost:8080').replace(
    /\/+$/,
    '',
  ),
  SEARCH_TOP_N: Number(process.env.SEARCH_TOP_N ?? 3),
  IMAGE_SEARCH_TOP_N: Number(process.env.IMAGE_SEARCH_TOP_N ?? 6),
  ANSWER_STEP_LIMIT: parseAnswerStepLimit(process.env.ANSWER_STEP_LIMIT),
}
