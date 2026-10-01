// ==============================================================
// src/pages/AuditSettings.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { BookOpen, Settings as SettingsIcon, Save, RefreshCw } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import Pagination from '../components/ui/Pagination'
import { getAuditLogs } from '../api/auditLogs'
import { getSettings, updateSettings } from '../api/settings'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

const PAGE_SIZE = 50

import { ago, formatDateTime } from '../utils/date'

export default function AuditSettings() {
  const [activeTab, setActiveTab] = useState('audit') // 'audit' | 'settings'

  // Audit State
  const [logs, setLogs]       = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)

  // Settings State
  const [settings, setSettings] = useState(null)
  const [saving, setSaving]     = useState(false)

  const toast = useToast()
  const { isAdmin } = useAuth()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (activeTab === 'audit') {
        const res = await getAuditLogs({ page, limit: PAGE_SIZE })
        setLogs(res.data?.data || [])
        setTotal(res.data?.total || 0)
      } else {
        const res = await getSettings()
        const s = res.data?.data || {}
        setSettings({
          soar_enabled: s.soar_enabled === 'true',
          n8n_webhook_url: s.n8n_webhook_url || '',
          n8n_webhook_url_ddos: s.n8n_webhook_url_ddos || '',
          n8n_webhook_url_phishing: s.n8n_webhook_url_phishing || '',
          n8n_webhook_url_wazuh: s.n8n_webhook_url_wazuh || '',
          alert_retention_days: parseInt(s.alert_retention_days) || 7
        })
      }
    } catch (e) {
      toast.error('Không tải được dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [activeTab, page, toast])

  useEffect(() => { loadData() }, [loadData])

  const handleSaveSettings = async () => {
    if (!isAdmin) { toast.warn('Chỉ admin mới có quyền lưu cấu hình'); return }
    setSaving(true)
    try {
      const payload = {
        soar_enabled: settings.soar_enabled ? 'true' : 'false',
        n8n_webhook_url: settings.n8n_webhook_url,
        n8n_webhook_url_ddos: settings.n8n_webhook_url_ddos,
        n8n_webhook_url_phishing: settings.n8n_webhook_url_phishing,
        n8n_webhook_url_wazuh: settings.n8n_webhook_url_wazuh,
        alert_retention_days: settings.alert_retention_days.toString()
      }
      await updateSettings(payload)
      toast.success('Lưu cấu hình thành công')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout title="Audit & Settings">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><BookOpen size={20} /></div>
          <div>
            <h1>Audit & Cài đặt hệ thống</h1>
            <p>Nhật ký hệ thống và cấu hình tích hợp SOAR</p>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab${activeTab === 'audit' ? ' on' : ''}`} onClick={() => setActiveTab('audit')}>
          Audit Logs
        </button>
        <button className={`tab${activeTab === 'settings' ? ' on' : ''}`} onClick={() => setActiveTab('settings')}>
          Cấu hình Hệ thống (SOAR)
        </button>
      </div>

      {activeTab === 'audit' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--line)' }}>
            <button className="b2" onClick={loadData} disabled={loading} style={{ fontSize: 13, padding: '4px 10px' }}>
              <RefreshCw size={14} style={loading ? { animation: 'spin .7s linear infinite' } : {}} /> Làm mới
            </button>
          </div>
          {loading ? (
            <div style={{ padding: 16 }}><SkeletonTable cols={6} rows={10} /></div>
          ) : (
            <>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Tác nhân</th>
                      <th>Hành động</th>
                      <th>Đối tượng</th>
                      <th>Trạng thái</th>
                      <th>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id}>
                        <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {new Date(l.created_at).toLocaleString('vi-VN')}
                        </td>
                        <td style={{ fontWeight: 500 }}>{l.actor}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{l.action}</td>
                        <td className="mono" style={{ fontSize: 12, color: 'var(--accent)' }}>{l.target || '—'}</td>
                        <td>
                          <span className={`tag ${l.status === 'success' ? 's-ok' : l.status === 'failed' ? 's-crit' : ''}`} style={{ background: 'none', border: 'none' }}>
                            {l.status === 'success' ? 'Thành công' : l.status === 'failed' ? 'Thất bại' : l.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.details || '—'}
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
      )}

      {activeTab === 'settings' && (
        <div className="card" style={{ maxWidth: 700 }}>
          <h2 style={{ borderBottom: '1px solid var(--line)', paddingBottom: 16, marginBottom: 20 }}>
            <SettingsIcon size={18} style={{ marginRight: 8 }} />
            Cấu hình SOAR (n8n Integration)
          </h2>

          {loading || !settings ? (
            <div className="loading-full"><div className="spinner" /><span>Đang tải cấu hình…</span></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className="sw">
                  <input
                    type="checkbox"
                    checked={settings.soar_enabled}
                    onChange={e => setSettings(s => ({ ...s, soar_enabled: e.target.checked }))}
                    disabled={!isAdmin}
                  />
                  <span className="sw-track"></span>
                  <span className="sw-thumb"></span>
                </label>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Kích hoạt SOAR Dispatcher</div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: -12, paddingLeft: 52 }}>
                Tự động gửi cảnh báo sang n8n để xử lý phản ứng tự động theo kịch bản.
              </p>

              <div className="form-group" style={{ opacity: settings.soar_enabled ? 1 : 0.5, transition: 'opacity .2s' }}>
                <label>n8n Webhook URL (Default/Fallback)</label>
                <input
                  className="soc-input mono"
                  value={settings.n8n_webhook_url}
                  onChange={e => setSettings(s => ({ ...s, n8n_webhook_url: e.target.value }))}
                  disabled={!settings.soar_enabled || !isAdmin}
                  placeholder="https://n8n.example.com/webhook/..."
                />
              </div>

              <div className="form-group" style={{ opacity: settings.soar_enabled ? 1 : 0.5, transition: 'opacity .2s' }}>
                <label>n8n Webhook URL (DDoS Playbook)</label>
                <input
                  className="soc-input mono"
                  value={settings.n8n_webhook_url_ddos}
                  onChange={e => setSettings(s => ({ ...s, n8n_webhook_url_ddos: e.target.value }))}
                  disabled={!settings.soar_enabled || !isAdmin}
                />
              </div>

              <div className="form-group" style={{ opacity: settings.soar_enabled ? 1 : 0.5, transition: 'opacity .2s' }}>
                <label>n8n Webhook URL (Phishing Playbook)</label>
                <input
                  className="soc-input mono"
                  value={settings.n8n_webhook_url_phishing}
                  onChange={e => setSettings(s => ({ ...s, n8n_webhook_url_phishing: e.target.value }))}
                  disabled={!settings.soar_enabled || !isAdmin}
                />
              </div>

              <div className="form-group" style={{ opacity: settings.soar_enabled ? 1 : 0.5, transition: 'opacity .2s' }}>
                <label>n8n Webhook URL (Wazuh Playbook)</label>
                <input
                  className="soc-input mono"
                  value={settings.n8n_webhook_url_wazuh}
                  onChange={e => setSettings(s => ({ ...s, n8n_webhook_url_wazuh: e.target.value }))}
                  disabled={!settings.soar_enabled || !isAdmin}
                />
              </div>

              <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '8px 0' }} />

              <div className="form-group">
                <label>Thời gian lưu trữ Cảnh báo (Ngày)</label>
                <input
                  type="number"
                  className="soc-input"
                  style={{ width: 150 }}
                  value={settings.alert_retention_days}
                  onChange={e => setSettings(s => ({ ...s, alert_retention_days: parseInt(e.target.value) || 7 }))}
                  disabled={!isAdmin}
                />
              </div>

              {isAdmin && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="b1" onClick={handleSaveSettings} disabled={saving}>
                    {saving ? 'Đang lưu…' : <><Save size={16} /> Lưu cấu hình</>}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
