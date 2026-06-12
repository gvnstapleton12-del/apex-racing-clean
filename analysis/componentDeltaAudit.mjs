import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const toFileUrl = (p) => new URL(`file:///${p.replace(/\\/g, '/')}`).href
const { runApexEngine } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'apexEngine.js')))
const { buildORHistory } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'classModel.js')))

const RESULTS_PATH = './data/backtest-results-current.json'
const CACHE_DIR = './data/backtest-cache'
const TRACKS_PATH = './data/trackProfiles.json'
const OUT_PATH = './analysis/component-delta-audit.json'

// ── Load ──
function loadJson(p) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null }
  catch { return null }
}

const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'))
const TRACK_PROFILES = loadJson(TRACKS_PATH) || {}
const TRAINER_FORM_DB_RAW = loadJson('./data/trainer-form.json') || {}
const TRAINER_FORM_DB = {}
for (const [k, v] of Object.entries(TRAINER_FORM_DB_RAW)) TRAINER_FORM_DB[k.toLowerCase()] = v
const JOCKEY_FORM_DB_RAW = loadJson('./data/jockey-form.json') || {}
const JOCKEY_FORM_DB = {}
for (const [k, v] of Object.entries(JOCKEY_FORM_DB_RAW)) JOCKEY_FORM_DB[k.toLowerCase()] = v
const LEARNING_DB = loadJson('./data/learning.json') || {}
const OR_HISTORY = buildORHistory(LEARNING_DB.records || [])
const LEARNING_RACES = LEARNING_DB.races || []
const MULTIPLIER = LEARNING_DB.weights?.multiplier || {}
const GOING_DB = loadJson('./data/going-database.json') || {}
const DISTANCE_DB = loadJson('./data/distance-database.json') || {}

// ── Build race map from results ──
const raceMap = {}
for (const r of results) {
  const key = `${r.raceId}||${r.date}||${r.course}`
  if (!raceMap[key]) raceMap[key] = []
  raceMap[key].push(r)
}

// ── Identify close misses ──
const closeMisses = []
for (const [key, runners] of Object.entries(raceMap)) {
  if (runners.length < 5) continue
  const sorted = [...runners].sort((a, b) => (b.winProb || 0) - (a.winProb || 0))
  sorted.forEach((r, i) => { r.rank = i + 1 })
  const winner = sorted.find(r => r.won)
  if (!winner || winner.rank === 1) continue
  closeMisses.push({
    raceId: winner.raceId,
    course: winner.course,
    date: winner.date,
    pick: { horse: sorted[0].horse, rank: 1, winProb: sorted[0].winProb },
    winner: { horse: winner.horse, rank: winner.rank, winProb: winner.winProb },
  })
}
console.log(`Found ${closeMisses.length} close misses`)

// ── Load cache files ──
const cacheFiles = readdirSync(CACHE_DIR).filter(f => f.startsWith('results-') && f.endsWith('.json')).sort()
const cacheByDate = {}
for (const f of cacheFiles) {
  const date = f.replace('results-', '').replace('.json', '')
  cacheByDate[date] = loadJson(join(CACHE_DIR, f))
}

// ── Helpers ──
function decimalFromOdds(odds) {
  if (!odds || odds <= 0) return 0
  if (typeof odds === 'string') {
    const m = odds.match(/^(\d+)\/(\d+)$/)
    if (m) return 1 + parseInt(m[1]) / parseInt(m[2])
    return parseFloat(odds) || 0
  }
  return odds
}

function detectRaceType(race) {
  const name = (race.race_name || '').toLowerCase()
  if (/(hurdle|chase|nh\s*flat|national hunt)/.test(name)) return 'Jumps'
  const runners = race.runners || []
  let hurdleCount = 0, flatCount = 0
  for (const r of runners) {
    for (const pr of (r.previous_results || [])) {
      const rt = (pr.run_type || '').toUpperCase()
      if (rt === 'HURDLE' || rt === 'CHASE' || rt === 'NH_FLAT') hurdleCount++
      else if (rt === 'FLAT') flatCount++
    }
  }
  return hurdleCount > flatCount ? 'Jumps' : 'Flat'
}

