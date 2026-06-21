/**
 * SSE 流式事件转换：OpenAI <-> Anthropic 双向转换
 *
 * 包含：
 * - anthropicSSEToOpenAI()：方向5，Anthropic SSE -> OpenAI SSE
 * - openAISSEToAnthropic()：方向6，OpenAI SSE -> Anthropic SSE（状态机）
 * - createStreamContext()：创建 SSE 流式转换上下文
 * - convertSSEEvent()：公共入口
 */

import type { ProtocolFormat, StreamContext, StreamState } from './types'
import { mapFinishReason } from './types'

// ========== 方向5：Anthropic SSE -> OpenAI SSE ==========

/**
 * 将 Anthropic message_start 事件转换为 OpenAI chunk
 * @param data - Anthropic message_start 事件数据
 * @returns OpenAI 格式的首帧 chunk
 */
function formatAnthropicMessageStartToOpenAI(data: Record<string, any>) {
  const msg = data.message ?? {}
  const msgUsage = msg.usage ?? {}
  // 首帧若上游回报 cache 命中，生成新 usage 块（此前无 usage 字段，需新建）
  const usage = msgUsage.cache_read_input_tokens !== undefined
    ? { prompt_tokens_details: { cached_tokens: msgUsage.cache_read_input_tokens } }
    : undefined
  return {
    event: '',
    data: {
      id: msg.id,
      object: 'chat.completion.chunk',
      model: msg.model,
      choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
      ...(usage ? { usage } : {}),
    },
  }
}

/**
 * 将 Anthropic content_block_start 事件转换为 OpenAI chunk
 * 根据 block.type（text / tool_use / thinking）生成对应的 delta 结构
 * @param data - Anthropic content_block_start 事件数据
 * @returns OpenAI 格式 chunk，或 null（未知 block 类型）
 */
function formatAnthropicContentBlockStartToOpenAI(data: Record<string, any>) {
  const block = data.content_block ?? {}
  const index = data.index ?? 0
  if (block.type === 'text') {
    return {
      event: '',
      data: {
        object: 'chat.completion.chunk',
        choices: [{ index, delta: { content: block.text ?? '' } }],
      },
    }
  }
  if (block.type === 'tool_use') {
    return {
      event: '',
      data: {
        object: 'chat.completion.chunk',
        choices: [{
          index,
          delta: {
            tool_calls: [{
              index,
              id: block.id,
              type: 'function',
              function: { name: block.name, arguments: '' },
            }],
          },
        }],
      },
    }
  }
  if (block.type === 'thinking') {
    return {
      event: '',
      data: {
        object: 'chat.completion.chunk',
        choices: [{ index, delta: { reasoning_content: block.thinking ?? '' } }],
      },
    }
  }
  return null
}

/**
 * 将 Anthropic content_block_delta 事件转换为 OpenAI chunk
 * 支持 text_delta / input_json_delta / thinking_delta / signature_delta 四种子类型
 * @param data - Anthropic content_block_delta 事件数据
 * @returns OpenAI 格式 chunk，或 null（未知 delta 类型）
 */
function formatAnthropicContentBlockDeltaToOpenAI(data: Record<string, any>) {
  const delta = data.delta ?? {}
  const index = data.index ?? 0
  if (delta.type === 'text_delta') {
    return {
      event: '',
      data: {
        object: 'chat.completion.chunk',
        choices: [{ index, delta: { content: delta.text ?? '' } }],
      },
    }
  }
  if (delta.type === 'input_json_delta') {
    return {
      event: '',
      data: {
        object: 'chat.completion.chunk',
        choices: [{
          index,
          delta: {
            tool_calls: [{
              index,
              function: { arguments: delta.partial_json ?? '' },
            }],
          },
        }],
      },
    }
  }
  if (delta.type === 'thinking_delta') {
    return {
      event: '',
      data: {
        object: 'chat.completion.chunk',
        choices: [{ index, delta: { reasoning_content: delta.thinking ?? '' } }],
      },
    }
  }
  if (delta.type === 'signature_delta') {
    return {
      event: '',
      data: {
        object: 'chat.completion.chunk',
        choices: [{ index, delta: { reasoning_content: '\n' } }],
      },
    }
  }
  return null
}

