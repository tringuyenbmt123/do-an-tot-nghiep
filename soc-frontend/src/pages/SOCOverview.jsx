// ==============================================================
// src/pages/SOCOverview.jsx
// SOC Console – Tổng quan Agent và cảnh báo (real data từ MySQL)
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Flag, RefreshCw, Shield, ArrowRight, ExternalLink } from 'lucide-react'
import Layout from '../components/layout/Layout'
import { useToast } from '../contexts/ToastContext'
import { getSOCOverviewStats } from '../api/soc'

const SEV_NAMES = { crit: 'Nghiêm trọng', high: 'Cao', med: 'Trung bình', low: 'Thấp' }
const SEV_LEVELS = {
  crit: 'Rule level 15 trở lên',
  high: 'Rule level 12 – 14',
  med: 'Rule level 7 – 11',
  low: 'Rule level 0 – 6',
}
const SEV_COLORS = {
  crit: 'var(--crit)',
  high: 'var(--high)',
  med: 'var(--med)',
  low: 'var(--low)',
}

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'var(--ok)' },
  disconnected: { label: 'Disconnected', color: 'var(--crit)' },
  pending: { label: 'Pending', color: 'var(--med)' },
  never_connected: { label: 'Never Connected', color: '#7b8794' },
}

const MODULE_GROUPS = [
  {
    title: 'Endpoint Security & EDR',
    modules: [
      { name: 'Malware & Anomaly Detection', desc: 'Kiểm tra dấu hiệu xâm nhập do mã độc hoặc tiến trình bất thường gây ra.', path: '/alerts', badge: 'MD' },
      { name: 'File Integrity Monitoring', desc: 'Cảnh báo thay đổi tệp: quyền, nội dung, thuộc tính theo quy tắc FIM.', path: '/rules', badge: 'FIM' },
      { name: 'Active Response & Isolation', desc: 'Thực thi phản ứng: Kill Process, Chặn IP, Cô lập mạng Endpoint.', path: '/agents', badge: 'AR' },
    ],
  },
  {
    title: 'Threat Intelligence & SIEM',
    modules: [
      { name: 'Threat Hunting (SIEM)', desc: 'Duyệt và truy vấn nhật ký sự kiện Event Logs từ Agent gửi về trung tâm.', path: '/siem', badge: 'TH' },
      { name: 'Vulnerability Detection', desc: 'Phát hiện và thống kê các lỗ hổng bảo mật CVE trên hệ thống.', path: '/vulns', badge: 'VD' },
      { name: 'MITRE ATT&CK Matrix', desc: 'Khám phá và trực quan hóa cảnh báo theo chiến thuật và kỹ thuật tấn công.', path: '/mitre', badge: 'MA' },
    ],
  },
  {
    title: 'Security Operations & SOAR',
    modules: [
      { name: 'Incident & Case Management', desc: 'Quản lý vụ việc, điều tra chi tiết và theo dõi tiến độ xử lý sự cố an ninh.', path: '/cases', badge: 'CM' },
      { name: 'SOAR Playbooks', desc: 'Kịch bản tự động hóa phản ứng sự cố tích hợp qua n8n webhook workflow.', path: '/playbooks', badge: 'PB' },
      { name: 'SOAR Pipeline & Auditing', desc: 'Cấu hình pipeline webhook SOAR và kiểm toán nhật ký vận hành hệ thống.', path: '/audit-settings', badge: 'SO' },
    ],
  },
]

function renderDonut(items) {
  const tot = items.reduce((a, x) => a + x.value, 0)
  let offset = 25
  let circles = (
    <circle
      cx="21"
      cy="21"
      r="15.9"
      fill="none"
      style={{ stroke: 'var(--panel2)' }}
      strokeWidth="5"
    />
  )

  const paths = items.map((x, idx) => {
    if (!x.value || tot === 0) return null
    const p = (x.value / tot) * 100
    const el = (
      <circle
        key={idx}
        cx="21"
        cy="21"
        r="15.9"
        fill="none"
        stroke={x.color}
        strokeWidth="5"
        strokeDasharray={`${p} ${100 - p}`}
        strokeDashoffset={offset}
      />
    )
    offset -= p
    return el
  })

  return (
    <svg className="dn" viewBox="0 0 42 42" role="img" aria-label="Agent theo trạng thái" style={{ width: 140, height: 140, flex: 'none' }}>
      {circles}
      {paths}
      <text x="21" y="22.8" textAnchor="middle" style={{ fill: 'var(--text)' }} fontSize="7" fontWeight="600">
        {tot}
      </text>
    </svg>
  )
}