// ── Extract meaningful component deltas ──
const COMPONENTS = [
  'power',           // total power score from rawPower
  'paceCompat',      // pace compatibility (0-100)
  'raceShape',       // raceShapeSuitability
  'ground',          // newComponents.ground
  'distance',        // newComponents.distance
  'trainerForm',     // newComponents.trainerForm
  'courseAffinity',  // personalAffinity.courseAdj
  'distanceAffinity', // personalAffinity.distanceAdj
  'goingAffinity',   // personalAffinity.goingAdj
  'rprORGap',        // classModel.rprORGap
  'orFit',           // classModel.orFitScore
  'personalAffinity', // personalAffinity.adjustment
  'draw',            // newComponents.draw
  'jockeyCourseSR',  // newComponents.jockeyCourseSR
  'classMove',       // newComponents.classMove
  'finalScore',      // finalScore
  'qualityScore',    // qualityAdjustedScore
]

function extractComponents(runner) {
  const power = typeof runner.power?.total === 'number' ? runner.power.total :
    typeof runner.powerScore === 'number' ? runner.powerScore : 0
  return {
    power: Math.round(power * 10) / 10,
    paceCompat: runner.paceCompat?.compatibility ?? 50,
    raceShape: runner.raceShapeSuitability ?? 50,
    ground: runner.newComponents?.ground ?? 50,
    distance: runner.newComponents?.distance ?? 50,
    trainerForm: runner.newComponents?.trainerForm ?? 50,
    courseAffinity: runner.personalAffinity?.courseAdj ?? 0,
    distanceAffinity: runner.personalAffinity?.distanceAdj ?? 0,
    goingAffinity: runner.personalAffinity?.goingAdj ?? 0,
    rprORGap: runner.classModel?.rprORGap ?? 0,
    orFit: runner.classModel?.orFitScore ?? 50,
    personalAffinity: runner.personalAffinity?.adjustment ?? 0,
    draw: runner.newComponents?.draw ?? 50,
    jockeyCourseSR: runner.newComponents?.jockeyCourseSR ?? 50,
    classMove: runner.newComponents?.classMove ?? 50,
    finalScore: runner.finalScore ?? 0,
    qualityScore: runner.qualityAdjustedScore ?? 50,
  }
}

// ── Process ──
let processed = 0, engineErrors = 0, matchFailures = 0
const promotions = []

for (const cm of closeMisses) {
  const cacheData = cacheByDate[cm.date]
  if (!cacheData) { engineErrors++; continue }

  const race = cacheData.find(r =>
    (r.race_id || '') === cm.raceId &&
    (r.course || '') === cm.course
  )
  if (!race) { engineErrors++; continue }

  const raceType = detectRaceType(race)
  const engineRunners = (race.runners || []).map(r => ({
    horse: r.horse,
    horse_id: r.horse_id || '',
    odds: decimalFromOdds(r.odds) || 2,
    or: r.or || 0,
    rpr: r.rpr || 0,
    draw: r.draw || 0,
    jockey: r.jockey || '',
    trainer: r.trainer || '',
    form: r.form || '',
    age: r.age || 0,
    sex: r.sex || '',
    lbs: r.lbs || '',
    last_run: r.last_run || 0,
    previous_results: r.previous_results || [],
    runningStyle: null,
    marketMovement: 'UNKNOWN',
    headgear: { items: [], firstTimeItems: [] },
    weight: '',
  }))

  const raceData = {
    course: race.course || '',
    off_time: '',
    date: race.date || '',
    going: race.going || '',
    distance_f: race.distance_f || '',
    race_class: race.race_class || 0,
    type: raceType === 'Jumps' ? 'Hurdle' : 'Flat',
    race_name: race.race_name || '',
    surface: '',
    field_size: engineRunners.length,
  }

  let engineResult
  try {
    engineResult = runApexEngine(engineRunners, raceData, {
      goingDb: GOING_DB,
      distanceDb: DISTANCE_DB,
      trainerForm: TRAINER_FORM_DB,
      jockeyForm: JOCKEY_FORM_DB,
      orHistory: OR_HISTORY,
      races: LEARNING_RACES,
      multiplier: MULTIPLIER,
      trackProfiles: TRACK_PROFILES,
    })
  } catch { engineErrors++; continue }

  const preds = engineResult.racecards || []
  const winnerPred = preds.find(p => p.horse === cm.winner.horse)
  const pickPred = preds.find(p => p.horse === cm.pick.horse)

  if (!winnerPred || !pickPred) { matchFailures++; continue }

  const wc = extractComponents(winnerPred)
  const pc = extractComponents(pickPred)

  // Compute deltas (winner - pick)
  const deltas = {}
  for (const comp of COMPONENTS) {
    deltas[comp] = Math.round(((wc[comp] ?? 0) - (pc[comp] ?? 0)) * 100) / 100
  }

  // Primary driver = component with largest positive delta
  const sorted = COMPONENTS
    .filter(c => deltas[c] > 0)  // only positive = winner has more
    .sort((a, b) => deltas[b] - deltas[a])
  const primaryDriver = sorted.length > 0 ? sorted[0] : 'none (all neg)'

  promotions.push({
    raceId: cm.raceId,
    course: cm.course,
    winner: cm.winner.horse,
    pick: cm.pick.horse,
    rank: cm.winner.rank,
    primaryDriver,
    deltas,
    winner: wc,
    pick: pc,
  })

  processed++
}

