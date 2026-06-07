/**
 * MappingList — 模型映射表格列表
 *
 * 展示请求模型、映射模型、状态徽章，以及编辑/删除操作按钮。
 * 空状态和加载态由父组件处理，此组件仅渲染表格。
 *
 * @param mappings - 模型映射列表数据
 * @param onEdit - 点击编辑按钮的回调
 * @param onDelete - 点击删除按钮的回调
 */

import { motion } from 'framer-motion'
import { rowFadeIn } from '@/lib/animations'
import { Pencil, Trash2 } from 'lucide-react'
import type { ModelMapping } from '../../../../shared/types'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

interface MappingListProps {
  /** 模型映射列表 */
  mappings: ModelMapping[]
  /** 点击编辑按钮的回调 */
  onEdit: (mapping: ModelMapping) => void
  /** 点击删除按钮的回调 */
  onDelete: (mapping: ModelMapping) => void
}

/** 模型映射表格列表，展示请求模型、映射模型、状态和操作按钮。 @returns 模型映射列表 JSX。 */
export function MappingList({ mappings, onEdit, onDelete }: MappingListProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>请求模型</TableHead>
            <TableHead>映射模型</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map((m, idx) => (
            <motion.tr key={m.id} {...rowFadeIn(idx)} className="border-b transition-colors hover:bg-muted/50">
              <TableCell>
                <code className="text-sm font-mono text-foreground">{m.sourceModel}</code>
              </TableCell>
              <TableCell>
                <code className="text-sm font-mono text-foreground">{m.targetModel}</code>
              </TableCell>
              <TableCell>
                <StatusBadge active={m.isActive === 1} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" className="text-primary" onClick={() => onEdit(m)}>
                    <Pencil className="h-3.5 w-3.5" />
                    编辑
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => onDelete(m)}>
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
