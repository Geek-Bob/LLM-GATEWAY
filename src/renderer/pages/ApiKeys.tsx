/**
 * ApiKeys 页面 — 网关访问密钥管理
 *
 * 薄层组合：加载数据 → 委托子组件渲染列表和对话框。
 * 列表格和创建对话框分别在 features/apikey/components/ 中实现。
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { pageVariants, childVariants } from '@/lib/animations'
import { Plus, Key } from 'lucide-react'
import { useApiKeys, useCreateApiKey, useDeleteApiKey } from '@/lib/queries/apiKeys'
import type { ApiKey } from '@/lib/types'
import { useDeleteWithToast } from '@/hooks/useDeleteWithToast'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { ApiKeyList } from '@/features/apikey/components/ApiKeyList'
import { ApiKeyFormDialog } from '@/features/apikey/components/ApiKeyFormDialog'

/** API Key 管理页面，支持创建和删除网关访问密钥。 @returns API Key 页面 JSX。 */
export function ApiKeysPage() {
  const { data: keys = [], isLoading } = useApiKeys()
  const createMutation = useCreateApiKey()
  const deleteMutation = useDeleteApiKey()
  const { execute: deleteApiKey } = useDeleteWithToast(deleteMutation, 'API Key')
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleDelete = (key: ApiKey) => deleteApiKey(key.id, key.name)

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show">
      <motion.div variants={childVariants}>
        <PageHeader
          title="API Key 管理"
          description="管理网关访问密钥"
          action={
            <Button onClick={() => setDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4" />
              创建 API Key
            </Button>
          }
        />
      </motion.div>

      <motion.div variants={childVariants}>
        {isLoading ? (
          <TableSkeleton />
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<Key className="h-10 w-10 mx-auto text-muted-foreground/40" />}
            title="暂无 API Key"
            description="点击上方「创建 API Key」生成一个新的密钥"
          />
        ) : (
          <ApiKeyList keys={keys} onDelete={handleDelete} />
        )}
      </motion.div>

      <ApiKeyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        createKey={(name, rateLimit) => createMutation.mutateAsync({ name, rateLimit })}
      />
    </motion.div>
  )
}