// ── Aggregate ──
const driverCounts = {}
for (const p of promotions) {
  driverCounts[p.primaryDriver] = (driverCounts[p.primaryDriver] || 0) + 1
}

// Winner-better counts for each component
const winnerBetter = {}
for (const comp of COMPONENTS) {
  winnerBetter[comp] = promotions.filter(p => p.deltas[comp] > 0).length
}

const avgDeltas = {}
for (const comp of COMPONENTS) {
  const vals = promotions.map(p => p.deltas[comp])
  avgDeltas[comp] = {
    avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 100) / 100,
    median: [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)],
    min: Math.min(...vals),
    max: Math.max(...vals),
    winnerBetter: winnerBetter[comp],
    winnerBetterPct: Math.round(winnerBetter[comp] / promotions.length * 100),
  }
}

// ── Output ──
console.log('\n═══════════════════════════════════════════════════════')
console.log('  COMPONENT DELTA AUDIT')
console.log('═══════════════════════════════════════════════════════\n')

const sortedByAvg = [...COMPONENTS].sort((a, b) =>
  Math.abs(avgDeltas[b].avg) - Math.abs(avgDeltas[a].avg)
)

console.log('  Component          Avg Delta   Median   Winner+    %')
console.log('  ────────────────── ────────── ──────── ──────── ────')
for (const comp of sortedByAvg) {
  const s = avgDeltas[comp].avg >= 0 ? '+' : ''
  console.log(`  ${comp.padEnd(18)} ${s}${String(avgDeltas[comp].avg).padStart(8)}  ${s}${String(avgDeltas[comp].median).padStart(6)}  ${String(avgDeltas[comp].winnerBetter).padStart(5)}/${processed} ${avgDeltas[comp].winnerBetterPct}%`)
}

console.log('\n  PRIMARY DRIVERS (component with largest +delta for winner):')
const sortedDrivers = Object.entries(driverCounts).sort((a, b) => b[1] - a[1])
for (const [driver, count] of sortedDrivers) {
  const pct = Math.round(count / promotions.length * 100)
  console.log(`  ${driver.padEnd(18)} ${String(count).padStart(4)}/${promotions.length} (${pct}%)`)
}

console.log(`\n  Races processed: ${processed}`)
console.log(`  Engine errors: ${engineErrors}`)
console.log(`  Match failures: ${matchFailures}`)
console.log(`  Total promotions: ${promotions.length}`)

writeFileSync(OUT_PATH, JSON.stringify({
  summary: { processed, engineErrors, matchFailures, promotions: promotions.length },
  driverCounts,
  avgDeltas,
  promotions: promotions.map(p => ({
    raceId: p.raceId, course: p.course, winner: p.winner, pick: p.pick,
    rank: p.rank, primaryDriver: p.primaryDriver, deltas: p.deltas,
  })),
}, null, 2))

console.log(`\n  Saved to ${OUT_PATH}`)
console.log('═══════════════════════════════════════════════════════\n')
