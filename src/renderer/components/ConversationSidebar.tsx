import { motion, AnimatePresence } from 'framer-motion'

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
        className="flex flex-col items-center py-3 gap-2 cursor-pointer shrink-0"
        style={{ width: 40, borderRight: '1px solid rgba(255,255,255,0.06)' }}
        onClick={onToggleCollapse}
        whileHover={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <svg className="w-5 h-5" style={{ color: '#64748b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="flex flex-col shrink-0 overflow-hidden"
      style={{ width: 240, borderRight: '1px solid rgba(255,255,255,0.06)' }}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 240, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: '#64748b' }}>会话</span>
        <div className="flex items-center gap-1">
          <motion.button
            type="button"
            onClick={onNew}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-all"
            style={{ color: '#60a5fa', background: 'rgba(59,130,246,0.1)' }}
            whileHover={{ background: 'rgba(59,130,246,0.2)' }}
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建
          </motion.button>
          <motion.button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded-lg transition-all"
            style={{ color: '#64748b' }}
            whileHover={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </motion.button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        <AnimatePresence>
          {conversations.length === 0 ? (
            <motion.div key="empty" className="px-4 py-8 text-center">
              <p className="text-xs" style={{ color: '#475569' }}>暂无会话</p>
              <p className="text-xs mt-1" style={{ color: '#64748b' }}>点击"新建"开始对话</p>
            </motion.div>
          ) : (
            conversations.map((conv) => (
              <motion.div
                key={conv.id}
                className="mx-1.5 my-0.5 px-3 py-2 rounded-lg cursor-pointer transition-all"
                style={{
                  background: activeId === conv.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                  border: activeId === conv.id ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
                }}
                onClick={() => onSelect(conv.id)}
                whileHover={{ background: activeId === conv.id ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)' }}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate flex-1" style={{ color: '#e2e8f0' }}>
                    {conv.title}
                  </p>
                  {activeId === conv.id && (
                    <motion.button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                      className="p-0.5 rounded shrink-0 ml-1"
                      style={{ color: '#64748b' }}
                      whileHover={{ color: '#ef4444' }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </motion.button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-mono truncate max-w-[120px]" style={{ color: '#475569' }}>
                    {conv.model}
                  </span>
                  <span className="text-[10px] shrink-0" style={{ color: '#64748b' }}>
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
