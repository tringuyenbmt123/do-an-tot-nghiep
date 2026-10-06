// ==============================================================
// src/pages/SOCOverview.jsx
// SOC Console – Tổng quan Agent và cảnh báo (real data từ MySQL)
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Flag, RefreshCw, Shield, ArrowRight, ExternalLink } from 'lucide-react'
import Layout from '../components/layout/Layout'
import { useToast } from '../contexts/ToastContext'
import { getSOCOverviewStats } from '../api/wazuh'

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
    title: 'Endpoint security',
    modules: [
      { name: 'Configuration Assessment', desc: 'Quét tài sản để đánh giá cấu hình theo chuẩn kiểm toán.', path: null, badge: 'CA' },
      { name: 'Malware Detection', desc: 'Kiểm tra dấu hiệu xâm nhập do mã độc hoặc tấn công mạng gây ra.', path: '/alerts', badge: 'MD' },
      { name: 'File Integrity Monitoring', desc: 'Cảnh báo thay đổi tệp: quyền, nội dung, chủ sở hữu và thuộc tính.', path: '/rules', badge: 'FIM' },
    ],
  },
  {
    title: 'Threat intelligence',
    modules: [
      { name: 'Threat Hunting', desc: 'Duyệt qua các cảnh báo bảo mật để phát hiện sự cố và mối đe dọa.', path: '/siem', badge: 'TH' },
      { name: 'Vulnerability Detection', desc: 'Phát hiện ứng dụng bị ảnh hưởng bởi các lỗ hổng đã biết.', path: '/vulns', badge: 'VD' },
      { name: 'MITRE ATT&CK', desc: 'Khám phá cảnh báo theo chiến thuật và kỹ thuật tấn công.', path: '/mitre', badge: 'MA' },
    ],
  },
  {
    title: 'Security operations',
    modules: [
      { name: 'IT Hygiene', desc: 'Đánh giá hệ thống, phần mềm, tiến trình và mạng để phát hiện cấu hình sai, thay đổi trái phép và bất thường.', path: null, badge: 'IT' },
      { name: 'PCI DSS', desc: 'Tiêu chuẩn bảo mật toàn cầu cho đơn vị xử lý, lưu trữ hoặc truyền dữ liệu thẻ thanh toán.', path: null, badge: 'PCI' },
      { name: 'GDPR', desc: 'Quy định bảo vệ dữ liệu chung của EU về xử lý dữ liệu cá nhân.', path: null, badge: 'GDPR' },
      { name: 'HIPAA', desc: 'Đạo luật bảo mật và an toàn thông tin y tế của Hoa Kỳ.', path: null, badge: 'HIPAA' },
      { name: 'NIST 800-53', desc: 'Hướng dẫn kiểm soát bảo mật cho hệ thống thông tin liên bang.', path: null, badge: 'NIST' },
      { name: 'TSC', desc: 'Tiêu chí dịch vụ tin cậy: bảo mật, sẵn sàng, toàn vẹn xử lý, bí mật và riêng tư.', path: null, badge: 'TSC' },
    ],
  },
  {
    title: 'Cloud security',
    modules: [
      { name: 'Docker', desc: 'Theo dõi hoạt động container: tạo, chạy, khởi động, dừng hoặc tạm dừng.', path: null, badge: 'DK' },
      { name: 'Amazon Web Services', desc: 'Sự kiện bảo mật của dịch vụ AWS, thu thập trực tiếp qua AWS API.', path: null, badge: 'AWS' },
      { name: 'Google Cloud', desc: 'Sự kiện bảo mật của Google Cloud Platform, thu thập qua GCP API.', path: null, badge: 'GCP' },
      { name: 'GitHub', desc: 'Giám sát nhật ký kiểm toán của các tổ chức GitHub.', path: null, badge: 'GH' },
      { name: 'Office 365', desc: 'Sự kiện bảo mật của các dịch vụ Office 365.', path: null, badge: 'O365' },
      { name: 'Microsoft Graph API', desc: 'Sự kiện bảo mật của dịch vụ Microsoft Graph, thu thập qua Graph API.', path: null, badge: 'MG' },
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

export default function WazuhOverview() {
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
            <Link to="/wazuh/endpoints" style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 400, display: 'flex', alignItems: 'center', gap: 4 }}>
              Xem danh sách Agents <ArrowRight size={14} />
            </Link>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginTop: 12 }}>
            {renderDonut(agentItems)}
            <div style={{ display: 'grid', gap: 6, flex: 1, minWidth: 140 }}>
              {agentItems.map(x => (
                <Link
                  key={x.key}
                  to={`/wazuh/endpoints?status=${x.key}`}
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
