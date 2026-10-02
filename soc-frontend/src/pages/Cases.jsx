// ==============================================================
// src/pages/Cases.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { FolderOpen, Plus, RefreshCw, Search, MessageSquare, Clock, Send, FileText } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SeverityBadge from '../components/ui/SeverityBadge'
import StatusBadge from '../components/ui/StatusBadge'
import SkeletonTable from '../components/ui/SkeletonTable'
import EmptyState from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import Modal from '../components/ui/Modal'
import { getCases, getCaseById, createCase, updateCaseStatus, assignCase, addCaseNote } from '../api/cases'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { ago, formatDateTime } from '../utils/date'

const PAGE_SIZE = 20

const resolveSeverity = (item) => {
  if (!item) return 'medium'
  if (item.severity && item.severity !== '—') return item.severity
  if (item.severity_num) {
    const map = { 1: 'critical', 2: 'high', 3: 'medium', 4: 'low' }
    if (map[item.severity_num]) return map[item.severity_num]
  }
  const text = `${item.title || ''} ${item.description || ''}`.toUpperCase()
  if (text.includes('[CRITICAL]') || text.includes('CRITICAL')) return 'critical'
  if (text.includes('[HIGH]') || text.includes('HIGH')) return 'high'
  if (text.includes('[MEDIUM]') || text.includes('MEDIUM')) return 'medium'
  if (text.includes('[LOW]') || text.includes('LOW')) return 'low'
  return 'medium'
}

const parseCaseDescription = (desc) => {
  if (!desc) return { initialDesc: '', notes: [] }

  const parts = desc.split(/\n*---\n*/).map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return { initialDesc: '', notes: [] }

  let initialDesc = ''
  const notes = []

  parts.forEach((part, idx) => {
    const match = part.match(/^\*{0,2}\[([^\]]+)\]\s*([^:*]+)\*{0,2}:\s*([\s\S]*)$/)
    if (match) {
      notes.push({
        id: idx,
        timestamp: match[1].trim(),
        author: match[2].trim(),
        content: match[3].trim(),
      })
    } else {
      if (idx === 0) {
        initialDesc = part
      } else {
        notes.push({
          id: idx,
          timestamp: '',
          author: '',
          content: part,
        })
      }
    }
  })

  return { initialDesc, notes }
}

