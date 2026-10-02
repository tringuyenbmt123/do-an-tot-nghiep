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
  const [logs, setLogs]           = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [exporting, setExporting] = useState(false)
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

  const exportCSV = async () => {
    setExporting(true)
    try {
      const res = await getSiemEvents({ page: 1, limit: 5000, q: dSearch })
      const rows = res.data?.data || []
      if (rows.length === 0) { alert('Không có dữ liệu để xuất.'); return }

      const esc = (val) => {
        if (val === null || val === undefined) return ''
        const str = String(val).replace(/"/g, '""')
        return (str.includes(',') || str.includes('"') || str.includes('\n')) ? `"${str}"` : str
      }

      const headers = ['ID','Thời gian','Host','Nguồn (Source)','Mức độ (Level)','Người dùng','IP','Nội dung (Message)']
      const csvRows = [
        headers.join(','),
        ...rows.map(l => [
          esc(l.id),
          esc(l.occurred_at ? new Date(l.occurred_at).toLocaleString('vi-VN') : ''),
          esc(l.host),
          esc(l.source),
          esc(l.level),
          esc(l.user),
          esc(l.ip),
          esc(l.message),
        ].join(','))
      ]

      const csvContent = '\uFEFF' + csvRows.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)

      const now = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
      const suffix = dSearch ? `_${dSearch.slice(0, 20).replace(/\s+/g, '_')}` : ''

      const a = document.createElement('a')
      a.href = url
      a.download = `siem_logs_${ts}${suffix}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Xuat CSV that bai: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  const levelBadge = (level = '') => {
    const l = level.toLowerCase()
    if (l === 'critical') return 's-crit'
    if (l === 'error') return 's-high'
    if (l === 'warn') return 's-med'
    return ''
  }

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
          <button className="b2" onClick={exportCSV} disabled={exporting || loading}>
            <Download size={15} style={exporting ? { animation: 'spin .7s linear infinite' } : {}} />
            {exporting ? 'Đang xuất…' : 'Xuất CSV'}
          </button>
          <button className="b2" onClick={load} disabled={loading}>
            <RefreshCw size={15} style={loading ? { animation: 'spin .7s linear infinite' } : {}} />
            Làm mới
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="bar2">
          <div className="q-wrap" style={{ maxWidth: '100%' }}>
            <span className="q-icon"><Search size={16} /></span>
            <input
              className="q"
              style={{ maxWidth: '100%' }}
              placeholder="Tìm kiếm theo host, nguồn, nội dung..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonTable cols={5} rows={10} /></div>
        ) : logs.length === 0 ? (
          <EmptyState
            message="Không có log"
            sub={dSearch ? `Không tìm thấy "${dSearch}"` : 'Chưa có sự kiện nào được ghi nhận'}
          />
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
                      <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {new Date(l.occurred_at).toLocaleString('vi-VN')}
                      </td>
                      <td style={{ fontWeight: 500 }}>{l.host || '-'}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{l.source}</td>
                      <td>
                        <span className={`sev ${levelBadge(l.level)}`} style={{ fontSize: 11 }}>
                          {l.level}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.message}
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
    </Layout>
  )
}
