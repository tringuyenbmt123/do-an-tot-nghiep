// ==============================================================
// src/pages/ThreatIntel.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { Shield, Search, Plus, RefreshCw, Globe, Server, Hash, FileDigit, Mail, ScanSearch } from 'lucide-react'
import Layout from '../components/layout/Layout'
import StatusBadge from '../components/ui/StatusBadge'
import SkeletonTable from '../components/ui/SkeletonTable'
import EmptyState from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import Modal from '../components/ui/Modal'
import { getIndicators, createIndicator, deleteIndicator, analyzeIOC } from '../api/indicators'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../contexts/ToastContext'

import { ago, formatDateTime } from '../utils/date'

const PAGE_SIZE = 50

const TYPE_ICONS = {
  'ip-src': Server, 'ip-dst': Server, 'domain': Globe, 'url': Globe,
  'md5': Hash, 'sha1': FileDigit, 'sha256': FileDigit, 'email': Mail
}

export default function ThreatIntel() {
  const [iocs, setIocs]             = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const dSearch = useDebounce(search, 400)
  const toast = useToast()

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ type: 'ip-src', value: '', category: 'malware', description: '' })
  const [createErrors, setCreateErrors] = useState({})

  const [analyzeModal, setAnalyzeModal] = useState(null)
  const [analyzeRes, setAnalyzeRes]     = useState(null)
  const [analyzing, setAnalyzing]       = useState(false)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const params = { page, limit: PAGE_SIZE }
      if (typeFilter) params.type = typeFilter
      const res = await getIndicators(params)
      setIocs(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [page, typeFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [typeFilter])

  const filtered = dSearch
    ? iocs.filter(i =>
        (i.value || '').toLowerCase().includes(dSearch.toLowerCase()) ||
        (i.category || '').toLowerCase().includes(dSearch.toLowerCase()) ||
        (i.description || '').toLowerCase().includes(dSearch.toLowerCase())
      )
    : iocs

  const handleCreate = async () => {
    const e = {}
    if (!createForm.value.trim()) e.value = 'Vui lòng nhập giá trị IOC'
    if (Object.keys(e).length > 0) { setCreateErrors(e); return }

    try {
      await createIndicator(createForm)
      toast.success('Đã thêm Indicator')
      setShowCreate(false)
      setCreateForm({ type: 'ip-src', value: '', category: 'malware', description: '' })
      setCreateErrors({})
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa Indicator này khỏi cơ sở dữ liệu?')) return
    try {
      await deleteIndicator(id)
      toast.success('Đã xóa Indicator')
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleAnalyze = async (ioc) => {
    setAnalyzeModal(ioc)
    setAnalyzeRes(null)
    setAnalyzing(true)
    try {
      const res = await analyzeIOC({ type: ioc.type, value: ioc.value })
      setAnalyzeRes(res.data)
    } catch (e) {
      toast.error(e.message)
      setAnalyzeModal(null)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <Layout title="Threat Intelligence">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><Shield size={20} /></div>
          <div>
            <h1>Threat Intelligence</h1>
            <p>Quản lý IOC (Indicators of Compromise) và danh sách đen · {total} mục</p>
          </div>
        </div>
        <div className="act">
          <button className="b1" onClick={() => setShowCreate(true)}><Plus size={15} /> Thêm IOC</button>
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
              placeholder="Tìm kiếm giá trị IOC…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="soc-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 160 }}>
            <option value="">Tất cả loại IOC</option>
            <option value="ip-src">IP (Source)</option>
            <option value="ip-dst">IP (Dest)</option>
            <option value="domain">Domain</option>
            <option value="url">URL</option>
            <option value="md5">MD5</option>
            <option value="sha256">SHA-256</option>
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
          <EmptyState message="Không có dữ liệu IOC" sub={dSearch ? `Không tìm thấy "${dSearch}"` : 'Thêm Indicator mới để bắt đầu'} />
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Loại</th>
                    <th>Giá trị IOC</th>
                    <th>Danh mục</th>
                    <th>Điểm rủi ro</th>
                    <th>Mô tả</th>
                    <th>Thời gian thêm</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(i => {
                    const Icon = TYPE_ICONS[i.type] || Shield
                    return (
                      <tr key={i.id} className="cl">
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' }}>
                            <Icon size={14} /> {i.type}
                          </div>
                        </td>
                        <td className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{i.value}</td>
                        <td><span className="tag">{i.category || '—'}</span></td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 24, height: 24, borderRadius: 12, fontSize: 11, fontWeight: 700,
                            background: i.risk_score >= 80 ? 'rgba(248,81,73,.15)' : i.risk_score >= 50 ? 'rgba(210,153,34,.15)' : 'rgba(63,185,80,.15)',
                            color: i.risk_score >= 80 ? 'var(--crit)' : i.risk_score >= 50 ? 'var(--med)' : 'var(--low)'
                          }}>
                            {i.risk_score || 0}
                          </span>
                        </td>
                        <td style={{ fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {i.description || '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{ago(i.created_at)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="lnk" title="Phân tích (Cortex)" onClick={() => handleAnalyze(i)}>
                              <ScanSearch size={14} />
                            </button>
                            <button className="lnk d" title="Xóa" onClick={() => handleDelete(i.id)}>Xóa</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* Create IOC Modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); setCreateErrors({}) }}
        title="Thêm Indicator of Compromise"
        footer={
          <>
            <button className="b2" onClick={() => setShowCreate(false)}>Hủy</button>
            <button className="b1" onClick={handleCreate}>Lưu Indicator</button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16 }}>
          <div className="form-group">
            <label>Loại IOC</label>
            <select className="soc-select" value={createForm.type} onChange={e => setCreateForm(f => ({ ...f, type: e.target.value }))}>
              <option value="ip-src">IP (Src)</option>
              <option value="ip-dst">IP (Dst)</option>
              <option value="domain">Domain</option>
              <option value="url">URL</option>
              <option value="md5">MD5</option>
              <option value="sha256">SHA-256</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div className="form-group">
            <label>Giá trị *</label>
            <input
              className="soc-input mono"
              placeholder="VD: 192.168.1.1, evil.com..."
              value={createForm.value}
              onChange={e => { setCreateForm(f => ({ ...f, value: e.target.value })); setCreateErrors(v => ({ ...v, value: '' })) }}
              style={createErrors.value ? { borderColor: 'var(--crit)' } : {}}
            />
            {createErrors.value && <p style={{ color: 'var(--crit)', fontSize: 12, marginTop: 4 }}>{createErrors.value}</p>}
          </div>
        </div>
        <div className="form-group">
          <label>Danh mục</label>
          <input
            className="soc-input"
            placeholder="malware, phishing, c2..."
            value={createForm.category}
            onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label>Mô tả / Ghi chú</label>
          <textarea
            className="soc-input"
            placeholder="Nguồn cấp, chiến dịch..."
            value={createForm.description}
            onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Analyze Modal */}
      <Modal
        open={!!analyzeModal}
        onClose={() => setAnalyzeModal(null)}
        title={analyzeModal ? `Phân tích IOC: ${analyzeModal.value}` : ''}
        size="lg"
        footer={<button className="b2" onClick={() => setAnalyzeModal(null)}>Đóng</button>}
      >
        {analyzing ? (
          <div className="loading-full">
            <div className="spinner" />
            <span>Đang gửi yêu cầu phân tích tới Cortex/VirusTotal…</span>
          </div>
        ) : analyzeRes ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--panel2)', padding: 16, borderRadius: 8, border: '1px solid var(--line)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Kết luận</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: analyzeRes.verdict === 'malicious' ? 'var(--crit)' : 'var(--ok)' }}>
                  {analyzeRes.verdict === 'malicious' ? 'MÃ ĐỘC (Malicious)' : 'SẠCH (Clean)'}
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: '0 24px', borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Detections</div>
                <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace' }}>
                  <span style={{ color: analyzeRes.detections > 0 ? 'var(--crit)' : 'var(--ok)' }}>{analyzeRes.detections}</span>
                  <span style={{ color: 'var(--muted)' }}>/{analyzeRes.total_engines}</span>
                </div>
              </div>
              <div style={{ textAlign: 'center', paddingLeft: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Risk Score</div>
                <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace', color: analyzeRes.risk_score >= 80 ? 'var(--crit)' : analyzeRes.risk_score >= 50 ? 'var(--med)' : 'var(--low)' }}>
                  {analyzeRes.risk_score}
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Tags</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {analyzeRes.tags?.map(t => <span key={t} className="tag">{t}</span>) || <span style={{ color: 'var(--muted)' }}>Không có</span>}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Chi tiết phản hồi (Raw)</div>
              <pre className="code-block" style={{ maxHeight: 250 }}>
                {JSON.stringify(analyzeRes, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </Layout>
  )
}
