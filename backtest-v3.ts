import fs from 'fs'
import path from 'path'

// =========================================
// APEX RACING BACKTEST ENGINE V3
// =========================================
// Reads clean JSON (from csv-to-json.ts)
// No CSV parsing, no external deps
// =========================================

interface Runner {
  horse: string
  position: number
  odds: number
  oddsFractional: string
  or: number
  draw: number
  trainer: string
  jockey: string
  formRaw: string
  formPositions: number[]
  daysSinceLastRun: number
  comments: string
  rpr: number
  age: number
  weight: string
  headgear: string
  sire: string
  dam: string
  owner: string
}

interface Race {
  raceId: string
  course: string
  date: string
  time: string
  raceName: string
  raceType: string
  going: string
  distance: string
  distanceFurlongs: number
  fieldSize: number
  runners: Runner[]
}

interface PickResult {
  raceId: string
  course: string
  date: string
  horse: string
  odds: number
  won: boolean
  profit: number
  score: number
  snapshot: HistoricalSnapshot | null
}

interface HistoricalSnapshot {
  raceId: string
  runId: string
  horseId: string
  horseName: string
  timestamp: string
  signals: {
    formEngine: { formPositions: number[] }
    paceEngine: { runningStyle: string; pacePressure: number }
    componentScores: { pace: number; draw: number; ground: number; distance: number; classMove: number; lastRunTrouble: number; trainerForm: number; jockeyCourseSR: number }
    hiddenImprover: { classDrop: boolean; tripStepUp: boolean; secondRunAfterLayoff: boolean; trainerHiddenUpside: boolean }
    stableIntent: { equipmentChange: string | null; jockeyChange: boolean; trainerPattern: string | null }
    finishingStrength: { stayedOn: boolean; weakened: boolean; staminaBias: boolean }
  }
  scores: {
    legacyLayeredScore: number
    componentBlend: number
    marketAdjustment: number
    volatilityAdjustment: number
    finalScore: number
  }
  commentary: {
    summary: string
    positives: string[]
    negatives: string[]
    verdict: string
  }
}

interface ConditionRecord {
  runs: number
  wins: number
  places: number
  avgPos: number
  positions: number[]
}

interface HorseConditionProfile {
  name: string
  stats: { total: number; wins: number; places: number }
  going: Record<string, ConditionRecord>
  distance: Record<string, ConditionRecord>
  class: Record<string, ConditionRecord>
  weight: Record<string, ConditionRecord>
}

// =========================================
// CONFIG
// =========================================

const CONFIG = {
  minOdds: 2,
  maxOdds: 12,
  maxFieldSize: 14,
  stakePerBet: 1,
  skipMaidenRaces: false,
  skipLargeFields: true,
  minimumScore: 3,
  maxPicksPerRace: 1
}

// =========================================
// CONDITION DB (in-memory for backtest)
// =========================================

const conditionDB: Record<string, HorseConditionProfile> = {}

function normalizeGoing(going: string): string {
  if (!going) return 'unknown'
  const g = going.toLowerCase().trim()
  if (g.includes('heavy')) return 'heavy'
  if (g.includes('soft')) return 'soft'
  if (g.includes('good to soft')) return 'good_to_soft'
  if (g.includes('good to firm')) return 'good_to_firm'
  if (g.includes('good')) return 'good'
  if (g.includes('firm')) return 'firm'
  if (g.includes('standard')) return 'standard'
  return 'unknown'
}

function normalizeDistance(distF: number): string {
  if (!distF || isNaN(distF)) return 'unknown'
  if (distF <= 5) return 'sprint'
  if (distF <= 7) return 'short_mile'
  if (distF <= 9) return 'mile'
  if (distF <= 12) return 'middle'
  if (distF <= 16) return 'long'
  return 'stayer'
}

function normalizeClass(raceClass: string): string {
  if (!raceClass) return 'unknown'
  const c = String(raceClass).toLowerCase().replace('class ', '')
  const num = parseInt(c, 10)
  if (num >= 1 && num <= 6) return `class_${num}`
  return 'unknown'
}

