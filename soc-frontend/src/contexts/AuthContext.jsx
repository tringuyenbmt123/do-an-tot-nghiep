// ==============================================================
// src/contexts/AuthContext.jsx
// JWT stored in memory only (no localStorage)
// ==============================================================
import React, { createContext, useContext, useState, useCallback } from 'react'
import { setToken, clearToken } from '../api/client'
import * as authApi from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('soc_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(false)

  const login = useCallback(async (username, password) => {
    setLoading(true)
    try {
      const res = await authApi.login(username, password)
      const { token, user: userData } = res.data
      setToken(token)
      localStorage.setItem('soc_user', JSON.stringify(userData))
      setUser(userData)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    clearToken()
    localStorage.removeItem('soc_user')
    setUser(null)
  }, [])

  const isAdmin = user?.role === 'admin'
  const isAnalyst = user?.role === 'analyst' || isAdmin
  const isAuthenticated = !!user

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isAnalyst, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