/**
 * 将 Anthropic message_delta 事件转换为 OpenAI 最终 chunk（含 finish_reason + usage）
 * @param data - Anthropic message_delta 事件数据
 * @returns OpenAI 格式的终止 chunk
 */
function formatAnthropicMessageDeltaToOpenAI(data: Record<string, any>) {
  const delta = data.delta ?? {}
  const stopReason = delta.stop_reason
  const finishReason = stopReason ? mapFinishReason(stopReason, 'toOpenAI') : null
  return {
    event: '',
    data: {
      object: 'chat.completion.chunk',
      choices: [{ index: 0, finish_reason: finishReason, delta: {} }],
      ...(data.usage ? {
        usage: {
          prompt_tokens: data.usage.input_tokens ?? 0,
          completion_tokens: data.usage.output_tokens ?? 0,
          total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
          // 终止帧若上游回报 cache 命中，在已有 usage 块中加 prompt_tokens_details
          ...(data.usage.cache_read_input_tokens !== undefined ? {
            prompt_tokens_details: { cached_tokens: data.usage.cache_read_input_tokens },
          } : {}),
        },
      } : {}),
    },
  }
}

/**
 * Anthropic SSE -> OpenAI SSE 事件转换（方向5）
 *
 * 将 Anthropic 的结构化 SSE 事件逐个转换为 OpenAI 的扁平化 SSE chunk 格式。
 * 按 data.type 分发到对应的格式化函数。
 *
 * @param _event - 原始事件类型（未使用，从 data.type 推断）
 * @param data - Anthropic SSE 事件数据
 * @returns OpenAI 格式的 chunk 对象，或 null（当事件不需要输出时）
 */
function anthropicSSEToOpenAI(
  _event: string,
  data: Record<string, any>
): { event: string; data: any } | null {
  switch (data.type) {
    case 'message_start':
      return formatAnthropicMessageStartToOpenAI(data)
    case 'content_block_start':
      return formatAnthropicContentBlockStartToOpenAI(data)
    case 'content_block_delta':
      return formatAnthropicContentBlockDeltaToOpenAI(data)
    case 'message_delta':
      return formatAnthropicMessageDeltaToOpenAI(data)
    case 'message_stop':
    default:
      return null
  }
}

// ========== 公共工具 ==========

/** 创建一个初始化状态的 StreamContext */
export function createStreamContext(): StreamContext {
  return {
    state: {
      lastMessagesType: 'none',
      index: 0,
      toolCallBaseIndex: 0,
      toolCallMaxIndexOffset: 0,
      isDone: false,
      done: false,
      finishReason: '',
      model: '',
      id: '',
    },
    sentMessageStart: { current: false },
  }
}

/**
 * 生成 content_block_stop 事件
 * 对应 Anthropic SSE 规范中关闭一个 content block 的事件。
 * 在每次 block 类型切换或流结束时调用。
 *
 * @param index - 要关闭的 content_block 索引
 */
function contentBlockStop(index: number) {
  return { event: 'content_block_stop', data: { type: 'content_block_stop', index } }
}

/**
 * 关闭当前所有打开的 content_block（不推进 index）
 *
 * 根据当前的 lastMessagesType 决定如何关闭：
 * - text / thinking：关闭一个索引（单个 content_block）
 * - tools：关闭 toolCallBaseIndex 到 toolCallBaseIndex + toolCallMaxIndexOffset 范围
 *   因为并行工具调用可能有多个 tool_use block 同时打开
 * - none：不产生事件（无打开 block）
 *
 * 此函数只生成关闭事件，不修改 state.index。
 * 如需同时推进 index，使用 stopOpenBlocksAndAdvance。
 *
 * @param s - 当前的 StreamState（只读）
 * @returns content_block_stop 事件数组
 */
