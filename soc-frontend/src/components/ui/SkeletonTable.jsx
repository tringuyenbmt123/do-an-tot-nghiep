// ==============================================================
// src/components/ui/SkeletonTable.jsx
// ==============================================================
import React from 'react'

export default function SkeletonTable({ cols = 5, rows = 8 }) {
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <div className="skeleton" style={{ height: 12, width: '70%', borderRadius: 3 }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <div
                    className="skeleton"
                    style={{ height: 14, width: `${50 + Math.random() * 40}%`, borderRadius: 3 }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
