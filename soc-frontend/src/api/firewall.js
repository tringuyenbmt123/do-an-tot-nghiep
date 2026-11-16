import client from './client'

export const getBlocklist    = (params = {}) => client.get('/api/v1/firewall/blocklist',  { params })
export const unblockIp       = (ip, table, password, reason = '') =>
  client.post('/api/v1/firewall/blocklist/unblock', { ip, table, password, reason })
export const getBlockedDomains = ()          => client.get('/api/v1/firewall/domains')
export const unblockDomain   = (domain, password, reason = '') =>
  client.post('/api/v1/firewall/domains/unblock', { domain, password, reason })
export const runSshCommand   = (command, confirm = false) =>
  client.post('/api/v1/firewall/ssh', { command, confirm })
