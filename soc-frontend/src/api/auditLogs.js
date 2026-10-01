import client from './client'

export const getAuditLogs = (params = {}) =>
  client.get('/api/v1/audit-logs', { params })
