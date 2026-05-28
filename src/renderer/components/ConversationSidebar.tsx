import { motion, AnimatePresence } from 'framer-motion'
import { Plus, PanelLeftClose, PanelLeft, Trash2 } from 'lucide-react'

interface Conversation {
  id: number
  title: string
  model: string
  updated_at: string
}

interface ConversationSidebarProps {
  conversations: Conversation[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  collapsed,
  onToggleCollapse,
}: ConversationSidebarProps) {
  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays === 0) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays}天前`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  if (collapsed) {
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
          <motion.button
            type="button"
            onClick={onNew}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-all text-primary bg-primary/10 hover:bg-primary/20"
            whileTap={{ scale: 0.95 }}
          >
            <Plus className="w-3.5 h-3.5" />
            新建
          </motion.button>
          <motion.button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded-lg transition-all text-muted-foreground hover:bg-muted/50"
          >
            <PanelLeftClose className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        <AnimatePresence>
          {conversations.length === 0 ? (
            <motion.div key="empty" className="px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground">暂无会话</p>
              <p className="text-xs mt-1 text-muted-foreground/70">点击"新建"开始对话</p>
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
                    <motion.button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                      className="p-0.5 rounded shrink-0 ml-1 text-muted-foreground hover:text-destructive"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </motion.button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-mono truncate max-w-[120px] text-muted-foreground">
                    {conv.model}
                  </span>
                  <span className="text-[10px] shrink-0 text-muted-foreground/70">
                    {formatDate(conv.updated_at)}
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
