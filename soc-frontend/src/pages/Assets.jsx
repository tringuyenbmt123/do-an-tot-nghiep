// ==============================================================
// src/pages/Assets.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { Server, Search, RefreshCw, Plus } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import EmptyState from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import SeverityBadge from '../components/ui/SeverityBadge'
import { getAssets } from '../api/assets'
import { useDebounce } from '../hooks/useDebounce'

const PAGE_SIZE = 50

export default function Assets() {
  const [assets, setAssets]   = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const dSearch = useDebounce(search, 400)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAssets({ page, limit: PAGE_SIZE, q: dSearch })
      setAssets(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [page, dSearch])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [dSearch])

  return (
    <Layout title="Tài sản & Endpoint">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><Server size={20} /></div>
          <div>
            <h1>Quản lý Tài sản</h1>
            <p>Kiểm kê server, workstation và đánh giá rủi ro · {total} thiết bị</p>
          </div>
        </div>
        <div className="act">
          <button className="b1"><Plus size={15} /> Thêm tài sản</button>
          <button className="b2" onClick={load} disabled={loading}><RefreshCw size={15} /> Làm mới</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="bar2">
          <div className="q-wrap">
            <span className="q-icon"><Search size={16} /></span>
            <input className="q" placeholder="Tìm kiếm theo hostname, IP…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonTable cols={6} rows={10} /></div>
        ) : assets.length === 0 ? (
          <EmptyState message="Không có tài sản nào" />
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Hostname</th>
                    <th>IP</th>
                    <th>Loại</th>
                    <th>Hệ điều hành</th>
                    <th>Chủ sở hữu</th>
                    <th>Độ quan trọng</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map(a => (
                    <tr key={a.id} className="cl">
                      <td style={{ fontWeight: 600 }}>{a.hostname}</td>
                      <td className="mono">{a.ip || '—'}</td>
                      <td><span className="tag" style={{ textTransform: 'capitalize' }}>{a.type}</span></td>
                      <td style={{ fontSize: 13, color: 'var(--muted)' }}>{a.os || '—'}</td>
                      <td style={{ fontSize: 13 }}>{a.owner || '—'}</td>
                      <td><SeverityBadge value={a.criticality} /></td>
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