function stopOpenBlocks(s: StreamState): Array<{ event: string; data: any }> {
  const result: Array<{ event: string; data: any }> = []
  switch (s.lastMessagesType) {
    case 'text':
    case 'thinking':
      result.push(contentBlockStop(s.index))
      break
    case 'tools':
      for (let offset = 0; offset <= s.toolCallMaxIndexOffset; offset++) {
        result.push(contentBlockStop(s.toolCallBaseIndex + offset))
      }
      break
  }
  return result
}

/**
 * 关闭当前打开的 content_block 并推进索引
 *
 * 在 content_block 类型切换时调用（例如从 text 切换到 tools）：
 * 1. 关闭当前打开的所有 block
 * 2. 根据刚刚关闭的 block 类型推进 state.index
 * 3. 重置 lastMessagesType 为 'none'
 *
 * @param s - StreamState（会被修改）
 * @returns content_block_stop 事件数组
 */
function stopOpenBlocksAndAdvance(s: StreamState): Array<{ event: string; data: any }> {
  if (s.lastMessagesType === 'none') return []
  const result = stopOpenBlocks(s)
  switch (s.lastMessagesType) {
    case 'tools':
      s.index = s.toolCallBaseIndex + s.toolCallMaxIndexOffset + 1
      s.toolCallBaseIndex = 0
      s.toolCallMaxIndexOffset = 0
      break
    default:
      s.index++
  }
  s.lastMessagesType = 'none'
  return result
}

// ========== 方向6：OpenAI SSE -> Anthropic SSE ==========

/**
 * 生成 usage-only chunk 关闭流的事件序列
 * 当 OpenAI 发送无 choices 但有 usage 的 chunk 时，用缓存的 finishReason 关闭流
 * @param s - StreamState（isDone 置 true）
 * @param usage - OpenAI usage 数据
 * @returns content_block_stop + message_delta + message_stop 事件数组
 */
function formatOpenAIUsageOnlyClose(
  s: StreamState,
  usage: Record<string, any>
): Array<{ event: string; data: any }> {
  s.isDone = true
  // 反向映射 OpenAI usage.prompt_tokens_details.cached_tokens → Anthropic cache_read_input_tokens
  // OpenAI 协议不输出 cache_creation_input_tokens，故反向不保留该字段
  const anthropicUsage: Record<string, number> = {
    input_tokens: usage.prompt_tokens ?? 0,
    output_tokens: usage.completion_tokens ?? 0,
  }
  if (typeof usage.prompt_tokens_details?.cached_tokens === 'number') {
    anthropicUsage.cache_read_input_tokens = usage.prompt_tokens_details.cached_tokens
  }
  return [
    ...stopOpenBlocks(s),
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: mapFinishReason(s.finishReason, 'toAnthropic') },
        usage: anthropicUsage,
      },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ]
}

/**
 * 生成 Anthropic message_start 事件（首 chunk）
 * @param ctx - StreamContext（sentMessageStart 置 true）
 * @param s - StreamState（缓存 id 和 model）
 * @param data - OpenAI 首 chunk 数据
 * @returns message_start 事件
 */
function formatOpenAIMessageStart(
  ctx: StreamContext,
  s: StreamState,
  data: Record<string, any>
) {
  ctx.sentMessageStart.current = true
  if (data.id) s.id = data.id
  if (data.model) s.model = data.model
  // 反向映射 OpenAI usage.prompt_tokens_details.cached_tokens → Anthropic cache_read_input_tokens
  // OpenAI 协议不输出 cache_creation_input_tokens，故反向不保留该字段
  const messageUsage: Record<string, number> = { input_tokens: 0, output_tokens: 0 }
  if (typeof data.usage?.prompt_tokens_details?.cached_tokens === 'number') {
    messageUsage.cache_read_input_tokens = data.usage.prompt_tokens_details.cached_tokens
  }
  return {
    event: 'message_start',
    data: {
      type: 'message_start',
      message: {
        id: s.id,
        model: s.model,
        type: 'message',
        role: 'assistant',
        usage: messageUsage,
        content: [],
      },
    },
  }
}