export default function SOCOverview() {
  const [stats, setStats] = useState({
    agents: { active: 0, disconnected: 0, pending: 0, never_connected: 0 },
    alerts: { crit: 0, high: 0, med: 0, low: 0 },
  })
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const toast = useToast()
  const navigate = useNavigate()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getSOCOverviewStats()
      if (data) {
        setStats({
          agents: data.agents_summary || stats.agents,
          alerts: data.alerts_summary || stats.alerts,
        })
      }
      setLastUpdated(new Date())
    } catch {
      toast.error('Không thể cập nhật thống kê')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const agentItems = Object.keys(STATUS_CONFIG)
    .map(key => ({
      key,
      label: STATUS_CONFIG[key].label,
      value: stats.agents[key] || 0,
      color: STATUS_CONFIG[key].color,
    }))
    .filter(x => x.value > 0)

  const handleModuleClick = (m) => {
    if (m.path) {
      navigate(m.path)
    } else {
      toast.info(`Module "${m.name}" chưa có trang template.`)
    }
  }

  const handleRefresh = () => {
    loadData()
    toast.success('Đã làm mới tổng quan SOC Console')
  }

  const fmtTime = (d) => {
    const pad = n => String(n).padStart(2, '0')
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <Layout title="SOC Console · Tổng quan">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="ic" style={{ background: '#e3f3f7', color: 'var(--accent)' }}>
            <Flag size={22} />
          </div>
          <div>
            <h1>SOC Console · Tổng quan</h1>
            <p>Tóm tắt agent, cảnh báo 24 giờ qua và các module bảo mật</p>
          </div>
        </div>
        <div className="act">
          <button className="b2" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={15} style={loading ? { animation: 'spin .7s linear infinite' } : {}} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Top Cards Grid */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Agent Summary Card */}
        <div className="card">
          <h2>
            Tóm tắt Agent{' '}
            <Link to="/soc/endpoints" style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 400, display: 'flex', alignItems: 'center', gap: 4 }}>
              Xem danh sách Agents <ArrowRight size={14} />
            </Link>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginTop: 12 }}>
            {renderDonut(agentItems)}
            <div style={{ display: 'grid', gap: 6, flex: 1, minWidth: 140 }}>
              {agentItems.map(x => (
                <Link
                  key={x.key}
                  to={`/soc/endpoints?status=${x.key}`}
                  title={`Xem agent ${x.label}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    color: 'var(--text)',
                    borderRadius: 4,
                    padding: '4px 8px',
                    background: 'var(--panel2)',
                    textDecoration: 'none',
                  }}
                >
                  <i style={{ width: 10, height: 10, borderRadius: '50%', background: x.color, display: 'inline-block' }} />
                  <span style={{ flex: 1, fontWeight: 500 }}>{x.label}</span>
                  <span className="mono" style={{ color: 'var(--muted)' }}>({x.value})</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* 24h Alerts Card */}
        <div className="card">
          <h2>
            Cảnh báo 24 giờ qua{' '}
            <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>
              Cập nhật {fmtTime(lastUpdated)}
            </span>
          </h2>
          <div className="sevbig" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginTop: 12 }}>
            {['crit', 'high', 'med', 'low'].map(k => (
              <Link
                key={k}
                to={`/alerts?sev=${k}`}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '14px 8px',
                  borderRadius: 'var(--r)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                  textDecoration: 'none',
                  background: 'var(--panel)',
                  transition: 'all .15s',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, display: 'block' }}>{SEV_NAMES[k]}</span>
                <b style={{ fontSize: 32, fontFamily: 'var(--mono)', color: SEV_COLORS[k], display: 'block', margin: '4px 0' }}>
                  {stats.alerts[k] || 0}
                </b>
                <small style={{ color: 'var(--muted)', fontSize: 11, display: 'block' }}>{SEV_LEVELS[k]}</small>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Modules Sections */}
      <div style={{ display: 'grid', gap: 16 }}>
        {MODULE_GROUPS.map((grp, idx) => (
          <div key={idx} className="card">
            <h2>
              {grp.title}{' '}
              <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>
                {grp.modules.length} module
              </span>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>
              {grp.modules.map((m, mIdx) => (
                <button
                  key={mIdx}
                  onClick={() => handleModuleClick(m)}
                  style={{
                    display: 'flex',
                    gap: 12,
                    textAlign: 'left',
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r)',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    width: '100%',
                    alignItems: 'flex-start',
                    color: 'inherit',
                    font: 'inherit',
                    transition: 'all .15s',
                  }}
                  className="mod-card"
                >
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: '#e3f3f7',
                      color: 'var(--accent)',
                      display: 'grid',
                      placeItems: 'center',
                      flex: 'none',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {m.badge}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                      {m.name}
                      {!m.path && (
                        <span
                          style={{
                            fontSize: 11,
                            border: '1px solid var(--line)',
                            borderRadius: 10,
                            padding: '0 6px',
                            color: 'var(--muted)',
                            fontWeight: 400,
                          }}
                        >
                          Chưa có trang
                        </span>
                      )}
                    </b>
                    <small style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.4, display: 'block' }}>
                      {m.desc}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  )
}
