// ==============================================================
// src/pages/CaseDetail.jsx
// Trang chi tiết Sự cố (Case Detail) — 3 cột kiểu TheHive / Jira SOC
// ==============================================================
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  RefreshCw,
  Send,
  MessageSquare,
  FileText,
  ExternalLink,
  Shield,
  Activity,
  Layers,
  Paperclip,
  CheckSquare
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Layout from '../components/layout/Layout'
import SeverityBadge from '../components/ui/SeverityBadge'
import StatusBadge from '../components/ui/StatusBadge'
import CaseAlertDetails from '../components/cases/CaseAlertDetails'
import { getCaseById, updateCaseStatus, assignCase, addCaseNote } from '../api/cases'
import { getAlertById } from '../api/alerts'
import { getAgents } from '../api/agents'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { ago, formatDateTime } from '../utils/date'
import {
  resolveSeverity,
  resolveCaseTitle,
  parseCaseDescription,
  extractRawAlert,
  extractAgent,
  extractAttackInfo
} from '../utils/case'
import '../styles/case-detail.css'

const STORAGE_KEY = 'case-cols'

export default function CaseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  // Case data states
  const [caseData, setCaseData] = useState(null)
  const [agentsList, setAgentsList] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // Middle tab & left nav
  const [activeTab, setActiveTab] = useState('comments') // 'comments' | 'activity' | 'all'
  const [activeNav, setActiveNav] = useState('overview')

  // Note composer state
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  // Updating right column state
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingAssign, setSavingAssign] = useState(false)

  // Column width refs & states
  const rootRef = useRef(null)
  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      if (saved?.l && saved?.r) return { l: saved.l, r: saved.r }
    } catch {
      /* ignore */
    }
    return { l: 230, r: 300 }
  })

  // References for sections to scroll to
  const overviewRef = useRef(null)
  const notesRef = useRef(null)
  const alertRef = useRef(null)

  // Fetch case detail
  const loadCase = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      // Load agents list in parallel for agent device matching
      getAgents({ limit: 100 })
        .then(res => setAgentsList(res.data?.data || res.data || []))
        .catch(() => { })

      const res = await getCaseById(id)
      const data = res.data?.data || res.data
      if (!data) throw new Error('Không tìm thấy thông tin sự cố')

      // Fallback: If case has alert_id but alert object wasn't populated
      if (data.alert_id && !data.alert) {
        try {
          const alertRes = await getAlertById(data.alert_id)
          if (alertRes.data) {
            data.alert = alertRes.data
          }
        } catch {
          /* ignore */
        }
      }

      setCaseData(data)
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Lỗi khi tải thông tin sự cố')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [id])

  useEffect(() => {
    loadCase()
  }, [loadCase])

  // Save column widths to localStorage
  const saveColWidths = useCallback((l, r) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ l, r }))
    } catch {
      /* ignore */
    }
  }, [])

  // Splitter dragging handler
  const handleSplitterPointerDown = (side, ev) => {
    ev.preventDefault()
    const target = ev.currentTarget
    target.classList.add('dragging')
    target.setPointerCapture(ev.pointerId)

    const wsElem = rootRef.current?.querySelector('.cd-ws')
    if (!wsElem) return
    const wsRect = wsElem.getBoundingClientRect()

    const onPointerMove = (e) => {
      if (side === 'l') {
        const newL = Math.min(380, Math.max(180, e.clientX - wsRect.left))
        setColWidths((prev) => {
          const next = { ...prev, l: newL }
          saveColWidths(next.l, next.r)
          return next
        })
      } else {
        const newR = Math.min(460, Math.max(240, wsRect.right - e.clientX))
        setColWidths((prev) => {
          const next = { ...prev, r: newR }
          saveColWidths(next.l, next.r)
          return next
        })
      }
    }

    const onPointerUp = () => {
      target.classList.remove('dragging')
      target.removeEventListener('pointermove', onPointerMove)
      target.removeEventListener('pointerup', onPointerUp)
    }

    target.addEventListener('pointermove', onPointerMove)
    target.addEventListener('pointerup', onPointerUp)
  }

  // Handle status change
  const handleStatusChange = async (newStatus) => {
    if (!caseData || caseData.status === newStatus) return

    // Quy tắc: chưa assign thì không được đổi trạng thái sang closed
    const currentAssigned = Boolean(
      caseData.assigned_to &&
      caseData.assigned_to !== 'soar_automation' &&
      caseData.assigned_to.toLowerCase() !== 'unassigned' &&
      caseData.assigned_to.trim() !== ''
    )
    if (newStatus === 'closed' && !currentAssigned) {
      toast.warn('Vui lòng phân công người phụ trách trước khi đóng sự cố')
      return
    }

    const labels = { new: 'Mới', progress: 'Đang xử lý', pending: 'Chờ', closed: 'Đóng' }

    setSavingStatus(true)
    try {
      await updateCaseStatus(caseData.id, newStatus)
      toast.success(`Đã đổi trạng thái sang "${labels[newStatus] || newStatus}"`)
      setCaseData((prev) => ({ ...prev, status: newStatus }))
    } catch (e) {
      const errDetail = e.response?.data?.detail || e.response?.data?.error || e.message
      toast.error(errDetail || 'Lỗi khi cập nhật trạng thái')
    } finally {
      setSavingStatus(false)
    }
  }

  // Handle close case button
  const handleCloseCase = () => {
    handleStatusChange('closed')
  }

  // Handle assign to current user
  const handleAssignToMe = async () => {
    if (!caseData) return
    const targetUser = user?.username || 'analyst'
    if (caseData.assigned_to === targetUser && caseData.status === 'progress') {
      toast.info('Bạn đã là người phụ trách case này')
      return
    }

    setSavingAssign(true)
    try {
      await assignCase(caseData.id, targetUser)
      if (caseData.status !== 'closed' && caseData.status !== 'progress') {
        try {
          await updateCaseStatus(caseData.id, 'progress')
        } catch (_) {}
      }
      toast.success(`Đã gán case cho ${targetUser} và chuyển trạng thái sang "Đang xử lý"`)
      setCaseData((prev) => ({
        ...prev,
        assigned_to: targetUser,
        status: prev.status === 'closed' ? 'closed' : 'progress'
      }))
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.error || e.message || 'Lỗi khi gán người phụ trách')
    } finally {
      setSavingAssign(false)
    }
  }

  // Handle note submission
  const handleAddNote = async () => {
    const text = noteText.trim()
    if (!text) {
      toast.warn('Vui lòng nhập nội dung ghi chú')
      return
    }

    setAddingNote(true)
    try {
      await addCaseNote(caseData.id, text)
      toast.success('Đã thêm ghi chú điều tra')
      setNoteText('')
      // Reload case to refresh timeline and description
      loadCase(true)
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Lỗi khi lưu ghi chú')
    } finally {
      setAddingNote(false)
    }
  }

  // Handle Ctrl+Enter in note composer
  const handleKeyDownNote = (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault()
      handleAddNote()
    }
  }

  // Navigation scroll helper
  const scrollToSection = (navKey, ref) => {
    setActiveNav(navKey)
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Render loading state
  if (loading) {
    return (
      <Layout title="Chi tiết Sự cố" noPadding>
        <div className="cd-loading">
          <RefreshCw size={24} style={{ animation: 'spin 0.8s linear infinite' }} />
          <span>Đang tải thông tin sự cố…</span>
        </div>
      </Layout>
    )
  }

  // Render error state
  if (error || !caseData) {
    return (
      <Layout title="Chi tiết Sự cố" noPadding>
        <div className="cd-error">
          <AlertTriangle size={36} color="var(--crit)" style={{ marginBottom: 12 }} />
          <p>{error || 'Không tìm thấy sự cố yêu cầu.'}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="cd-btn" onClick={() => navigate('/cases')}>
              ← Quay lại danh sách
            </button>
            <button className="cd-btn" onClick={() => loadCase()}>
              Thử lại
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  // Parse details from caseData
  const rawAlert = extractRawAlert(caseData)
  const { initialDesc, notes: parsedNotes } = parseCaseDescription(caseData.description)
  const notes = (caseData.notes && caseData.notes.length > 0)
    ? caseData.notes.map((n, idx) => ({
        id: n.id || idx,
        timestamp: n.created_at ? formatDateTime(n.created_at) : (n.timestamp || ''),
        author: n.author || 'Analyst',
        content: n.note || n.content || ''
      }))
    : parsedNotes
  const agent = extractAgent(caseData, rawAlert, agentsList)
  const severity = resolveSeverity(caseData)
  const displayTitle = resolveCaseTitle(caseData, rawAlert)
  const isAssigned = Boolean(
    caseData?.assigned_to &&
    caseData.assigned_to !== 'soar_automation' &&
    caseData.assigned_to.toLowerCase() !== 'unassigned' &&
    caseData.assigned_to.trim() !== ''
  )
  const { stage, category } = extractAttackInfo(rawAlert?.rule?.groups || [])

  // Calculate observables count
  const observables = []
  if (rawAlert?.data?.srcip) observables.push({ type: 'ip', val: rawAlert.data.srcip })
  if (rawAlert?.data?.dstip) observables.push({ type: 'ip', val: rawAlert.data.dstip })
  if (rawAlert?.data?.url) observables.push({ type: 'url', val: rawAlert.data.url })
  if (rawAlert?.data?.sha256 || rawAlert?.data?.md5) observables.push({ type: 'hash', val: rawAlert.data.sha256 || rawAlert.data.md5 })

  // Extract MITRE techniques
  const mitreTechniques = []
  if (caseData.alert?.mitre_technique_id) mitreTechniques.push(caseData.alert.mitre_technique_id)
  if (rawAlert?.rule?.mitre?.id) {
    const ids = Array.isArray(rawAlert.rule.mitre.id) ? rawAlert.rule.mitre.id : [rawAlert.rule.mitre.id]
    ids.forEach((m) => {
      if (!mitreTechniques.includes(m)) mitreTechniques.push(m)
    })
  }
  // Heuristic MITRE fallback if none
  if (mitreTechniques.length === 0 && (caseData.title?.toLowerCase().includes('ddos') || initialDesc.toLowerCase().includes('ddos'))) {
    mitreTechniques.push('T1498', 'T1499')
  }

  // Tags
  const tags = []
  if (caseData.title?.toLowerCase().includes('ddos') || initialDesc.toLowerCase().includes('ddos')) tags.push('DDoS')
  if (caseData.alert_id || initialDesc.toLowerCase().includes('soar')) tags.push('SOAR')
  if (initialDesc.toLowerCase().includes('ai')) tags.push('AI Auto')
  if (tags.length === 0) tags.push('Security Incident')

  // Filter notes by active tab
  const filteredNotes = notes.filter((n) => {
    const author = (n.author || '').toLowerCase()
    const content = (n.content || '').toLowerCase()
    if (activeTab === 'comments') return !author.includes('system')
    if (activeTab === 'activity') return author.includes('system') || content.includes('trạng thái')
    return true
  })

  // SLA and MTTR visual calculation
  const createdTime = new Date(caseData.created_at).getTime()
  const endTime = caseData.closed_at ? new Date(caseData.closed_at).getTime() : Date.now()
  const resolveMinutes = Math.max(1, Math.round((endTime - createdTime) / (1000 * 60)))
  const now = Date.now()
  const elapsedHours = (now - createdTime) / (1000 * 60 * 60)
  const slaHours = 4 // standard 4h response window
  const slaRemainingHours = Math.max(0, slaHours - elapsedHours)
  const slaPercent = Math.min(100, Math.max(10, (slaRemainingHours / slaHours) * 100))

  return (
    <Layout title={`Case – ${caseData.id}`} noPadding>
      <div
        className="cd-root"
        ref={rootRef}
        style={{
          '--cd-lw': `${colWidths.l}px`,
          '--cd-rw': `${colWidths.r}px`
        }}
      >
        {/* TOP HEADER */}
        <header className="cd-header">
          <div className="cd-crumb">
            <Link to="/cases">Sự cố</Link> / <span className="mono">{caseData.id.slice(0, 8)}</span>
          </div>

          <div className="cd-titlerow">
            <div>
              <h1>{displayTitle || `Sự cố ${caseData.id}`}</h1>
              <div className="cd-id mono">{caseData.id}</div>
              <div className="cd-badges">
                <SeverityBadge value={severity} />
                <StatusBadge value={caseData.status} />
                {tags.map((t, i) => (
                  <span className="cd-tag" key={i}>
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="cd-actions">
              <button
                className="cd-btn"
                onClick={() => loadCase(true)}
                disabled={refreshing}
                title="Làm mới dữ liệu"
              >
                <RefreshCw size={13} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : {}} />
              </button>
              <button className="cd-btn" onClick={() => navigate('/cases')}>
                <ArrowLeft size={14} />
                <span>Danh sách</span>
              </button>
              {caseData.status !== 'closed' ? (
                <button
                  className="cd-btn danger"
                  onClick={handleCloseCase}
                  disabled={savingStatus}
                  title={!isAssigned ? 'Cần phân công người phụ trách trước khi đóng case' : 'Đóng case'}
                  style={!isAssigned ? { opacity: 0.7 } : {}}
                >
                  <CheckCircle2 size={14} />
                  <span>{savingStatus ? 'Đang đóng…' : 'Đóng case'}</span>
                </button>
              ) : (
                <button
                  className="cd-btn"
                  onClick={() => handleStatusChange('progress')}
                  disabled={savingStatus}
                >
                  <RefreshCw size={14} />
                  <span>{savingStatus ? 'Đang mở…' : 'Mở lại case'}</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* 3-COLUMN WORKSPACE */}
        <div className="cd-ws" id="ws">
          {/* ── LEFT COLUMN ── */}
          <aside className="cd-col left">
            <ul className="cd-nav" role="tablist">
              <li>
                <button
                  className={activeNav === 'overview' ? 'active' : ''}
                  onClick={() => scrollToSection('overview', overviewRef)}
                >
                  <span>Tổng quan</span>
                </button>
              </li>
              <li>
                <button
                  className={activeNav === 'notes' ? 'active' : ''}
                  onClick={() => scrollToSection('notes', notesRef)}
                >
                  <span>Ghi chú</span>
                  <span className="cd-nav-count">{notes.length}</span>
                </button>
              </li>
              <li>
                <button
                  className={activeNav === 'observables' ? 'active' : ''}
                  onClick={() => scrollToSection('observables', alertRef)}
                >
                  <span>Observables</span>
                  <span className="cd-nav-count">{observables.length}</span>
                </button>
              </li>
              <li>
                <button
                  className={activeNav === 'tasks' ? 'active' : ''}
                  onClick={() => setActiveNav('tasks')}
                >
                  <span>Tasks</span>
                  <span className="cd-nav-count">0</span>
                </button>
              </li>
              <li>
                <button
                  className={activeNav === 'attachments' ? 'active' : ''}
                  onClick={() => setActiveNav('attachments')}
                >
                  <span>Tệp đính kèm</span>
                  <span className="cd-nav-count">0</span>
                </button>
              </li>
              <li>
                <button
                  className={activeNav === 'timeline' ? 'active' : ''}
                  onClick={() => scrollToSection('timeline', notesRef)}
                >
                  <span>Dòng thời gian</span>
                </button>
              </li>
            </ul>

            <h3 className="cd-sec">Thông tin nhanh</h3>
            <dl className="cd-kv">
              <div>
                <dt>Tạo lúc</dt>
                <dd>{formatDateTime(caseData.created_at)}</dd>
              </div>
              <div>
                <dt>Cập nhật</dt>
                <dd>{ago(caseData.updated_at)}</dd>
              </div>
              <div>
                <dt>Nguồn</dt>
                <dd>{caseData.alert_id ? 'SOAR Automation' : 'Thủ công'}</dd>
              </div>
              {caseData.alert_id && (
                <div>
                  <dt>Alert gốc</dt>
                  <dd className="mono" style={{ fontSize: 12 }}>
                    <span
                      title={caseData.alert_id}
                      style={{ color: 'var(--primary)', cursor: 'pointer' }}
                      onClick={() => scrollToSection('observables', alertRef)}
                    >
                      {caseData.alert_id.slice(0, 14)}…
                    </span>
                  </dd>
                </div>
              )}
              <div>
                <dt>SLA phản hồi</dt>
                <dd>
                  {caseData.status === 'closed'
                    ? 'Đã hoàn thành'
                    : slaRemainingHours > 0
                      ? `Còn ~${Math.floor(slaRemainingHours)}h ${Math.round((slaRemainingHours % 1) * 60)}m`
                      : 'Quá hạn SLA'}
                  <div className="cd-sla-bar">
                    <i
                      style={{
                        width: `${slaPercent}%`,
                        background:
                          slaRemainingHours <= 0
                            ? 'var(--crit)'
                            : slaRemainingHours < 1
                              ? 'var(--med, #d29922)'
                              : 'var(--ok)'
                      }}
                    />
                  </div>
                </dd>
              </div>
            </dl>
          </aside>

          {/* LEFT SPLITTER */}
          <div
            className="cd-split"
            data-side="l"
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={(e) => handleSplitterPointerDown('l', e)}
          />

          {/* ── MIDDLE COLUMN ── */}
          <section className="cd-col mid">
            {/* 1. Initial Description Panel */}
            <section className="cd-panel" ref={overviewRef}>
              <div className="cd-panel-header">
                <span>Mô tả ban đầu</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 'normal' }}>
                  <Clock size={12} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                  {formatDateTime(caseData.created_at)}
                </span>
              </div>
              <div className="cd-panel-body cd-md">
                {initialDesc ? (
                  <ReactMarkdown>{initialDesc}</ReactMarkdown>
                ) : (
                  <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                    Không có mô tả ban đầu cho sự cố này.
                  </div>
                )}
              </div>
            </section>

            {/* 2. Alert Details + Raw JSON Viewer Panel */}
            <div ref={alertRef}>
              <CaseAlertDetails alert={caseData.alert} raw={rawAlert} agent={agent} />
            </div>

            {/* 3. Investigation Notes & Activities Panel */}
            <section className="cd-panel" ref={notesRef}>
              <div className="cd-tabs">
                <button
                  className={activeTab === 'comments' ? 'active' : ''}
                  onClick={() => setActiveTab('comments')}
                >
                  Bình luận {notes.length > 0 && `(${notes.length})`}
                </button>
                <button
                  className={activeTab === 'activity' ? 'active' : ''}
                  onClick={() => setActiveTab('activity')}
                >
                  Hoạt động
                </button>
                <button
                  className={activeTab === 'all' ? 'active' : ''}
                  onClick={() => setActiveTab('all')}
                >
                  Tất cả
                </button>
              </div>

              <div className="cd-panel-body" style={{ padding: 0 }}>
                {/* Notes Feed */}
                <div className="cd-feed">
                  {filteredNotes.length === 0 ? (
                    <div className="cd-empty-feed">
                      Chưa có ghi chú điều tra nào trong mục này.
                    </div>
                  ) : (
                    filteredNotes.map((note) => {
                      const isSystem =
                        note.author.toLowerCase().includes('system') ||
                        note.author.toLowerCase().includes('auto')
                      const initial = (note.author || 'A').charAt(0).toUpperCase()

                      return (
                        <div className="cd-note-item" key={note.id}>
                          <span
                            className="cd-avatar"
                            style={
                              isSystem
                                ? { background: 'var(--panel2, #21262d)', color: 'var(--muted)' }
                                : {}
                            }
                          >
                            {initial}
                          </span>
                          <div className="cd-bubble">
                            <div className="cd-bubble-header">
                              <b>{note.author || 'Analyst'}</b>
                              <span>{note.timestamp || 'Gần đây'}</span>
                            </div>
                            <div className="cd-bubble-body cd-md">
                              <ReactMarkdown>{note.content}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Note Composer */}
                <div className="cd-composer">
                  <textarea
                    placeholder="Ghi lại các phát hiện, hành động ngăn chặn hoặc cập nhật mới nhất…"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={handleKeyDownNote}
                    rows={3}
                  />
                  <div className="cd-composer-row">
                    <span className="cd-hint">Hỗ trợ Markdown · Ctrl+Enter để gửi</span>
                    <button
                      className="cd-btn"
                      style={{
                        background: 'var(--primary)',
                        color: '#fff',
                        borderColor: 'var(--primary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        opacity: noteText.trim() && !addingNote ? 1 : 0.6
                      }}
                      onClick={handleAddNote}
                      disabled={!noteText.trim() || addingNote}
                    >
                      <Send size={13} />
                      {addingNote ? 'Đang gửi…' : 'Gửi ghi chú'}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </section>

          {/* RIGHT SPLITTER */}
          <div
            className="cd-split"
            data-side="r"
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={(e) => handleSplitterPointerDown('r', e)}
          />

          {/* ── RIGHT COLUMN ── */}
          <aside className="cd-col right">
            {/* Assignee Field */}
            <div className="cd-field">
              <label>NGƯỜI PHỤ TRÁCH</label>
              <div className="cd-assignee">
                {isAssigned ? (
                  <>
                    <span className="cd-avatar">
                      {caseData.assigned_to.charAt(0).toUpperCase()}
                    </span>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>
                      {caseData.assigned_to}
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className="cd-avatar"
                      style={{
                        background: 'var(--panel2, rgba(255, 255, 255, 0.06))',
                        color: 'var(--muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <User size={13} />
                    </span>
                    <span style={{ fontStyle: 'italic', color: 'var(--muted)', fontSize: 13 }}>
                      Chưa phân công
                    </span>
                  </>
                )}
                <button
                  className="cd-assignee-link"
                  onClick={handleAssignToMe}
                  disabled={savingAssign}
                >
                  {savingAssign ? 'Đang gán…' : 'Gán cho tôi'}
                </button>
              </div>
            </div>

            {/* Status Dropdown */}
            <div className="cd-field">
              <label htmlFor="case-status-select">TRẠNG THÁI</label>
              <select
                id="case-status-select"
                className="soc-select cd-status-select"
                value={caseData.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={savingStatus}
              >
                <option value="new">Mới (New)</option>
                <option value="progress">Đang xử lý (In Progress)</option>
                <option value="pending">Chờ (Pending)</option>
                <option value="closed" disabled={!isAssigned}>
                  Đóng (Closed){!isAssigned ? ' - Cần phân công' : ''}
                </option>
              </select>
            </div>

            {/* Severity Field */}
            <div className="cd-field">
              <label>MỨC ĐỘ</label>
              <div style={{ marginTop: 4 }}>
                <SeverityBadge value={severity} />
              </div>
            </div>

            {/* Related Agent Info */}
            <h3 className="cd-sec">Máy agent liên quan</h3>
            {agent ? (
              <div className="cd-agent-card">
                <div className="cd-hd">
                  <span
                    className={`cd-dot${agent.status === 'offline' ? ' offline' : ''}`}
                  />
                  <span>{agent.name || agent.hostname || 'Agent Unknown'}</span>
                </div>
                <dl>
                  <dt>Agent ID</dt>
                  <dd className="mono">{agent.id || '—'}</dd>
                  <dt>IP</dt>
                  <dd className="mono">{agent.ip || '—'}</dd>
                  {agent.os && (
                    <>
                      <dt>OS</dt>
                      <dd>{agent.os}</dd>
                    </>
                  )}
                  <dt>Trạng thái</dt>
                  <dd style={{ textTransform: 'capitalize' }}>{agent.status || 'Active'}</dd>
                  {agent.last_seen && (
                    <>
                      <dt>Lần cuối</dt>
                      <dd>{ago(agent.last_seen)}</dd>
                    </>
                  )}
                </dl>
                <button
                  className="cd-btn"
                  style={{ width: '100%', marginTop: 10, fontSize: 12 }}
                  onClick={() => navigate('/agents')}
                >
                  <ExternalLink size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                  Xem chi tiết agent
                </button>
              </div>
            ) : (
              <div
                style={{
                  border: '1px dashed var(--bdr)',
                  borderRadius: 8,
                  padding: '12px',
                  fontSize: 12,
                  color: 'var(--muted)',
                  marginBottom: 16,
                  textAlign: 'center'
                }}
              >
                Không có agent liên quan trực tiếp
              </div>
            )}

            {/* MITRE ATT&CK */}
            <h3 className="cd-sec">MITRE ATT&amp;CK</h3>
            <div className="cd-chips cd-field">
              {mitreTechniques.length > 0 ? (
                mitreTechniques.map((m, idx) => (
                  <span className="cd-tag" key={idx} style={{ color: 'var(--primary)' }}>
                    {m}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
              )}
            </div>

            {/* Stage & Category */}
            {(stage || category) && (
              <div style={{ marginBottom: 16 }}>
                <h3 className="cd-sec">ATT&amp;CK Context</h3>
                <div style={{ fontSize: 12, display: 'grid', gap: 4 }}>
                  {stage && (
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Stage: </span>
                      <b>{stage}</b>
                    </div>
                  )}
                  {category && (
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Category: </span>
                      <b>{category}</b>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tags */}
            <h3 className="cd-sec">Tags</h3>
            <div className="cd-chips">
              {tags.map((t, idx) => (
                <span className="cd-tag" key={idx}>
                  {t.toLowerCase()}
                </span>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  )
}
