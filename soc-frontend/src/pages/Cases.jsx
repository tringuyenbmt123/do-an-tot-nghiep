// ==============================================================
// src/pages/Cases.jsx
// Trang Quản lý Sự cố (Incident Management)
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Plus, RefreshCw, Search } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SeverityBadge from '../components/ui/SeverityBadge'
import StatusBadge from '../components/ui/StatusBadge'
import SkeletonTable from '../components/ui/SkeletonTable'
import EmptyState from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import Modal from '../components/ui/Modal'
import { getCases, createCase, updateCaseStatus } from '../api/cases'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { ago } from '../utils/date'
import { resolveSeverity, resolveCaseTitle } from '../utils/case'

const PAGE_SIZE = 20

export default function Cases() {
  const navigate = useNavigate()
  const [cases, setCases]           = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('')
  const [showCreate, setShowCreate] = useState(false)
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
    const targetCase = cases.find((item) => item.id === caseId)
    const isAssigned = Boolean(
      targetCase?.assigned_to &&
      targetCase.assigned_to !== 'soar_automation' &&
      targetCase.assigned_to.toLowerCase() !== 'unassigned' &&
      targetCase.assigned_to.trim() !== ''
    )
    if (status === 'closed' && !isAssigned) {
      toast.warn('Vui lòng phân công người phụ trách trước khi đóng sự cố')
      return
    }

    const labels = { new: 'Mới', progress: 'Đang xử lý', pending: 'Chờ', closed: 'Đóng' }
    try {
      await updateCaseStatus(caseId, status)
      toast.success(`Đã cập nhật trạng thái thành "${labels[status] || status}"`)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message)
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
                    <tr
                      key={c.id}
                      className="cl"
                      onClick={() => navigate(`/cases/${c.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="mono" style={{ fontSize: 11 }}>{c.id}</td>
                      <td
                        style={{ fontWeight: 500, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={resolveCaseTitle(c)}
                      >
                        {resolveCaseTitle(c)}
                      </td>
                      <td><SeverityBadge value={resolveSeverity(c)} /></td>
                      <td style={{ fontSize: 13, color: (!c.assigned_to || c.assigned_to === 'soar_automation' || c.assigned_to.toLowerCase() === 'unassigned') ? 'var(--muted)' : 'inherit', fontStyle: (!c.assigned_to || c.assigned_to === 'soar_automation' || c.assigned_to.toLowerCase() === 'unassigned') ? 'italic' : 'normal' }}>
                        {(!c.assigned_to || c.assigned_to === 'soar_automation' || c.assigned_to.toLowerCase() === 'unassigned') ? 'Chưa phân công' : c.assigned_to}
                      </td>
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
    </Layout>
  )
}
