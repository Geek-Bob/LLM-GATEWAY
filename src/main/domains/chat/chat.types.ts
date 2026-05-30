export interface ChatRequest {
  model: string
  messages: { role: string; content: string }[]
  stream?: boolean
}

export interface ChatChunk {
  text: string
  chunkType?: 'thinking' | 'text'
  done: boolean
  error?: string
}
