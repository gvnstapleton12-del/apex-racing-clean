import type { Race, Runner } from './types'
import { formatOffTime } from './formatTime'

// ============================================================
// CODE MATCH — detect if horse's form is in different race code
// ============================================================

const SL_RUN_TYPE_MAP: Record<string, string> = {
  FLAT: 'Flat',
  HURDLE: 'Hurdle',
  CHASE: 'Chase',
  N_H_FLAT: 'NH Flat',
  NH_FLAT: 'NH Flat',
}

function normalizeRaceType(raceType: string): string {
  const lower = raceType.toLowerCase()
  if (lower.includes('chase') || lower.includes('steeple')) return 'Chase'
  if (lower.includes('hurdle')) return 'Hurdle'
  if (lower.includes('nh flat') || lower.includes('national hunt flat') || lower.includes('bumper')) return 'NH Flat'
  return 'Flat'
}

function normalizeRunType(rt: string): string {
  return SL_RUN_TYPE_MAP[rt?.toUpperCase()] || 'Flat'
}

function isCodeCompatible(horseCode: string, raceCode: string): boolean {
  if (horseCode === raceCode) return true
  const jumps = ['Hurdle', 'Chase', 'NH Flat']
  if (jumps.includes(horseCode) && jumps.includes(raceCode)) return true
  return false
}

export function getCodeMatchScore(previousResults: any[], raceType: string): { score: number, label: string, matchedRuns: number, totalRuns: number, penalty: number } {
  if (!previousResults || previousResults.length === 0) {
    return { score: 0, label: 'No data', matchedRuns: 0, totalRuns: 0, penalty: -6 }
  }

  const raceCode = normalizeRaceType(raceType)
  const runs = previousResults.filter(r => r.run_type)
  if (runs.length === 0) return { score: 0, label: 'No data', matchedRuns: 0, totalRuns: 0, penalty: -6 }

  let matched = 0
  let wins = 0
  let winsInCode = 0

  for (const run of runs) {
    const runCode = normalizeRunType(run.run_type)
    if (isCodeCompatible(runCode, raceCode)) {
      matched++
      if (run.position === 1) {
        winsInCode++
        wins++
      }
    } else {
      if (run.position === 1) wins++
    }
  }

  const totalRuns = runs.length
  const matchRate = matched / totalRuns
  const winRateInCode = matched > 0 ? winsInCode / matched : 0

  let score: number
  let label: string
  let penalty: number

  if (matched >= 6) {
    score = 100
    label = 'Proven at code'
    penalty = 0
  } else if (matched >= 3) {
    score = 70
    label = 'Some code experience'
    penalty = -1
  } else if (matched >= 1) {
    score = 40
    label = 'Limited code experience'
    penalty = -3
  } else {
    score = 0
    label = 'No form at this code'
    penalty = -6
  }

  return { score, label, matchedRuns: matched, totalRuns, penalty }
}

// ============================================================
// PROBABILITY ENGINE — Five independent dimensions
// ============================================================

export interface HorseProfile {
  ability: number
  suitability: number
  paceAdvantage: number
  hiddenUpside: number
}

export interface ProbabilityEstimate {
  winProb: number
  placeProb: number
  fairOdds: number
  confidence: number
  edge: number
  kellyStake: number
  noBet: boolean
  noBetReason: string | null
}

export function calcAbility(runner: Runner): number {
  const c = runner.components
  const hm = runner.horseMemory
  
  // Use historical ability if available (horse memory)
  if (hm?.abilityScore) {
    return hm.abilityScore
  }
  
  // Fallback to components
  if (c?.ability) {
    return c.ability
  }
  
  // Final fallback to legacy score
  return getScore(runner)
}

export function calcSuitability(runner: Runner): number {
  const c = runner.components
  if (!c) return 50
  return c.suitability
}

export function calcPaceAdvantage(runner: Runner, race: Race): number {
  const paceCompat = runner.horseQuality?.paceCompat ?? 50
  const runningStyle = runner.runningStyle ?? ''
  const paceMap = race.paceMap
  const collapseRisk = paceMap?.collapseRisk ?? ''
  if (collapseRisk === 'HIGH' && runningStyle.includes('Front')) return paceCompat + 15
  if (collapseRisk === 'HIGH' && runningStyle.includes('Hold-up')) return paceCompat + 20
  if (runningStyle === 'Lone Front') return Math.min(paceCompat + 20, 100)
  return paceCompat
}

