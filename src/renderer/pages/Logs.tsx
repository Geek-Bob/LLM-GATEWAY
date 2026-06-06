/**
 * Logs 页面 — 代理请求日志查看
 *
 * 数据流:
 * 1. useLogs 通过 IPC 分页获取日志列表
 * 2. useDebugMode / useSetDebugMode 控制是否记录详细的请求/响应体
 * 3. 点击一行在右侧滑出详情面板（仅当一个请求对应的 debug 字段非空时展示完整链路）
 * 4. Debug 模式开启后新请求会记录完整调试信息，历史日志只显示基础数据
 *
 * 内嵌 DebugSection / DebugKV / DebugJSON 三个辅助组件用于格式化呈现调试信息
 */

import { useState } from 'react'
import { X, Bug } from 'lucide-react'
import { motion } from 'framer-motion'
import { useLogs } from '@/lib/queries/logs'
import { useDebugMode, useSetDebugMode } from '@/lib/queries/proxy'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { Pagination } from '@/components/ui/pagination'
import type { LogEntry } from '@/lib/types'
import { formatDate } from '@/lib/utils'

const PAGE_SIZE = 10

function formatTokens(entry: LogEntry) {
  if (entry.tokens_in === 0 && entry.tokens_out === 0) return '-'
  return `${entry.tokens_in}↑ ${entry.tokens_out}↓`
}

function DebugSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2 text-muted-foreground">{title}</h4>
      <div className="rounded-lg p-3 space-y-1.5 text-sm bg-card border border-border/50">
        {children}
      </div>
    </div>
  )
}

