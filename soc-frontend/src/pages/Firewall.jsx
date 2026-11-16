// ==============================================================
// src/pages/Firewall.jsx  — Quản lý Domain Sinkhole, IP Blocklist & pfSense SSH Console
// ==============================================================
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Flame, RefreshCw, Terminal, Globe, Shield, Send, Unlock, CheckCircle } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import Modal from '../components/ui/Modal'
import { getBlocklist, unblockIp, getBlockedDomains, unblockDomain, runSshCommand } from '../api/firewall'

// ---- SSH Console Component ----------------------------------------
function SshConsole() {
  const [history, setHistory] = useState([
    { type: 'info', text: '# pfSense SSH Console — 192.168.221.221' },
    { type: 'info', text: '# Gõ lệnh rồi nhấn Enter hoặc bấm nút Chạy' },
    { type: 'info', text: '# Ví dụ: pfctl -t SOAR_Phishing_BlockList -T show' },
    { type: 'info', text: '' },
  ])
  const [cmd, setCmd] = useState('')
  const [running, setRunning] = useState(false)
  const [cmdHistory, setCmdHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history])

  const QUICK_CMDS = [
    { label: 'Phishing IPs',    cmd: 'pfctl -t SOAR_Phishing_BlockList -T show' },
    { label: 'Attack IPs',      cmd: 'pfctl -t SOAR_BlockList -T show' },
    { label: 'Domain Sinkhole', cmd: 'cat /var/unbound/pfb_dnsbl_SOAR.conf' },
    { label: 'Tất cả Tables',   cmd: 'pfctl -s Tables' },
    { label: 'Uptime',          cmd: 'uptime' },
    { label: 'Restart Unbound', cmd: '/usr/local/sbin/pfSsh.php playback svc restart unbound' },
  ]

  const run = useCallback(async (command) => {
    const c = (command || cmd).trim()
    if (!c) return
    setRunning(true)
    setHistory(h => [...h, { type: 'cmd', text: `$ ${c}` }])
    setCmdHistory(h => [c, ...h.filter(x => x !== c)].slice(0, 50))
    setHistIdx(-1)
    setCmd('')
    try {
      const res = await runSshCommand(c)
      const out = res.data?.output || ''
      const err = res.data?.error  || ''
      const code = res.data?.exit_code
      if (out) setHistory(h => [...h, { type: 'out', text: out.trimEnd() }])
      if (err) setHistory(h => [...h, { type: 'err', text: err.trimEnd() }])
      setHistory(h => [...h, {
        type: code === 0 ? 'ok' : 'err',
        text: `[exit ${code}]`
      }])
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || 'Lỗi kết nối'
      setHistory(h => [...h, { type: 'err', text: `✗ ${msg}` }])
    } finally {
      setRunning(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [cmd])

  const onKey = (e) => {
    if (e.key === 'Enter') { run(); return }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = Math.min(histIdx + 1, cmdHistory.length - 1)
      setHistIdx(idx)
      setCmd(cmdHistory[idx] || '')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const idx = Math.max(histIdx - 1, -1)
      setHistIdx(idx)
      setCmd(idx === -1 ? '' : cmdHistory[idx])
    }
  }

  const colorClass = (type) => {
    if (type === 'cmd')  return '#7dd3fc'   // blue
    if (type === 'err')  return '#f87171'   // red
    if (type === 'ok')   return '#4ade80'   // green
    if (type === 'info') return '#94a3b8'   // muted
    return '#e2e8f0'                        // white
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Quick commands */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {QUICK_CMDS.map(q => (
          <button key={q.label} className="b2" style={{ fontSize: 12 }}
            onClick={() => run(q.cmd)} disabled={running}>
            {q.label}
          </button>
        ))}
        <button className="b2" style={{ fontSize: 12, marginLeft: 'auto', color: 'var(--muted)' }}
          onClick={() => setHistory([{ type: 'info', text: '# Màn hình đã xóa' }])}>
          Xóa màn hình
        </button>
      </div>

      {/* Terminal output */}
      <div style={{
        background: '#0f172a', borderRadius: 8, padding: '14px 16px',
        fontFamily: 'Consolas, monospace', fontSize: 13, lineHeight: 1.6,
        height: 400, overflowY: 'auto', border: '1px solid #1e293b'
      }}>
        {history.map((line, i) => (
          <div key={i} style={{ color: colorClass(line.type), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {line.text}
          </div>
        ))}
        {running && (
          <div style={{ color: '#facc15' }}>⏳ Đang chạy...</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{
          fontFamily: 'monospace', fontSize: 14, padding: '8px 10px',
          background: '#1e293b', borderRadius: 6, color: '#4ade80'
        }}>$</span>
        <input
          ref={inputRef}
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          onKeyDown={onKey}
          disabled={running}
          placeholder="Gõ lệnh pfSense... (↑↓ xem lịch sử)"
          style={{
            flex: 1, background: '#1e293b', border: '1px solid #334155',
            borderRadius: 6, padding: '8px 12px', color: '#e2e8f0',
            fontFamily: 'monospace', fontSize: 13, outline: 'none'
          }}
        />
        <button className="b1" onClick={() => run()} disabled={running || !cmd.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Send size={14} /> Chạy
        </button>
      </div>
    </div>
  )
}

// ---- Main Page ----------------------------------------------------
export default function Firewall() {
  const [tab, setTab]     = useState('domains')
  const [data, setData]   = useState([])
  const [loading, setLoading] = useState(true)

  // Modal gỡ chặn domain
  const [unblockModal, setUnblockModal] = useState({
    open: false,
    domain: '',
    password: '',
    reason: '',
    loading: false,
    error: '',
    successMsg: '',
  })

  // Modal gỡ chặn IP
  const [unblockIpState, setUnblockIpState] = useState({
    open: false,
    ip: '',
    table: '',
    password: '',
    reason: '',
    loading: false,
    error: '',
    successMsg: '',
  })

  const load = useCallback(async () => {
    if (tab === 'ssh') return
    setLoading(true)
    try {
      let res
      if      (tab === 'domains')   res = await getBlockedDomains()
      else if (tab === 'blocklist') res = await getBlocklist()
      setData(res.data?.data || [])
    } catch { setData([]) }
    finally  { setLoading(false) }
  }, [tab])

  useEffect(() => { load() }, [load])

  // --- Handlers Domain ---
  const openUnblockDomain = (domain) => {
    setUnblockModal({
      open: true,
      domain,
      password: '',
      reason: 'Đã xác minh an toàn / False Positive',
      loading: false,
      error: '',
      successMsg: '',
    })
  }

  const handleConfirmUnblockDomain = async () => {
    if (!unblockModal.password) {
      setUnblockModal(prev => ({ ...prev, error: 'Vui lòng nhập mật khẩu xác thực.' }))
      return
    }

    setUnblockModal(prev => ({ ...prev, loading: true, error: '', successMsg: '' }))
    try {
      const res = await unblockDomain(unblockModal.domain, unblockModal.password, unblockModal.reason)
      setUnblockModal(prev => ({
        ...prev,
        loading: false,
        successMsg: res.data?.message || `Đã gỡ chặn ${unblockModal.domain} thành công!`,
      }))
      setTimeout(() => {
        setUnblockModal(prev => ({ ...prev, open: false }))
        load()
      }, 1200)
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || 'Lỗi khi gỡ chặn domain'
      setUnblockModal(prev => ({ ...prev, loading: false, error: msg }))
    }
  }

  // --- Handlers IP ---
  const openUnblockIp = (ip, table) => {
    setUnblockIpState({
      open: true,
      ip,
      table: table || 'SOAR_Phishing_BlockList',
      password: '',
      reason: 'Gỡ chặn IP qua xác thực SOC Analyst',
      loading: false,
      error: '',
      successMsg: '',
    })
  }

  const handleConfirmUnblockIp = async () => {
    if (!unblockIpState.password) {
      setUnblockIpState(prev => ({ ...prev, error: 'Vui lòng nhập mật khẩu xác thực.' }))
      return
    }

    setUnblockIpState(prev => ({ ...prev, loading: true, error: '', successMsg: '' }))
    try {
      const res = await unblockIp(unblockIpState.ip, unblockIpState.table, unblockIpState.password, unblockIpState.reason)
      setUnblockIpState(prev => ({
        ...prev,
        loading: false,
        successMsg: res.data?.message || `Đã gỡ chặn IP ${unblockIpState.ip} thành công!`,
      }))
      setTimeout(() => {
        setUnblockIpState(prev => ({ ...prev, open: false }))
        load()
      }, 1200)
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || 'Lỗi khi gỡ chặn IP'
      setUnblockIpState(prev => ({ ...prev, loading: false, error: msg }))
    }
  }

  const TABS = [
    { key: 'domains',   label: 'Domain Sinkhole',  icon: <Globe size={14} /> },
    { key: 'blocklist', label: 'IP Blocklist',     icon: <Shield size={14} /> },
    { key: 'ssh',       label: 'pfSense Console',  icon: <Terminal size={14} /> },
  ]

  return (
    <Layout title="Firewall / Sinkhole">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><Flame size={20} /></div>
          <div>
            <h1>Firewall / Sinkhole</h1>
            <p>Quản lý Domain Phishing đã chặn (DNS Sinkhole), IP Blocklist và điều khiển pfSense qua SSH</p>
          </div>
        </div>
        <div className="act">
          {tab !== 'ssh' && (
            <button className="b2" onClick={load} disabled={loading}>
              <RefreshCw size={15} /> Làm mới
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {/* Tab bar */}
        <div className="tabs" style={{ padding: '16px 16px 0' }}>
          {TABS.map(t => (
            <button key={t.key}
              className={`tab ${tab === t.key ? 'on' : ''}`}
              onClick={() => setTab(t.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 16 }}>
          {/* SSH Console Tab */}
          {tab === 'ssh' && <SshConsole />}

          {/* Table Tabs */}
          {tab !== 'ssh' && (
            loading ? <SkeletonTable cols={5} rows={5} /> : (
              <div className="tw">
                <table>
                  <thead>
                    {tab === 'domains' && (
                      <tr>
                        <th>Domain bị chặn</th>
                        <th>Sinkhole IP</th>
                        <th>Cơ chế</th>
                        <th style={{ textAlign: 'right' }}>Thao tác</th>
                      </tr>
                    )}
                    {tab === 'blocklist' && (
                      <tr>
                        <th>IP / CIDR</th>
                        <th>Bảng pfSense</th>
                        <th>Phân loại</th>
                        <th>Cơ chế</th>
                        <th style={{ textAlign: 'right' }}>Thao tác</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {data.map((item, idx) => (
                      <tr key={item.id || item.domain || item.cidr || idx} className="cl">
                        {tab === 'domains' && (<>
                          <td className="mono" style={{ fontWeight: 600, color: '#f87171' }}>{item.domain}</td>
                          <td className="mono" style={{ color: 'var(--muted)' }}>{item.sinkhole_ip}</td>
                          <td><span className="tag s-crit">{item.source}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="b2"
                              style={{
                                color: '#f87171',
                                borderColor: 'rgba(248, 113, 113, 0.3)',
                                fontSize: 12,
                                padding: '4px 10px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                              onClick={() => openUnblockDomain(item.domain)}
                            >
                              <Unlock size={13} /> Gỡ chặn
                            </button>
                          </td>
                        </>)}

                        {tab === 'blocklist' && (<>
                          <td className="mono" style={{ fontWeight: 600, color: '#f87171' }}>{item.cidr}</td>
                          <td>
                            <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4, fontSize: 12, color: '#38bdf8' }}>
                              {item.table}
                            </code>
                          </td>
                          <td>
                            <span className={`tag ${item.table === 'SOAR_Phishing_BlockList' ? 's-crit' : 's-high'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{item.source}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="b2"
                              style={{
                                color: '#f87171',
                                borderColor: 'rgba(248, 113, 113, 0.3)',
                                fontSize: 12,
                                padding: '4px 10px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                              onClick={() => openUnblockIp(item.cidr, item.table)}
                            >
                              <Unlock size={13} /> Gỡ chặn
                            </button>
                          </td>
                        </>)}
                      </tr>
                    ))}
                    {data.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                        {tab === 'domains'
                          ? '📡 Chưa có domain nào bị chặn hoặc không kết nối được pfSense'
                          : '📡 Hiện tại không có IP nào bị chặn trong các bảng pfSense (SOAR_Phishing_BlockList / SOAR_BlockList)'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      {/* Modal Xác thực Gỡ chặn Domain */}
      <Modal
        open={unblockModal.open}
        onClose={() => !unblockModal.loading && setUnblockModal(prev => ({ ...prev, open: false }))}
        title="Xác thực Gỡ chặn Domain"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              className="b2"
              onClick={() => setUnblockModal(prev => ({ ...prev, open: false }))}
              disabled={unblockModal.loading}
            >
              Hủy
            </button>
            <button
              className="b1"
              style={{ background: '#ef4444', borderColor: '#ef4444' }}
              onClick={handleConfirmUnblockDomain}
              disabled={unblockModal.loading || !unblockModal.password}
            >
              {unblockModal.loading ? 'Đang gỡ trên pfSense...' : 'Xác nhận gỡ chặn'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 6,
            fontSize: 13,
            color: '#fca5a5',
            lineHeight: 1.5,
          }}>
            ⚠️ <strong>Cảnh báo an toàn:</strong> Bạn đang yêu cầu gỡ chặn domain{' '}
            <code style={{ background: '#000', padding: '2px 6px', borderRadius: 4, color: '#fff' }}>
              {unblockModal.domain}
            </code>{' '}
            khỏi DNS Sinkhole trên pfSense. Toàn bộ máy trạm trong mạng nội bộ sẽ truy cập lại được domain này.
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
              Mật khẩu tài khoản xác thực <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="password"
              placeholder="Nhập mật khẩu tài khoản đăng nhập..."
              value={unblockModal.password}
              onChange={e => setUnblockModal(prev => ({ ...prev, password: e.target.value, error: '' }))}
              onKeyDown={e => { if (e.key === 'Enter' && unblockModal.password) handleConfirmUnblockDomain() }}
              disabled={unblockModal.loading}
              style={{
                width: '100%',
                padding: '9px 12px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#fff',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
              Lý do gỡ chặn
            </label>
            <input
              type="text"
              placeholder="Ví dụ: False Positive, đã kiểm tra domain an toàn..."
              value={unblockModal.reason}
              onChange={e => setUnblockModal(prev => ({ ...prev, reason: e.target.value }))}
              disabled={unblockModal.loading}
              style={{
                width: '100%',
                padding: '9px 12px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#fff',
                outline: 'none',
              }}
            />
          </div>

          {unblockModal.error && (
            <div style={{
              color: '#f87171',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
            }}>
              ✗ {unblockModal.error}
            </div>
          )}

          {unblockModal.successMsg && (
            <div style={{
              color: '#4ade80',
              background: 'rgba(74, 222, 128, 0.1)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <CheckCircle size={15} /> {unblockModal.successMsg}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Xác thực Gỡ chặn IP */}
      <Modal
        open={unblockIpState.open}
        onClose={() => !unblockIpState.loading && setUnblockIpState(prev => ({ ...prev, open: false }))}
        title="Xác thực Gỡ chặn IP Firewall"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              className="b2"
              onClick={() => setUnblockIpState(prev => ({ ...prev, open: false }))}
              disabled={unblockIpState.loading}
            >
              Hủy
            </button>
            <button
              className="b1"
              style={{ background: '#ef4444', borderColor: '#ef4444' }}
              onClick={handleConfirmUnblockIp}
              disabled={unblockIpState.loading || !unblockIpState.password}
            >
              {unblockIpState.loading ? 'Đang xóa IP trên pfSense...' : 'Xác nhận gỡ chặn'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 6,
            fontSize: 13,
            color: '#fca5a5',
            lineHeight: 1.5,
          }}>
            ⚠️ <strong>Cảnh báo an toàn:</strong> Bạn đang yêu cầu xóa IP{' '}
            <code style={{ background: '#000', padding: '2px 6px', borderRadius: 4, color: '#fff' }}>
              {unblockIpState.ip}
            </code>{' '}
            khỏi bảng pfSense <code style={{ color: '#38bdf8' }}>{unblockIpState.table}</code>. Lưu lượng từ/đến IP này sẽ không còn bị tường lửa drop.
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
              Mật khẩu tài khoản xác thực <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="password"
              placeholder="Nhập mật khẩu tài khoản đăng nhập..."
              value={unblockIpState.password}
              onChange={e => setUnblockIpState(prev => ({ ...prev, password: e.target.value, error: '' }))}
              onKeyDown={e => { if (e.key === 'Enter' && unblockIpState.password) handleConfirmUnblockIp() }}
              disabled={unblockIpState.loading}
              style={{
                width: '100%',
                padding: '9px 12px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#fff',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
              Lý do gỡ chặn
            </label>
            <input
              type="text"
              placeholder="Ví dụ: IP phân giải đã sạch, kết thúc điều tra..."
              value={unblockIpState.reason}
              onChange={e => setUnblockIpState(prev => ({ ...prev, reason: e.target.value }))}
              disabled={unblockIpState.loading}
              style={{
                width: '100%',
                padding: '9px 12px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#fff',
                outline: 'none',
              }}
            />
          </div>

          {unblockIpState.error && (
            <div style={{
              color: '#f87171',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
            }}>
              ✗ {unblockIpState.error}
            </div>
          )}

          {unblockIpState.successMsg && (
            <div style={{
              color: '#4ade80',
              background: 'rgba(74, 222, 128, 0.1)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <CheckCircle size={15} /> {unblockIpState.successMsg}
            </div>
          )}
        </div>
      </Modal>
    </Layout>
  )
}
