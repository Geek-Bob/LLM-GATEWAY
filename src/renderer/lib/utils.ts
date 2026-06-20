import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 一天的毫秒数 */
const MS_PER_DAY = 86_400_000

/**
 * Tailwind CSS 类名合并工具
 * clsx 负责条件类名拼接，twMerge 负责解决 Tailwind 类名冲突（后定义的覆盖先定义的）。
 * 使用时确保冲突类名按优先级从低到高排列。
 * 例：cn('px-4', 'px-2') → 'px-2'（px-2 覆盖 px-4）
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 格式化日期为 YYYY-MM-DD HH:mm 格式
 * @param dateStr ISO 日期字符串
 * @returns 格式化后的日期字符串
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 格式化日期为相对时间（如"3分钟前"、"2小时前"）
 * 今天显示时分，昨天显示"昨天"，7天内显示"N天前"，更早显示月日
 * @param iso ISO 日期字符串
 * @returns 相对时间字符串
 */
export function formatRelativeDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / MS_PER_DAY)
  if (diffDays === 0) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays}天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/**
 * 从未知错误中提取错误消息
 * @param e 未知错误对象
 * @returns 错误消息字符串
 */
export function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * 格式化美元金额（2-4 位小数）。
 * @param cost 费用数值（元）
 * @returns 形如 "$1.2345" 的字符串
 */
export function formatCost(cost: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost)
}
