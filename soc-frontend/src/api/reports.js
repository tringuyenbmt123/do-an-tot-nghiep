import client from './client'

export const getReports = (params = {}) => client.get('/api/v1/reports', { params })
export const getReportSchedules = () => client.get('/api/v1/reports/schedules')
