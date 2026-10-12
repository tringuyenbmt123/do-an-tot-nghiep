import client from './client'

export const getPlaybooks = (params = {}) => client.get('/api/v1/playbooks', { params })
export const getPlaybookRuns = (params = {}) => client.get('/api/v1/playbooks/runs', { params })
export const runPlaybook = (id) => client.post(`/api/v1/playbooks/${id}/run`)
export const createPlaybook = (data) => client.post('/api/v1/playbooks', data)
export const importN8nPlaybook = (formData) =>
  client.post('/api/v1/playbooks/import-n8n', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
export const deletePlaybook = (id) => client.delete(`/api/v1/playbooks/${id}`)
export const togglePlaybook = (id) => client.patch(`/api/v1/playbooks/${id}/toggle`)
