// ==============================================================
// src/pages/Playbooks.jsx - SOAR Playbook Management & n8n Integration
// ==============================================================
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  TerminalSquare,
  RefreshCw,
  Play,
  ExternalLink,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  Bot,
  Upload,
  Plus,
  Trash2,
  Power,
  X,
  FileJson
} from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import {
  getPlaybooks,
  getPlaybookRuns,
  runPlaybook,
  createPlaybook,
  importN8nPlaybook,
  deletePlaybook,
  togglePlaybook
} from '../api/playbooks'

export default function Playbooks() {
  const [tab, setTab] = useState('list')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [runningId, setRunningId] = useState(null)
  const [notice, setNotice] = useState(null)

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)

  // Form create state
  const [formData, setFormData] = useState({
    name: '',
    trigger: 'custom_alert',
    enabled: true,
    stepsText: '1. Phân tích sự cố qua AI\n2. Xin phê duyệt qua Telegram\n3. Thực thi cô lập đối tượng',
  })

  const fileInputRef = useRef(null)
  const n8nWorkflowUrl = 'https://undegenerate-alisia-farsightedly.ngrok-free.dev/workflow/PiXHOoQvi19Ze351'

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

  useEffect(() => {
    load()
  }, [load])

  // Chạy thử Playbook
  const handleRunPlaybook = async (pb) => {
    setRunningId(pb.id)
    setNotice({ type: 'info', msg: `Đang gửi tín hiệu kích hoạt "${pb.name}" sang n8n...` })
    try {
      const res = await runPlaybook(pb.id)
      const resData = res.data || {}
      setNotice({
        type: resData.success ? 'success' : 'warning',
        msg: resData.message || `Đã kích hoạt ${pb.name} thành công!`
      })
      setTimeout(() => {
        if (tab === 'runs') {
          load()
        }
      }, 1500)
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Lỗi không xác định'
      setNotice({
        type: 'error',
        msg: `Kích hoạt thất bại: ${detail}`
      })
    } finally {
      setRunningId(null)
    }
  }

  // Bật/tắt Playbook
  const handleToggle = async (pb) => {
    try {
      await togglePlaybook(pb.id)
      setNotice({
        type: 'success',
        msg: `Đã ${pb.enabled ? 'tắt' : 'bật'} kịch bản: ${pb.name}`
      })
      load()
    } catch (err) {
      setNotice({ type: 'error', msg: 'Không thể cập nhật trạng thái Playbook' })
    }
  }

  // Xóa Playbook
  const handleDelete = async (pb) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa Playbook: "${pb.name}" không?`)) {
      return
    }
    try {
      await deletePlaybook(pb.id)
      setNotice({ type: 'success', msg: `Đã xóa thành công Playbook: ${pb.name}` })
      load()
    } catch (err) {
      setNotice({ type: 'error', msg: 'Lỗi khi xóa Playbook' })
    }
  }

  // Upload n8n JSON
  const handleUploadSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFile) {
      alert('Vui lòng chọn file JSON n8n trước khi tải lên!')
      return
    }
    setUploadLoading(true)
    try {
      const form = new FormData()
      form.append('file', selectedFile)
      const res = await importN8nPlaybook(form)
      setNotice({
        type: 'success',
        msg: res.data?.message || 'Đã import thành công Playbook từ file n8n!'
      })
      setShowUploadModal(false)
      setSelectedFile(null)
      load()
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Lỗi import file'
      setNotice({ type: 'error', msg: `Import thất bại: ${detail}` })
    } finally {
      setUploadLoading(false)
    }
  }

  // Tạo Playbook thủ công
  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('Vui lòng nhập tên Playbook!')
      return
    }
    setCreateLoading(true)
    try {
      const rawSteps = formData.stepsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)

      const steps = rawSteps.map((s, idx) => ({
        label: s.replace(/^\d+[\.\-\:]\s*/, ''),
        type: idx === 0 ? 'detection' : idx === rawSteps.length - 1 ? 'containment' : 'action',
        position: idx + 1,
      }))

      await createPlaybook({
        name: formData.name,
        trigger: formData.trigger,
        enabled: formData.enabled,
        steps,
      })

      setNotice({ type: 'success', msg: `Tạo thành công Playbook: ${formData.name}` })
      setShowCreateModal(false)
      setFormData({
        name: '',
        trigger: 'custom_alert',
        enabled: true,
        stepsText: '1. Phân tích sự cố qua AI\n2. Xin phê duyệt qua Telegram\n3. Thực thi cô lập đối tượng',
      })
      load()
    } catch (err) {
      setNotice({ type: 'error', msg: 'Không thể tạo Playbook mới' })
    } finally {
      setCreateLoading(false)
    }
  }

  return (
    <Layout title="Playbook SOAR">
      <div className="ph">
        <div className="ph-left">
          <div className="ic">
            <TerminalSquare size={20} />
          </div>
          <div>
            <h1>Playbook (SOAR)</h1>
            <p>Tự động hóa phản ứng và điều phối sự cố an ninh qua n8n</p>
          </div>
        </div>
        <div className="act" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="b2"
            onClick={() => setShowUploadModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: '#3b82f6', color: '#3b82f6' }}
          >
            <Upload size={14} /> Upload Workflow JSON
          </button>
          <button
            className="b2"
            onClick={() => setShowCreateModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: '#10b981', color: '#10b981' }}
          >
            <Plus size={14} /> Tạo Playbook Mới
          </button>
          <a
            href={n8nWorkflowUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="b2"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: 'var(--primary)', color: 'var(--primary)' }}
          >
            <ExternalLink size={14} /> Mở n8n Studio
          </a>
          <button className="b2" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Làm mới
          </button>
        </div>
      </div>

      {/* SOAR Engine Integration Card */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              <Zap size={22} color="#f97316" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: '#f8fafc' }}>
                  n8n Orchestration Engine
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#22c55e',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                  ngrok Active: undegenerate-alisia-farsightedly.ngrok-free.dev → localhost:5678
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
                Hỗ trợ phân loại sự cố bằng AI (Ollama Gemma), phê duyệt Telegram Bot và phản ứng chủ động (Kill Process, Block IP, Isolate Host).
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="b2"
              onClick={() => {
                setTab('runs')
                load()
              }}
              style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Layers size={14} /> Xem Lịch sử Chạy ({tab === 'runs' ? data.length : '...'})
            </button>
          </div>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background:
              notice.type === 'success'
                ? 'rgba(34, 197, 94, 0.15)'
                : notice.type === 'error'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(59, 130, 246, 0.15)',
            border: `1px solid ${
              notice.type === 'success'
                ? 'rgba(34, 197, 94, 0.3)'
                : notice.type === 'error'
                ? 'rgba(239, 68, 68, 0.3)'
                : 'rgba(59, 130, 246, 0.3)'
            }`,
            color:
              notice.type === 'success'
                ? '#22c55e'
                : notice.type === 'error'
                ? '#ef4444'
                : '#38bdf8',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {notice.type === 'success' && <CheckCircle2 size={16} />}
            {notice.type === 'error' && <AlertCircle size={16} />}
            {notice.type === 'info' && <Loader2 size={16} className="spin" />}
            <span>{notice.msg}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs card */}
      <div className="card" style={{ padding: 0 }}>
        <div className="tabs" style={{ padding: '16px 16px 0' }}>
          <button
            className={`tab ${tab === 'list' ? 'on' : ''}`}
            onClick={() => setTab('list')}
          >
            Danh sách Playbook ({tab === 'list' ? data.length : '...'})
          </button>
          <button
            className={`tab ${tab === 'runs' ? 'on' : ''}`}
            onClick={() => setTab('runs')}
          >
            Lịch sử chạy SOAR ({tab === 'runs' ? data.length : '...'})
          </button>
        </div>

        <div>
          {loading ? (
            <div style={{ padding: 16 }}>
              <SkeletonTable cols={4} rows={5} />
            </div>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  {tab === 'list' ? (
                    <tr>
                      <th style={{ width: 220 }}>Tên Playbook</th>
                      <th style={{ width: 140 }}>Trigger</th>
                      <th>Quy trình các bước (Steps)</th>
                      <th style={{ width: 100 }}>Trạng thái</th>
                      <th style={{ width: 150, textAlign: 'center' }}>Hành động</th>
                    </tr>
                  ) : (
                    <tr>
                      <th style={{ width: 80 }}>ID</th>
                      <th style={{ width: 220 }}>Kịch bản Playbook</th>
                      <th style={{ width: 110 }}>Trạng thái</th>
                      <th style={{ width: 170 }}>Bắt đầu</th>
                      <th style={{ width: 170 }}>Kết thúc</th>
                      <th>Chi tiết kết quả (Logs)</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.id} className="cl">
                      {tab === 'list' ? (
                        <>
                          <td style={{ fontWeight: 600, color: '#f8fafc' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Bot size={16} color="var(--primary)" />
                              {item.name}
                            </div>
                          </td>
                          <td>
                            <span className="tag" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa' }}>
                              {item.trigger}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {item.steps && item.steps.length > 0 ? (
                                item.steps.map((st, idx) => (
                                  <span
                                    key={st.id || idx}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      fontSize: 11,
                                      padding: '3px 8px',
                                      borderRadius: 6,
                                      background: 'rgba(148, 163, 184, 0.1)',
                                      color: '#cbd5e1',
                                      border: '1px solid rgba(148, 163, 184, 0.2)',
                                    }}
                                  >
                                    <span style={{ color: '#38bdf8', fontWeight: 600 }}>{idx + 1}.</span>
                                    {st.label}
                                  </span>
                                ))
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Tự động hóa qua n8n workflow</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <button
                              onClick={() => handleToggle(item)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                              title="Bấm để bật/tắt"
                            >
                              {item.enabled ? (
                                <span className="tag s-low" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', cursor: 'pointer' }}>
                                  Kích hoạt
                                </span>
                              ) : (
                                <span className="tag s-crit" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', cursor: 'pointer' }}>
                                  Tắt
                                </span>
                              )}
                            </button>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <button
                                className="lnk"
                                onClick={() => handleRunPlaybook(item)}
                                disabled={runningId === item.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '5px 10px',
                                  borderRadius: 6,
                                  background: runningId === item.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(34, 197, 94, 0.15)',
                                  color: runningId === item.id ? '#93c5fd' : '#22c55e',
                                  border: '1px solid rgba(34, 197, 94, 0.3)',
                                  cursor: runningId === item.id ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {runningId === item.id ? (
                                  <>
                                    <Loader2 size={12} className="spin" /> Đang chạy
                                  </>
                                ) : (
                                  <>
                                    <Play size={12} /> Chạy thử
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleDelete(item)}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                  color: '#ef4444',
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                }}
                                title="Xóa Playbook này"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ fontWeight: 600 }}>#{item.id}</td>
                          <td style={{ fontWeight: 500, color: '#f1f5f9' }}>
                            {item.playbook_name || `Playbook #${item.playbook_id}`}
                          </td>
                          <td>
                            <span
                              className={`stt ${
                                item.status === 'success'
                                  ? 'a'
                                  : item.status === 'failed'
                                  ? 'e'
                                  : 'b'
                              }`}
                            >
                              {item.status === 'success' ? 'Thành công' : item.status === 'failed' ? 'Thất bại' : 'Đang xử lý'}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {item.started_at ? new Date(item.started_at).toLocaleString('vi-VN') : '—'}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {item.completed_at ? new Date(item.completed_at).toLocaleString('vi-VN') : '—'}
                          </td>
                          <td style={{ fontSize: 11, color: '#94a3b8', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.logs ? (
                              typeof item.logs === 'object' ? (
                                item.logs.status_code ? (
                                  `HTTP ${item.logs.status_code} | ${item.logs.alert_sent?.title || ''}`
                                ) : item.logs.callback_action ? (
                                  `Callback: ${item.logs.callback_action} -> Target: ${item.logs.callback_target}`
                                ) : (
                                  JSON.stringify(item.logs)
                                )
                              ) : (
                                String(item.logs)
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={tab === 'list' ? 5 : 6} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                        Chưa có dữ liệu nào
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Upload n8n JSON */}
      {showUploadModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            style={{
              width: 480,
              maxWidth: '90%',
              background: '#0f172a',
              border: '1px solid #334155',
              padding: 24,
              borderRadius: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileJson size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>Upload Workflow JSON (n8n)</h3>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit}>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px' }}>
                Chọn file JSON export từ n8n (ví dụ: <code>SOC SOAR Unified Platform v9...json</code>). Hệ thống sẽ tự động phân tích các node webhook và các bước xử lý để đưa vào danh mục Playbook.
              </p>

              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #334155',
                  borderRadius: 8,
                  padding: '24px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'rgba(30, 41, 59, 0.5)',
                  marginBottom: 16,
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={(e) => setSelectedFile(e.target.files[0] || null)}
                />
                <Upload size={28} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
                {selectedFile ? (
                  <p style={{ margin: 0, fontSize: 13, color: '#38bdf8', fontWeight: 600 }}>
                    Đã chọn: {selectedFile.name}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                    Nhấn để chọn file <code>.json</code>
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="b2"
                  onClick={() => setShowUploadModal(false)}
                  disabled={uploadLoading}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="b1"
                  disabled={uploadLoading || !selectedFile}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {uploadLoading && <Loader2 size={14} className="spin" />}
                  {uploadLoading ? 'Đang Import...' : 'Bắt đầu Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tạo Playbook thủ công */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            style={{
              width: 520,
              maxWidth: '90%',
              background: '#0f172a',
              border: '1px solid #334155',
              padding: 24,
              borderRadius: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Plus size={20} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>Tạo Playbook Mới</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>
                  Tên Playbook:
                </label>
                <input
                  type="text"
                  className="inp"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ví dụ: PB-06: Brute Force SSH Auto-Ban"
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>
                  Sự kiện kích hoạt (Trigger):
                </label>
                <input
                  type="text"
                  className="inp"
                  value={formData.trigger}
                  onChange={(e) => setFormData({ ...formData, trigger: e.target.value })}
                  placeholder="Ví dụ: brute_force_detected hoặc soc-alert"
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>
                  Quy trình các bước (Mỗi dòng 1 bước):
                </label>
                <textarea
                  className="inp"
                  rows={4}
                  value={formData.stepsText}
                  onChange={(e) => setFormData({ ...formData, stepsText: e.target.value })}
                  style={{ width: '100%', resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="b2"
                  onClick={() => setShowCreateModal(false)}
                  disabled={createLoading}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="b1"
                  disabled={createLoading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {createLoading && <Loader2 size={14} className="spin" />}
                  {createLoading ? 'Đang lưu...' : 'Lưu Playbook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
