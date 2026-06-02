/**
 * ChatToolbar -- Provider / Model / API Key 选择器
 *
 * 纯 UI 组件：所有数据和回调通过 props 传入，不自己做数据请求。
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import type { Provider, ApiKey } from '@/lib/types'

interface ChatToolbarProps {
  providers: Provider[]
  selectedProviderId: number | null
  onSelectProvider: (id: number | null) => void
  availableModels: string[]
  selectedModel: string | null
  onSelectModel: (model: string | null) => void
  apiKeys: ApiKey[]
  selectedApiKeyId: number | null
  onSelectApiKey: (id: number | null) => void
}

export function ChatToolbar({
  providers,
  selectedProviderId,
  onSelectProvider,
  availableModels,
  selectedModel,
  onSelectModel,
  apiKeys,
  selectedApiKeyId,
  onSelectApiKey,
}: ChatToolbarProps) {
  return (
    <Card className="p-3 mb-4 flex items-center gap-3 flex-wrap">
      <Select
        value={selectedProviderId?.toString() ?? ''}
        onValueChange={(val) => {
          if (!val) { onSelectProvider(null); return }
          onSelectProvider(Number(val))
        }}
      >
        <SelectTrigger className="flex-1 min-w-[140px]">
          <SelectValue placeholder="选择供应商" />
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedModel ?? ''}
        onValueChange={(val) => onSelectModel(val || null)}
        disabled={availableModels.length === 0}
      >
        <SelectTrigger className="flex-1 min-w-[140px]">
          <SelectValue placeholder="选择模型" />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((m) => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedApiKeyId?.toString() ?? ''}
        onValueChange={(val) => {
          if (!val) { onSelectApiKey(null); return }
          onSelectApiKey(Number(val))
        }}
      >
        <SelectTrigger className="flex-1 min-w-[140px]">
          <SelectValue placeholder="选择 API Key" />
        </SelectTrigger>
        <SelectContent>
          {apiKeys.map((k) => (
            <SelectItem key={k.id} value={k.id.toString()}>{k.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Card>
  )
}
