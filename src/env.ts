const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
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
}