export function calcHiddenUpside(runner: Runner): number {
  let upsides = runner.components?.replay ?? 50
  const triggers = runner.replayTriggers ?? []
  const flags = runner.replayFlags ?? []
  const finishKick = runner.placeTraits?.finishingKick ?? 50
  const explosive = runner.placeTraits?.explosiveAbility ?? 50
  upsides += triggers.length * 5
  upsides += flags.filter(f => f.severity === 'high').length * 3
  upsides += (finishKick - 50) * 0.3
  upsides += (explosive - 50) * 0.2
  return Math.round(Math.min(Math.max(upsides, 0), 100))
}

export function buildHorseProfile(runner: Runner, race: Race): HorseProfile {
  return {
    ability: calcAbility(runner),
    suitability: calcSuitability(runner),
    paceAdvantage: calcPaceAdvantage(runner, race),
    hiddenUpside: calcHiddenUpside(runner),
  }
}

export function estimateWinProb(runner: Runner, race: Race): ProbabilityEstimate {
  let winProb: number
  let confidence: number
  let placeProb: number
  let fairOdds: number
  let marketOdds: number
  let edge: number

  const sq = runner.selectionQuality
  if (sq?.fairOdds && sq?.marketOdds) {
    fairOdds = parseOdds(sq.fairOdds)
    marketOdds = parseOdds(sq.marketOdds)
    winProb = fairOdds > 0 ? 1 / fairOdds : 0.01
    edge = marketOdds > 0 ? (winProb * marketOdds) - 1 : 0
    confidence = runner.aiProfile?.confidence ?? Math.min(Math.max(winProb * 4, 0.2), 0.85)
    placeProb = winProb * 2.5
  } else if (runner.winProb != null && runner.winProb > 0) {
    winProb = runner.winProb / 100
    fairOdds = winProb > 0 ? 1 / winProb : 100
    marketOdds = parseOdds(runner.odds)
    edge = marketOdds > 0 ? (winProb * marketOdds) - 1 : 0
    confidence = runner.aiProfile?.confidence ?? Math.min(Math.max(winProb * 4, 0.2), 0.85)
    placeProb = runner.placeProb != null ? runner.placeProb / 100 : winProb * 2.5
  } else {
    const profile = buildHorseProfile(runner, race)

    const weights = { ability: 0.38, suitability: 0.25, paceAdvantage: 0.29, hiddenUpside: 0.08 }
    const rawProb =
      (profile.ability / 100) * weights.ability +
      (profile.suitability / 100) * weights.suitability +
      (profile.paceAdvantage / 100) * weights.paceAdvantage +
      (profile.hiddenUpside / 100) * weights.hiddenUpside

    const fieldSize = race.runners?.length || 8
    const baseFieldProb = 1 / fieldSize
    winProb = Math.min(Math.max(rawProb, baseFieldProb * 0.2), baseFieldProb * 3)

    const sim = runner.simulation
    placeProb = sim?.placeRate != null ? sim.placeRate / 100 : winProb * 2.5

    const componentSpread = [
      profile.ability, profile.suitability,
      profile.paceAdvantage, profile.hiddenUpside,
    ]
    const avg = componentSpread.reduce((a, b) => a + b, 0) / componentSpread.length
    const variance = componentSpread.reduce((acc, v) => acc + (v - avg) ** 2, 0) / componentSpread.length
    confidence = Math.min(Math.max(1 - Math.sqrt(variance) / 50, 0.1), 0.95)
    fairOdds = winProb > 0 ? 1 / winProb : 100
    marketOdds = parseOdds(runner.odds)
    edge = marketOdds > 0 ? (winProb * marketOdds) - 1 : 0
  }

  const kellyFraction = confidence * edge * 0.25
  const kellyStake = kellyFraction > 0 ? Math.min(kellyFraction, 0.03) : 0

  const reasons: string[] = []
  if (winProb < 0.06) reasons.push('win probability too low')
  if (edge < -0.15) reasons.push('negative edge exceeds threshold')
  const noBet = reasons.length > 0 && (winProb < 0.06 || edge < -0.15)
  const simCollapse = runner.simulation?.collapseRate ?? 0
  if (simCollapse > 0.4 && !noBet) {
    reasons.push('high collapse rate in simulation')
  }

  return {
    winProb: Math.round(winProb * 10000) / 10000,
    placeProb: Math.round(Math.min(placeProb, 1) * 10000) / 10000,
    fairOdds: Math.round(fairOdds * 100) / 100,
    confidence: Math.round(confidence * 10000) / 10000,
    edge: Math.round(edge * 10000) / 10000,
    kellyStake: Math.round(kellyStake * 10000) / 10000,
    noBet,
    noBetReason: noBet ? reasons.join('; ') : null,
  }
}

