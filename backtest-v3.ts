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

  if (weakened) negatives.push('Tendency to weaken late')
  if (runner.daysSinceLastRun > 180) negatives.push('Long absence')
  if (orDiff <= -10) negatives.push('Below average OR')
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
        equipmentChange: null,
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

  // FORM SCORE (pre-parsed positions)
  for (const pos of runner.formPositions) {
    if (pos === 1) score += 4
    else if (pos === 2) score += 2
    else if (pos === 3) score += 1
    else if (pos >= 8) score -= 1
  }

  // RECENCY
  if (runner.daysSinceLastRun > 0 && runner.daysSinceLastRun <= 30) {
    score += 1
  }
  if (runner.daysSinceLastRun > 180) {
    score -= 2
  }

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

const picks: PickResult[] = []

for (const race of races) {
  const result = selectPick(race)
  if (result) picks.push(result)
}

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