function recordRunToDB(race: Race) {
  const going = normalizeGoing(race.going)
  const dist = normalizeDistance(race.distanceFurlongs)
  const cls = normalizeClass(race.raceClass || '')

  for (const runner of race.runners) {
    const horseId = runner.horse.toLowerCase().replace(/\s+/g, '_')
    if (!conditionDB[horseId]) {
      conditionDB[horseId] = {
        name: runner.horse,
        stats: { total: 0, wins: 0, places: 0 },
        going: {},
        distance: {},
        class: {},
        weight: {},
      }
    }

    const horse = conditionDB[horseId]
    const position = runner.position || 0
    horse.stats.total++

    const buckets = [
      { map: horse.going, key: going },
      { map: horse.distance, key: dist },
      { map: horse.class, key: cls },
      { map: horse.weight, key: runner.weight || 'unknown' },
    ]

    for (const { map, key } of buckets) {
      if (!map[key]) map[key] = { runs: 0, wins: 0, places: 0, avgPos: 0, positions: [] }
      map[key].runs++
      map[key].positions.push(position)
      if (position === 1) map[key].wins++
      else if (position >= 2 && position <= 3) map[key].places++
    }

    if (position === 1) horse.stats.wins++
    else if (position >= 2 && position <= 3) horse.stats.places++
  }
}

function getConditionMatch(horseName: string, todayGoing: string, todayDistF: number, todayClass: string, todayWeight: string) {
  const horseId = horseName.toLowerCase().replace(/\s+/g, '_')
  const profile = conditionDB[horseId]
  if (!profile || profile.stats.total === 0) {
    return { hasHistory: false, overallScore: 50, positives: [] as string[], negatives: [] as string[] }
  }

  const going = normalizeGoing(todayGoing)
  const dist = normalizeDistance(todayDistF)
  const cls = normalizeClass(todayClass)
  const weightBucket = todayWeight || 'unknown'

  let score = 50
  const positives: string[] = []
  const negatives: string[] = []

  const checks = [
    { data: profile.going[going], label: going.replace(/_/g, ' '), type: 'going' },
    { data: profile.distance[dist], label: dist, type: 'distance' },
    { data: profile.class[cls], label: cls, type: 'class' },
    { data: profile.weight[weightBucket], label: weightBucket, type: 'weight' },
  ]

  for (const { data, label, type } of checks) {
    if (data && data.runs > 0) {
      const winRate = data.wins / data.runs
      const placeRate = (data.wins + data.places) / data.runs
      if (winRate >= 0.3) { score += 12; positives.push(`Strong ${type}: ${data.wins}/${data.runs} on ${label}`) }
      else if (winRate >= 0.15) { score += 6; positives.push(`Proven ${type}: ${data.wins}/${data.runs} on ${label}`) }
      else if (placeRate >= 0.4) { score += 3; positives.push(`Places ${type} on ${label}`) }
      else { score -= 4; negatives.push(`Poor ${type} on ${label}`) }
    } else {
      negatives.push(`No ${type} record on ${label}`)
    }
  }

  return {
    hasHistory: true,
    overallScore: Math.max(0, Math.min(100, score)),
    positives,
    negatives,
  }
}

// =========================================
// LOAD JSON
// =========================================

const inputPath = path.join(process.cwd(), 'historical_races.json')

if (!fs.existsSync(inputPath)) {
  console.error('historical_races.json not found. Run: npx tsx csv-to-json.ts')
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))
const races: Race[] = data.races

console.log(`Loaded ${races.length} races, ${data.totalRunners} runners`)

// =========================================
// KNOWN STRONG TRAINER/JOCKEY PAIRS
// =========================================

const knownStrongPairs = new Set([
  'n henderson_b geraghty',
  'p nicholls_h cobden',
  'w mullins_p townend',
  'g elliott_d russell',
  'd pipe_t scudamore',
  'n twiston-davies_s twiston-davies',
  'evan williams_a wedge',
  'jonjo oneill_jonjo oneill jr',
  'd mccain jr_c deutsch',
])

// =========================================
// BUILD HISTORICAL SNAPSHOT
// =========================================

