// ==============================================================
// src/pages/Vulns.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { Bug, Search, RefreshCw } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import EmptyState from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import StatusBadge from '../components/ui/StatusBadge'
import { getVulns } from '../api/vulns'
import { useDebounce } from '../hooks/useDebounce'

const PAGE_SIZE = 50

export default function Vulns() {
  const [vulns, setVulns]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const dSearch = useDebounce(search, 400)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getVulns({ page, limit: PAGE_SIZE, q: dSearch })
      setVulns(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      setVulns([])
    } finally {
      setLoading(false)
    }
  }, [page, dSearch])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [dSearch])

  return (
    <Layout title="Quản lý Lỗ hổng">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><Bug size={20} /></div>
          <div>
            <h1>Lỗ hổng (Vulnerabilities)</h1>
            <p>Quản lý rủi ro và các bản vá bảo mật · {total} CVE</p>
          </div>
        </div>
        <div className="act">
          <button className="b2" onClick={load} disabled={loading}><RefreshCw size={15} /> Làm mới</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="bar2">
          <div className="q-wrap">
            <span className="q-icon"><Search size={16} /></span>
            <input className="q" placeholder="Tìm theo CVE…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonTable cols={6} rows={10} /></div>
        ) : vulns.length === 0 ? (
          <EmptyState message="Không có lỗ hổng nào" />
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>CVE</th>
                    <th>Mô tả</th>
                    <th>CVSS</th>
                    <th>Exploited</th>
                    <th>Hạn vá</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {vulns.map(v => (
                    <tr key={v.cve} className="cl">
                      <td style={{ fontWeight: 600 }}>{v.cve}</td>
                      <td style={{ fontSize: 13, maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.description}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 24, height: 24, borderRadius: 12, fontSize: 11, fontWeight: 700,
                          background: v.cvss >= 9.0 ? 'rgba(248,81,73,.15)' : v.cvss >= 7.0 ? 'rgba(210,153,34,.15)' : 'rgba(63,185,80,.15)',
                          color: v.cvss >= 9.0 ? 'var(--crit)' : v.cvss >= 7.0 ? 'var(--med)' : 'var(--low)'
                        }}>
                          {v.cvss}
                        </span>
                      </td>
                      <td>{v.exploited ? <span className="tag s-crit">Có</span> : <span className="tag">Không</span>}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{v.due_date || '—'}</td>
                      <td><StatusBadge value={v.status} /></td>
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
