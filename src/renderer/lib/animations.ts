/**
 * 共享动画常量
 *
 * 统一管理 framer-motion 动画变体，避免各页面重复定义。
 */

/** 页面入场动画 — 透明度渐变 */
export const pageVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} as const

/** 子元素入场动画 — 从下方滑入 */
export const childVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
} as const

/** 表格行入场动画 — 带交错延迟
 * @param idx 行索引（用于计算延迟）
 */
export function rowFadeIn(idx: number) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2, delay: idx * 0.03 },
  }
}
