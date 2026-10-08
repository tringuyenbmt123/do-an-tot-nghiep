// ==============================================================
// src/pages/Alerts.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { Bell, Search, RefreshCw, ChevronDown, Eye, CheckCircle, XCircle, ArrowUp, Zap } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SeverityBadge from '../components/ui/SeverityBadge'
import StatusBadge from '../components/ui/StatusBadge'
import SkeletonTable from '../components/ui/SkeletonTable'
import EmptyState from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import Modal from '../components/ui/Modal'
import { getAlerts, getAlertById, updateAlertStatus, escalateAlert } from '../api/alerts'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../contexts/ToastContext'
import { ago, formatDateTime } from '../utils/date'

const PAGE_SIZE = 50


export default function Alerts() {
  const [alerts, setAlerts]       = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [sevFilter, setSevFilter] = useState('')
  const [statusFilter, setStatus] = useState('')
  const [selected, setSelected]   = useState([])
  const [detail, setDetail]       = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const dSearch = useDebounce(search, 400)
  const toast = useToast()

  const load = useCallback(async (silent = false) => {
    setError('')
    if (!silent) setLoading(true)
    try {
      const params = { page, limit: PAGE_SIZE }
      if (sevFilter)    params.severity = sevFilter
      if (statusFilter) params.status   = statusFilter
      const res = await getAlerts(params)
      setAlerts(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, sevFilter, statusFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [sevFilter, statusFilter])

  // Lắng nghe sự kiện Alert mới qua WebSocket theo thời gian thực (không cần F5)
  useEffect(() => {
    const handleRealtimeAlert = (e) => {
      const incoming = e.detail
      if (!incoming) return
      
      setAlerts(prev => {
        // Tránh trùng lặp nếu alert đã có trong list
        if (incoming.id && prev.some(a => a.id === incoming.id)) return prev
        return [incoming, ...prev]
      })
      setTotal(t => t + 1)
    }

    window.addEventListener('soc:new_alert', handleRealtimeAlert)
    
    // Auto-refresh nền mỗi 30 giây để đồng bộ ngầm mà không nháy màn hình
    const timer = setInterval(() => {
      load(true)
    }, 30000)

    return () => {
      window.removeEventListener('soc:new_alert', handleRealtimeAlert)
      clearInterval(timer)
    }
  }, [load])

  const filtered = dSearch
    ? alerts.filter(a =>
        (a.title || '').toLowerCase().includes(dSearch.toLowerCase()) ||
        (a.event_type || '').toLowerCase().includes(dSearch.toLowerCase()) ||
        (a.id || '').toLowerCase().includes(dSearch.toLowerCase())
      )
    : alerts

  const toggleSelect = (id) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const toggleAll = () =>
    setSelected(s => s.length === filtered.length ? [] : filtered.map(a => a.id))

  const handleStatusBulk = async (status) => {
    if (selected.length === 0) { toast.warn('Chưa chọn cảnh báo nào'); return }
    const label = { ack: 'Nhận xử lý', closed: 'Đóng', fp: 'False Positive' }[status] || status
    if (!window.confirm(`Đặt ${selected.length} cảnh báo thành "${label}"?`)) return
    let ok = 0
    for (const id of selected) {
      try { await updateAlertStatus(id, { status }); ok++ } catch {}
    }
    toast.success(`Đã cập nhật ${ok}/${selected.length} cảnh báo`)
    setSelected([])
    load()
  }

  const handleSingleStatus = async (id, status) => {
    const label = { ack: 'Nhận xử lý', closed: 'Đóng', fp: 'False Positive' }[status] || status
    try {
      await updateAlertStatus(id, { status })
      toast.success(`Đã chuyển cảnh báo sang "${label}"`)
      load(true)
      return true
    } catch (e) {
      toast.error(e.message || 'Cập nhật trạng thái thất bại')
      return false
    }
  }

  const openDetail = async (id) => {
    setDetailLoading(true)
    setDetail({ id, loading: true })
    try {
      const res = await getAlertById(id)
      setDetail(res.data)
    } catch (e) {
      toast.error('Không tải được chi tiết cảnh báo')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleStatusSingle = async (id, status) => {
    const label = { ack: 'Nhận xử lý', closed: 'Đóng', fp: 'False Positive' }[status] || status
    try {
      await updateAlertStatus(id, { status })
      toast.success(`Đã đặt cảnh báo thành "${label}"`)
      setDetail(null)
      load()
    } catch (e) {
      toast.error(`Không cập nhật được: ${e.message}`)
    }
  }

  const handleEscalate = async (id) => {
    if (!window.confirm('Tạo Case điều tra từ cảnh báo này?')) return
    try {
      await escalateAlert(id)
      toast.success('Đã tạo Case điều tra thành công')
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Layout title="Cảnh báo">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><Bell size={20} /></div>
          <div>
            <h1>Hàng đợi Cảnh báo</h1>
            <p>Quản lý và phân loại cảnh báo bảo mật · {total} tổng cộng</p>
          </div>
        </div>
        <div className="act">
          {selected.length > 0 && (
            <>
              <button className="b2" onClick={() => handleStatusBulk('ack')} style={{ fontSize: 13 }}>
                <CheckCircle size={14} /> Nhận ({selected.length})
              </button>
              <button className="b2" onClick={() => handleStatusBulk('fp')} style={{ fontSize: 13 }}>
                <XCircle size={14} /> FP ({selected.length})
              </button>
              <button className="b2" onClick={() => handleStatusBulk('closed')} style={{ fontSize: 13 }}>
                Đóng ({selected.length})
              </button>
            </>
          )}
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
              placeholder="Tìm theo tiêu đề, loại, ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="tools">
            <span style={{ fontSize: 12, color: 'var(--muted)', padding: '0 4px' }}>Mức độ:</span>
            {['', 'critical', 'high', 'medium', 'low'].map(v => (
              <button
                key={v}
                className={`chip${sevFilter === v ? ' on' : ''}`}
                onClick={() => setSevFilter(v)}
              >
                {v === '' ? 'Tất cả' : { critical: 'Nghiêm trọng', high: 'Cao', medium: 'Trung bình', low: 'Thấp' }[v]}
              </button>
            ))}
          </div>

          <select className="soc-select" value={statusFilter} onChange={e => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="new">Mới</option>
            <option value="ack">Đã nhận</option>
            <option value="fp">False Positive</option>
            <option value="closed">Đóng</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 16 }}>
            <SkeletonTable cols={7} rows={10} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState message="Không có cảnh báo" sub={dSearch ? `Không tìm thấy "${dSearch}"` : 'Hệ thống đang hoạt động bình thường'} />
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={selected.length === filtered.length && filtered.length > 0}
                        onChange={toggleAll}
                        aria-label="Chọn tất cả"
                      />
                    </th>
                    <th>ID</th>
                    <th>Tiêu đề</th>
                    <th>Mức độ</th>
                    <th>Loại sự kiện</th>
                    <th>Trạng thái</th>
                    <th>Thời gian</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.id} className="cl" onClick={() => openDetail(a.id)}>
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.includes(a.id)}
                          onChange={() => toggleSelect(a.id)}
                          aria-label={`Chọn cảnh báo ${a.id}`}
                        />
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{a.id}</td>
                      <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {a.title || a.event_type}
                      </td>
                      <td><SeverityBadge value={a.severity} /></td>
                      <td className="mono" style={{ fontSize: 12 }}>{a.event_type}</td>
                      <td><StatusBadge value={a.status} /></td>
                      <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }} title={formatDateTime(a.created_at)}>
                        {ago(a.created_at)}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="lnk" onClick={() => openDetail(a.id)} aria-label="Chi tiết"><Eye size={13} /></button>
                          <button className="lnk" onClick={() => handleEscalate(a.id)} title="Tạo Case" aria-label="Tạo Case">
                            <ArrowUp size={13} />
                          </button>
                        </div>
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

      {/* Alert Detail Modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`Chi tiết cảnh báo – ${detail?.id || ''}`}
        size="lg"
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button
              className="b2"
              onClick={() => detail?.id && handleStatusSingle(detail.id, 'ack')}
              disabled={!detail?.id || detail?.status === 'ack'}
            >
              <CheckCircle size={14} /> Nhận xử lý
            </button>
            <button
              className="b2"
              onClick={() => { if (detail?.id) { handleEscalate(detail.id) } }}
              disabled={!detail?.id}
            >
              <ArrowUp size={14} /> Tạo Case
            </button>
            <button className="b1 danger" style={{ marginLeft: 'auto' }} onClick={() => setDetail(null)}>Đóng</button>
          </div>
        }
      >
        {detailLoading ? (
          <div className="loading-full"><div className="spinner" /><span>Đang tải…</span></div>
        ) : detail && !detail.loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>TIÊU ĐỀ</div>
                <div style={{ fontWeight: 600 }}>{detail.title || detail.event_type}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>MỨC ĐỘ</div>
                <SeverityBadge value={detail.severity} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>TRẠNG THÁI</div>
                <StatusBadge value={detail.status} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>AGENT</div>
                <span className="mono" style={{ fontSize: 12 }}>{detail.agent_id}</span>
              </div>
              {detail.mitre_tactic && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>MITRE TACTIC</div>
                  <span className="tag">{detail.mitre_tactic}</span>
                </div>
              )}
              {detail.mitre_technique_id && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>TECHNIQUE</div>
                  <span className="tag">{detail.mitre_technique_id}</span>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>THỜI GIAN PHÁT HIỆN</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  {formatDateTime(detail.created_at)} <span style={{ color: 'var(--muted)', fontSize: 11 }}>({ago(detail.created_at)})</span>
                </div>
              </div>
            </div>
            {detail.description && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>MÔ TẢ</div>
                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{detail.description}</p>
              </div>
            )}
            {detail.raw_payload && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>RAW PAYLOAD</div>
                <pre className="code-block">
                  {typeof detail.raw_payload === 'string'
                    ? detail.raw_payload
                    : JSON.stringify(detail.raw_payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </Layout>
  )
}