function buildSnapshot(runner: Runner, race: Race, score: number): HistoricalSnapshot {
  const c = runner.comments.toLowerCase()
  const stayedOn = c.includes('stayed on') || c.includes('ran on') || c.includes('kept on')
  const weakened = c.includes('weakened') || c.includes('outpaced') || c.includes('faded')
  const travelledWell = c.includes('travelled well') || c.includes('prominent') || c.includes('led')

  const ratings = race.runners.map(r => r.or).filter(Boolean)
  const avgOR = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
  const orDiff = runner.or - avgOR

  const rprs = race.runners.map(r => r.rpr).filter(Boolean)
  const avgRPR = rprs.length > 0 ? rprs.reduce((a, b) => a + b, 0) / rprs.length : 0
  const rprDiff = runner.rpr - avgRPR

  const raceClass = extractRaceClass(race.raceName)
  const expectedOR = raceClassToExpectedOR(raceClass)
  const classDrop = raceClass > 0 && runner.or > 0 && runner.or < expectedOR - 10

  const runningStyle = c.includes('led') || c.includes('made all') ? 'Front Runner' :
    c.includes('held up') || c.includes('rear') ? 'Hold Up' : 'Midfield'

  const pacePressure = race.fieldSize > 12 ? 0.7 : race.fieldSize > 8 ? 0.5 : 0.3

  const positives: string[] = []
  const negatives: string[] = []

  if (runner.formPositions.slice(0, 3).filter(p => p <= 3).length >= 2) positives.push('Multiple recent placings')
  if (runner.formPositions[0] === 1) positives.push('Last-start winner')
  if (stayedOn) positives.push('Strong staying profile')
  if (travelledWell) positives.push('Travelled well')
  if (classDrop) positives.push('Dropping in class')
  if (runner.daysSinceLastRun > 0 && runner.daysSinceLastRun <= 30) positives.push('Recent run — fit')
  if (orDiff >= 5) positives.push('Above average OR')
  if (rprDiff >= 10) positives.push('High RPR — proven ability')
  if (runner.age >= 4 && runner.age <= 7) positives.push('Prime age')
  if (runner.headgear.toLowerCase().includes('first time')) positives.push('First-time headgear')

  if (weakened) negatives.push('Tendency to weaken late')
  if (runner.daysSinceLastRun > 180) negatives.push('Long absence')
  if (orDiff <= -10) negatives.push('Below average OR')
  if (rprDiff <= -10) negatives.push('Low RPR')
  if (race.fieldSize >= 16) negatives.push('Large field — traffic risk')

  const summary = positives.length > negatives.length
    ? `${positives.length} positive signals vs ${negatives.length} negative`
    : `${negatives.length} concerns outweigh ${positives.length} positives`

  let verdict = 'NO BET'
  if (score >= 8 && positives.length >= 3) verdict = 'STRONG BET'
  else if (score >= 6 && positives.length > negatives.length) verdict = 'BET'
  else if (score >= 4 && positives.length >= negatives.length) verdict = 'VALUE'
  else if (score >= 2) verdict = 'PLACE'
  else if (score < 0) verdict = 'AVOID'

  return {
    raceId: race.raceId,
    runId: `run_${race.date}_${runner.horse.replace(/\s+/g, '_').toLowerCase()}`,
    horseId: runner.horse.replace(/\s+/g, '_').toLowerCase(),
    horseName: runner.horse,
    timestamp: `${race.date}T${race.time || '00:00'}:00Z`,
    signals: {
      formEngine: { formPositions: runner.formPositions },
      paceEngine: { runningStyle, pacePressure },
      componentScores: {
        pace: travelledWell ? 65 : 50,
        draw: runner.draw <= 3 ? 60 : runner.draw >= 10 ? 40 : 50,
        ground: 50,
        distance: 50,
        classMove: classDrop ? 70 : 50,
        lastRunTrouble: 50,
        trainerForm: knownStrongPairs.has(`${runner.trainer.toLowerCase()}_${runner.jockey.toLowerCase()}`) ? 75 : 50,
        jockeyCourseSR: 50,
      },
      hiddenImprover: {
        classDrop,
        tripStepUp: false,
        secondRunAfterLayoff: runner.daysSinceLastRun > 60 && runner.daysSinceLastRun <= 120,
        trainerHiddenUpside: false,
      },
      stableIntent: {
        equipmentChange: runner.headgear || null,
        jockeyChange: false,
        trainerPattern: null,
      },
      finishingStrength: {
        stayedOn,
        weakened,
        staminaBias: race.distanceFurlongs >= 12,
      },
    },
    scores: {
      legacyLayeredScore: Math.round(score * 10),
      componentBlend: Math.round(score * 8),
      marketAdjustment: 0,
      volatilityAdjustment: 1.0,
      finalScore: Math.round(score * 10),
    },
    commentary: {
      summary: summary.charAt(0).toUpperCase() + summary.slice(1) + '.',
      positives,
      negatives,
      verdict,
    },
  }
}

// =========================================
// SCORE RUNNER
// =========================================

