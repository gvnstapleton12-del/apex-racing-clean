const API_BASE = ''

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
