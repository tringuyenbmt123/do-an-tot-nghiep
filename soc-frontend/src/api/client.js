// ==============================================================
// src/api/client.js - Axios instance with JWT interceptors
// ==============================================================
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// Token store with localStorage persistence
let _token = localStorage.getItem('soc_token') || null

export const setToken = (token) => {
  _token = token
  if (token) {
    localStorage.setItem('soc_token', token)
  } else {
    localStorage.removeItem('soc_token')
  }
}
export const getToken = () => _token
export const clearToken = () => {
  _token = null
  localStorage.removeItem('soc_token')
  localStorage.removeItem('soc_user')
}

// Request interceptor – đính JWT header
client.interceptors.request.use((config) => {
  if (_token) {
    config.headers['Authorization'] = `Bearer ${_token}`
  }
  return config
})

// Response interceptor – xử lý lỗi
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearToken()
      // Redirect về login
      window.location.href = '/login'
    }
    // Chuẩn hóa thông báo lỗi tiếng Việt
    const msg =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      'Lỗi kết nối máy chủ'
    return Promise.reject(new Error(msg))
  },
)

export default client
