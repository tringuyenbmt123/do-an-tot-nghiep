// ==============================================================
// src/pages/DetectionRules.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Plus, Search, RefreshCw, Power } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SeverityBadge from '../components/ui/SeverityBadge'
import SkeletonTable from '../components/ui/SkeletonTable'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { getRules, toggleRule, createRule, updateRule, deleteRule } from '../api/rules'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

export default function DetectionRules() {
  const [rules, setRules]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')
  const dSearch = useDebounce(search, 400)
  const toast = useToast()
  const { isAdmin } = useAuth()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(null)
  const [formErrs, setFormErrs] = useState({})
  const [isEdit, setIsEdit]     = useState(false)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const res = await getRules()
      setRules(res.data?.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = dSearch
    ? rules.filter(r =>
        (r.name || '').toLowerCase().includes(dSearch.toLowerCase()) ||
        (r.id || '').toLowerCase().includes(dSearch.toLowerCase()) ||
        (r.event_type || '').toLowerCase().includes(dSearch.toLowerCase())
      )
    : rules

  const handleToggle = async (r) => {
    if (!isAdmin) { toast.warn('Chỉ admin mới có quyền đổi trạng thái Rule'); return }
    try {
      await toggleRule(r.id, !r.is_active)
      toast.success(`Đã ${!r.is_active ? 'bật' : 'tắt'} rule: ${r.name}`)
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleDelete = async (id) => {
    if (!isAdmin) { toast.warn('Chỉ admin mới có quyền xóa Rule'); return }
    if (!window.confirm('Xóa luật phát hiện này?')) return
    try {
      await deleteRule(id)
      toast.success('Đã xóa rule')
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const openCreate = () => {
    if (!isAdmin) { toast.warn('Chỉ admin mới có quyền tạo Rule'); return }
    setForm({
      name: '', severity: 'medium', event_type: 'custom_event',
      conditions: { field: '', operator: 'equals', value: '' },
      mitre_tactic: '', mitre_technique_id: '', description: ''
    })
    setIsEdit(false)
    setFormErrs({})
    setShowForm(true)
  }

  const openEdit = (r) => {
    if (!isAdmin) { toast.warn('Chỉ admin mới có quyền sửa Rule'); return }
    setForm({ ...r, conditions: r.conditions || { field: '', operator: 'equals', value: '' } })
    setIsEdit(true)
    setFormErrs({})
    setShowForm(true)
  }

  const handleSave = async () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Vui lòng nhập tên Rule'
    if (Object.keys(e).length > 0) { setFormErrs(e); return }

    try {
      if (isEdit) {
        await updateRule(form.id, form)
        toast.success('Đã cập nhật rule')
      } else {
        await createRule(form)
        toast.success('Đã tạo rule mới')
      }
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <Layout title="Detection Rules">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><AlertTriangle size={20} /></div>
          <div>
            <h1>Detection Rules</h1>
            <p>Luật phát hiện sự kiện bất thường và tự động tạo cảnh báo · {rules.length} mục</p>
          </div>
        </div>
        <div className="act">
          <button className="b1" onClick={openCreate}><Plus size={15} /> Thêm Rule</button>
          <button className="b2" onClick={load} disabled={loading}>
            <RefreshCw size={15} style={loading ? { animation: 'spin .7s linear infinite' } : {}} /> Làm mới
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
              placeholder="Tìm theo tên rule, ID, loại sự kiện…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonTable cols={7} rows={10} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="Không có Rule nào" sub={dSearch ? `Không tìm thấy "${dSearch}"` : 'Bấm "Thêm Rule" để tạo mới'} />
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60, textAlign: 'center' }}>Trạng thái</th>
                  <th>ID Rule</th>
                  <th>Tên Rule</th>
                  <th>Mức độ</th>
                  <th>Loại sự kiện</th>
                  <th>Điều kiện (JSON)</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="cl">
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleToggle(r)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: r.is_active ? 'var(--ok)' : 'var(--muted)',
                          padding: 4
                        }}
                        title={r.is_active ? 'Đang Bật' : 'Đang Tắt'}
                      >
                        <Power size={18} />
                      </button>
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.id}</td>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td><SeverityBadge value={r.severity} /></td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.event_type}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeof r.conditions === 'string' ? r.conditions : JSON.stringify(r.conditions)}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="lnk" onClick={() => openEdit(r)}>Sửa</button>
                        <button className="lnk d" onClick={() => handleDelete(r.id)}>Xóa</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={isEdit ? `Sửa Rule: ${form?.id}` : 'Thêm Rule Mới'}
        size="lg"
        footer={
          <>
            <button className="b2" onClick={() => setShowForm(false)}>Hủy</button>
            <button className="b1" onClick={handleSave}>Lưu Rule</button>
          </>
        }
      >
        {form && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label>Tên Rule *</label>
              <input
                className="soc-input"
                placeholder="Ví dụ: Suspicious Process Creation"
                value={form.name}
                onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormErrs(v => ({ ...v, name: '' })) }}
                style={formErrs.name ? { borderColor: 'var(--crit)' } : {}}
              />
              {formErrs.name && <p style={{ color: 'var(--crit)', fontSize: 12, marginTop: 4 }}>{formErrs.name}</p>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Loại sự kiện (Event Type)</label>
                <input
                  className="soc-input mono"
                  placeholder="process_creation, file_mod, ..."
                  value={form.event_type}
                  onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Mức độ tạo cảnh báo</label>
                <select className="soc-select" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                  <option value="low">Thấp</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Cao</option>
                  <option value="critical">Nghiêm trọng</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Điều kiện Match (JSON)</label>
              <textarea
                className="soc-input mono"
                style={{ minHeight: 100 }}
                placeholder='{"field": "process_name", "operator": "equals", "value": "cmd.exe"}'
                value={typeof form.conditions === 'string' ? form.conditions : JSON.stringify(form.conditions, null, 2)}
                onChange={e => {
                  try {
                    const parsed = JSON.parse(e.target.value)
                    setForm(f => ({ ...f, conditions: parsed }))
                  } catch {
                    setForm(f => ({ ...f, conditions: e.target.value })) // keep as string if invalid JSON while typing
                  }
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Nhập điều kiện match ở định dạng JSON để engine gRPC có thể biên dịch.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>MITRE Tactic (Tùy chọn)</label>
                <input
                  className="soc-input"
                  placeholder="Ví dụ: Execution"
                  value={form.mitre_tactic || ''}
                  onChange={e => setForm(f => ({ ...f, mitre_tactic: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>MITRE Technique ID (Tùy chọn)</label>
                <input
                  className="soc-input"
                  placeholder="Ví dụ: T1059"
                  value={form.mitre_technique_id || ''}
                  onChange={e => setForm(f => ({ ...f, mitre_technique_id: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Mô tả / Ghi chú</label>
              <textarea
                className="soc-input"
                placeholder="Mô tả mục đích của luật này..."
                value={form.description || ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  )
}
