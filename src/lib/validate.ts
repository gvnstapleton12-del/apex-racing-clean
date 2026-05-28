import type { Race, Runner } from './types'

interface ValidationResult<T> {
  valid: T[]
  invalid: { item: unknown; reason: string }[]
}

export function validateRace(raw: unknown): Race | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!r.course || !r.race_name || !r.off_time) {
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
  let skipped = 0
  for (const item of raw) {
    const race = validateRace(item)
    if (race) {
      race.runners = (race.runners || []).map(validateRunner).filter(Boolean) as Runner[]
      valid.push(race)
    } else {
      skipped++
    }
  }
  if (skipped > 0) {
    console.warn(`[validate] Filtered out ${skipped} malformed race(s)`)
  }
  return { valid, invalid }
}

export function validateResults(raw: unknown[]): ValidationResult<Race> {
  return validateRaces(raw)
}

export function validateRaceData(race: Race): { valid: boolean; issues: string[] } {
  const issues: string[] = []
  if (!race.field_size || race.field_size < 3) issues.push(`field_size=${race.field_size} (expected ≥3)`)
  if (!race.runners || race.runners.length < 2) issues.push(`runners=${race.runners?.length || 0} (expected ≥2)`)
  if (!race.off_time) issues.push('missing off_time')
  if (!race.course) issues.push('missing course')
  if (!race.race_name) issues.push('missing race_name')
  if (race.race_class !== undefined && (isNaN(Number(race.race_class)) || Number(race.race_class) < 1)) issues.push(`race_class=${race.race_class} out of range`)
  for (const r of race.runners || []) {
    if (r.odds !== undefined && r.odds !== null && (isNaN(Number(r.odds)) || Number(r.odds) < 1)) issues.push(`runner ${r.horse} odds=${r.odds}`)
    if (r.position !== undefined && r.position !== null && (isNaN(Number(r.position)) || Number(r.position) < 0)) issues.push(`runner ${r.horse} position=${r.position}`)
  }
  return { valid: issues.length === 0, issues }
}

export function validateRaceDataBatch(races: Race[]): { passed: Race[]; quarantined: { race: Race; issues: string[] }[] } {
  const passed: Race[] = []
  const quarantined: { race: Race; issues: string[] }[] = []
  for (const race of races) {
    const { valid, issues } = validateRaceData(race)
    if (valid) passed.push(race)
    else quarantined.push({ race, issues })
  }
  if (quarantined.length > 0) {
    console.warn(`[validate] Quarantined ${quarantined.length}/${races.length} races with data issues`)
  }
  return { passed, quarantined }
}
