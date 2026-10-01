import client from './client'

export const getPlaybooks = (params = {}) => client.get('/api/v1/playbooks', { params })
export const getPlaybookRuns = (params = {}) => client.get('/api/v1/playbooks/runs', { params })
