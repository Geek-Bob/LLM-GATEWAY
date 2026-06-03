/**
 * SSE 流式事件转换：OpenAI ↔ Anthropic 双向转换
 *
 * 包含：
 * - anthropicSSEToOpenAI()：方向⑤，Anthropic SSE → OpenAI SSE
 * - openAISSEToAnthropic()：方向⑥，OpenAI SSE → Anthropic SSE（状态机）
 * - createStreamContext()：创建 SSE 流式转换上下文
 * - convertSSEEvent()：公共入口
 */

import type { ProtocolFormat, StreamContext, StreamState } from './types'
import { mapFinishReason } from './types'

/**
 * Anthropic SSE → OpenAI SSE 事件转换（方向⑤）
 *
 * 将 Anthropic 的结构化 SSE 事件逐个转换为 OpenAI 的扁平化 SSE chunk 格式。
 *
 * Anthropic SSE 事件模型（有事件类型）→ OpenAI SSE 模型（无事件类型，纯 data: chunk）：
 *
 * ┌─────────────────────┬────────────────────────────────────────────┐
 * │ Anthropic 事件      │ OpenAI data chunk 内容                     │
 * ├─────────────────────┼────────────────────────────────────────────┤
 * │ message_start       │ choices[0].delta.role=assistant（首帧）    │
 * │ content_block_start │ tool_calls[index] 首帧 / 首段文本          │
 * │   (text/tool_use)   │                                            │
 * │ content_block_delta │ delta.content / tool_calls.function.args   │
 * │   (text_delta /     │ / reasoning_content                        │
 * │    input_json_delta │                                            │
 * │    / thinking_delta)│                                            │
 * │ content_block_stop  │ （忽略，OpenAI 无对应事件）                  │
 * │ message_delta       │ finish_reason + usage（最后一个 chunk）      │
 * │ message_stop        │ [DONE] 终止信号                             │
 * └─────────────────────┴────────────────────────────────────────────┘
 *
 * 特殊说明：
 * - thinking_delta → reasoning_content：Anthropic 的思考过程映射为 OpenAI 的 reasoning
 * - signature_delta → 发出 '\n' 空内容维持流不中断
 * - input_json_delta 的 partial_json 需要逐段拼接到 tool_calls.arguments
 * - content_block_stop 不产生输出（OpenAI chunk 不需要 block 关闭事件）
 *
 * @param _event - 原始事件类型（未使用，从 data.type 推断）
 * @param data - Anthropic SSE 事件数据
 * @returns OpenAI 格式的 chunk 对象，或 null（当事件不需要输出时，如 message_stop）
 */
function anthropicSSEToOpenAI(
  _event: string,
  data: Record<string, any>
): { event: string; data: any } | null {
  switch (data.type) {
    case 'message_start': {
      const msg = data.message ?? {}
      return {
        event: '',
        data: {
          id: msg.id,
          object: 'chat.completion.chunk',
          model: msg.model,
          choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
        },
      }
    }

    case 'content_block_start': {
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
      } else if (block.type === 'tool_use') {
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
      } else if (block.type === 'thinking') {
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

    case 'content_block_delta': {
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
      } else if (delta.type === 'input_json_delta') {
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
      } else if (delta.type === 'thinking_delta') {
        return {
          event: '',
          data: {
            object: 'chat.completion.chunk',
            choices: [{ index, delta: { reasoning_content: delta.thinking ?? '' } }],
          },
        }
      } else if (delta.type === 'signature_delta') {
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

    case 'message_delta': {
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
            },
          } : {}),
        },
      }
    }

    case 'message_stop':
      return null

    default:
      return null
  }
}

