// ==============================================================
// src/pages/Playbooks.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { TerminalSquare, RefreshCw, Play } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import { getPlaybooks, getPlaybookRuns } from '../api/playbooks'

export default function Playbooks() {
  const [tab, setTab] = useState('list')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = tab === 'list' ? await getPlaybooks() : await getPlaybookRuns()
      setData(res.data?.data || [])
    } catch (e) {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  return (
    <Layout title="Playbook SOAR">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><TerminalSquare size={20} /></div>
          <div>
            <h1>Playbook (SOAR)</h1>
            <p>Tự động hóa xử lý sự cố an ninh</p>
          </div>
        </div>
        <div className="act">
          <button className="b2" onClick={load} disabled={loading}><RefreshCw size={15} /> Làm mới</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tabs" style={{ padding: '16px 16px 0' }}>
          <button className={`tab ${tab === 'list' ? 'on' : ''}`} onClick={() => setTab('list')}>Danh sách Playbook</button>
          <button className={`tab ${tab === 'runs' ? 'on' : ''}`} onClick={() => setTab('runs')}>Lịch sử chạy</button>
        </div>

        <div>
          {loading ? (
            <div style={{ padding: 16 }}><SkeletonTable cols={4} rows={5} /></div>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  {tab === 'list' ? (
                    <tr><th>Tên Playbook</th><th>Trigger</th><th>Trạng thái</th><th>Hành động</th></tr>
                  ) : (
                    <tr><th>ID</th><th>Trạng thái</th><th>Thời gian bắt đầu</th><th>Thời gian kết thúc</th></tr>
                  )}
                </thead>
                <tbody>
                  {data.map(item => (
                    <tr key={item.id} className="cl">
                      {tab === 'list' ? (
                        <>
                          <td style={{ fontWeight: 600 }}>{item.name}</td>
                          <td><span className="tag">{item.trigger}</span></td>
                          <td>{item.enabled ? <span className="tag s-low">Kích hoạt</span> : <span className="tag s-crit">Tắt</span>}</td>
                          <td><button className="lnk"><Play size={14} /> Chạy thử</button></td>
                        </>
                      ) : (
                        <>
                          <td style={{ fontWeight: 600 }}>#{item.id}</td>
                          <td>
                            <span className={`stt ${item.status==='success'?'a':item.status==='failed'?'e':'b'}`}>
                              {item.status}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(item.started_at).toLocaleString()}</td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{item.completed_at ? new Date(item.completed_at).toLocaleString() : '—'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>Không có dữ liệu</td></tr>
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
