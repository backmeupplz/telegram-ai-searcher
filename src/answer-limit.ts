export const DEFAULT_ANSWER_STEP_LIMIT = 150
export const MAX_ANSWER_STEP_LIMIT = 300

export function parseAnswerStepLimit(
  value: string | undefined,
  name = 'ANSWER_STEP_LIMIT',
): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_ANSWER_STEP_LIMIT
  }

  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${name} must be a positive integer`)
  }

  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`)
  }

  if (parsed > MAX_ANSWER_STEP_LIMIT) {
    throw new Error(`${name} must be <= ${MAX_ANSWER_STEP_LIMIT}`)
  }

  return parsed
}

export function noTextAnswerReason(
  finishReason: string | null,
  stepCount: number,
  stepLimit: number,
): string {
  if (finishReason === 'tool-calls' && stepCount >= stepLimit) {
    return `Hit the ${stepLimit}-step tool-call limit before the model produced an answer. Try a narrower question or ask me to summarise what I already found.`
  }

  if (finishReason === 'length') {
    return 'The model hit its output token limit before producing any text.'
  }

  if (finishReason === 'content-filter') {
    return 'The response was blocked by the content filter.'
  }

  if (finishReason && finishReason !== 'stop') {
    return `The model stopped without replying (reason: ${finishReason}).`
  }

  return 'The model returned no text.'
}
