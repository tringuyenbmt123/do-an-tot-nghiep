// ==============================================================
// src/pages/Firewall.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { Flame, RefreshCw } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import { getFwRules, getIdsEvents, getBlocklist } from '../api/firewall'

export default function Firewall() {
  const [tab, setTab] = useState('rules')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let res
      if (tab === 'rules') res = await getFwRules()
      else if (tab === 'ids') res = await getIdsEvents()
      else res = await getBlocklist()
      setData(res.data?.data || [])
    } catch (e) {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  return (
    <Layout title="Firewall & IDS">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><Flame size={20} /></div>
          <div>
            <h1>Firewall / IDS</h1>
            <p>Quản lý rule tường lửa, cảnh báo IDS và danh sách IP bị chặn</p>
          </div>
        </div>
        <div className="act">
          <button className="b2" onClick={load} disabled={loading}><RefreshCw size={15} /> Làm mới</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tabs" style={{ padding: '16px 16px 0' }}>
          <button className={`tab ${tab === 'rules' ? 'on' : ''}`} onClick={() => setTab('rules')}>Firewall Rules</button>
          <button className={`tab ${tab === 'ids' ? 'on' : ''}`} onClick={() => setTab('ids')}>IDS Events</button>
          <button className={`tab ${tab === 'blocklist' ? 'on' : ''}`} onClick={() => setTab('blocklist')}>IP Blocklist</button>
        </div>

        <div style={{ padding: '0' }}>
          {loading ? (
            <div style={{ padding: 16 }}><SkeletonTable cols={5} rows={5} /></div>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  {tab === 'rules' && (
                    <tr>
                      <th>ID/Tên</th><th>Hành động</th><th>Nguồn</th><th>Đích</th><th>Port</th><th>Lượt truy cập</th>
                    </tr>
                  )}
                  {tab === 'ids' && (
                    <tr>
                      <th>SID</th><th>Chữ ký</th><th>Mức độ</th><th>Số lần</th><th>Thời gian</th>
                    </tr>
                  )}
                  {tab === 'blocklist' && (
                    <tr>
                      <th>IP/CIDR</th><th>Lý do</th><th>Hết hạn</th><th>Thời gian tạo</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {data.map(item => (
                    <tr key={item.id} className="cl">
                      {tab === 'rules' && (
                        <>
                          <td style={{ fontWeight: 600 }}>{item.name}</td>
                          <td><span className={`tag ${item.action==='allow'?'s-low':'s-crit'}`}>{item.action}</span></td>
                          <td className="mono">{item.src}</td>
                          <td className="mono">{item.dst}</td>
                          <td className="mono">{item.port}</td>
                          <td>{item.hits}</td>
                        </>
                      )}
                      {tab === 'ids' && (
                        <>
                          <td className="mono">{item.sid}</td>
                          <td style={{ fontWeight: 600 }}>{item.signature}</td>
                          <td>{item.severity}</td>
                          <td>{item.count}</td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(item.created_at).toLocaleString()}</td>
                        </>
                      )}
                      {tab === 'blocklist' && (
                        <>
                          <td className="mono" style={{ fontWeight: 600 }}>{item.cidr}</td>
                          <td style={{ fontSize: 13 }}>{item.reason}</td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{item.expires_at ? new Date(item.expires_at).toLocaleString() : 'Vĩnh viễn'}</td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(item.created_at).toLocaleString()}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>Không có dữ liệu</td></tr>
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
