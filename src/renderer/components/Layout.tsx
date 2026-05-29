import { NavLink, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Building2, Key, ScrollText, MessageSquare } from 'lucide-react'
import { TitleBar } from './TitleBar'
import { cn } from '../lib/utils'

const navItems = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard },
  { to: '/providers', label: '供应商', icon: Building2 },
  { to: '/api-keys', label: 'API Keys', icon: Key },
  { to: '/logs', label: '请求日志', icon: ScrollText },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
]

export function Layout() {
  return (
    <div className="h-screen flex flex-col bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — macOS 26 毛玻璃 */}
        <nav className="w-60 shrink-0 flex flex-col py-3 backdrop-blur-xl bg-background/60 border-r border-border/50">
          <div className="px-4 pb-3 mb-2 border-b border-border/50">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">导航</p>
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 mx-2 px-4 py-2.5 text-sm text-left rounded-xl transition-all duration-200',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="activeNav"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Main content */}
        <motion.main
          className="flex-1 overflow-auto p-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  )
}