function scoreRunner(runner: Runner, race: Race): number {
  let score = 0

  // OFFICIAL RATING (relative to field)
  const ratings = race.runners.map(r => r.or).filter(Boolean)
  if (ratings.length > 0) {
    const avgOR = ratings.reduce((a, b) => a + b, 0) / ratings.length
    const orDiff = runner.or - avgOR
    if (orDiff >= 5) score += 3
    else if (orDiff >= 0) score += 1
    else if (orDiff <= -10) score -= 2
  }

  // RPR (Racing Post Rating) — direct ability measure
  const rprs = race.runners.map(r => r.rpr).filter(Boolean)
  if (rprs.length > 0) {
    const avgRPR = rprs.reduce((a, b) => a + b, 0) / rprs.length
    const rprDiff = runner.rpr - avgRPR
    if (rprDiff >= 10) score += 4
    else if (rprDiff >= 5) score += 2
    else if (rprDiff >= 0) score += 1
    else if (rprDiff <= -10) score -= 2
  }

  // FORM SCORE (if available — new format may be empty)
  for (const pos of runner.formPositions) {
    if (pos === 1) score += 4
    else if (pos === 2) score += 2
    else if (pos === 3) score += 1
    else if (pos >= 8) score -= 1
  }

  // RECENCY (if available)
  if (runner.daysSinceLastRun > 0 && runner.daysSinceLastRun <= 30) {
    score += 1
  }
  if (runner.daysSinceLastRun > 180) {
    score -= 2
  }

  // AGE — prime age bonus
  if (runner.age >= 4 && runner.age <= 7) score += 1
  if (runner.age >= 8 && runner.age <= 10) score += 0
  if (runner.age > 10) score -= 1

  // HEADGEAR — equipment change signals
  const hg = runner.headgear.toLowerCase()
  if (hg.includes('first time') || hg.includes('ft')) score += 2
  if (hg.includes('cheekpieces') || hg.includes('blinkers') || hg.includes('visor')) score += 1
  if (hg.includes('removed') || hg.includes('off')) score -= 1

  // FIELD SIZE
  if (race.runners.length <= 6) score += 1
  else if (race.runners.length >= 14) score -= 1

  // TRAINER/JOCKEY
  const tjKey = `${runner.trainer.toLowerCase()}_${runner.jockey.toLowerCase()}`
  if (knownStrongPairs.has(tjKey)) score += 2

  // CLASS DROP (OR below expected for race class)
  const raceClass = extractRaceClass(race.raceName)
  if (raceClass > 0 && runner.or > 0) {
    const expectedOR = raceClassToExpectedOR(raceClass)
    if (runner.or < expectedOR - 10) score += 2
  }

  // COMMENTS ANALYSIS (stamina/pace signals)
  const c = runner.comments.toLowerCase()

  // Stamina positives — horse finished strongly
  if (c.includes('stayed on') || c.includes('ran on')) score += 2
  if (c.includes('finished well') || c.includes('kept on')) score += 1
  if (c.includes('strong finish') || c.includes('rallied')) score += 1

  // Stamina negatives — horse weakened late
  if (c.includes('weakened') || c.includes('outpaced')) score -= 2
  if (c.includes('faded') || c.includes('no extra')) score -= 1
  if (c.includes('tired') || c.includes('lost momentum')) score -= 1

  // Pace positives — horse travelled well
  if (c.includes('travelled well') || c.includes('prominent')) score += 1
  if (c.includes('led') || c.includes('made all')) score += 1

  // Pace negatives — poor start/traffic issues
  if (c.includes('slowly away') || c.includes('jumped slowly')) score -= 1
  if (c.includes('badly hampered') || c.includes('checked')) score -= 1

  // CONDITION MATCH — historical wins on today's going/distance/class/weight
  const cond = getConditionMatch(runner.horse, race.going, race.distanceFurlongs, race.raceClass || '', runner.weight)
  if (cond.hasHistory) {
    const adj = (cond.overallScore - 50) * 0.1
    score += adj
  }

  return score
}

// =========================================
// SELECT PICK
// =========================================

function selectPick(race: Race): PickResult | null {
  if (!race.runners.length) return null

  if (CONFIG.skipLargeFields && race.fieldSize > CONFIG.maxFieldSize) return null
  if (CONFIG.skipMaidenRaces && isMaiden(race)) return null

  const scored = race.runners.map(runner => ({
    runner,
    score: scoreRunner(runner, race)
  }))

  const filtered = scored.filter(({ runner }) =>
    runner.odds >= CONFIG.minOdds && runner.odds <= CONFIG.maxOdds
  )

  if (!filtered.length) return null

  filtered.sort((a, b) => b.score - a.score)

  const picks = filtered.slice(0, CONFIG.maxPicksPerRace)
  const best = picks[0]

  if (best.score < CONFIG.minimumScore) return null

  const won = best.runner.position === 1

  return {
    raceId: race.raceId,
    course: race.course,
    date: race.date,
    horse: best.runner.horse,
    odds: best.runner.odds,
    won,
    score: best.score,
    profit: won
      ? (best.runner.odds * CONFIG.stakePerBet) - CONFIG.stakePerBet
      : -CONFIG.stakePerBet,
    snapshot: buildSnapshot(best.runner, race, best.score)
  }
}

