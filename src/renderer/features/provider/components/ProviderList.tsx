/**
 * ProviderList — 供应商表格列表
 *
 * 展示供应商名称、类型徽章、模型数量、状态徽章，
 * 以及编辑/删除操作按钮。
 *
 * @param providers - 供应商列表数据
 * @param onEdit - 点击编辑按钮的回调
 * @param onDelete - 点击删除按钮的回调
 */

import { motion } from 'framer-motion'
import { rowFadeIn } from '@/lib/animations'
import { Pencil, Trash2 } from 'lucide-react'
import type { Provider } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

interface ProviderListProps {
  providers: Provider[]
  onEdit: (provider: Provider) => void
  onDelete: (provider: Provider) => void
}

/** 供应商表格列表，展示名称、类型、模型数、状态和操作按钮。 @returns 供应商列表表格 JSX。 */
export function ProviderList({ providers, onEdit, onDelete }: ProviderListProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>模型数</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((p, idx) => (
            <motion.tr key={p.id} {...rowFadeIn(idx)} className="border-b transition-colors hover:bg-muted/50">
              <TableCell>
                <span className="font-medium text-foreground">{p.name}</span>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{p.providerType}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{p.models.length}</TableCell>
              <TableCell>
                <StatusBadge isActive={p.isActive === 1} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" className="text-primary" onClick={() => onEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                    编辑
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => onDelete(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </Button>
                </div>
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
