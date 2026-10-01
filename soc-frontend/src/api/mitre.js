import client from './client'

export const getMitreCoverage = () => client.get('/api/v1/mitre/coverage')
