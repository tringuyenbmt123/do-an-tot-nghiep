import client from './client'

export const getSiemEvents = (params = {}) => client.get('/api/v1/siem/events', { params })
