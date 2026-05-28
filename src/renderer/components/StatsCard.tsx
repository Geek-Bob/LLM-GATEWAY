import { Card, CardContent } from './ui/card'
import { motion } from 'framer-motion'

interface StatsCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
}

export function StatsCard({ title, value, icon }: StatsCardProps) {
  return (
    <motion.div whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card className="relative overflow-hidden group transition-shadow hover:shadow-md border-border/50">
        <div className="absolute top-0 left-0 w-full h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-primary to-primary/60" />
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-3">
            <span className="text-muted-foreground">{icon}</span>
          </div>
          <p className="text-xs font-medium mb-1 text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
