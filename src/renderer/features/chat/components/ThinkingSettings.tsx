/**
 * ThinkingSettings — chat 页面思考设置受控组件（chip+Popover 形态）
 *
 * 职责：
 * - 执行方式（disabled/enabled/adaptive）单选：左 chip（前缀 Brain 图标）点击触发 Popover，
 *   Popover 内三个 Button 列表项（disabled/enabled/adaptive），active 态 cyan 高亮
 * - 强度偏好（minimal~max）单选：右 chip（前缀 Zap 图标，显示「强度 · {effort}」）点击触发 Popover，
 *   Popover 内六个 Button 列表项；thinkingType=disabled 时 chip 不可交互（pointer-events-none）
 *   但保留当前值以便切回 enabled/adaptive 时恢复
 *
 * 设计依据：docs/superpowers/specs/2026-06-20-chat-ui-redesign-design.md#53
 */
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Brain, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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

/** Popover 内 active 态选项样式：cyan 文字 + 半透明背景 + 左侧 accent 边框 */
const POPOVER_ITEM_ACTIVE = 'bg-accent/10 text-accent border-l-2 border-accent'
/** Popover 内非 active 态选项样式：透明背景 + muted 文字 */
const POPOVER_ITEM_INACTIVE = 'text-muted-foreground hover:text-foreground hover:bg-muted/50'

/**
 * ThinkingChip — 通用 chip+Popover 单选组件
 *
 * 渲染一个带前缀图标的 outline 按钮（chip），点击触发 Popover 单选列表。
 * 用于 ThinkingSettings 内的执行方式 chip 与强度偏好 chip 复用。
 */
interface ThinkingChipProps<T extends string> {
  /** chip 前缀图标（lucide-react） */
  icon: LucideIcon
  /** chip 按钮的 aria-label */
  label: string
  /** chip 显示文本（如 thinkingType 值 / 「强度 · medium」） */
  displayText: string
  /** 是否为 active 态视觉（左侧 chip 由父级计算；当前实现下未使用，保留以备扩展） */
  isActive: boolean
  /** 是否禁用（灰显 + pointer-events-none） */
  isDisabled?: boolean
  /** Popover 内可选项数组 */
  options: readonly T[]
  /** 当前选中的值（用于渲染 active 视觉态） */
  currentValue: T
  /** 自定义选项标签渲染函数（默认 String(option)） */
  renderOptionLabel?: (option: T) => string
  /** 判定某个选项是否 active（默认严格相等 currentValue） */
  isOptionActive?: (option: T) => boolean
  /** 选中选项回调（同时关闭 Popover） */
  onSelect: (option: T) => void
  /** Popover 受控 open 状态 */
  open: boolean
  /** Popover open 状态变更回调 */
  onOpenChange: (open: boolean) => void
}

/**
 * 渲染单个 chip+Popover 单选组件。
 *
 * @param props - 见 ThinkingChipProps
 * @returns chip+Popover JSX
 */
function ThinkingChip<T extends string>({
  icon: Icon,
  label,
  displayText,
  isDisabled = false,
  options,
  currentValue,
  renderOptionLabel,
  isOptionActive,
  onSelect,
  open,
  onOpenChange,
}: ThinkingChipProps<T>) {
  const formatLabel = renderOptionLabel ?? ((option: T) => String(option))
  const checkActive = isOptionActive ?? ((option: T) => option === currentValue)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`gap-1.5 border-border/50 font-normal ${
            isDisabled ? 'pointer-events-none opacity-50' : ''
          }`}
          aria-label={label}
          aria-disabled={isDisabled}
        >
          <Icon className="h-3.5 w-3.5" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        {options.map((option) => {
          const isActive = checkActive(option)
          return (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="sm"
              role="option"
              aria-selected={isActive}
              className={`w-full justify-start rounded-md border-l-2 border-transparent px-2 ${
                isActive ? POPOVER_ITEM_ACTIVE : POPOVER_ITEM_INACTIVE
              }`}
              onClick={() => {
                onSelect(option)
                onOpenChange(false)
              }}
            >
              {formatLabel(option)}
            </Button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

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
 * 思考设置受控组件：两个 chip + Popover 单选。
 * @param props - 见 ThinkingSettingsProps
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
  // disabled 时强度无意义：右 chip 灰显且不可交互，但不重置值，便于切回 enabled/adaptive 时恢复
  const isEffortDisabled = thinkingType === 'disabled'
  const [typeOpen, setTypeOpen] = useState(false)
  const [effortOpen, setEffortOpen] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <ThinkingChip<ThinkingType>
        icon={Brain}
        label={`执行方式: ${thinkingType}`}
        displayText={thinkingType}
        isActive={false}
        options={THINKING_TYPE_OPTIONS}
        currentValue={thinkingType}
        onSelect={onThinkingTypeChange}
        open={typeOpen}
        onOpenChange={setTypeOpen}
      />
      <ThinkingChip<ReasoningEffort>
        icon={Zap}
        label={`强度偏好: ${reasoningEffort}`}
        displayText={`强度 · ${reasoningEffort}`}
        isActive={false}
        isDisabled={isEffortDisabled}
        options={REASONING_EFFORT_OPTIONS}
        currentValue={reasoningEffort}
        onSelect={onReasoningEffortChange}
        open={effortOpen}
        onOpenChange={setEffortOpen}
      />
    </div>
  )
}
