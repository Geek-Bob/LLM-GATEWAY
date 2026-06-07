/** ModelMappings 页面 — 模型名称映射 CRUD 管理（薄层组合） */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { pageVariants, childVariants } from '@/lib/animations'
import { Plus } from 'lucide-react'
import { useModelMappings, useModels, useDeleteModelMapping } from '@/lib/queries/modelMappings'
import type { ModelMapping } from '../../shared/types'
import { useDeleteWithToast } from '@/hooks/useDeleteWithToast'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { MappingList } from '@/features/model-mapping/components/MappingList'
import { MappingFormDialog, type MappingForm } from '@/features/model-mapping/components/MappingFormDialog'

/** 模型映射管理页面，配置模型名称转换规则。 @returns 模型映射页面 JSX。 */
export function ModelMappingsPage() {
  const { data: mappings = [], isLoading } = useModelMappings()
  const { data: models = [] } = useModels()
  const deleteMutation = useDeleteModelMapping()
  const { execute: deleteMapping } = useDeleteWithToast(deleteMutation, '映射')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [initialForm, setInitialForm] = useState<MappingForm | undefined>(undefined)

  const openCreate = () => { setEditingId(null); setInitialForm(undefined); setModalOpen(true) }
  const openEdit = (m: ModelMapping) => {
    setEditingId(m.id)
    setInitialForm({ sourceModel: m.sourceModel, targetModel: m.targetModel })
    setModalOpen(true)
  }

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show">
      <motion.div variants={childVariants}>
        <PageHeader title="模型映射" description="配置模型名称转换规则，将请求中的模型名映射到实际模型"
          action={<Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" />新增映射</Button>}
        />
      </motion.div>

      <motion.div variants={childVariants}>
        {isLoading ? <TableSkeleton />
          : mappings.length === 0 ? <EmptyState icon="&#128260;" title="暂无映射" description="点击上方「新增映射」开始配置模型名称转换规则" />
          : <MappingList mappings={mappings} onEdit={openEdit} onDelete={(m) => deleteMapping(m.id, `${m.sourceModel} → ${m.targetModel}`)} />}
      </motion.div>

      <MappingFormDialog open={modalOpen} onOpenChange={setModalOpen} editingId={editingId} initialForm={initialForm} models={models} onSaved={() => {}} />
    </motion.div>
  )
}
