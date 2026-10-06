// ==============================================================
// src/pages/SOCDeploy.jsx
// SOC Agent Deployment Wizard Page (6 Steps)
// Provides: Direct CLI commands & Config/Script file downloads
// ==============================================================
import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Download, ArrowLeft, Check, Copy, Box } from 'lucide-react'
import Layout from '../components/layout/Layout'
import { useToast } from '../contexts/ToastContext'
import { INITIAL_AGENTS } from '../api/wazuh'

const reSrv = v =>
  /^((\d{1,3}\.){3}\d{1,3}|([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63})(:\d{1,5})?$/.test(v) &&
  (!/^[\d.]+$/.test(v.split(':')[0]) || v.split(':')[0].split('.').every(o => +o <= 255))

const reNm = v => /^[A-Za-z0-9._-]{2,128}$/.test(v)

const existingNames = INITIAL_AGENTS.map(a => a.name)

function downloadFile(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

export default function WazuhDeploy() {
  const [pyOs, setPyOs] = useState('windows') // 'windows' | 'linux'
  const [serverAddr, setServerAddr] = useState('192.168.1.194')
  const [agentName, setAgentName] = useState('yairo01')
  const [agentSecret, setAgentSecret] = useState('soc-agent-secret-token-2026')
  const [rememberAddr, setRememberAddr] = useState(true)
  const [touchedServer, setTouchedServer] = useState(false)
  const toast = useToast()

  const isServerValid = reSrv(serverAddr.trim())
  const isNameValid = !agentName.trim() || (reNm(agentName.trim()) && !existingNames.includes(agentName.trim()))
  const isReady = Boolean(pyOs && isServerValid && isNameValid)

  // Formatting server URL depending on agent type
  const targetServerUrl = useMemo(() => {
    const raw = serverAddr.trim()
    if (!raw) return ''
    return raw.includes(':') ? raw : `${raw}:50051`
  }, [serverAddr])

  // Generated Commands & Files
  const generated = useMemo(() => {
    if (!isReady) return { install: '', start: '', configJson: '', scriptFile: '', scriptFileName: '' }

    const srv = targetServerUrl
    const nm = agentName.trim() || 'endpoint-agent-01'
    const secret = agentSecret.trim() || 'soc-agent-secret-token-2026'

    const isWin = pyOs === 'windows'
    const installCmd = isWin
      ? `# [Cách 1] Cài đặt siêu tốc qua Internet (Khuyên dùng):\nirm https://raw.githubusercontent.com/tringuyenbmt123/do-an-tot-nghiep/main/soc-agent-python/install-agent.ps1 | iex\n\n# [Cách 2] Cài đặt thủ công từ Source code:\ncd soc-agent-python\npip install -r requirements.txt`
      : `# [Cách 1] Cài đặt siêu tốc qua Internet (Khuyên dùng):\ncurl -sSL https://raw.githubusercontent.com/tringuyenbmt123/do-an-tot-nghiep/main/soc-agent-python/install-agent.sh | sudo bash\n\n# [Cách 2] Cài đặt thủ công từ Source code:\ncd soc-agent-python\npip3 install -r requirements.txt`

    const startCmd = isWin
      ? `# Nếu dùng [Cách 1], Agent đã tự chạy ngầm.\n# Nếu dùng [Cách 2], khởi chạy lệnh sau:\npython main.py -server ${srv} -agent-id ${nm} -secret ${secret}`
      : `# Nếu dùng [Cách 1], Agent đã tự chạy ngầm.\n# Nếu dùng [Cách 2], khởi chạy lệnh sau:\npython3 main.py -server ${srv} -agent-id ${nm} -secret ${secret}`

    const configJsonObj = {
      server_url: srv,
      protocol: 'grpc',
      agent_id: nm,
      agent_secret_key: secret,
      heartbeat_interval_seconds: 5,
      metric_interval_seconds: 1,
      max_backoff_seconds: 30,
      buffer_size: 1000,
      log_paths: ['test_logs/app.log'],
      fim_enabled: true,
      fim_paths: isWin ? ['C:\\\\Users\\\\Public\\\\SOC-Test'] : ['/tmp/soc-test'],
      metrics_enabled: true,
      log_tailer_enabled: true,
      process_monitor_enabled: true,
      network_monitor_enabled: true,
    }

    const configJsonStr = JSON.stringify(configJsonObj, null, 2)
    const scriptFileName = isWin ? 'run_agent.ps1' : 'run_agent.sh'
    const scriptFile = isWin
      ? `# Script tự động cài đặt & khởi chạy SOC Agent\n$ErrorActionPreference = "Stop"\nWrite-Host ">>> Cài đặt dependencies..." -ForegroundColor Cyan\npip install -r requirements.txt\nWrite-Host ">>> Khởi chạy SOC Agent [Server: ${srv}, AgentID: ${nm}]..." -ForegroundColor Green\n$env:SERVER_URL="${srv}"\n$env:AGENT_ID="${nm}"\n$env:AGENT_SECRET_KEY="${secret}"\npython main.py -server "${srv}" -agent-id "${nm}" -secret "${secret}"\n`
      : `#!/bin/bash\nset -e\necho ">>> Cài đặt dependencies..."\npip3 install -r requirements.txt\necho ">>> Khởi chạy SOC Agent [Server: ${srv}, AgentID: ${nm}]..."\nexport SERVER_URL="${srv}"\nexport AGENT_ID="${nm}"\nexport AGENT_SECRET_KEY="${secret}"\npython3 main.py -server "${srv}" -agent-id "${nm}" -secret "${secret}"\n`

    return { install: installCmd, start: startCmd, configJson: configJsonStr, scriptFile, scriptFileName }
  }, [pyOs, targetServerUrl, agentName, agentSecret, isReady])

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Đã sao chép ${label}`)
    } catch {
      toast.error('Không sao chép được, hãy chọn và copy thủ công')
    }
  }

  return (
    <Layout title="Triển khai agent mới – SOC Console">
      {/* Breadcrumb */}
      <div className="crumb" style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 6, marginBottom: 8 }}>
        <Link to="/wazuh/overview" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Wazuh</Link>
        <span>›</span>
        <Link to="/wazuh/endpoints" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Endpoints</Link>
        <span>›</span>
        <b>Triển khai agent mới</b>
      </div>

      {/* Page Header */}
      <div className="ph" style={{ marginBottom: 16 }}>
        <div className="ph-left">
          <div className="ic" style={{ background: '#e3f6ec', color: 'var(--ok)' }}>
            <Download size={22} />
          </div>
          <div>
            <h1>Triển khai agent mới</h1>
            <p>Chọn hệ điều hành, cấu hình thông số và nhận ngay câu lệnh hoặc file khởi chạy</p>
          </div>
        </div>
        <div className="act">
          <Link to="/wazuh/endpoints" className="b2" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <ArrowLeft size={16} /> Quay lại danh sách
          </Link>
        </div>
      </div>

      {/* Agent Type Header */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Box size={20} color="var(--accent)" />
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
          Triển khai SOC Agent
        </span>
      </div>

      {/* Wizard Steps */}
      <div className="card">
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {/* Step 1 */}
          <li style={{ position: 'relative', paddingLeft: 48, paddingBottom: 24, borderLeft: '2px solid var(--line)', marginLeft: 16 }}>
            <span
              style={{
                position: 'absolute',
                left: -17,
                top: 0,
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: pyOs ? 'var(--ok)' : 'var(--accent)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              <Check size={18} strokeWidth={3} />
            </span>
            <h3 style={{ fontSize: 17, marginBottom: 8, marginTop: 4 }}>
              1. Chọn hệ điều hành cho SOC Agent
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <fieldset style={{ border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '10px 14px' }}>
                <legend style={{ fontWeight: 600, padding: '0 6px', fontSize: 14 }}>HỆ ĐIỀU HÀNH MỤC TIÊU</legend>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer', margin: 0 }}>
                    <input type="radio" name="pyos" value="windows" checked={pyOs === 'windows'} onChange={e => setPyOs(e.target.value)} />
                    Windows (PowerShell)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer', margin: 0 }}>
                    <input type="radio" name="pyos" value="linux" checked={pyOs === 'linux'} onChange={e => setPyOs(e.target.value)} />
                    Linux / macOS (Bash)
                  </label>
                </div>
              </fieldset>
            </div>
          </li>

          {/* Step 2 */}
          <li style={{ position: 'relative', paddingLeft: 48, paddingBottom: 24, borderLeft: '2px solid var(--line)', marginLeft: 16 }}>
            <span
              style={{
                position: 'absolute',
                left: -17,
                top: 0,
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: isServerValid ? 'var(--ok)' : 'var(--accent)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {isServerValid ? <Check size={18} strokeWidth={3} /> : '2'}
            </span>
            <h3 style={{ fontSize: 17, marginBottom: 4, marginTop: 4 }}>
              2. Địa chỉ gRPC Server
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>
              Nhập IP hoặc FQDN của SOC Server (gRPC port 50051).
            </p>
            <label style={{ display: 'block', maxWidth: 420 }}>
              <input
                className="soc-input"
                placeholder="VD: 192.168.1.194:50051 hoặc 192.168.1.194"
                value={serverAddr}
                onChange={e => {
                  setTouchedServer(true)
                  setServerAddr(e.target.value)
                }}
                style={{ width: '100%' }}
              />
            </label>
            {touchedServer && !isServerValid && (
              <div style={{ color: 'var(--crit)', fontSize: 13, marginTop: 4 }}>
                Địa chỉ không hợp lệ. Nhập IP (VD 192.168.1.194) hoặc FQDN.
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 14, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={rememberAddr}
                onChange={e => setRememberAddr(e.target.checked)}
              />
              Ghi nhớ địa chỉ server trong phiên này
            </label>
          </li>

          {/* Step 3 */}
          <li style={{ position: 'relative', paddingLeft: 48, paddingBottom: 24, borderLeft: '2px solid var(--line)', marginLeft: 16 }}>
            <span
              style={{
                position: 'absolute',
                left: -17,
                top: 0,
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: isNameValid ? 'var(--ok)' : 'var(--accent)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {isNameValid ? <Check size={18} strokeWidth={3} /> : '3'}
            </span>
            <h3 style={{ fontSize: 17, marginBottom: 4, marginTop: 4 }}>3. Tùy chọn thông số Agent</h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>
              Đặt Agent ID / Tên định danh và mã Secret Token xác thực.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, maxWidth: 460 }}>
              <label>
                Tên / Agent ID
                <input
                  className="soc-input"
                  placeholder="VD: yairo01"
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </label>

              <label>
                Agent Secret Token
                <input
                  className="soc-input"
                  placeholder="VD: soc-agent-secret-token-2026"
                  value={agentSecret}
                  onChange={e => setAgentSecret(e.target.value)}
                  style={{ width: '100%' }}
                />
              </label>
            </div>

            {agentName.trim() && !isNameValid && (
              <div style={{ color: 'var(--crit)', fontSize: 13, marginTop: 4 }}>
                {!reNm(agentName.trim())
                  ? 'Tên chỉ gồm chữ, số, dấu chấm, gạch dưới, gạch ngang (2–128 ký tự).'
                  : 'Tên agent này đã tồn tại, hãy chọn tên khác.'}
              </div>
            )}
          </li>

          {/* Step 4 */}
          <li style={{ position: 'relative', paddingLeft: 48, paddingBottom: 24, borderLeft: '2px solid var(--line)', marginLeft: 16 }}>
            <span
              style={{
                position: 'absolute',
                left: -17,
                top: 0,
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: isReady ? 'var(--ok)' : 'var(--accent)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {isReady ? <Check size={18} strokeWidth={3} /> : '4'}
            </span>
            <h3 style={{ fontSize: 17, marginBottom: 8, marginTop: 4 }}>
              4. Lệnh cài đặt / Chuẩn bị môi trường Agent
            </h3>
            {isReady ? (
              <div
                style={{
                  position: 'relative',
                  background: '#14202e',
                  color: '#d6e1ee',
                  borderRadius: 'var(--r)',
                  padding: '12px 90px 12px 14px',
                  fontFamily: 'var(--mono)',
                  fontSize: 14,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                <button
                  className="b2"
                  onClick={() => copyToClipboard(generated.install, 'Lệnh cài đặt')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: 8,
                    background: '#22344a',
                    color: '#d6e1ee',
                    borderColor: '#35506f',
                    fontSize: 12,
                    padding: '4px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Copy size={13} /> Sao chép
                </button>
                {generated.install}
              </div>
            ) : (
              <div style={{ background: '#fff6e0', color: '#7a5600', borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 14 }}>
                Vui lòng điền thông tin server và tên agent hợp lệ.
              </div>
            )}
          </li>

          {/* Step 5 */}
          <li style={{ position: 'relative', paddingLeft: 48, paddingBottom: 24, borderLeft: '2px solid var(--line)', marginLeft: 16 }}>
            <span
              style={{
                position: 'absolute',
                left: -17,
                top: 0,
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: isReady ? 'var(--ok)' : 'var(--accent)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {isReady ? <Check size={18} strokeWidth={3} /> : '5'}
            </span>
            <h3 style={{ fontSize: 17, marginBottom: 8, marginTop: 4 }}>
              5. Lệnh thực thi / Khởi động Agent & Tải File cấu hình
            </h3>
            {isReady ? (
              <div>
                <div
                  style={{
                    position: 'relative',
                    background: '#14202e',
                    color: '#d6e1ee',
                    borderRadius: 'var(--r)',
                    padding: '12px 90px 12px 14px',
                    fontFamily: 'var(--mono)',
                    fontSize: 14,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    marginBottom: 12,
                  }}
                >
                  <button
                    className="b2"
                    onClick={() => copyToClipboard(generated.start, 'Lệnh khởi động')}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: 8,
                      background: '#22344a',
                      color: '#d6e1ee',
                      borderColor: '#35506f',
                      fontSize: 12,
                      padding: '4px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Copy size={13} /> Sao chép
                  </button>
                  {generated.start}
                </div>

                {/* File Downloads Options */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {generated.configJson && (
                    <button
                      className="b2"
                      onClick={() => {
                        downloadFile('config.json', generated.configJson, 'application/json;charset=utf-8')
                        toast.success('Đã tải file config.json')
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                    >
                      <Download size={14} /> Tải file `config.json`
                    </button>
                  )}

                  {generated.scriptFile && (
                    <button
                      className="b2"
                      onClick={() => {
                        downloadFile(generated.scriptFileName, generated.scriptFile, 'text/plain;charset=utf-8')
                        toast.success(`Đã tải script ${generated.scriptFileName}`)
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                    >
                      <Download size={14} /> Tải script cài đặt tự động (`{generated.scriptFileName}`)
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ background: '#fff6e0', color: '#7a5600', borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 14 }}>
                Vui lòng hoàn thành các thông số ở trên.
              </div>
            )}
          </li>

          {/* Step 6 */}
          <li style={{ position: 'relative', paddingLeft: 48, marginLeft: 16 }}>
            <span
              style={{
                position: 'absolute',
                left: -17,
                top: 0,
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              6
            </span>
            <h3 style={{ fontSize: 17, marginBottom: 8, marginTop: 4 }}>6. Quay lại danh sách endpoint để kiểm tra kết nối</h3>
            <Link to="/wazuh/endpoints" className="b1" style={{ display: 'inline-block', textDecoration: 'none' }}>
              Về danh sách agent
            </Link>
          </li>
        </ol>
      </div>
    </Layout>
  )
}
