import client from './client'

export const getFwRules = (params = {}) => client.get('/api/v1/firewall/rules', { params })
export const getIdsEvents = (params = {}) => client.get('/api/v1/firewall/ids', { params })
export const getBlocklist = (params = {}) => client.get('/api/v1/firewall/blocklist', { params })
