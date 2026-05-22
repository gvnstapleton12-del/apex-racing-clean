const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.PROD)
  ? 'https://apex-racing-clean-production.up.railway.app'
  : ''

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