export default function Cases() {
  const [cases, setCases]           = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected]     = useState(null)
  const [noteText, setNoteText]     = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', description: '', assigned_to: '', severity: 'high' })
  const [createErrors, setCreateErrors] = useState({})
  const dSearch = useDebounce(search, 400)
  const toast = useToast()
  const { user } = useAuth()

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const params = { page, limit: PAGE_SIZE }
      if (statusFilter) params.status = statusFilter
      const res = await getCases(params)
      setCases(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [statusFilter])

  const filtered = dSearch
    ? cases.filter(c =>
        (c.title || '').toLowerCase().includes(dSearch.toLowerCase()) ||
        (c.id || '').toLowerCase().includes(dSearch.toLowerCase()) ||
        (c.assigned_to || '').toLowerCase().includes(dSearch.toLowerCase())
      )
    : cases

  const handleCreate = async () => {
    const e = {}
    if (!createForm.title.trim()) e.title = 'Vui lòng nhập tiêu đề'
    if (Object.keys(e).length > 0) { setCreateErrors(e); return }

    try {
      await createCase({
        title: createForm.title,
        description: createForm.description,
        assigned_to: createForm.assigned_to || user?.username,
        severity: createForm.severity || 'high',
      })
      toast.success('Đã tạo Case mới')
      setShowCreate(false)
      setCreateForm({ title: '', description: '', assigned_to: '', severity: 'high' })
      setCreateErrors({})
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleStatusChange = async (caseId, status) => {
    const labels = { new: 'Mới', progress: 'Đang xử lý', pending: 'Chờ', closed: 'Đóng' }
    if (!window.confirm(`Đổi trạng thái thành "${labels[status] || status}"?`)) return
    try {
      await updateCaseStatus(caseId, status)
      toast.success('Đã cập nhật trạng thái')
      load()
      if (selected?.id === caseId) setSelected(s => ({ ...s, status }))
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) { toast.warn('Vui lòng nhập nội dung ghi chú'); return }
    setAddingNote(true)
    try {
      await addCaseNote(selected.id, noteText)
      toast.success('Đã thêm ghi chú điều tra')
      setNoteText('')
      try {
        const res = await getCaseById(selected.id)
        if (res.data) setSelected(res.data)
      } catch {
        const now = new Date()
        const timeStr = now.toISOString().replace('T', ' ').substring(0, 19)
        const appendNote = `\n\n---\n**[${timeStr}] ${user?.username || 'admin'}**: ${noteText}`
        setSelected(s => ({ ...s, description: (s.description || '') + appendNote }))
      }
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setAddingNote(false)
    }
  }

  return (
    <Layout title="Sự cố">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><FolderOpen size={20} /></div>
          <div>
            <h1>Quản lý Sự cố</h1>
            <p>Theo dõi, điều tra và đóng các case bảo mật · {total} tổng cộng</p>
          </div>
        </div>
        <div className="act">
          <button className="b1" onClick={() => setShowCreate(true)}><Plus size={15} /> Tạo Case</button>
          <button className="b2" onClick={load} disabled={loading}>
            <RefreshCw size={15} style={loading ? { animation: 'spin .7s linear infinite' } : {}} />
            Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,81,73,.1)', border: '1px solid var(--crit)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: 'var(--crit)', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠ {error}</span>
          <button className="b2" style={{ padding: '4px 10px', fontSize: 12 }} onClick={load}>Thử lại</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="bar2">
          <div className="q-wrap">
            <span className="q-icon"><Search size={16} /></span>
            <input
              className="q"
              placeholder="Tìm theo tiêu đề, ID, người phụ trách…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="tools">
            {['', 'new', 'progress', 'pending', 'closed'].map(v => (
              <button
                key={v}
                className={`chip${statusFilter === v ? ' on' : ''}`}
                onClick={() => setStatus(v)}
              >
                {v === '' ? 'Tất cả' : { new: 'Mới', progress: 'Đang xử lý', pending: 'Chờ', closed: 'Đóng' }[v]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 16 }}>
            <SkeletonTable cols={6} rows={8} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState message="Không có sự cố" sub={dSearch ? `Không tìm thấy "${dSearch}"` : 'Tạo case mới để bắt đầu điều tra'} />
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tiêu đề</th>
                    <th>Mức độ</th>
                    <th>Trạng thái</th>
                    <th>Người phụ trách</th>
                    <th>Cập nhật</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} className="cl" onClick={() => setSelected(c)}>
                      <td className="mono" style={{ fontSize: 11 }}>{c.id}</td>
                      <td style={{ fontWeight: 500, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.title}
                      </td>
                      <td><SeverityBadge value={resolveSeverity(c)} /></td>
                      <td><StatusBadge value={c.status} /></td>
                      <td style={{ fontSize: 13 }}>{c.assigned_to || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{ago(c.updated_at)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <select
                          className="soc-select"
                          style={{ fontSize: 12, padding: '3px 24px 3px 8px' }}
                          value={c.status}
                          onChange={e => handleStatusChange(c.id, e.target.value)}
                          aria-label="Đổi trạng thái"
                        >
                          <option value="new">Mới</option>
                          <option value="progress">Đang xử lý</option>
                          <option value="pending">Chờ</option>
                          <option value="closed">Đóng</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* Create Case Modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); setCreateErrors({}) }}
        title="Tạo Case mới"
        footer={
          <>
            <button className="b2" onClick={() => setShowCreate(false)}>Hủy</button>
            <button className="b1" onClick={handleCreate}>Tạo Case</button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor="case-title">Tiêu đề *</label>
          <input
            id="case-title"
            className="soc-input"
            placeholder="Điều tra sự kiện bất thường…"
            value={createForm.title}
            onChange={e => { setCreateForm(f => ({ ...f, title: e.target.value })); setCreateErrors(v => ({ ...v, title: '' })) }}
            style={createErrors.title ? { borderColor: 'var(--crit)' } : {}}
          />
          {createErrors.title && <p style={{ color: 'var(--crit)', fontSize: 12, marginTop: 4 }}>{createErrors.title}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="case-sev">Mức độ</label>
          <select
            id="case-sev"
            className="soc-select"
            value={createForm.severity}
            onChange={e => setCreateForm(f => ({ ...f, severity: e.target.value }))}
            style={{ width: '100%' }}
          >
            <option value="critical">Nghiêm trọng (Critical)</option>
            <option value="high">Cao (High)</option>
            <option value="medium">Trung bình (Medium)</option>
            <option value="low">Thấp (Low)</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="case-desc">Mô tả</label>
          <textarea
            id="case-desc"
            className="soc-input"
            placeholder="Mô tả chi tiết về sự cố…"
            value={createForm.description}
            onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label htmlFor="case-assign">Phụ trách</label>
          <input
            id="case-assign"
            className="soc-input"
            placeholder={user?.username || 'analyst'}
            value={createForm.assigned_to}
            onChange={e => setCreateForm(f => ({ ...f, assigned_to: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Case Detail / Note Modal */}
      <Modal
        open={!!selected}
        onClose={() => { setSelected(null); setNoteText('') }}
        title={`Case – ${selected?.id || ''}`}
        size="lg"
        footer={
          <>
            <button className="b2" onClick={() => { setSelected(null); setNoteText('') }}>Đóng</button>
          </>
        }
      >
        {selected && (() => {
          const { initialDesc, notes } = parseCaseDescription(selected.description)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>TIÊU ĐỀ</div>
                  <div style={{ fontWeight: 600 }}>{selected.title}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>MỨC ĐỘ</div>
                  <SeverityBadge value={resolveSeverity(selected)} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>TRẠNG THÁI</div>
                  <StatusBadge value={selected.status} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>PHỤ TRÁCH</div>
                  <span style={{ fontSize: 13 }}>{selected.assigned_to || '—'}</span>
                </div>
              </div>

              {/* Mô tả ban đầu */}
              {initialDesc && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <FileText size={13} /> THÔNG TIN MÔ TẢ BAN ĐẦU
                  </div>
                  <div style={{
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--bdr)',
                    borderRadius: 8,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--text)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {initialDesc}
                  </div>
                </div>
              )}

              {/* Nhật ký ghi chú điều tra */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <MessageSquare size={13} /> NHẬT KÝ GHI CHÚ ĐIỀU TRA {notes.length > 0 && `(${notes.length})`}
                </div>
                {notes.length === 0 ? (
                  <div style={{
                    padding: '14px',
                    textAlign: 'center',
                    color: 'var(--muted)',
                    fontSize: 13,
                    background: 'rgba(255, 255, 255, 0.01)',
                    border: '1px dashed var(--bdr)',
                    borderRadius: 8,
                  }}>
                    Chưa có ghi chú điều tra nào.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
                    {notes.map(n => (
                      <div
                        key={n.id}
                        style={{
                          padding: '10px 14px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--bdr)',
                          borderRadius: 8,
                          borderLeft: '3px solid var(--primary, #3b82f6)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              background: 'rgba(59, 130, 246, 0.15)',
                              color: 'var(--primary, #3b82f6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontWeight: 700,
                            }}>
                              {(n.author || 'A').charAt(0).toUpperCase()}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                              {n.author || 'Analyst'}
                            </span>
                          </div>
                          {n.timestamp && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
                              <Clock size={12} />
                              <span>{n.timestamp}</span>
                            </div>
                          )}
                        </div>
                        <div style={{
                          fontSize: 13.5,
                          color: 'var(--text)',
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}>
                          {n.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Thêm ghi chú mới */}
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={13} /> THÊM GHI CHÚ MỚI
                </div>
                <textarea
                  className="soc-input"
                  placeholder="Ghi lại các phát hiện, hành động ngăn chặn hoặc cập nhật mới nhất…"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  rows={3}
                  style={{ marginBottom: 8, resize: 'vertical' }}
                />
                <button
                  className="b1"
                  onClick={handleAddNote}
                  disabled={addingNote || !noteText.trim()}
                  style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Send size={13} />
                  {addingNote ? 'Đang lưu…' : 'Gửi ghi chú'}
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </Layout>
  )
}
