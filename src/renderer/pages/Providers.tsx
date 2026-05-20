import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/ipc'
import type { Provider } from '../lib/types'

interface ProviderForm {
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  models: string[]
}

const emptyForm: ProviderForm = {
  name: '',
  providerType: 'openai',
  baseUrl: '',
  apiKey: '',
  models: [],
}

const defaultBaseUrls: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
}

export function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ProviderForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [revealedKey, setRevealedKey] = useState<number | null>(null)
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null)
  const [popoverStyle, setPopoverStyle] = useState<Record<string, string> | null>(null)
  const [newModel, setNewModel] = useState('')

  const fetchProviders = () => {
    setLoading(true)
    api.providers
      .list()
      .then(setProviders)
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchProviders() }, [])

  useEffect(() => {
    if (revealedKey === null) return
    const handler = () => { setRevealedKey(null); setPopoverStyle(null) }
    const timer = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handler)
    }
  }, [revealedKey])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setNewModel('')
    setModalOpen(true)
  }

  const openEdit = (p: Provider) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      providerType: p.providerType,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      models: [...p.models],
    })
    setNewModel('')
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId !== null) {
        const payload: Record<string, unknown> = {
          name: form.name.trim(),
          providerType: form.providerType,
          baseUrl: form.baseUrl.trim(),
          models: form.models,
        }
        if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim()
        await api.providers.update(editingId, payload)
      } else {
        await api.providers.create({
          name: form.name.trim(),
          providerType: form.providerType,
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey.trim(),
          models: form.models,
        })
      }
      setModalOpen(false)
      fetchProviders()
    } catch (e) {
      alert(`保存失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setSaving(false) }
  }

  const handleDelete = async (p: Provider) => {
    if (!window.confirm(`确认删除供应商「${p.name}」？此操作不可撤销。`)) return
    try { await api.providers.delete(p.id); fetchProviders() }
    catch (e) { alert(`删除失败: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const handleProviderTypeChange = (newType: 'anthropic' | 'openai') => {
    setForm((prev) => ({
      ...prev,
      providerType: newType,
      baseUrl: defaultBaseUrls[newType] ?? prev.baseUrl,
    }))
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#f1f5f9' }}>供应商管理</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>管理 AI 服务提供商连接</p>
        </div>
        <button onClick={openCreate} className="btn-cyber flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加供应商
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="cyber-card p-8">
          <div className="space-y-4">
            {[1,2,3].map((i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        </div>
      ) : providers.length === 0 ? (
        <div className="cyber-card p-12 text-center">
          <div className="text-3xl mb-3 opacity-40">🏢</div>
          <p className="text-base font-medium mb-1" style={{ color: '#94a3b8' }}>暂无供应商</p>
          <p className="text-sm" style={{ color: '#475569' }}>点击上方「添加供应商」开始配置</p>
        </div>
      ) : (
        <div className="cyber-card overflow-hidden">
          <table className="cyber-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>类型</th>
                <th>模型数</th>
                <th>状态</th>
                <th style={{ textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p, idx) => (
                <motion.tr
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.3 }}
                >
                  <td>
                    <span className="font-medium" style={{ color: '#f1f5f9' }}>{p.name}</span>
                  </td>
                  <td>
                    <span className="cyber-badge" style={{ background: 'rgba(59, 130, 246, 0.08)', color: '#60a5fa' }}>
                      {p.providerType}
                    </span>
                  </td>
                  <td style={{ color: '#94a3b8' }}>{p.models.length}</td>
                  <td>
                    <span
                      className="cyber-badge"
                      style={{
                        background: p.isActive === 1 ? 'rgba(34, 197, 94, 0.08)' : 'rgba(100, 116, 139, 0.1)',
                        color: p.isActive === 1 ? '#22c55e' : '#64748b',
                      }}
                    >
                      <span className="cyber-badge-dot" style={{ background: p.isActive === 1 ? '#22c55e' : '#64748b' }} />
                      {p.isActive === 1 ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="flex items-center justify-end gap-2">
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (revealedKey === p.id) {
                              setRevealedKey(null)
                              setPopoverStyle(null)
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setRevealedKey(p.id)
                              setPopoverStyle({
                                position: 'fixed',
                                top: `${rect.bottom + 6}px`,
                                right: `${window.innerWidth - rect.right}px`,
                              })
                            }
                          }}
                          className="btn-ghost text-xs !px-2 !py-1.5"
                          style={{ color: revealedKey === p.id ? '#60a5fa' : '#64748b' }}
                          title="查看 API Key"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {revealedKey === p.id ? (
                              <>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </>
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                            )}
                          </svg>
                        </button>
                        {revealedKey === p.id && popoverStyle && createPortal(
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
                                {p.apiKey}
                              </code>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(p.apiKey)
                                  setCopiedKeyId(p.id)
                                  setTimeout(() => setCopiedKeyId(null), 2000)
                                }}
                                className="btn-ghost !px-2 !py-1 shrink-0"
                                style={{ color: copiedKeyId === p.id ? '#22c55e' : '#94a3b8' }}
                              >
                                {copiedKeyId === p.id ? (
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
                      <button onClick={() => openEdit(p)} className="btn-ghost text-xs !px-3 !py-1.5" style={{ color: '#60a5fa' }}>
                        编辑
                      </button>
                      <button onClick={() => handleDelete(p)} className="btn-danger text-xs !px-3 !py-1.5">
                        删除
                      </button>
                    </div>
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
                  {editingId !== null ? '编辑供应商' : '添加供应商'}
                </h2>
                <button onClick={() => setModalOpen(false)} className="btn-ghost !p-1.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>名称</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="例如: OpenAI 主账号"
                    className="cyber-input w-full px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>供应商类型</label>
                  <div className="flex gap-2">
                    {(['openai', 'anthropic'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleProviderTypeChange(type)}
                        className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-200"
                        style={{
                          background: form.providerType === type ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.03)',
                          borderColor: form.providerType === type ? 'rgba(59, 130, 246, 0.3)' : 'var(--border)',
                          color: form.providerType === type ? '#60a5fa' : '#64748b',
                        }}
                      >
                        {type === 'openai' ? 'OpenAI' : 'Anthropic'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Base URL</label>
                  <input
                    type="text"
                    value={form.baseUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder="https://api.openai.com/v1"
                    className="cyber-input w-full px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>API Key</label>
                  <input
                    type="password"
                    value={form.apiKey}
                    onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={editingId !== null ? '留空则不修改' : 'sk-...'}
                    className="cyber-input w-full px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>模型列表</label>
                  <div className="space-y-1.5 mb-2">
                    {form.models.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                        <span className="font-mono flex-1" style={{ color: '#e2e8f0' }}>{m}</span>
                        <button
                          onClick={() => setForm((prev) => ({ ...prev, models: prev.models.filter((_, j) => j !== i) }))}
                          className="btn-ghost !p-1 shrink-0"
                          style={{ color: '#ef4444' }}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newModel.trim()) {
                          e.preventDefault()
                          const trimmed = newModel.trim()
                          if (form.models.includes(trimmed)) return
                          setForm((prev) => ({ ...prev, models: [...prev.models, trimmed] }))
                          setNewModel('')
                        }
                      }}
                      placeholder="输入模型名称后按 Enter 添加"
                      className="cyber-input flex-1 px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => {
                        if (newModel.trim()) {
                          const trimmed = newModel.trim()
                          if (form.models.includes(trimmed)) return
                          setForm((prev) => ({ ...prev, models: [...prev.models, trimmed] }))
                          setNewModel('')
                        }
                      }}
                      disabled={!newModel.trim()}
                      className="btn-cyber text-sm !px-3 !py-2"
                    >
                      添加
                    </button>
                  </div>
                  <p className="text-xs mt-1" style={{ color: '#475569' }}>按 Enter 快速添加模型</p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                <button onClick={() => setModalOpen(false)} className="btn-ghost">
                  取消
                </button>
                <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-cyber">
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
