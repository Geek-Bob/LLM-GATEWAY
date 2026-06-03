/**
 * 协议转换器统一导出
 * OpenAI ↔ Anthropic 双向转换：请求、响应、SSE 流
 */
export { convertRequest } from './request'
export { convertResponse } from './response'
export { convertSSEEvent, createStreamContext } from './sse'
export { mapFinishReason } from './types'
export type { ProtocolFormat, StreamContext, StreamState } from './types'
