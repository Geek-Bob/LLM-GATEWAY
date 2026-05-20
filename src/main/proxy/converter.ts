const CLAUDE_TO_OPENAI: Record<string, string> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  tool_use: 'tool_calls',
  refusal: 'content_filter',
}

const OPENAI_TO_CLAUDE: Record<string, string> = {
  stop: 'end_turn',
  stop_sequence: 'stop_sequence',
  length: 'max_tokens',
  max_tokens: 'max_tokens',
  content_filter: 'refusal',
  tool_calls: 'tool_use',
}

export function mapFinishReason(
  reason: string,
  direction: 'toOpenAI' | 'toAnthropic'
): string {
  if (!reason) return ''
  const map = direction === 'toOpenAI' ? CLAUDE_TO_OPENAI : OPENAI_TO_CLAUDE
  return map[reason.toLowerCase()] ?? reason
}
