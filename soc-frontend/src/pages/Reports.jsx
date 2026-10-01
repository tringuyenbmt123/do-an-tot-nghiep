// ==============================================================
// src/pages/Reports.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { BarChart2, RefreshCw, Download } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import { getReports, getReportSchedules } from '../api/reports'

export default function Reports() {
  const [tab, setTab] = useState('list')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = tab === 'list' ? await getReports() : await getReportSchedules()
      setData(res.data?.data || [])
    } catch (e) {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  return (
    <Layout title="Báo cáo">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><BarChart2 size={20} /></div>
          <div>
            <h1>Báo cáo (Reports)</h1>
            <p>Quản lý và xuất báo cáo an ninh định kỳ</p>
          </div>
        </div>
        <div className="act">
          <button className="b2" onClick={load} disabled={loading}><RefreshCw size={15} /> Làm mới</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tabs" style={{ padding: '16px 16px 0' }}>
          <button className={`tab ${tab === 'list' ? 'on' : ''}`} onClick={() => setTab('list')}>Báo cáo đã tạo</button>
          <button className={`tab ${tab === 'schedules' ? 'on' : ''}`} onClick={() => setTab('schedules')}>Lịch trình tạo tự động</button>
        </div>

        <div>
          {loading ? (
            <div style={{ padding: 16 }}><SkeletonTable cols={5} rows={5} /></div>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  {tab === 'list' ? (
                    <tr><th>Loại báo cáo</th><th>Kỳ báo cáo</th><th>Định dạng</th><th>Ngày tạo</th><th>Hành động</th></tr>
                  ) : (
                    <tr><th>Tên lịch trình</th><th>Loại</th><th>Cron</th><th>Người nhận</th><th>Trạng thái</th></tr>
                  )}
                </thead>
                <tbody>
                  {data.map(item => (
                    <tr key={item.id} className="cl">
                      {tab === 'list' ? (
                        <>
                          <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{item.type}</td>
                          <td><span className="tag">{item.range}</span></td>
                          <td><span className="tag" style={{ textTransform: 'uppercase' }}>{item.format}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(item.created_at).toLocaleString()}</td>
                          <td><button className="lnk"><Download size={14} /> Tải về</button></td>
                        </>
                      ) : (
                        <>
                          <td style={{ fontWeight: 600 }}>{item.name}</td>
                          <td style={{ textTransform: 'capitalize' }}>{item.type}</td>
                          <td className="mono">{item.cron}</td>
                          <td style={{ fontSize: 13, color: 'var(--muted)' }}>{item.recipients || '—'}</td>
                          <td>{item.enabled ? <span className="tag s-low">Đang bật</span> : <span className="tag s-crit">Tắt</span>}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>Không có dữ liệu</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