function DebugKV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground min-w-20 shrink-0">{label}:</span>
      <span className={`text-foreground break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function DebugJSON({ label, json }: { label: string; json: string }) {
  let formatted = json
  try {
    formatted = JSON.stringify(JSON.parse(json), null, 2)
  } catch { /* use raw string */ }

  return (
    <div className="mt-1">
      <span className="text-muted-foreground text-[13px]">{label}:</span>
      <pre className="mt-1 p-2.5 rounded text-xs overflow-x-auto max-h-72 overflow-y-auto font-mono bg-popover/80 text-foreground border border-border/50">
        {formatted}
      </pre>
    </div>
  )
}

export function LogsPage() {
  const [page, setPage] = useState(1)
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)

  const { data, isLoading } = useLogs(page, PAGE_SIZE)
  const { data: debugMode = false } = useDebugMode()
  const setDebugMode = useSetDebugMode()

  const logs = data?.logs ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handlePageChange = (newPage: number) => {
    setSelectedLog(null)
    setPage(newPage)
  }

  const handleToggleDebug = (checked: boolean) => {
    setDebugMode.mutate(checked)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      {/* Header */}
      <PageHeader
        title="请求日志"
        description="查看所有代理请求记录"
        action={
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Debug</span>
            <Switch
              checked={debugMode}
              onCheckedChange={handleToggleDebug}
            />
          </div>
        }
      />

      {/* Content */}
      {isLoading ? (
        <TableSkeleton />
      ) : logs.length === 0 ? (
        <EmptyState title="暂无日志" />
      ) : (
        <>
          <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">ID</TableHead>
                  <TableHead className="text-muted-foreground">时间</TableHead>
                  <TableHead className="text-muted-foreground">模型</TableHead>
                  <TableHead className="text-muted-foreground">格式</TableHead>
                  <TableHead className="text-muted-foreground">状态</TableHead>
                  <TableHead className="text-muted-foreground">延迟</TableHead>
                  <TableHead className="text-muted-foreground">Tokens</TableHead>
                  <TableHead className="text-muted-foreground">详情</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((entry) => {
                  const isSuccess = entry.status_code < 400
                  return (
                    <TableRow
                      key={entry.id}
                      className={`cursor-pointer border-border/50 ${selectedLog?.id === entry.id ? 'bg-muted/50' : ''}`}
                      onClick={() => setSelectedLog(selectedLog?.id === entry.id ? null : entry)}
                    >
                      <TableCell>
                        <span className="font-mono text-sm text-muted-foreground">{entry.id}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm whitespace-nowrap text-muted-foreground">{formatDate(entry.created_at)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-foreground">{entry.model}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            entry.api_format === 'openai'
                              ? 'bg-green-500/10 text-green-500 border-transparent'
                              : 'bg-primary/10 text-primary border-transparent'
                          }
                        >
                          {entry.api_format}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            isSuccess
                              ? 'bg-green-500/10 text-green-500 border-transparent'
                              : 'bg-destructive/10 text-destructive border-transparent'
                          }
                        >
                          {entry.status_code}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm text-muted-foreground">{entry.duration_ms}ms</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm tabular-nums text-muted-foreground">
                          {formatTokens(entry)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {entry.debug ? (
                          <Badge
                            className="bg-green-500/10 text-green-500 border-transparent cursor-help"
                            title="此请求包含完整调试详情"
                          >
                            <Bug className="h-3 w-3" />
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
          />
        </>
      )}

      {/* Detail Panel */}
      {selectedLog && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-20 bg-black/20 backdrop-blur-sm"
            onClick={() => setSelectedLog(null)}
          />
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed right-0 top-10 bottom-0 w-[42%] overflow-y-auto z-30 border-l border-border/50 bg-popover"
          >
          {/* Panel header */}
          <div className="flex items-center justify-between mb-5 sticky top-0 py-3 px-5 border-b border-border/50 bg-popover z-10">
            <h3 className="text-lg font-bold text-foreground">
              请求详情 #{selectedLog.id}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedLog(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="px-5 pb-5 space-y-5">
            {selectedLog.debug ? (
              <>
                {/* Client request section */}
                <DebugSection title="客户端请求">
                  <DebugKV label="模型" value={selectedLog.model} />
                  <DebugKV label="格式" value={selectedLog.debug.client.apiFormat} />
                  <DebugJSON label="请求体" json={selectedLog.debug.client.body} />
                </DebugSection>

                {/* Route & conversion section */}
                <DebugSection title="路由 & 转换">
                  <DebugKV label="Provider" value={`${selectedLog.debug.route.providerName} (${selectedLog.debug.route.providerType})`} />
                  <DebugKV label="Base URL" value={selectedLog.debug.route.baseUrl} />
                  <DebugKV label="上游模型" value={selectedLog.debug.route.modelName} />
                  {selectedLog.debug.conversion && (
                    <>
                      <div className="mt-2 pt-2 border-t border-border/50" />
                      <DebugKV label="协议转换" value={`${selectedLog.debug.conversion.from} → ${selectedLog.debug.conversion.to}`} />
                      <DebugKV label="原始路径" value={selectedLog.debug.conversion.originalPath} />
                      <DebugKV label="转换路径" value={selectedLog.debug.conversion.convertedPath} />
                      <DebugKV label="原始模型" value={selectedLog.debug.conversion.originalModel} />
                      <DebugKV label="转换模型" value={selectedLog.debug.conversion.convertedModel} />
                    </>
                  )}
                </DebugSection>

                {/* Upstream request section */}
                <DebugSection title="上游请求">
                  <DebugKV label="URL" value={selectedLog.debug.upstream.url} />
                  <DebugKV label="状态码" value={String(selectedLog.debug.upstream.statusCode)} mono />
                  <DebugJSON label="请求体" json={selectedLog.debug.upstream.body} />
                </DebugSection>

                {/* Upstream response section */}
                <DebugSection title="上游响应">
                  <DebugJSON label="响应体" json={selectedLog.debug.upstream.responseBody} />
                </DebugSection>

                {/* Error section (when debug has error info) */}
                {selectedLog.debug.error && (
                  <DebugSection title="错误">
                    <DebugKV label="错误信息" value={selectedLog.debug.error} />
                  </DebugSection>
                )}
              </>
            ) : (
              /* No debug data -- show basic info + hint */
              <div className="text-center py-12">
                <p className="text-sm mb-4 text-muted-foreground">基础信息</p>
                <div className="space-y-2 text-left max-w-xs mx-auto">
                  <DebugKV label="状态码" value={String(selectedLog.status_code)} />
                  <DebugKV label="耗时" value={`${selectedLog.duration_ms}ms`} />
                  <DebugKV label="Tokens" value={`${selectedLog.tokens_in}↑ ${selectedLog.tokens_out}↓`} />
                  {selectedLog.error && <DebugKV label="错误" value={selectedLog.error} />}
                </div>
                <div className={`mt-8 p-4 rounded-lg mx-auto max-w-xs ${debugMode ? 'bg-destructive/5 border border-destructive/20' : 'bg-primary/5 border border-primary/15'}`}>
                  <p className={`text-sm ${debugMode ? 'text-destructive' : 'text-primary'}`}>
                    {debugMode
                      ? '此请求记录于 Debug 模式开启前，不含调试详情。请发送新请求以查看完整链路。'
                      : <>开启 <strong>Debug 模式</strong> 后可查看完整请求/响应体</>
                    }
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
        </>
      )}
    </motion.div>
  )
}
