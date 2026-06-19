/**
 * ThinkingSettings — chat 页面思考设置受控组件
 *
 * 职责：
 * - 执行方式（disabled/enabled/adaptive）单选：三个 Button 组成分段控件，aria-pressed 标记选中态
 * - 强度偏好（minimal~max）下拉：Radix Select，六档枚举
 * - 两维度正交独立；thinkingType === 'disabled' 时强度下拉灰显（disabled），
 *   但保留当前值以便切回 enabled/adaptive 时恢复（纯展示+回调，不持有状态）
 *
 * 设计依据：docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#41-ui-布局
 */
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ThinkingType, ReasoningEffort } from '../../../../shared/types'

/** 执行方式三档枚举（与 ThinkingType 一一对应，渲染顺序即 UI 顺序） */
const THINKING_TYPE_OPTIONS: readonly ThinkingType[] = ['disabled', 'enabled', 'adaptive']

/** 强度六档枚举（由弱到强，与 ReasoningEffort 一一对应） */
const REASONING_EFFORT_OPTIONS: readonly ReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

export interface ThinkingSettingsProps {
  /** 当前执行方式 */
  thinkingType: ThinkingType
  /** 当前强度偏好 */
  reasoningEffort: ReasoningEffort
  /** 执行方式切换回调 */
  onThinkingTypeChange: (type: ThinkingType) => void
  /** 强度切换回调 */
  onReasoningEffortChange: (effort: ReasoningEffort) => void
}

/**
 * 思考设置受控组件：执行方式单选 + 强度下拉。
 *
 * @param props.thinkingType - 当前执行方式
 * @param props.reasoningEffort - 当前强度偏好
 * @param props.onThinkingTypeChange - 执行方式切换回调
 * @param props.onReasoningEffortChange - 强度切换回调
 * @returns 思考设置 JSX
 * @example
 * <ThinkingSettings
 *   thinkingType="enabled"
 *   reasoningEffort="high"
 *   onThinkingTypeChange={setThinkingType}
 *   onReasoningEffortChange={setReasoningEffort}
 * />
 */
export function ThinkingSettings({
  thinkingType,
  reasoningEffort,
  onThinkingTypeChange,
  onReasoningEffortChange,
}: ThinkingSettingsProps) {
  // disabled 时强度无意义：灰显下拉但不重置值，便于切回 enabled/adaptive 时恢复
  const isEffortDisabled = thinkingType === 'disabled'

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>执行方式</Label>
        <div role="group" aria-label="执行方式" className="flex gap-2">
          {THINKING_TYPE_OPTIONS.map((type) => (
            <Button
              key={type}
              type="button"
              variant={type === thinkingType ? 'default' : 'outline'}
              aria-pressed={type === thinkingType}
              onClick={() => onThinkingTypeChange(type)}
            >
              {type}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>强度偏好</Label>
        <Select
          value={reasoningEffort}
          onValueChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}
          disabled={isEffortDisabled}
        >
          <SelectTrigger className="w-full" aria-label="强度偏好">
            <SelectValue placeholder="选择强度" />
          </SelectTrigger>
          <SelectContent>
            {REASONING_EFFORT_OPTIONS.map((effort) => (
              <SelectItem key={effort} value={effort}>
                {effort}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
