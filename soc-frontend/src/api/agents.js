import client from './client'

export const getAgents = (params = {}) =>
  client.get('/api/v1/agents', { params })

export const getOnlineAgentIds = () =>
  client.get('/api/v1/agents/online-ids')

export const killProcess = (agentId, pid) =>
  client.post(`/api/v1/agents/${agentId}/response/kill-process`, { pid })

export const blockIP = (agentId, ip) =>
  client.post(`/api/v1/agents/${agentId}/response/block-ip`, { ip })

export const blockURL = (agentId, url) =>
  client.post(`/api/v1/agents/${agentId}/response/block-url`, { url })

export const quarantineFile = (agentId, path) =>
  client.post(`/api/v1/agents/${agentId}/response/quarantine-file`, { path })

export const isolateNetwork = (agentId, reason = '') =>
  client.post(`/api/v1/agents/${agentId}/response/isolate-network`, { reason })
