import { motion } from 'framer-motion'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: string
}

export function StatsCard({ title, value, subtitle, icon }: StatsCardProps) {
  return (
    <motion.div
      className="cyber-card p-5 relative overflow-hidden group"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
    >
      {/* Accent bar */}
      <div
        className="absolute top-0 left-0 w-full h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }}
      />

      <div className="flex items-start justify-between mb-3">
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-xs font-medium mb-1" style={{ color: '#64748b' }}>{title}</p>
      <p className="text-2xl font-bold tracking-tight" style={{ color: '#f1f5f9' }}>{value}</p>
      {subtitle && (
        <p className="text-xs mt-1" style={{ color: '#475569' }}>{subtitle}</p>
      )}
    </motion.div>
  )
}
