// src/pages/LoginPage.jsx
import { Lock, Shield, User } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { login } from '../services/api';

export default function LoginPage() {
  const { loginContext, addToast } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    
    setLoading(true);
    try {
      const data = await login(username, password);
      loginContext(data.user, data.token);
      addToast({ severity: 'success', title: 'Authentication Successful', message: 'Welcome to SOC/EDR Console.' });
    } catch (err) {
      addToast({ severity: 'critical', title: 'Access Denied', message: err.message || 'Invalid credentials' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center relative overflow-hidden" style={{ background: '#0a0e17' }}>
      
      {/* Background decorations */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-[120px]" style={{ background: 'rgba(6, 182, 212, 0.15)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-[120px]" style={{ background: 'rgba(59, 130, 246, 0.15)' }} />

      <div className="z-10 w-full max-w-md p-8 rounded-3xl shadow-2xl animate-fade-in"
        style={{
          background: 'linear-gradient(145deg, rgba(17,24,39,0.9) 0%, rgba(10,14,23,0.95) 100%)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(6,182,212,0.2)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 40px rgba(6,182,212,0.1)'
        }}
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', boxShadow: '0 0 20px rgba(6,182,212,0.2)' }}>
            <Shield size={32} style={{ color: '#06b6d4' }} />
          </div>
          <h1 className="text-2xl font-bold tracking-wide" style={{ color: '#f8fafc' }}>SOC / EDR Console</h1>
          <p className="text-sm mt-2 font-mono" style={{ color: '#06b6d4', letterSpacing: '0.1em' }}>ZERO-TRUST SECURITY</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>Username</label>
            <div className="relative">
              <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#475569' }} />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="analyst / admin"
                className="w-full rounded-xl outline-none font-mono text-sm transition-all"
                style={{
                  background: 'rgba(5,8,14,0.5)', border: '1px solid #1e293b',
                  color: '#f8fafc', padding: '12px 16px 12px 42px'
                }}
                onFocus={(e) => e.target.style.borderColor = '#06b6d4'}
                onBlur={(e) => e.target.style.borderColor = '#1e293b'}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#475569' }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl outline-none font-mono text-sm transition-all"
                style={{
                  background: 'rgba(5,8,14,0.5)', border: '1px solid #1e293b',
                  color: '#f8fafc', padding: '12px 16px 12px 42px'
                }}
                onFocus={(e) => e.target.style.borderColor = '#06b6d4'}
                onBlur={(e) => e.target.style.borderColor = '#1e293b'}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3.5 rounded-xl font-bold tracking-wide transition-all relative overflow-hidden"
            style={{
              background: loading ? '#1e293b' : 'linear-gradient(135deg, #06b6d4, #3b82f6)',
              color: loading ? '#64748b' : '#f8fafc',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 8px 25px -5px rgba(6,182,212,0.4)',
            }}
          >
            {loading ? 'AUTHENTICATING...' : 'SECURE LOGIN'}
          </button>
        </form>

        <div className="mt-8 text-center border-t pt-5" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
          <p className="text-[10px] font-mono" style={{ color: '#475569' }}>
            UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED AND MONITORED.
          </p>
        </div>
      </div>
    </div>
  );
}
