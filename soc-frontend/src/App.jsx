// ==============================================================
// src/App.jsx
// Main application router and context providers
// ==============================================================
import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { WebSocketProvider } from './contexts/WebSocketContext'


// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import Cases from './pages/Cases'
import Agents from './pages/Agents'
import ThreatIntel from './pages/ThreatIntel'
import DetectionRules from './pages/DetectionRules'
import AuditSettings from './pages/AuditSettings'
import SIEM from './pages/SIEM'
import MITRE from './pages/MITRE'
import Vulns from './pages/Vulns'
import Assets from './pages/Assets'
import Firewall from './pages/Firewall'
import Playbooks from './pages/Playbooks'
import Reports from './pages/Reports'

// Route Guard
function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Đang kiểm tra phiên đăng nhập...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <WebSocketProvider>
            <BrowserRouter>
              <Routes>
                {/* Public Route */}
                <Route path="/login" element={<Login />} />

                {/* Private Routes */}
                <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
                <Route path="/alerts" element={<PrivateRoute><Alerts /></PrivateRoute>} />
                <Route path="/cases" element={<PrivateRoute><Cases /></PrivateRoute>} />
                <Route path="/agents" element={<PrivateRoute><Agents /></PrivateRoute>} />
                <Route path="/intel" element={<PrivateRoute><ThreatIntel /></PrivateRoute>} />
                <Route path="/rules" element={<PrivateRoute><DetectionRules /></PrivateRoute>} />
                <Route path="/audit" element={<PrivateRoute><AuditSettings /></PrivateRoute>} />
                <Route path="/siem" element={<PrivateRoute><SIEM /></PrivateRoute>} />
                <Route path="/mitre" element={<PrivateRoute><MITRE /></PrivateRoute>} />
                <Route path="/vulns" element={<PrivateRoute><Vulns /></PrivateRoute>} />
                <Route path="/assets" element={<PrivateRoute><Assets /></PrivateRoute>} />
                <Route path="/firewall" element={<PrivateRoute><Firewall /></PrivateRoute>} />
                <Route path="/playbooks" element={<PrivateRoute><Playbooks /></PrivateRoute>} />
                <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </WebSocketProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