// ============================================================
// LEGACY — kept for widget backward compat
// ============================================================

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
    return raceDate === todayStr
  })
}

export function filterUnfinished(races: Race[]): Race[] {
  const now = new Date()
  return races.filter((race) => {
    const runners = race.runners || []
    const hasResults = runners.some((r) => r.position && r.position > 0)
    if (hasResults) return false

    // Time-based fallback: if off_time was > 30 minutes ago, consider finished
    const offDt = race.off_dt || race.off_time
    if (offDt) {
      const offTime = new Date(offDt)
      const minutesSinceOff = (now.getTime() - offTime.getTime()) / 60000
      if (minutesSinceOff > 30) return false
    }

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
  const posText = position ? ` ${position}` : ''
  if (result === 'won') return { text: `WON${posText}`, cls: 'won' }
  if (result === 'placed') return { text: `${position || 'P'}${position ? getOrdinal(position) : ''}`, cls: 'placed' }
  if (result === 'nr') return { text: 'NR', cls: 'nr' }
  if (result === 'lost') return { text: `${position || 'L'}${position ? getOrdinal(position) : ''}`, cls: 'lost' }
  return null
}

function getOrdinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

function parseField(val: any) {
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return null }
  }
  return val
}

function parseOdds(odds?: string | number): number {
  if (odds == null) return 0
  if (typeof odds === 'number') return odds
  const parts = odds.split('/')
  if (parts.length === 2) {
    const num = parseFloat(parts[0])
    const den = parseFloat(parts[1])
    if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den + 1
  }
  const val = parseFloat(odds)
  return isNaN(val) ? 0 : val
}

// ============================================================
// SELECTION ENGINE — probability-first, tier-free
// ============================================================

export function formatSelection(race: Race, runner: Runner) {
  const betFilter = race.betFilter || {}
  if (betFilter.verdict === 'AUTO SKIP') return null

  const odds = parseOddsNum(runner.odds) || 0

  // Prefer server-computed values when available — avoids edge mismatch between pages
  let winProb: number
  let edge: number
  let fairOdds: number
  let placeProb: number
  let confidence: number

  if (runner.winProb != null && runner.winProb > 0) {
    winProb = runner.winProb / 100
    fairOdds = runner.fairOdds || (winProb > 0 ? 1 / winProb : 100)
    edge = odds > 0 ? (winProb * odds) - 1 : 0
    placeProb = runner.placeProb != null ? runner.placeProb / 100 : winProb * 2.5
    confidence = runner.confidenceScore ? runner.confidenceScore / 100 : Math.min(Math.max(winProb * 4, 0.2), 0.85)
  } else {
    const prob = estimateWinProb(runner, race)
    winProb = prob.winProb
    edge = prob.edge
    fairOdds = prob.fairOdds
    placeProb = prob.placeProb
    confidence = prob.confidence
  }

  const isFavourite = odds > 0 && odds <= 3.0
  const hasRating = (runner.or || 0) > 0 || (runner.rpr || 0) > 0

  const codeMatch = getCodeMatchScore(runner.previous_results || [], race.type || race.race_name || '')
  const codePenalty = 0 // Disabled as score modifier, kept for flags

  let betType: string | null = null
  if (winProb >= 0.10 && odds >= 5.0) {
    if (isFavourite && winProb >= 0.30) {
      betType = 'PLACE'
    } else if (edge > 0.05) {
      betType = 'WIN'
    } else if (isFavourite) {
      betType = 'PLACE'
    } else {
      betType = 'SPEC'
    }
  } else if (winProb >= 0.10 && odds >= 2.0) {
    // Below E/W threshold — WIN or SPEC only
    if (edge > 0.05) {
      betType = 'WIN'
    } else {
      betType = 'SPEC'
    }
  } else {
    betType = 'SPEC'
  }

  // PA modifier: downgrade weak PA (<2), upgrade strong PA (>=5)
  // PLACE/E/W requires odds >= 5.0 to be profitable (1/4 or 1/5 place terms)
  const paAdj = (runner as any).personalAffinity?.adjustment ?? 0
  if (paAdj < 2 && betType === 'WIN' && odds >= 5.0) betType = 'PLACE'
  if (paAdj <= 0 && betType === 'PLACE') betType = 'SPEC'
  if (paAdj >= 5 && betType === 'SPEC' && edge > 0) betType = 'WIN'
  if (paAdj >= 5 && betType === 'PLACE') betType = 'WIN'

  return {
    ...runner,
    race,
    race_id: race.race_id || null,
    raceName: race.race_name,
    course: race.course,
    offTime: formatOffTime(race),
    going: race.going || '',
    score: getScore(runner),
    winProb,
    placeProb,
    fairOdds,
    probConfidence: confidence,
    valueEdge: edge,
    kellyStake: confidence * Math.max(edge, 0) * 0.25,
    noBet: winProb < 0.06 || edge < -0.15 || odds < 2.0,
    noBetReason: winProb < 0.06 ? 'win probability too low' : edge < -0.15 ? 'negative edge exceeds threshold' : odds < 2.0 ? 'odds below evens — no value at short prices' : null,
    probBand: runner.probBand || '',
    probRange: runner.probRange || '',
    confidenceTier: '',
    betFilterVerdict: betFilter.verdict || 'BETTABLE',
    selectionQuality: runner.selectionQuality,
    odds: runner.odds,
    betType,
    hasRating,
    codeMatch,
  } as const
}

