import { TitleBar } from './TitleBar'
import { motion } from 'framer-motion'

export type PageKey = 'dashboard' | 'providers' | 'api-keys' | 'logs' | 'chat'

interface LayoutProps {
  activePage: PageKey
  onNavigate: (page: PageKey) => void
  children: React.ReactNode
}

interface NavItem {
  key: PageKey
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { key: 'dashboard', label: '仪表盘', icon: '📊' },
  { key: 'providers', label: '供应商', icon: '🏢' },
  { key: 'api-keys', label: 'API Keys', icon: '🔑' },
  { key: 'logs', label: '请求日志', icon: '📋' },
  { key: 'chat', label: 'Chat', icon: '💬' },
]

export function Layout({ activePage, onNavigate, children }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col" style={{ background: '#080a0e' }}>
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-56 shrink-0 flex flex-col py-3" style={{ background: '#0a0c12', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="px-4 pb-3 mb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <p className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: '#475569' }}>导航</p>
          </div>
          {navItems.map((item) => {
            const isActive = activePage === item.key
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className="relative flex items-center gap-3 mx-2 px-4 py-2.5 text-sm text-left rounded-xl transition-all duration-200"
                style={{
                  background: isActive ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                  color: isActive ? '#60a5fa' : '#64748b',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                    e.currentTarget.style.color = '#e2e8f0'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = '#64748b'
                  }
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="activeNav"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                    style={{ background: '#60a5fa' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <span className="text-base shrink-0">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Main content */}
        <motion.main
          className="flex-1 overflow-auto p-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.main>
      </div>
    </div>
  )
}
