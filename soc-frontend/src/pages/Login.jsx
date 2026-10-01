// ==============================================================
// src/pages/Login.jsx
// ==============================================================
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Shield, Loader } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState({})
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const validate = () => {
    const e = {}
    if (!form.username.trim()) e.username = 'Vui lòng nhập tên đăng nhập'
    if (!form.password)        e.password = 'Vui lòng nhập mật khẩu'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    const res = await login(form.username.trim(), form.password)
    if (res.ok) {
      toast.success('Đăng nhập thành công!')
      navigate('/')
    } else {
      toast.error(res.error || 'Sai tên đăng nhập hoặc mật khẩu')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      {/* Background pattern */}
      <div style={{
        position: 'fixed', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none'
      }}>
        <div style={{
          position: 'absolute',
          width: 600, height: 600,
          top: -200, left: -200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(88,166,255,.07) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute',
          width: 400, height: 400,
          bottom: -100, right: -100,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(248,81,73,.07) 0%, transparent 70%)',
        }} />
      </div>

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 400,
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        padding: '40px 36px',
        boxShadow: 'var(--shadow-lg)',
        animation: 'slideUp .3s',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56,
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(88,166,255,.3)',
          }}>
            <Shield size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>SOC Console</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Trung tâm Giám sát An ninh</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Username */}
          <div className="form-group">
            <label htmlFor="username">Tên đăng nhập</label>
            <input
              id="username"
              type="text"
              className="soc-input"
              placeholder="admin"
              autoComplete="username"
              value={form.username}
              onChange={e => { setForm(f => ({ ...f, username: e.target.value })); setErrors(v => ({ ...v, username: '' })) }}
              style={errors.username ? { borderColor: 'var(--crit)' } : {}}
            />
            {errors.username && (
              <p style={{ color: 'var(--crit)', fontSize: 12, marginTop: 4 }}>{errors.username}</p>
            )}
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="password">Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={show ? 'text' : 'password'}
                className="soc-input"
                placeholder="••••••••"
                autoComplete="current-password"
                value={form.password}
                onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setErrors(v => ({ ...v, password: '' })) }}
                style={{ paddingRight: 40, ...(errors.password ? { borderColor: 'var(--crit)' } : {}) }}
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                style={{
                  position: 'absolute', right: 10, top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: 2,
                }}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <p style={{ color: 'var(--crit)', fontSize: 12, marginTop: 4 }}>{errors.password}</p>
            )}
          </div>

          <button
            type="submit"
            className="b1"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 8, fontSize: 15 }}
          >
            {loading ? <><Loader size={16} style={{ animation: 'spin .7s linear infinite' }} /> Đang đăng nhập…</> : 'Đăng nhập'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 24 }}>
          Demo: <code style={{ color: 'var(--accent)' }}>admin</code> / <code style={{ color: 'var(--accent)' }}>admin123</code>
        </p>
      </div>
    </div>
  )
}
