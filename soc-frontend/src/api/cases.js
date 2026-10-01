import client from './client'

export const getCases = (params = {}) =>
  client.get('/api/v1/cases', { params })

export const getCaseById = (id) =>
  client.get(`/api/v1/cases/${id}`)

export const createCase = (data) =>
  client.post('/api/v1/cases', data)

export const updateCaseStatus = (id, status) =>
  client.patch(`/api/v1/cases/${id}/status`, { status })

export const assignCase = (id, assigned_to) =>
  client.patch(`/api/v1/cases/${id}/assign`, { assigned_to })

export const addCaseNote = (id, note) =>
  client.post(`/api/v1/cases/${id}/notes`, { note })
