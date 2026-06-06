/**
 * Layout — 应用主布局
 *
 * 包含:
 * 1. TitleBar：Electron 无边框窗口的标题栏（拖拽区域 + 窗口控制按钮）
 * 2. 左侧导航栏：跟随鼠标悬停自动展开/收起（macOS 风格），使用 NavLink 高亮当前路由
 * 3. 右侧内容区：通过 React Router 的 Outlet 渲染子页面
 *
 * 导航项定义在 navItems 数组中，涵盖仪表盘/供应商/API Keys/日志/Chat/设置
 */

import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Building2, Key, ScrollText, MessageSquare, ArrowLeftRight, Bot, Settings } from 'lucide-react'
import { TitleBar } from './TitleBar'
import { cn } from '../lib/utils'

const navItems = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard },
  { to: '/providers', label: '供应商', icon: Building2 },
  { to: '/api-keys', label: 'API Keys', icon: Key },
  { to: '/logs', label: '请求日志', icon: ScrollText },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/model-mappings', label: '模型映射', icon: ArrowLeftRight },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/settings', label: '设置', icon: Settings },
]

export function Layout() {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div className="h-screen flex flex-col bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — macOS 26 自动收起 */}
        <motion.nav
          className="shrink-0 flex flex-col py-3 backdrop-blur-xl bg-background/60 border-r border-border/50 overflow-hidden"
          animate={{ width: collapsed ? 52 : 240 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          onMouseEnter={() => setCollapsed(false)}
          onMouseLeave={() => setCollapsed(true)}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 mx-2 px-3 py-2.5 text-sm text-left rounded-xl transition-all duration-200',
                  collapsed && 'justify-center px-0',
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
                  {!collapsed && (
                    <motion.span
                      className="font-medium whitespace-nowrap"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.15, delay: 0.05 }}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </motion.nav>

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