/**
 * 将 OpenAI reasoning_content 转换为 Anthropic thinking 事件序列
 * 类型切换时自动注入 content_block_stop + content_block_start
 * @param s - StreamState（lastMessagesType、index 会被修改）
 * @param reasoning - reasoning_content 文本
 * @returns thinking 相关的 Anthropic 事件数组
 */
function convertReasoningToThinking(
  s: StreamState,
  reasoning: string
): Array<{ event: string; data: any }> {
  const result: Array<{ event: string; data: any }> = []
  if (s.lastMessagesType !== 'thinking') {
    result.push(...stopOpenBlocksAndAdvance(s))
    result.push({
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index: s.index,
        content_block: { type: 'thinking', thinking: '' },
      },
    })
  }
  s.lastMessagesType = 'thinking'
  result.push({
    event: 'content_block_delta',
    data: {
      type: 'content_block_delta',
      index: s.index,
      delta: { type: 'thinking_delta', thinking: reasoning },
    },
  })
  return result
}

/**
 * 将 OpenAI content 转换为 Anthropic text 事件序列
 * 类型切换时自动注入 content_block_stop + content_block_start
 * @param s - StreamState（lastMessagesType、index 会被修改）
 * @param textContent - content 文本
 * @returns text 相关的 Anthropic 事件数组
 */
function convertContentToText(
  s: StreamState,
  textContent: string
): Array<{ event: string; data: any }> {
  const result: Array<{ event: string; data: any }> = []
  if (s.lastMessagesType !== 'text') {
    result.push(...stopOpenBlocksAndAdvance(s))
    result.push({
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index: s.index,
        content_block: { type: 'text', text: '' },
      },
    })
  }
  s.lastMessagesType = 'text'
  result.push({
    event: 'content_block_delta',
    data: {
      type: 'content_block_delta',
      index: s.index,
      delta: { type: 'text_delta', text: textContent },
    },
  })
  return result
}

/**
 * 将 OpenAI tool_calls 转换为 Anthropic tool_use 事件序列
 * 支持并行工具调用：同一 chunk 中多个 tool_calls[index]
 * @param s - StreamState（lastMessagesType、toolCallBaseIndex、index 等会被修改）
 * @param toolCalls - OpenAI tool_calls 数组
 * @returns tool_use 相关的 Anthropic 事件数组
 */
function convertToolCallsToToolUse(
  s: StreamState,
  toolCalls: Array<Record<string, any>>
): Array<{ event: string; data: any }> {
  const result: Array<{ event: string; data: any }> = []
  if (s.lastMessagesType !== 'tools') {
    result.push(...stopOpenBlocksAndAdvance(s))
    s.toolCallBaseIndex = s.index
    s.toolCallMaxIndexOffset = 0
  }
  s.lastMessagesType = 'tools'
  const base = s.toolCallBaseIndex
  let maxOffset = s.toolCallMaxIndexOffset

  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i]
    const offset = tc.index ?? i
    if (offset > maxOffset) maxOffset = offset
    const blockIndex = base + offset

    if (tc.function?.name) {
      result.push({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: blockIndex,
          content_block: {
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: {},
          },
        },
      })
    }
    if (tc.function?.arguments) {
      result.push({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: blockIndex,
          delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
        },
      })
    }
  }
  s.toolCallMaxIndexOffset = maxOffset
  s.index = base + maxOffset
  return result
}

/**
 * 处理 finish_reason：缓存或立即关闭流
 * 当 usage 在同一 chunk 中时立即关闭；否则暂存 finishReason 等待后续 usage chunk
 * @param ctx - StreamContext（可能修改 sentMessageStart）
 * @param s - StreamState（可能修改 finishReason、done）
 * @param finishReason - OpenAI finish_reason 值
 * @param usage - 同一 chunk 中的 usage 数据（可能不存在）
 * @returns 关闭事件数组，或 null（等待后续 chunk）
 */
function handleFinishReason(
  ctx: StreamContext,
  s: StreamState,
  finishReason: string,
  usage: Record<string, any> | undefined
): Array<{ event: string; data: any }> | null {
  s.finishReason = finishReason
  if (!usage) return null

  s.isDone = true
  ctx.sentMessageStart.current = false
  return [
    ...stopOpenBlocks(s),
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: mapFinishReason(finishReason, 'toAnthropic') },
        usage: {
          input_tokens: usage.prompt_tokens ?? 0,
          output_tokens: usage.completion_tokens ?? 0,
        },
      },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ]
}

