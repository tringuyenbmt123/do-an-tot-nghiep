import client from './client'

export const getSettings = () =>
  client.get('/api/v1/settings')

export const updateSettings = (data) =>
  client.put('/api/v1/settings', data)
