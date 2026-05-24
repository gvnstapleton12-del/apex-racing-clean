import type { Race, Runner } from './types'
import { formatOffTime } from './formatTime'

export function getScore(runner: Runner): number {
  return runner.score ?? runner.finalScore ?? runner.aiProfile?.confidence ?? 0
}

export function sortByScore(runners: Runner[]): Runner[] {
  return [...runners].sort((a, b) => getScore(b) - getScore(a))
}

export function findTopRated(runners: Runner[]): Runner | undefined {
  return sortByScore(runners)[0]
}

export function filterGBIRE(races: Race[]): Race[] {
  return races.filter((r) => {
    const region = r.region?.toUpperCase()
    return region === 'GB' || region === 'IRE'
  })
}

export function filterMinRunners(races: Race[], min = 5): Race[] {
  return races.filter((r) => (r.runners?.length || 0) >= min)
}

export function filterToday(races: Race[]): Race[] {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  return races.filter((race) => {
    const raceDate = race.date ?? (race.off_dt ? race.off_dt.slice(0, 10) : null)
    if (raceDate !== todayStr) return false
    if (race.off_dt) return new Date(race.off_dt) > now
    return true
  })
}

export function sortByOffTime(races: Race[]): Race[] {
  return [...races].sort((a, b) => {
    const aTime = a.off_dt || a.off_time || ''
    const bTime = b.off_dt || b.off_time || ''
    return aTime < bTime ? -1 : aTime > bTime ? 1 : 0
  })
}

export function scoreRunners(runners: Runner[]): Runner[] {
  return runners.map((runner) => ({
    ...runner,
    score: getScore(runner),
  }))
}

export function deduplicateRaces(races: Race[]): Race[] {
  const seen = new Set<string>()
  return races.filter((race) => {
    const key = race.race_id ?? `${race.course}-${race.off_time || '?'}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function getGrade(score: number): string {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B+'
  if (score >= 60) return 'B'
  if (score >= 50) return 'C+'
  if (score >= 40) return 'C'
  if (score >= 30) return 'D'
  return 'E'
}

export function getScoreColor(value: number): string {
  if (value >= 65) return 'text-green-400'
  if (value >= 50) return 'text-amber-400'
  return 'text-red-400'
}

export function getConfidenceLabel(score: number): string {
  if (score >= 80) return 'Elite'
  if (score >= 60) return 'Strong'
  if (score >= 40) return 'Moderate'
  return 'Weak'
}

export function countRunners(races: Race[]): number {
  return races.reduce((total, race) => total + (race.runners?.length || 0), 0)
}

const gradeMap: Record<string, string> = {
  'High Probability': 'a-plus',
  'Medium-High': 'a',
  'Medium': 'b',
  'Low': 'c-plus',
  'Very Low': 'c',
  'Elite': 'a-plus',
  'Strong': 'a',
  'Playable': 'b',
  'Speculative': 'c-plus',
  'Avoid': 'c',
  'A+': 'a-plus',
  'A': 'a',
  'B': 'b',
  'C+': 'c-plus',
  'C': 'c',
}

export function gradeClass(label: string): string {
  return gradeMap[label] || 'c'
}

export function resultLabel(result: string | null | undefined, position?: number) {
  if (!result) return null
  if (result === 'won') return { text: 'WON', cls: 'won' }
  if (result === 'placed') return { text: 'P', cls: 'placed' }
  if (result === 'nr') return { text: 'NR', cls: 'nr' }
  if (result === 'lost') return { text: 'LOST', cls: 'lost' }
  return null
}

function parseField(val: any) {
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return null }
  }
  return val
}

export function formatSelection(race: Race, runner: Runner) {
  const betFilter = race.betFilter || {}
  const isSkipped = betFilter.verdict === 'AUTO SKIP'
  if (isSkipped) return null
  const ct = parseField(runner.confidenceTier) || {}
  const tier = ct.tier
  if (tier === 'D' && (runner.valueEngine?.edge ?? 0) > 0) return null
  const be = parseField(runner.bankrollEngine) || {}
  const bankrollLabel = be.label || ''
  if (bankrollLabel === 'AVOID') return null
  const ve = parseField(runner.valueEngine) || {}
  return {
    ...runner,
    race,
    raceName: race.race_name,
    course: race.course,
    offTime: formatOffTime(race),
    score: getScore(runner),
    probBand: runner.probBand || ct.label || runner.aiProfile?.grade || '',
    probRange: runner.probRange || '',
    winProb: runner.winProb || null,
    placeProb: runner.placeProb || null,
    valueEdge: ve.edge || 0,
    confidenceTier: ct.tier || 'B',
    betFilterVerdict: betFilter.verdict || 'BETTABLE',
    selectionQuality: runner.selectionQuality,
  } as const
}

export function getHomeSelections(races: Race[]) {
  return races
    .flatMap((race) =>
      (race.runners || [])
        .map((runner) => formatSelection(race, runner))
        .filter(Boolean)
    )
    .sort((a: any, b: any) => {
      const tierOrder: Record<string, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 }
      const tierDiff = (tierOrder[b.confidenceTier] || 0) - (tierOrder[a.confidenceTier] || 0)
      if (tierDiff !== 0) return tierDiff
      const edgeDiff = (b.valueEdge || 0) - (a.valueEdge || 0)
      if (Math.abs(edgeDiff) > 0.5) return edgeDiff
      return (b.score || 0) - (a.score || 0)
    })
}
