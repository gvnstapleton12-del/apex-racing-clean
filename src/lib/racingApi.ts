import type { Race } from './types'
import { validateRaces } from './validate'
import { validateRacecards } from './schemas'
import { apiUrl } from './api'

export interface LiveState {
  racecards: Race[]
  loading: boolean
  processingComplete: boolean
  atrLoading: boolean
  updatedAt: string | null
}

export async function fetchLiveState(): Promise<LiveState> {
  const response = await fetch(apiUrl('/api/live-state'))
  if (!response.ok) throw new Error(`live-state ${response.status}`)
  const data = await response.json()
  const raw = data.racecards || []
  const result = validateRacecards(raw)
  const racecards = result.success ? result.data : (() => {
    console.warn(`Zod validation failed: ${result.error.issues.length} issues`)
    const { valid } = validateRaces(raw)
    return valid
  })()
  return {
    racecards,
    loading: !!data.loading,
    processingComplete: !!data.processingComplete,
    atrLoading: !!data.atrLoading,
    updatedAt: data.updatedAt || null,
  }
}

export async function fetchRacecards(): Promise<Race[]> {
  try {
    const response = await fetch(apiUrl('/api/live-state'))
    const data = await response.json()
    const raw = data.racecards || []
    const result = validateRacecards(raw)
    if (!result.success) {
      console.warn(`Zod validation failed: ${result.error.issues.length} issues (e.g. ${result.error.issues[0]?.path.join('.')}: ${result.error.issues[0]?.message})`)
      const { valid } = validateRaces(raw)
      return valid
    }
    return result.data
  } catch (error) {
    console.error('Failed to fetch racecards:', error)
    return []
  }
}

export async function fetchResults(): Promise<Race[]> {
  try {
    const response = await fetch(apiUrl('/api/results'))
    const data = await response.json()
    const raw = Array.isArray(data) ? data : []
    const result = validateRacecards(raw)
    if (!result.success) {
      console.warn(`Zod validation failed: ${result.error.issues.length} issues (e.g. ${result.error.issues[0]?.path.join('.')}: ${result.error.issues[0]?.message})`)
      const { valid } = validateRaces(raw)
      return valid
    }
    return result.data
  } catch (error) {
    console.error('Failed to fetch results:', error)
    return []
  }
}
