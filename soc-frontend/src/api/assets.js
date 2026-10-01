import client from './client'

export const getAssets = (params = {}) => client.get('/api/v1/assets', { params })
