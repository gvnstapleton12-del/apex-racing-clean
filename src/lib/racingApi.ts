import type { Race } from './types'
import { validateRaces } from './validate'
import { validateRacecards } from './schemas'
import { apiUrl } from './api'

export async function fetchRacecards(): Promise<Race[]> {
  try {
    const response = await fetch(apiUrl('/api/live-state'))
    const data = await response.json()
    const raw = data.racecards || []
    const result = validateRacecards(raw)
    if (!result.success) {
      console.warn('Zod validation failed:', result.error.message)
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
      console.warn('Zod validation failed:', result.error.message)
      const { valid } = validateRaces(raw)
      return valid
    }
    return result.data
  } catch (error) {
    console.error('Failed to fetch results:', error)
    return []
  }
}
