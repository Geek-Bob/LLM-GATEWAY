/** Providers 页面 — 供应商 CRUD 管理（薄层组合） */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { pageVariants, childVariants } from '@/lib/animations'
import { Plus } from 'lucide-react'
import { useProviders, useDeleteProvider } from '@/lib/queries/providers'
import type { Provider } from '@/lib/types'
import { useDeleteWithToast } from '@/hooks/useDeleteWithToast'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { ProviderList } from '@/features/provider/components/ProviderList'
import { ProviderFormDialog, type ProviderForm } from '@/features/provider/components/ProviderFormDialog'

/** 供应商管理页面，支持 CRUD 操作的薄层组合组件。 @returns 供应商页面 JSX。 */
export function ProvidersPage() {
  const { data: providers = [], isLoading } = useProviders()
  const deleteMutation = useDeleteProvider()
  const { execute: deleteProvider } = useDeleteWithToast(deleteMutation, '供应商')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [initialForm, setInitialForm] = useState<ProviderForm | undefined>(undefined)

  const openCreate = () => { setEditingId(null); setInitialForm(undefined); setModalOpen(true) }
  const openEdit = (p: Provider) => {
    setEditingId(p.id)
    setInitialForm({ name: p.name, providerType: p.providerType, baseUrl: p.baseUrl, apiKey: p.apiKey, models: [...p.models] })
    setModalOpen(true)
  }

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show">
      <motion.div variants={childVariants}>
        <PageHeader title="供应商管理" description="管理 AI 服务提供商连接"
          action={<Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" />添加供应商</Button>}
        />
      </motion.div>

      <motion.div variants={childVariants}>
        {isLoading ? <TableSkeleton />
          : providers.length === 0 ? <EmptyState icon="&#127970;" title="暂无供应商" description="点击上方「添加供应商」开始配置" />
          : <ProviderList providers={providers} onEdit={openEdit} onDelete={(p) => deleteProvider(p.id, p.name)} />}
      </motion.div>

      <ProviderFormDialog open={modalOpen} onOpenChange={setModalOpen} editingId={editingId} initialForm={initialForm} onSaved={() => {}} />
    </motion.div>
  )
}