export function getHomeSelections(races: Race[]) {
  return races
    .flatMap((race) =>
      (race.runners || [])
        .map((runner) => formatSelection(race, runner))
        .filter(Boolean)
    )
    .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
}

export function calculateRaceVolatility(runners: Runner[]): number {
  if (!runners || runners.length === 0) return 0
  const scores = runners.map((r) => getScore(r))
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  const variance = scores.reduce((acc, score) => acc + Math.pow(score - avg, 2), 0) / scores.length
  return Math.round(Math.sqrt(variance))
}

export function getVolatilityLabel(volatility: number): { label: string; style: string } {
  if (volatility >= 15) return { label: 'High Chaos', style: 'text-red-400 border-red-500/20 bg-red-500/10' }
  if (volatility >= 8) return { label: 'Volatile', style: 'text-amber-400 border-amber-500/20 bg-amber-500/10' }
  return { label: 'Stable', style: 'text-green-400 border-green-500/20 bg-green-500/10' }
}

export function calculateValueIndex(score: number, odds: number): number {
  if (!odds || odds <= 0) return 0
  return Number(((score / odds) * 10).toFixed(1))
}

export function sortByValueIndex<T extends { valueIndex: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.valueIndex - a.valueIndex)
}

export function filterSmartMoney(runners: Runner[]): Runner[] {
  return runners.filter((runner) => {
    const odds = parseOddsNum(runner.odds)
    return odds !== null && odds <= 4 && getScore(runner) >= 80
  })
}

export function filterHiddenValue(runners: Runner[]): Runner[] {
  return runners.filter((runner) => {
    const odds = parseOddsNum(runner.odds)
    return odds !== null && odds >= 8 && getScore(runner) >= 75
  })
}

export function filterMarketMovers(runners: Runner[]): Runner[] {
  return runners.filter((runner) => {
    if (!runner.odds) return false
    const odds = parseOddsNum(runner.odds)
    return odds !== null && odds <= 5
  })
}

export function filterLiveAlerts(runners: Runner[]): Runner[] {
  return runners.filter((runner) => {
    const score = getScore(runner)
    const triggers = runner.replayTriggers || []
    return score >= 85 || triggers.length >= 2
  })
}

function parseOddsNum(odds?: string | number): number | null {
  if (odds == null || odds === '') return null
  if (typeof odds === 'number') return odds > 0 ? odds : null
  const str = String(odds)
  const parts = str.split('/')
  if (parts.length === 2) {
    const num = parseFloat(parts[0])
    const den = parseFloat(parts[1])
    if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den
  }
  const val = parseFloat(str)
  return isNaN(val) ? null : val
}

