import { useState } from 'react'
import { X, Bug } from 'lucide-react'
import { motion } from 'framer-motion'
import { useLogs } from '../lib/queries/logs'
import { useDebugMode, useSetDebugMode } from '../lib/queries/proxy'
import { Switch } from '../components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import type { LogEntry } from '../lib/types'

const PAGE_SIZE = 10

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatTokens(entry: LogEntry) {
  if (entry.tokens_in === 0 && entry.tokens_out === 0) return '-'
  return `${entry.tokens_in}↑ ${entry.tokens_out}↓`
}

function DebugSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2 text-slate-400">{title}</h4>
      <div className="rounded-lg p-3 space-y-1.5 text-sm bg-slate-900/60 border border-slate-400/10">
        {children}
      </div>
    </div>
  )
}

function DebugKV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-600 min-w-20 shrink-0">{label}:</span>
      <span className={`text-slate-200 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
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
      <span className="text-slate-600 text-[13px]">{label}:</span>
      <pre className="mt-1 p-2.5 rounded text-xs overflow-x-auto max-h-72 overflow-y-auto font-mono bg-slate-950/80 text-slate-300 border border-slate-400/10">
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

  const goToPrev = () => { if (page > 1) setPage((p) => p - 1) }
  const goToNext = () => { if (page < totalPages) setPage((p) => p + 1) }

  const handleToggleDebug = (checked: boolean) => {
    setDebugMode.mutate(checked)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">请求日志</h1>
          <p className="text-sm mt-1 text-slate-500">查看所有代理请求记录</p>
        </div>
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-slate-500" />
          <span className="text-xs text-slate-400">Debug</span>
          <Switch
            checked={debugMode}
            onCheckedChange={handleToggleDebug}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="rounded-lg border border-slate-400/10 bg-slate-900/40 p-8">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-slate-400/10 bg-slate-900/40 p-12 text-center">
          <p className="text-base font-medium text-slate-400">暂无日志</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-slate-400/10 bg-slate-900/40 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-400/10 hover:bg-transparent">
                  <TableHead className="text-slate-400">时间</TableHead>
                  <TableHead className="text-slate-400">模型</TableHead>
                  <TableHead className="text-slate-400">格式</TableHead>
                  <TableHead className="text-slate-400">状态</TableHead>
                  <TableHead className="text-slate-400">延迟</TableHead>
                  <TableHead className="text-slate-400">Tokens</TableHead>
                  <TableHead className="text-slate-400">详情</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((entry) => {
                  const isSuccess = entry.status_code < 400
                  return (
                    <TableRow
                      key={entry.id}
                      className={`cursor-pointer border-slate-400/10 ${selectedLog?.id === entry.id ? 'bg-white/5' : ''}`}
                      onClick={() => setSelectedLog(selectedLog?.id === entry.id ? null : entry)}
                    >
                      <TableCell>
                        <span className="text-sm whitespace-nowrap text-slate-500">{formatDate(entry.created_at)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-slate-100">{entry.model}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            entry.api_format === 'openai'
                              ? 'bg-green-500/10 text-green-500 border-transparent'
                              : 'bg-blue-400/10 text-blue-400 border-transparent'
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
                              : 'bg-red-500/10 text-red-500 border-transparent'
                          }
                        >
                          {entry.status_code}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm text-slate-400">{entry.duration_ms}ms</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm tabular-nums text-slate-400">
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
                          <span className="text-xs text-slate-700">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 px-1">
            <span className="text-sm text-slate-600">共 {total} 条</span>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={goToPrev}
                disabled={page <= 1}
                className="text-xs text-slate-400"
              >
                上一页
              </Button>
              <span className="text-sm tabular-nums text-slate-500">{page} / {totalPages}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={goToNext}
                disabled={page >= totalPages}
                className="text-xs text-slate-400"
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Detail Panel */}
      {selectedLog && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed right-0 top-12 bottom-0 w-[42%] overflow-y-auto z-30 border-l border-slate-400/10 bg-slate-950"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between mb-5 sticky top-0 py-3 px-5 border-b border-slate-400/10 bg-slate-950 z-10">
            <h3 className="text-lg font-bold text-slate-100">
              请求详情 #{selectedLog.id}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedLog(null)}
              className="text-slate-500 hover:text-slate-300"
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
                      <div className="mt-2 pt-2 border-t border-slate-400/10" />
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
              </>
            ) : (
              /* No debug data -- show basic info + hint */
              <div className="text-center py-12">
                <p className="text-sm mb-4 text-slate-400">基础信息</p>
                <div className="space-y-2 text-left max-w-xs mx-auto">
                  <DebugKV label="状态码" value={String(selectedLog.status_code)} />
                  <DebugKV label="耗时" value={`${selectedLog.duration_ms}ms`} />
                  <DebugKV label="Tokens" value={`${selectedLog.tokens_in}↑ ${selectedLog.tokens_out}↓`} />
                  {selectedLog.error && <DebugKV label="错误" value={selectedLog.error} />}
                </div>
                <div className={`mt-8 p-4 rounded-lg mx-auto max-w-xs ${debugMode ? 'bg-yellow-400/5 border border-yellow-400/20' : 'bg-blue-400/5 border border-blue-400/15'}`}>
                  <p className={`text-sm ${debugMode ? 'text-yellow-400' : 'text-blue-300'}`}>
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
      )}
    </motion.div>
  )
}
