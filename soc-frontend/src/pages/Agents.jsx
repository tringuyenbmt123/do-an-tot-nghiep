// ==============================================================
// src/pages/Agents.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { Activity, Search, RefreshCw, Skull, Ban, Globe, HardDrive, Wifi } from 'lucide-react'
import Layout from '../components/layout/Layout'
import StatusBadge from '../components/ui/StatusBadge'
import SkeletonTable from '../components/ui/SkeletonTable'
import EmptyState from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import Modal from '../components/ui/Modal'
import { getAgents, killProcess, blockIP, blockURL, quarantineFile, isolateNetwork } from '../api/agents'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

const PAGE_SIZE = 50

const ago = (ts) => {
  if (!ts) return '—'
  const sec = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (sec < 60) return `${sec}s trước`
  if (sec < 3600) return `${Math.floor(sec/60)}p trước`
  if (sec < 86400) return `${Math.floor(sec/3600)}h trước`
  return new Date(ts).toLocaleDateString('vi-VN')
}

export default function Agents() {
  const [agents, setAgents]       = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('')
  const [cmdModal, setCmdModal]   = useState(null) // { agent, type }
  const [cmdArg, setCmdArg]       = useState('')
  const [cmdLoading, setCmdLoading] = useState(false)
  const dSearch = useDebounce(search, 400)
  const toast = useToast()
  const { isAdmin, isAnalyst } = useAuth()

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const params = { page, limit: PAGE_SIZE }
      if (statusFilter) params.status = statusFilter
      const res = await getAgents(params)
      setAgents(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => { load() }, [load])

  const filtered = dSearch
    ? agents.filter(a =>
        (a.hostname || '').toLowerCase().includes(dSearch.toLowerCase()) ||
        (a.ip_address || a.ip || '').includes(dSearch) ||
        (a.id || a.agent_id || '').toLowerCase().includes(dSearch.toLowerCase())
      )
    : agents

  const openCmd = (agent, type) => {
    if (!isAnalyst) { toast.warn('Bạn không có quyền thực hiện thao tác này'); return }
    setCmdModal({ agent, type })
    setCmdArg('')
  }

  const CMDS = {
    kill_pid:  { label: 'Kill Process (PID)', placeholder: 'Nhập PID (số nguyên dương)', icon: Skull, danger: true },
    block_ip:  { label: 'Block IP', placeholder: 'Nhập địa chỉ IP hoặc CIDR', icon: Ban, danger: true },
    block_url: { label: 'Block URL', placeholder: 'Nhập URL cần chặn', icon: Globe, danger: false },
    quarantine:{ label: 'Quarantine File', placeholder: 'Nhập đường dẫn file', icon: HardDrive, danger: true },
    isolate:   { label: 'Cách ly mạng', placeholder: 'Lý do cách ly (tùy chọn)', icon: Wifi, danger: true },
  }

  const executeCmd = async () => {
    if (!cmdModal) return
    const { agent, type } = cmdModal
    const agentId = agent.id || agent.agent_id
    const cmd = CMDS[type]

    if (type !== 'isolate' && !cmdArg.trim()) {
      toast.warn(`Vui lòng nhập ${cmd.placeholder.split('(')[0].trim().toLowerCase()}`)
      return
    }

    const confirmMsg = `⚠ CẢNH BÁO: Thao tác "${cmd.label}" trên agent "${agent.hostname}" không thể hoàn tác!\n\nXác nhận thực hiện?`
    if (!window.confirm(confirmMsg)) return

    setCmdLoading(true)
    try {
      let res
      if (type === 'kill_pid') {
        const pid = parseInt(cmdArg.trim())
        if (isNaN(pid) || pid <= 0) { toast.error('PID phải là số nguyên dương'); setCmdLoading(false); return }
        res = await killProcess(agentId, pid)
      } else if (type === 'block_ip') {
        res = await blockIP(agentId, cmdArg.trim())
      } else if (type === 'block_url') {
        res = await blockURL(agentId, cmdArg.trim())
      } else if (type === 'quarantine') {
        res = await quarantineFile(agentId, cmdArg.trim())
      } else if (type === 'isolate') {
        res = await isolateNetwork(agentId, cmdArg.trim())
      }
      toast.success(res?.data?.message || `Đã gửi lệnh ${cmd.label} thành công`)
      setCmdModal(null)
      setCmdArg('')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCmdLoading(false)
    }
  }

  return (
    <Layout title="Agents & EDR">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><Activity size={20} /></div>
          <div>
            <h1>Agents & EDR</h1>
            <p>Kiểm soát endpoint, Active Response · {total} agents</p>
          </div>
        </div>
        <div className="act">
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
              placeholder="Tìm theo hostname, IP, Agent ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="tools">
            {['', 'online', 'offline'].map(v => (
              <button
                key={v}
                className={`chip${statusFilter === v ? ' on' : ''}`}
                onClick={() => setStatus(v)}
              >
                {v === '' ? 'Tất cả' : v === 'online' ? '🟢 Online' : '🔴 Offline'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 16 }}>
            <SkeletonTable cols={7} rows={10} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState message="Không có agent nào" sub="Cài đặt agent để bắt đầu giám sát endpoint" />
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Hostname</th>
                    <th>IP</th>
                    <th>OS</th>
                    <th>Phiên bản</th>
                    <th>Trạng thái</th>
                    <th>Heartbeat</th>
                    <th>Active Response</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => {
                    const id = a.id || a.agent_id
                    const isOnline = a.status === 'online' || a.is_online
                    return (
                      <tr key={id}>
                        <td style={{ fontWeight: 600 }}>{a.hostname}</td>
                        <td className="mono">{a.ip_address || a.ip || '—'}</td>
                        <td style={{ fontSize: 12 }}>{a.os || '—'}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{a.version || '—'}</td>
                        <td><StatusBadge value={isOnline ? 'online' : 'offline'} /></td>
                        <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {ago(a.last_heartbeat)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {isAnalyst && (
                              <>
                                <button
                                  className="lnk"
                                  title="Kill Process"
                                  onClick={() => openCmd(a, 'kill_pid')}
                                  aria-label={`Kill process trên ${a.hostname}`}
                                >
                                  <Skull size={12} />
                                </button>
                                <button
                                  className="lnk d"
                                  title="Block IP"
                                  onClick={() => openCmd(a, 'block_ip')}
                                  aria-label={`Block IP trên ${a.hostname}`}
                                >
                                  <Ban size={12} />
                                </button>
                                <button
                                  className="lnk"
                                  title="Block URL"
                                  onClick={() => openCmd(a, 'block_url')}
                                  aria-label={`Block URL trên ${a.hostname}`}
                                >
                                  <Globe size={12} />
                                </button>
                                {isAdmin && (
                                  <button
                                    className="lnk d"
                                    title="Cách ly mạng"
                                    onClick={() => openCmd(a, 'isolate')}
                                    aria-label={`Cách ly mạng agent ${a.hostname}`}
                                  >
                                    <Wifi size={12} />
                                  </button>
                                )}
                              </>
                            )}
                            {!isAnalyst && <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}
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

      {/* Active Response Modal */}
      <Modal
        open={!!cmdModal}
        onClose={() => { setCmdModal(null); setCmdArg('') }}
        title={cmdModal ? `${CMDS[cmdModal.type]?.label} – ${cmdModal.agent?.hostname}` : ''}
        footer={
          <>
            <button className="b2" onClick={() => { setCmdModal(null); setCmdArg('') }}>Hủy</button>
            <button
              className={`b1${CMDS[cmdModal?.type]?.danger ? ' danger' : ''}`}
              onClick={executeCmd}
              disabled={cmdLoading}
            >
              {cmdLoading ? 'Đang gửi…' : 'Thực thi'}
            </button>
          </>
        }
      >
        {cmdModal && (
          <div>
            <div style={{ background: 'rgba(248,81,73,.1)', border: '1px solid rgba(248,81,73,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--crit)' }}>
              ⚠ Thao tác này sẽ được thực thi ngay lập tức trên agent và không thể hoàn tác.
            </div>
            <div className="form-group">
              <label>{CMDS[cmdModal.type]?.placeholder}</label>
              <input
                className="soc-input"
                placeholder={CMDS[cmdModal.type]?.placeholder}
                value={cmdArg}
                onChange={e => setCmdArg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') executeCmd() }}
                autoFocus
              />
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  )
}