/** 创建一个初始化状态的 StreamContext */
export function createStreamContext(): StreamContext {
  return {
    state: {
      lastMessagesType: 'none',
      index: 0,
      toolCallBaseIndex: 0,
      toolCallMaxIndexOffset: 0,
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
 * index 推进规则：
 * - text / thinking：index++（每个 text/thinking block 占一个索引）
 * - tools：index = toolCallBaseIndex + toolCallMaxIndexOffset + 1
 *   因为并行工具调用可能有多个 block，跳过整个 group
 * - none：无操作（没有打开的 block 需要关闭）
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

/**
 * OpenAI SSE → Anthropic SSE 事件转换的核心状态机（方向⑥）
 *
 * 将 OpenAI 的扁平 data chunk 转换为 Anthropic 的结构化 SSE 事件序列。
 * 这是整个转换器中最复杂的函数，因为它需要：
 * 1. 维护 StreamState 来追踪当前打开的 content block
 * 2. 在正确的时机插入 content_block_start / content_block_stop 事件
 * 3. 将 OpenAI 的 delta 字段正确分配到不同的 content_block 类型
 *
 * OpenAI chunk → Anthropic 事件映射规则：
 *
 * ┌──────────────────────┬─────────────────────────────────────────────┐
 * │ OpenAI delta 内容     │ 生成的事件                                  │
 * ├──────────────────────┼─────────────────────────────────────────────┤
 * │ 第一个 chunk (有 id)  │ message_start                              │
 * │ delta.reasoning      │ thinking block start + delta               │
 * │ delta.content        │ text block start + delta                   │
 * │ delta.tool_calls     │ tool_use block start + input_json_delta    │
 * │ finish_reason + usage│ message_delta + message_stop               │
 * │ finish_reason alone  │ 暂存到 state，等待后续 usage chunk          │
 * │ usage-only chunk     │ 使用缓存的 finish_reason 关闭流            │
 * └──────────────────────┴─────────────────────────────────────────────┘
 *
 * 类型切换时的自动事件注入：
 * 当连续收到相同类型的 delta（如连续 text content），只发 delta 事件。
 * 当类型变化时（如 text → thinking），先发 content_block_stop（旧），
 * 再发 content_block_start（新），再发 delta。
 *
 * 边界情况：
 * - 首 chunk 之后的 chunk 可能没有 id → 用 state 中缓存的 id
 * - finish_reason 和 usage 可能不在同一个 chunk 中 → 需要缓存 finish_reason
 * - usage-only chunk（无 choices）→ 用缓存 finish_reason 关闭流
 * - tool_calls 可能分布在多个 chunk 中（name 在一个 chunk，arguments 在后续 chunks）
 * - 并行工具调用：同一 chunk 中可能出现多个 tool_calls[index] 包含不同内容
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
  if (s.done) return null

  const choice = data.choices?.[0]
  if (!choice) {
    // Usage-only chunk (no choices) — close stream if finish reason was set
    if (s.finishReason && data.usage) {
      s.done = true
      const result: Array<{ event: string; data: any }> = [
        ...stopOpenBlocks(s),
        {
          event: 'message_delta',
          data: {
            type: 'message_delta',
            delta: { stop_reason: mapFinishReason(s.finishReason, 'toAnthropic') },
            usage: {
              input_tokens: data.usage.prompt_tokens ?? 0,
              output_tokens: data.usage.completion_tokens ?? 0,
            },
          },
        },
        { event: 'message_stop', data: { type: 'message_stop' } },
      ]
      return result
    }
    return null
  }

  const delta = choice.delta ?? {}

  // First chunk → message_start
  if (!ctx.sentMessageStart.current && (data.id || s.id)) {
    ctx.sentMessageStart.current = true
    if (data.id) s.id = data.id
    if (data.model) s.model = data.model
    return {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: s.id,
          model: s.model,
          type: 'message',
          role: 'assistant',
          usage: { input_tokens: 0, output_tokens: 0 },
          content: [],
        },
      },
    }
  }

  const reasoning = delta.reasoning_content ?? ''
  const textContent = delta.content ?? ''
  const toolCalls: Array<Record<string, any>> = delta.tool_calls ?? []

  if (reasoning) {
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

  if (textContent) {
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

  if (toolCalls.length > 0) {
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

  // Check for finish_reason
  const finishReason = choice.finish_reason
  if (finishReason && !s.done) {
    s.finishReason = finishReason
    // Don't close yet if usage is still coming
    if (data.usage) {
      s.done = true
      ctx.sentMessageStart.current = false
      const result: Array<{ event: string; data: any }> = [
        ...stopOpenBlocks(s),
        {
          event: 'message_delta',
          data: {
            type: 'message_delta',
            delta: { stop_reason: mapFinishReason(finishReason, 'toAnthropic') },
            usage: {
              input_tokens: data.usage.prompt_tokens ?? 0,
              output_tokens: data.usage.completion_tokens ?? 0,
            },
          },
        },
        { event: 'message_stop', data: { type: 'message_stop' } },
      ]
      return result
    }
  }

  return null
}

/**
 * SSE 事件转换入口（公共 API） - 方向⑤ / ⑥
 *
 * 函数重载说明：
 * - 方向⑤（Anthropic → OpenAI）：始终返回单个事件对象（null 或不返回）
 * - 方向⑥（OpenAI → Anthropic）：可能返回零到多个事件
 *   （例如类型切换时同时返回 content_block_stop + content_block_start + delta）
 *   TypeScript 重载签名用于精确表达这一差异
 *
 * 方向⑤：直接调用 anthropicSSEToOpenAI
 * 方向⑥：需要 StreamContext，先处理 [DONE] 信号，再调用 openAISSEToAnthropic
 *         如果 finish_reason 在之前的 chunk 中被设置但未发出（usage 在后续 chunk），
 *         在 [DONE] 到来时补发 message_delta + message_stop，确保客户端收到完整终止信号
 *
 * @param event - SSE 事件类型（仅 Anthropic 方向使用，OpenAI 方向置空）
 * @param data - 解析后的 SSE data JSON
 * @param from - 源协议格式
 * @param to - 目标协议格式
 * @param ctx - StreamContext（方向⑥必需，方向⑤可选）
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
    if (!ctx) return null // require StreamContext for O→C streaming
    if (event === 'done' || (event === '' && data === null)) {
      // If finish_reason was set in a prior chunk but never emitted (no usage in same chunk),
      // emit message_delta + message_stop now before closing, so the client receives
      // proper stream termination instead of an abrupt socket close.
      const s = ctx.state
      if (s.finishReason && !s.done) {
        s.done = true
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
