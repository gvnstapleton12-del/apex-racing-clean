import type { Race } from './types'
import { validateRaces } from './validate'

export async function fetchRacecards(): Promise<Race[]> {
  try {
    const response = await fetch('/api/live-state')
    const data = await response.json()
    const raw = data.racecards || []
    const { valid } = validateRaces(raw)
    return valid
  } catch (error) {
    console.error('Failed to fetch racecards:', error)
    return []
  }
}

export async function fetchResults(): Promise<Race[]> {
  try {
    const response = await fetch('/api/results')
    const data = await response.json()
    const raw = Array.isArray(data) ? data : []
    const { valid } = validateRaces(raw)
    return valid
  } catch (error) {
    console.error('Failed to fetch results:', error)
    return []
  }
}
