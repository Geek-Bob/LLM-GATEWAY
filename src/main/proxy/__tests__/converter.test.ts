// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mapFinishReason } from '../converter'

describe('mapFinishReason', () => {
  describe('toOpenAI direction', () => {
    it('should map end_turn to stop', () => {
      expect(mapFinishReason('end_turn', 'toOpenAI')).toBe('stop')
    })
    it('should map stop_sequence to stop', () => {
      expect(mapFinishReason('stop_sequence', 'toOpenAI')).toBe('stop')
    })
    it('should map max_tokens to length', () => {
      expect(mapFinishReason('max_tokens', 'toOpenAI')).toBe('length')
    })
    it('should map tool_use to tool_calls', () => {
      expect(mapFinishReason('tool_use', 'toOpenAI')).toBe('tool_calls')
    })
    it('should map refusal to content_filter', () => {
      expect(mapFinishReason('refusal', 'toOpenAI')).toBe('content_filter')
    })
    it('should pass through unknown reasons unchanged', () => {
      expect(mapFinishReason('unknown_reason', 'toOpenAI')).toBe('unknown_reason')
    })
    it('should handle empty string', () => {
      expect(mapFinishReason('', 'toOpenAI')).toBe('')
    })
  })

  describe('toAnthropic direction', () => {
    it('should map stop to end_turn', () => {
      expect(mapFinishReason('stop', 'toAnthropic')).toBe('end_turn')
    })
    it('should map stop_sequence to stop_sequence', () => {
      expect(mapFinishReason('stop_sequence', 'toAnthropic')).toBe('stop_sequence')
    })
    it('should map length to max_tokens', () => {
      expect(mapFinishReason('length', 'toAnthropic')).toBe('max_tokens')
    })
    it('should map max_tokens to max_tokens', () => {
      expect(mapFinishReason('max_tokens', 'toAnthropic')).toBe('max_tokens')
    })
    it('should map content_filter to refusal', () => {
      expect(mapFinishReason('content_filter', 'toAnthropic')).toBe('refusal')
    })
    it('should map tool_calls to tool_use', () => {
      expect(mapFinishReason('tool_calls', 'toAnthropic')).toBe('tool_use')
    })
    it('should pass through unknown reasons unchanged', () => {
      expect(mapFinishReason('unknown_reason', 'toAnthropic')).toBe('unknown_reason')
    })
  })
})
