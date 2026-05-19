const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const optionalPositiveInteger = (
  name: string,
  defaultValue: number,
  maxValue?: number,
): number => {
  const raw = process.env[name]
  if (!raw) return defaultValue

  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  if (maxValue !== undefined && value > maxValue) {
    throw new Error(`${name} must be at most ${maxValue}`)
  }
  return value
}

export const env = {
  TELEGRAM_BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
  FIREWORKS_API_KEY: required('FIREWORKS_API_KEY'),
  FIREWORKS_MODEL: required('FIREWORKS_MODEL'),
  SEARXNG_URL: (process.env.SEARXNG_URL ?? 'http://localhost:8080').replace(
    /\/+$/,
    '',
  ),
  SEARCH_TOP_N: Number(process.env.SEARCH_TOP_N ?? 3),
  IMAGE_SEARCH_TOP_N: Number(process.env.IMAGE_SEARCH_TOP_N ?? 6),
  TOOL_STEP_LIMIT: optionalPositiveInteger('TOOL_STEP_LIMIT', 150, 300),
}