/**
 * OpenAI SSE -> Anthropic SSE 事件转换的核心状态机（方向6）
 *
 * 将 OpenAI 的扁平 data chunk 分发到对应的格式化函数，
 * 由各格式化函数维护 StreamState 并生成 Anthropic 事件序列。
 *
 * @param data - OpenAI 输出的一个 SSE chunk 数据
 * @param ctx - StreamContext（可变的，函数会更新其状态）
 * @returns 一个或多个 Anthropic SSE 事件，或 null（当 chunk 不需要输出时）
 */
function openAISSEToAnthropic(
  data: Record<string, any>,
  ctx: StreamContext
): { event: string; data: any } | Array<{ event: string; data: any }> | null {
  const s = ctx.state
  if (s.isDone) return null

  const choice = data.choices?.[0]
  if (!choice) {
    return (s.finishReason && data.usage)
      ? formatOpenAIUsageOnlyClose(s, data.usage)
      : null
  }

  const delta = choice.delta ?? {}

  if (!ctx.sentMessageStart.current && (data.id || s.id)) {
    return formatOpenAIMessageStart(ctx, s, data)
  }

  const reasoning = delta.reasoning_content ?? ''
  const textContent = delta.content ?? ''
  const toolCalls: Array<Record<string, any>> = delta.tool_calls ?? []

  if (reasoning) return convertReasoningToThinking(s, reasoning)
  if (textContent) return convertContentToText(s, textContent)
  if (toolCalls.length > 0) return convertToolCallsToToolUse(s, toolCalls)

  const finishReason = choice.finish_reason
  if (finishReason && !s.isDone) {
    return handleFinishReason(ctx, s, finishReason, data.usage)
  }

  return null
}

// ========== 公共入口 ==========

/**
 * SSE 事件转换入口（公共 API） - 方向5 / 6
 *
 * 函数重载说明：
 * - 方向5（Anthropic -> OpenAI）：始终返回单个事件对象（null 或不返回）
 * - 方向6（OpenAI -> Anthropic）：可能返回零到多个事件
 *   （例如类型切换时同时返回 content_block_stop + content_block_start + delta）
 *   TypeScript 重载签名用于精确表达这一差异
 *
 * @param event - SSE 事件类型（仅 Anthropic 方向使用，OpenAI 方向置空）
 * @param data - 解析后的 SSE data JSON
 * @param from - 源协议格式
 * @param to - 目标协议格式
 * @param ctx - StreamContext（方向6必需，方向5可选）
 * @returns 转换后的 SSE 事件对象或事件对象数组
 */
export function convertSSEEvent(
  event: string,
  data: any,
  from: ProtocolFormat,
  to: ProtocolFormat,
  ctx?: StreamContext
): { event: string; data: any } | Array<{ event: string; data: any }> | null {
  if (from === to) return { event, data }
  if (from === 'anthropic' && to === 'openai') {
    const result = anthropicSSEToOpenAI(event, data)
    return result ? { event: result.event || '', data: result.data } : null
  }
  if (from === 'openai' && to === 'anthropic') {
    if (!ctx) return null // require StreamContext for O->C streaming
    if (event === 'done' || (event === '' && data === null)) {
      // If finish_reason was set in a prior chunk but never emitted (no usage in same chunk),
      // emit message_delta + message_stop now before closing
      const s = ctx.state
      if (s.finishReason && !s.isDone) {
        s.isDone = true
        return [
          ...stopOpenBlocks(s),
          {
            event: 'message_delta',
            data: {
              type: 'message_delta',
              delta: { stop_reason: mapFinishReason(s.finishReason, 'toAnthropic') },
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          },
          { event: 'message_stop', data: { type: 'message_stop' } },
        ]
      }
      return null
    }
    return openAISSEToAnthropic(data, ctx)
  }
  return null
}
