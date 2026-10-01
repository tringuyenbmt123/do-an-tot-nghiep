import client from './client'

export const getRules = () =>
  client.get('/api/v1/rules')

export const createRule = (data) =>
  client.post('/api/v1/rules', data)

export const updateRule = (id, data) =>
  client.put(`/api/v1/rules/${id}`, data)

export const toggleRule = (id, is_active) =>
  client.patch(`/api/v1/rules/${id}/toggle`, { is_active })

export const deleteRule = (id) =>
  client.delete(`/api/v1/rules/${id}`)
