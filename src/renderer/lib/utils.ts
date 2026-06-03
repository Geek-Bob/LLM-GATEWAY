import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Tailwind CSS 类名合并工具
 * clsx 负责条件类名拼接，twMerge 负责解决 Tailwind 类名冲突（后定义的覆盖先定义的）。
 * 使用时确保冲突类名按优先级从低到高排列。
 * 例：cn('px-4', 'px-2') → 'px-2'（px-2 覆盖 px-4）
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
