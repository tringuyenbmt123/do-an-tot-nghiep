import client from './client'

export const getAlerts = (params = {}) =>
  client.get('/api/v1/alerts', { params })

export const getAlertById = (id) =>
  client.get(`/api/v1/alerts/${id}`)

export const updateAlertStatus = (id, data) =>
  client.patch(`/api/v1/alerts/${id}/status`, data)

export const escalateAlert = (id, data = {}) =>
  client.post(`/api/v1/alerts/${id}/escalate`, data)

export const dispatchToSOAR = (id) =>
  client.post(`/api/v1/alerts/${id}/soar`)
