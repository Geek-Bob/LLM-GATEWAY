/**
 * ConversationSidebar — 会话列表面板
 *
 * 功能:
 * 1. 展示所有会话列表，支持按更新时间的相对日期显示（今天/昨天/N天前/月日）
 * 2. 收起模式仅显示展开按钮；展开模式显示"新建"按钮和所有会话
 * 3. 选中状态高亮，并在 active 时显示删除按钮
 * 4. 动画：framer-motion layout 动画实现增删时的平滑过渡
 *
 * props:
 * - conversations: 会话列表
 * - activeId: 当前选中的会话 ID
 * - collapsed: 是否收起
 * - onSelect/onNew/onDelete/onToggleCollapse: 回调
 */

import { motion, AnimatePresence } from 'framer-motion'
import { Plus, PanelLeftClose, PanelLeft, Trash2 } from 'lucide-react'
import type { Conversation } from '@/lib/types'
import { formatRelativeDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'

interface ConversationSidebarProps {
  conversations: Conversation[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

/** 会话列表面板，支持展开/收起、新建和删除会话。 @returns 会话侧栏 JSX。 */
export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isCollapsed,
  onToggleCollapse,
}: ConversationSidebarProps) {
  if (isCollapsed) {
    return (
      <motion.div
        className="flex flex-col items-center py-3 gap-2 cursor-pointer shrink-0 w-10 border-r border-border/50 hover:bg-muted/30"
        onClick={onToggleCollapse}
      >
        <PanelLeft className="w-5 h-5 text-muted-foreground" />
      </motion.div>
    )
  }

  return (
    <motion.div
      className="flex flex-col shrink-0 overflow-hidden w-60 border-r border-border/50"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 240, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border/50">
        <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">会话</span>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <motion.button
              type="button"
              onClick={onNew}
              className="text-primary bg-primary/10 hover:bg-primary/20"
              whileTap={{ scale: 0.95 }}
            >
              <Plus className="w-3.5 h-3.5" />
              新建
            </motion.button>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <motion.button
              type="button"
              onClick={onToggleCollapse}
              whileTap={{ scale: 0.95 }}
            >
              <PanelLeftClose className="w-4 h-4" />
            </motion.button>
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        <AnimatePresence>
          {conversations.length === 0 ? (
            <motion.div key="empty">
              <EmptyState title="暂无会话" description={'点击"新建"开始对话'} className="border-0 bg-transparent p-4" />
            </motion.div>
          ) : (
            conversations.map((conv) => (
              <motion.div
                key={conv.id}
                className={`mx-1.5 my-0.5 px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                  activeId === conv.id
                    ? 'bg-primary/10 border-primary/20'
                    : 'border-transparent hover:bg-muted/30'
                }`}
                onClick={() => onSelect(conv.id)}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate flex-1 text-foreground">
                    {conv.title}
                  </p>
                  {activeId === conv.id && (
                    <Button asChild variant="ghost" size="sm">
                      <motion.button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                        className="p-0.5 shrink-0 ml-1 text-muted-foreground hover:text-destructive"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </motion.button>
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-mono truncate max-w-[120px] text-muted-foreground">
                    {conv.model}
                  </span>
                  <span className="text-[10px] shrink-0 text-muted-foreground/70">
                    {formatRelativeDate(conv.updatedAt)}
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