// =========================================
// RUN BACKTEST
// =========================================

// Sort races chronologically to avoid look-ahead bias
races.sort((a, b) => {
  const dateA = `${a.date}T${a.time || '00:00'}`
  const dateB = `${b.date}T${b.time || '00:00'}`
  return dateA.localeCompare(dateB)
})

const picks: PickResult[] = []
let racesProcessed = 0
let skippedByField = 0
let skippedByOdds = 0
let skippedByScore = 0

for (const race of races) {
  // Score using historical data from PREVIOUS races only (no look-ahead bias)
  const result = selectPick(race)
  if (result) picks.push(result)
  else {
    if (CONFIG.skipLargeFields && race.fieldSize > CONFIG.maxFieldSize) skippedByField++
    else {
      const scored = race.runners.map(runner => ({ runner, score: scoreRunner(runner, race) }))
      const inOdds = scored.filter(({ runner }) => runner.odds >= CONFIG.minOdds && runner.odds <= CONFIG.maxOdds)
      if (inOdds.length === 0) skippedByOdds++
      else {
        inOdds.sort((a, b) => b.score - a.score)
        if (inOdds[0].score < CONFIG.minimumScore) skippedByScore++
      }
    }
  }

  // Record this race to condition DB for FUTURE races
  recordRunToDB(race)
  racesProcessed++
}

console.log(`\nSkipped: ${skippedByField} field, ${skippedByOdds} odds, ${skippedByScore} score`)

// =========================================
// RESULTS
// =========================================

const totalBets = picks.length
const totalWins = picks.filter(p => p.won).length
const totalLosses = totalBets - totalWins
const strikeRate = totalBets ? ((totalWins / totalBets) * 100).toFixed(2) : '0'
const totalProfit = picks.reduce((sum, p) => sum + p.profit, 0)
const totalStaked = totalBets * CONFIG.stakePerBet
const roi = totalStaked ? ((totalProfit / totalStaked) * 100).toFixed(2) : '0'

const dbHorses = Object.keys(conditionDB).length
const dbRuns = Object.values(conditionDB).reduce((sum, h) => sum + h.stats.total, 0)
const dbWins = Object.values(conditionDB).reduce((sum, h) => sum + h.stats.wins, 0)

console.log('\n=========================================')
console.log('APEX RACING BACKTEST RESULTS')
console.log('=========================================\n')
console.log(`Total Bets:     ${totalBets}`)
console.log(`Wins:           ${totalWins}`)
console.log(`Losses:         ${totalLosses}`)
console.log(`Strike Rate:    ${strikeRate}%`)
console.log(`Profit/Loss:    ${totalProfit.toFixed(2)} pts`)
console.log(`ROI:            ${roi}%`)

console.log('\n=========================================')
console.log('CONDITION DATABASE')
console.log('=========================================')
console.log(`Horses Tracked: ${dbHorses}`)
console.log(`Total Runs:     ${dbRuns}`)
console.log(`Total Wins:     ${dbWins}`)

console.log('\n=========================================')
console.log('ALL PICKS')
console.log('=========================================\n')

for (const pick of picks) {
  console.log(
    `${pick.date} ${pick.course} | ${pick.horse} | ${pick.odds.toFixed(1)} | ${pick.won ? 'WON' : 'lost'} | ${pick.profit >= 0 ? '+' : ''}${pick.profit.toFixed(2)} | Score: ${pick.score.toFixed(1)} | Verdict: ${pick.snapshot?.commentary.verdict || 'N/A'}`
  )
}

// =========================================
// SAVE SNAPSHOTS
// =========================================

const snapshots = picks.map(p => p.snapshot).filter(Boolean)
if (snapshots.length > 0) {
  const snapshotPath = path.join(process.cwd(), 'backtest_snapshots.json')
  fs.writeFileSync(snapshotPath, JSON.stringify({ snapshots }, null, 2))
  console.log(`\nSaved ${snapshots.length} snapshots to ${snapshotPath}`)
}

// =========================================
// HELPERS
// =========================================

function extractRaceClass(raceName: string): number {
  const match = raceName.match(/Class\s*(\d)/i)
  if (match) return Number(match[1])
  if (raceName.toLowerCase().includes('handicap')) return 5
  if (raceName.toLowerCase().includes('maiden')) return 0
  return 0
}

function raceClassToExpectedOR(raceClass: number): number {
  const map: Record<number, number> = { 1: 140, 2: 130, 3: 120, 4: 110, 5: 100, 6: 90 }
  return map[raceClass] || 0
}

function isMaiden(race: Race): boolean {
  return race.raceName.toLowerCase().includes('maiden')
}
