import client from './client'

export const getVulns = (params = {}) => client.get('/api/v1/vulnerabilities', { params })
