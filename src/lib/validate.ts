import type { Race, Runner } from './types'

interface ValidationResult<T> {
  valid: T[]
  invalid: { item: unknown; reason: string }[]
}

export function validateRace(raw: unknown): Race | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!r.course || !r.race_name || !r.off_time) {
    console.warn('[validate] Skipped race: missing required fields', r.course || r.race_name || '(unknown)')
    return null
  }
  return r as Race
}

export function validateRunner(raw: unknown): Runner | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!r.horse) return null
  return r as Runner
}

export function validateRaces(raw: unknown[]): ValidationResult<Race> {
  const valid: Race[] = []
  const invalid: { item: unknown; reason: string }[] = []
  for (const item of raw) {
    const race = validateRace(item)
    if (race) {
      race.runners = (race.runners || []).map(validateRunner).filter(Boolean) as Runner[]
      valid.push(race)
    } else {
      invalid.push({ item, reason: 'Missing required fields (course, race_name, off_time)' })
    }
  }
  if (invalid.length > 0) {
    console.warn(`[validate] Filtered out ${invalid.length} malformed race(s)`)
  }
  return { valid, invalid }
}

export function validateResults(raw: unknown[]): ValidationResult<Race> {
  return validateRaces(raw)
}