export function calculateAvgScore(runners: Runner[]): number {
  if (!runners.length) return 0
  return runners.reduce((acc, r) => acc + getScore(r), 0) / runners.length
}

export function calculateAvgOdds(runners: Runner[]): number {
  if (!runners.length) return 0
  const validOdds = runners.map((r) => parseOddsNum(r.odds)).filter((o): o is number => o !== null)
  if (!validOdds.length) return 0
  return validOdds.reduce((acc, o) => acc + o, 0) / validOdds.length
}

export function calculateRiskProfile(avgScore: number, avgOdds: number, bankroll: number): { risk: string; stake: number; style: string } {
  if (avgOdds >= 8 || avgScore < 70) {
    return { risk: 'High', stake: bankroll * 0.005, style: 'text-red-400 border-red-500/20 bg-red-500/10' }
  }
  if (avgOdds >= 5 || avgScore < 80) {
    return { risk: 'Medium', stake: bankroll * 0.0075, style: 'text-amber-300 border-amber-500/20 bg-amber-500/10' }
  }
  return { risk: 'Low', stake: bankroll * 0.01, style: 'text-green-400 border-green-500/20 bg-green-500/10' }
}

export function getConfidenceStyle(score: number): { label: string; style: string } {
  if (score >= 90) return { label: 'Elite', style: 'bg-green-500/20 border-green-500/20 text-green-400' }
  if (score >= 75) return { label: 'Strong', style: 'bg-amber-500/20 border-amber-500/20 text-amber-300' }
  if (score >= 60) return { label: 'Moderate', style: 'bg-orange-500/20 border-orange-500/20 text-orange-300' }
  return { label: 'Weak', style: 'bg-red-500/20 border-red-500/20 text-red-400' }
}

export function countReplayFlags(races: Race[]): number {
  return races.reduce((acc, race) =>
    acc + (race.runners || []).filter((r) => r.replayTriggers && r.replayTriggers.length > 0).length, 0)
}

export function calculateAvgFieldSize(races: Race[]): number {
  if (!races.length) return 0
  return Math.round(countRunners(races) / races.length)
}

export function sortBySeverity<T extends { highSeverity?: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.highSeverity && !b.highSeverity) return -1
    if (!a.highSeverity && b.highSeverity) return 1
    return 0
  })
}

export function generateInsight(runner: Runner): string {
  if (getScore(runner) >= 90) return 'Elite confidence profile with strong market support and consistent form indicators'
  if ((runner.replayTriggers || []).length >= 2) return 'Replay intelligence suggests hidden value — multiple positive triggers detected'
  if (getScore(runner) >= 75 && runner.odds) return 'Strong scoring runner with favorable odds — worth monitoring for market movement'
  return 'Moderate profile runner — limited edge detected, monitor for late market changes'
}

export function groupByTrainerWithMin(runners: Runner[], minCount: number): { trainer: string; runners: Runner[] }[] {
  const grouped = runners.reduce((acc, runner) => {
    const trainer = runner.trainer || 'Unknown'
    if (!acc[trainer]) acc[trainer] = []
    acc[trainer].push(runner)
    return acc
  }, {} as Record<string, Runner[]>)

  return Object.entries(grouped)
    .filter(([, r]) => r.length >= minCount)
    .map(([trainer, r]) => ({ trainer, runners: r }))
}

export function classifySectional(runner: Runner): { label: string; style: string } {
  const score = getScore(runner)
  const triggers = runner.replayTriggers || []
  if (score >= 90 && triggers.length >= 1) return { label: 'Explosive Finish', style: 'bg-green-500/20 border-green-500/20 text-green-400' }
  if (score >= 75) return { label: 'Strong Closer', style: 'bg-amber-500/20 border-amber-500/20 text-amber-300' }
  if (score >= 60) return { label: 'Balanced Pace', style: 'bg-blue-500/20 border-blue-500/20 text-blue-300' }
  return { label: 'Weak Finish', style: 'bg-red-500/20 border-red-500/20 text-red-400' }
}

export function calculateStrikeRate(wins: number, total: number): string | null {
  return total > 0 ? ((wins / total) * 100).toFixed(0) : null
}

