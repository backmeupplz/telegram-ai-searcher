export function noTextReason(
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
