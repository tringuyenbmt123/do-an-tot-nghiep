// ==============================================================
// src/pages/SIEM.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { FileText, Search, RefreshCw, Download } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import EmptyState from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import { getSiemEvents } from '../api/siem'
import { useDebounce } from '../hooks/useDebounce'

const PAGE_SIZE = 50

export default function SIEM() {
  const [logs, setLogs]       = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const dSearch = useDebounce(search, 400)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getSiemEvents({ page, limit: PAGE_SIZE, q: dSearch })
      setLogs(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [page, dSearch])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [dSearch])

  return (
    <Layout title="Nhật ký (SIEM)">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><FileText size={20} /></div>
          <div>
            <h1>Nhật ký Sự kiện</h1>
            <p>Phân tích log tập trung từ các nguồn SIEM · {total} kết quả</p>
          </div>
        </div>
        <div className="act">
          <button className="b2"><Download size={15} /> Xuất CSV</button>
          <button className="b2" onClick={load} disabled={loading}><RefreshCw size={15} /> Làm mới</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="bar2">
          <div className="q-wrap" style={{ maxWidth: '100%' }}>
            <span className="q-icon"><Search size={16} /></span>
            <input className="q" style={{ maxWidth: '100%' }} placeholder="KQL Query: source:windows level:err..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonTable cols={6} rows={10} /></div>
        ) : logs.length === 0 ? (
          <EmptyState message="Không có log" />
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Host</th>
                    <th>Nguồn</th>
                    <th>Mức độ</th>
                    <th>Nội dung</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className="cl">
                      <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(l.occurred_at).toLocaleString()}</td>
                      <td style={{ fontWeight: 500 }}>{l.host || '—'}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{l.source}</td>
                      <td>
                        <span className={`tag ${l.level.toLowerCase() === 'error' ? 's-crit' : l.level.toLowerCase() === 'warn' ? 's-med' : ''}`} style={{ border: 'none', background: 'none' }}>
                          {l.level}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 16px' }}><Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} /></div>
          </>
        )}
      </div>
    </Layout>
  )
}
