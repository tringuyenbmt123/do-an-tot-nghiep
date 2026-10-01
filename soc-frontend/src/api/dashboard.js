import client from './client'

export const getDashboardStats = () =>
  client.get('/api/v1/dashboard/stats')
