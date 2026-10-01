// ==============================================================
// src/pages/MITRE.jsx
// ==============================================================
import React, { useState, useEffect, useCallback } from 'react'
import { Grid, RefreshCw } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import { getMitreCoverage } from '../api/mitre'

export default function MITRE() {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getMitreCoverage()
      setData(res.data?.data || [])
    } catch (e) {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Layout title="MITRE ATT&CK">
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><Grid size={20} /></div>
          <div>
            <h1>MITRE ATT&CK Coverage</h1>
            <p>Ma trận độ phủ phát hiện theo framework MITRE</p>
          </div>
        </div>
        <div className="act">
          <button className="b2" onClick={load} disabled={loading}><RefreshCw size={15} /> Làm mới</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <SkeletonTable cols={4} rows={6} />
        ) : (
          <div className="grid-4">
            {/* Very simplified view just mapping tactics to columns */}
            {['Initial Access', 'Execution', 'Persistence', 'Defense Evasion'].map(tactic => {
              const tacticsData = data.filter(d => d.tactic === tactic)
              return (
                <div key={tactic} style={{ background: 'var(--panel2)', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{tactic}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {tacticsData.length === 0 ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>Không có kỹ thuật</span> : null}
                    {tacticsData.map(t => (
                      <div key={t.id} style={{
                        padding: '6px 10px', fontSize: 12, background: 'var(--panel)',
                        border: '1px solid var(--line)', borderRadius: 4,
                        borderLeft: t.hits > 0 ? '3px solid var(--ok)' : '3px solid var(--crit)'
                      }}>
                        <div style={{ fontWeight: 600 }}>{t.id}</div>
                        <div style={{ color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