export function calculateWinPercentage(wins: number, runs: number): number {
  return runs > 0 ? (wins / runs) * 100 : 0
}

export function getNoBetReason(races: Race[]): string | null {
  if (!races.length) return null
  const highChaos = races.filter(r => (r as any).volatility?.chaos > 0.5).length
  const autoSkipped = races.filter(r => r.betFilter?.verdict === 'AUTO SKIP').length
  const highRisk = races.filter(r => r.betFilter?.verdict === 'HIGH RISK').length
  const smallFields = races.filter(r => (r.runners?.length || 0) < 5).length
  if (smallFields > races.length * 0.5) return 'Most races have fewer than 5 runners — too small for reliable analysis'
  if (highChaos > races.length * 0.5) return 'Most races are highly volatile — too chaotic for confident picks'
  if (autoSkipped > races.length * 0.5) return 'Most races have weak data or poor conditions — system skipping'
  if (highRisk > races.length * 0.5) return 'Most races flagged as high risk — no value edges detected'
  return 'No runners met the minimum confidence threshold today'
}

export interface TrainerScore {
  trainer: string
  runners: number
  totalScore: number
  avgScore: number
}

export function aggregateTrainerScores(races: Race[], minRunners = 2): TrainerScore[] {
  const trainers: Record<string, TrainerScore> = {}
  races.forEach((race) => {
    (race.runners || []).forEach((runner) => {
      const trainer = runner.trainer
      if (!trainer) return
      if (!trainers[trainer]) {
        trainers[trainer] = { trainer, runners: 0, totalScore: 0, avgScore: 0 }
      }
      trainers[trainer].runners++
      trainers[trainer].totalScore += getScore(runner)
    })
  })
  return Object.values(trainers)
    .filter((t) => t.runners >= minRunners)
    .map((t) => ({ ...t, avgScore: Math.round(t.totalScore / t.runners) }))
    .sort((a, b) => b.avgScore - a.avgScore)
}

export interface JockeyMetric {
  jockey: string
  rides: number
  totalScore: number
  avgScore: number
  eliteRides: number
}

// ============================================================
// VALUE GATE — shared filter for value pick selection
// ============================================================

export function passesValueGate(
  prob: number,
  odds: number,
  apexScore: number = 0,
  previousRuns: number = 0,
  pa: number | null = null,
  raceApexScores: number[] = []
): boolean {
  if (!odds || odds <= 1 || !prob) return false
  if (odds < 2.5) return false
  if (pa !== null && pa <= 0) return false

  const impliedProb = 1 / odds
  if (impliedProb >= 1) return false

  // Backtest gate: min 5% calibrated prob
  if (prob < 0.05) return false

  // Backtest gate: dynamic apex — race median + absolute floor
  if (raceApexScores.length > 0 && apexScore > 0) {
    const sorted = [...raceApexScores].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    if (apexScore < median || apexScore < 10) return false
  } else if (apexScore > 0 && apexScore < 10) {
    return false
  }

  // Backtest gate: dynamic edge — 25% base, 12% for 5-11 sweet spot
  const rawEdge = prob - impliedProb
  let minRequiredEdge = impliedProb * 0.25
  if (odds >= 5.0 && odds <= 11.0) {
    minRequiredEdge = impliedProb * 0.12
  }
  return rawEdge > minRequiredEdge
}

export function aggregateJockeyMetrics(races: Race[], minRides = 2, eliteThreshold = 80): JockeyMetric[] {
  const jockeys: Record<string, JockeyMetric> = {}
  races.forEach((race) => {
    (race.runners || []).forEach((runner) => {
      const jockey = runner.jockey
      if (!jockey) return
      if (!jockeys[jockey]) {
        jockeys[jockey] = { jockey, rides: 0, totalScore: 0, avgScore: 0, eliteRides: 0 }
      }
      jockeys[jockey].rides++
      jockeys[jockey].totalScore += getScore(runner)
      if (getScore(runner) >= eliteThreshold) jockeys[jockey].eliteRides++
    })
  })
  return Object.values(jockeys)
    .filter((j) => j.rides >= minRides)
    .map((j) => ({ ...j, avgScore: Math.round(j.totalScore / j.rides) }))
    .sort((a, b) => b.avgScore - a.avgScore)
}
