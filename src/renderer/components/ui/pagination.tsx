/**
 * 分页组件 — 完整功能分页控件
 *
 * 功能：
 * - 首页/末页按钮
 * - 上一页/下一页按钮
 * - 页码按钮（带省略号）
 * - 直接跳转到指定页码输入框
 * - 显示总条数和当前页/总页数
 */

import { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from './button'
import { Input } from './input'

interface PaginationProps {
  /** 当前页码（从 1 开始） */
  page: number
  /** 总页数 */
  totalPages: number
  /** 总条数 */
  total: number
  /** 每页条数 */
  pageSize: number
  /** 页码变化回调 */
  onPageChange: (page: number) => void
}

/**
 * 生成页码数组，带省略号。
 * 策略：始终显示首页和末页，当前页附近显示 ±2 页，其余用 '...' 替代。
 */
function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    // 总页数不超过 7，全部显示
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | '...')[] = [1]

  if (current > 3) {
    pages.push('...')
  }

  // 当前页附近 ±2
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (current < total - 2) {
    pages.push('...')
  }

  pages.push(total)
  return pages
}

/**
 * 通用分页组件
 */
export function Pagination({ page, totalPages, total, pageSize: _pageSize, onPageChange }: PaginationProps) {
  const [jumpValue, setJumpValue] = useState('')

  /** 跳转到指定页码 */
  const handleJump = useCallback(() => {
    const num = parseInt(jumpValue, 10)
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      onPageChange(num)
      setJumpValue('')
    }
  }, [jumpValue, totalPages, onPageChange])

  /** 输入框回车跳转 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleJump()
      }
    },
    [handleJump]
  )

  /** 输入框只允许数字 */
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^\d]/g, '')
    setJumpValue(val)
  }, [])

  if (totalPages <= 1) {
    return (
      <div className="flex items-center justify-between mt-4 px-1">
        <span className="text-sm text-muted-foreground">共 {total} 条</span>
        <span className="text-sm tabular-nums text-muted-foreground">1 / 1</span>
      </div>
    )
  }

  const pageNumbers = generatePageNumbers(page, totalPages)

  return (
    <div className="flex items-center justify-between mt-4 px-1">
      {/* 左侧：总条数 */}
      <span className="text-sm text-muted-foreground">
        共 {total} 条，{totalPages} 页
      </span>

      {/* 右侧：分页控件 */}
      <div className="flex items-center gap-1.5">
        {/* 首页 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          title="首页"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        {/* 上一页 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          title="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* 页码按钮 */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
                ...
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'default' : 'ghost'}
                size="sm"
                className={`h-8 min-w-8 px-2 text-sm tabular-nums ${
                  p === page
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            )
          )}
        </div>

        {/* 下一页 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          title="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* 末页 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          title="末页"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>

        {/* 跳转 */}
        <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border/50">
          <span className="text-xs text-muted-foreground whitespace-nowrap">跳至</span>
          <Input
            type="text"
            value={jumpValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={(e) => e.target.select()}
            className="h-8 w-14 text-center text-sm tabular-nums"
            placeholder={String(page)}
          />
          <span className="text-xs text-muted-foreground">页</span>
        </div>
      </div>
    </div>
  )
}
