import client from './client'

export const getIndicators = (params = {}) =>
  client.get('/api/v1/indicators', { params })

export const createIndicator = (data) =>
  client.post('/api/v1/indicators', data)

export const updateIndicator = (id, data) =>
  client.put(`/api/v1/indicators/${id}`, data)

export const deleteIndicator = (id) =>
  client.delete(`/api/v1/indicators/${id}`)

export const analyzeIOC = (data) =>
  client.post('/api/v1/indicators/analyze', data)
