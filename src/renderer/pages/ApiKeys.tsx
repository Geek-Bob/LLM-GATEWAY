import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/ipc'
import type { ApiKey } from '../lib/types'

type Step = 'form' | 'result'

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [name, setName] = useState('')
  const [rateLimit, setRateLimit] = useState('')
  const [saving, setSaving] = useState(false)
  const [plaintextKey, setPlaintextKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [revealedKey, setRevealedKey] = useState<number | null>(null)
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null)
  const [popoverStyle, setPopoverStyle] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    if (revealedKey === null) return
    const handler = () => { setRevealedKey(null); setPopoverStyle(null) }
    const timer = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handler)
    }
  }, [revealedKey])

  const fetchKeys = () => {
    setLoading(true)
    api.apiKeys.list().then(setKeys).finally(() => setLoading(false))
  }

  useEffect(() => { fetchKeys() }, [])

  const openCreate = () => {
    setName(''); setRateLimit(''); setStep('form'); setPlaintextKey(''); setCopied(false)
    setModalOpen(true)
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    const rl = rateLimit.trim() ? Number(rateLimit.trim()) : undefined
    if (rl !== undefined && (isNaN(rl) || rl < 1)) {
      alert('速率限制必须是大于 0 的数字')
      return
    }
    setSaving(true)
    try {
      const result = await api.apiKeys.create(name.trim(), rl)
      setPlaintextKey(result.plaintextKey)
      setStep('result')
      fetchKeys()
    } catch (e) {
      alert(`创建失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setSaving(false) }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(plaintextKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleClose = () => setModalOpen(false)

  const handleDelete = async (key: ApiKey) => {
    if (!window.confirm(`确认删除 API Key「${key.name}」？此操作不可撤销。`)) return
    try { await api.apiKeys.delete(key.id); fetchKeys() }
    catch (e) { alert(`删除失败: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const formatRateLimit = (rl: number) => `${rl}/min`
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#f1f5f9' }}>API Key 管理</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>管理网关访问密钥</p>
        </div>
        <button onClick={openCreate} className="btn-cyber flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          创建 API Key
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="cyber-card p-8">
          <div className="space-y-4">
            {[1,2,3].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
          </div>
        </div>
      ) : keys.length === 0 ? (
        <div className="cyber-card p-12 text-center">
          <div className="text-3xl mb-3 opacity-40">🔑</div>
          <p className="text-base font-medium mb-1" style={{ color: '#94a3b8' }}>暂无 API Key</p>
          <p className="text-sm" style={{ color: '#475569' }}>点击上方「创建 API Key」生成一个新的密钥</p>
        </div>
      ) : (
        <div className="cyber-card overflow-hidden">
          <table className="cyber-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>Key</th>
                <th>速率限制</th>
                <th>状态</th>
                <th>创建时间</th>
                <th style={{ textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key, idx) => (
                <motion.tr
                  key={key.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.3 }}
                >
                  <td>
                    <span className="font-medium" style={{ color: '#f1f5f9' }}>{key.name}</span>
                  </td>
                  <td>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <span className="font-mono text-sm" style={{ color: '#64748b' }}>{key.key_prefix}...</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (revealedKey === key.id) {
                            setRevealedKey(null)
                            setPopoverStyle(null)
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setRevealedKey(key.id)
                            setPopoverStyle({
                              position: 'fixed',
                              top: `${rect.bottom + 6}px`,
                              left: `${rect.left}px`,
                            })
                          }
                        }}
                        className="btn-ghost text-xs !px-2 !py-1.5 ml-2"
                        style={{ color: revealedKey === key.id ? '#60a5fa' : '#64748b', verticalAlign: 'middle' }}
                        title="查看完整 Key"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {revealedKey === key.id ? (
                            <>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </>
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          )}
                        </svg>
                      </button>
                      {revealedKey === key.id && popoverStyle && createPortal(
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            ...popoverStyle,
                            zIndex: 9999,
                            padding: '10px 12px',
                            background: '#1e293b',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                            minWidth: 320,
                            maxWidth: 480,
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <code
                              className="text-xs font-mono break-all select-all"
                              style={{ color: '#60a5fa', lineHeight: 1.6, flex: 1 }}
                            >
                              {key.key_plaintext}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(key.key_plaintext)
                                setCopiedKeyId(key.id)
                                setTimeout(() => setCopiedKeyId(null), 2000)
                              }}
                              className="btn-ghost !px-2 !py-1 shrink-0"
                              style={{ color: copiedKeyId === key.id ? '#22c55e' : '#94a3b8' }}
                            >
                              {copiedKeyId === key.id ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  </td>
                  <td style={{ color: '#94a3b8' }}>{formatRateLimit(key.rate_limit)}</td>
                  <td>
                    <span
                      className="cyber-badge"
                      style={{
                        background: key.is_active === 1 ? 'rgba(34, 197, 94, 0.08)' : 'rgba(100, 116, 139, 0.1)',
                        color: key.is_active === 1 ? '#22c55e' : '#64748b',
                      }}
                    >
                      <span className="cyber-badge-dot" style={{ background: key.is_active === 1 ? '#22c55e' : '#64748b' }} />
                      {key.is_active === 1 ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm" style={{ color: '#64748b' }}>{formatDate(key.created_at)}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => handleDelete(key)} className="btn-danger text-xs !px-3 !py-1.5">
                      删除
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="cyber-card-elevated w-full max-w-lg mx-4"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <h2 className="text-base font-semibold" style={{ color: '#f1f5f9' }}>
                  {step === 'form' ? '创建 API Key' : 'API Key 已创建'}
                </h2>
                <button onClick={handleClose} className="btn-ghost !p-1.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Step 1: Form */}
              {step === 'form' && (
                <>
                  <div className="px-6 py-5 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>名称</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="例如: 开发环境密钥"
                        className="cyber-input w-full px-3 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>速率限制（次/分钟）</label>
                      <input
                        type="number"
                        value={rateLimit}
                        onChange={(e) => setRateLimit(e.target.value)}
                        placeholder="默认 60"
                        min={1}
                        className="cyber-input w-full px-3 py-2.5 text-sm"
                      />
                      <p className="text-xs mt-1" style={{ color: '#475569' }}>留空则使用默认值（60 次/分钟）</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <button onClick={handleClose} className="btn-ghost">取消</button>
                    <button onClick={handleCreate} disabled={saving || !name.trim()} className="btn-cyber">
                      {saving ? '创建中...' : '创建'}
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Show key */}
              {step === 'result' && (
                <>
                  <div className="px-6 py-5 space-y-4">
                    <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                      <span className="text-lg shrink-0" style={{ color: '#22c55e' }}>✓</span>
                      <p className="text-sm" style={{ color: '#22c55e' }}>密钥已创建成功。后续可在列表中点按眼睛图标查看。</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>密钥</label>
                      <div className="cyber-input w-full px-3 py-3 select-all" style={{ background: 'rgba(0,0,0,0.3)' }}>
                        <code className="text-sm font-mono" style={{ color: '#60a5fa' }}>{plaintextKey}</code>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <button onClick={handleClose} className="btn-ghost">关闭</button>
                    <button onClick={handleCopy} className="btn-cyber flex items-center gap-2">
                      {copied ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          已复制
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          复制
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
