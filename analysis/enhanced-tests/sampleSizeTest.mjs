import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

const toFileUrl = (p) => new URL(`file:///${p.replace(/\\/g, '/')}`).href
const { runApexEngine } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'apexEngine.js')))
const { buildORHistory } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'classModel.js')))

const CACHE_DIR = join(ROOT, 'data', 'backtest-cache')
const TRACKS_PATH = join(ROOT, 'data', 'trackProfiles.json')
const RESULTS_PATH = join(ROOT, 'data', 'backtest-results-current.json')

function loadJson(p) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null }
  catch { return null }
}

console.log('Loading databases...')
const TRACK_PROFILES = loadJson(TRACKS_PATH) || {}
const TRAINER_FORM_DB_RAW = loadJson(join(ROOT, 'data', 'trainer-form.json')) || {}
const TRAINER_FORM_DB = {}
for (const [k, v] of Object.entries(TRAINER_FORM_DB_RAW)) TRAINER_FORM_DB[k.toLowerCase()] = v
const JOCKEY_FORM_DB_RAW = loadJson(join(ROOT, 'data', 'jockey-form.json')) || {}
const JOCKEY_FORM_DB = {}
for (const [k, v] of Object.entries(JOCKEY_FORM_DB_RAW)) JOCKEY_FORM_DB[k.toLowerCase()] = v
const LEARNING_DB = loadJson(join(ROOT, 'data', 'learning.json')) || {}
const OR_HISTORY = buildORHistory(LEARNING_DB.records || [])
const LEARNING_RACES = LEARNING_DB.races || []
const MULTIPLIER = LEARNING_DB.weights?.multiplier || {}
const GOING_DB = loadJson(join(ROOT, 'data', 'going-database.json')) || {}
const DISTANCE_DB = loadJson(join(ROOT, 'data', 'distance-database.json')) || {}

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
  if (hurdleCount > flatCount) return 'Jumps'
  return 'Flat'
}

function getPriorCourseRuns(horseName, course, cacheByDate) {
  const horseKey = horseName.toLowerCase().trim()
  let runs = 0
  for (const [date, cacheData] of Object.entries(cacheByDate)) {
    for (const race of cacheData) {
      if (race.course !== course) continue
      for (const runner of (race.runners || [])) {
        if (runner.horse?.toLowerCase().trim() === horseKey) runs++
      }
    }
  }
  return runs
}

async function main() {
  const results = loadJson(RESULTS_PATH)
  if (!results || !Array.isArray(results)) {
    console.error('No backtest results found')
    process.exit(1)
  }

  const trackData = loadJson(TRACKS_PATH)
  const trackMap = {}
  if (trackData?.tracks) {
    for (const [name, data] of Object.entries(trackData.tracks)) {
      trackMap[name.toLowerCase()] = data.trackCategory || 'unknown'
    }
  }

  const cacheFiles = readdirSync(CACHE_DIR)
    .filter(f => f.startsWith('results-') && f.endsWith('.json'))
    .sort()
  const cacheByDate = {}
  for (const f of cacheFiles) {
    const date = f.replace('results-', '').replace('.json', '')
    cacheByDate[date] = loadJson(join(CACHE_DIR, f))
  }

  const raceMap = {}
  for (const r of results) {
    const key = `${r.raceId}||${r.date}||${r.course}`
    if (!raceMap[key]) raceMap[key] = []
    raceMap[key].push(r)
  }

  const closeMisses = []
  for (const [key, runners] of Object.entries(raceMap)) {
    if (runners.length < 5) continue
    const sorted = [...runners].sort((a, b) => (b.winProb || 0) - (a.winProb || 0))
    sorted.forEach((r, i) => { r.rank = i + 1 })
    const winner = sorted.find(r => r.won)
    if (!winner || winner.rank === 1) continue
    const pick = sorted[0]
    closeMisses.push({
      raceId: pick.raceId,
      course: pick.course,
      date: pick.date,
      pick: { horse: pick.horse, rank: pick.rank, winProb: pick.winProb },
      winner: { horse: winner.horse, rank: winner.rank, winProb: winner.winProb }
    })
  }

  console.log(`\n═══════════════════════════════════════════════════════`)
  console.log('  SAMPLE SIZE TEST (with 0-run bucket)')
  console.log('═══════════════════════════════════════════════════════\n')
  console.log(`Analyzing ${closeMisses.length} close misses...\n`)

  const buckets = { '0 runs': [], '1 run': [], '2-3 runs': [], '4-6 runs': [], '7+ runs': [] }

  for (const cm of closeMisses) {
    const priorRuns = getPriorCourseRuns(cm.winner.horse, cm.course, cacheByDate)
    let bucket
    if (priorRuns === 0) bucket = '0 runs'
    else if (priorRuns === 1) bucket = '1 run'
    else if (priorRuns <= 3) bucket = '2-3 runs'
    else if (priorRuns <= 6) bucket = '4-6 runs'
    else bucket = '7+ runs'
    buckets[bucket].push(cm)
  }

  console.log('  Bucket        Count   % of Total')
  console.log('  ──────────── ────── ──────────')
  for (const [bucket, races] of Object.entries(buckets)) {
    const pct = (races.length / closeMisses.length * 100).toFixed(1)
    console.log(`  ${bucket.padEnd(12)} ${String(races.length).padStart(5)}  ${pct.padStart(6)}%`)
  }

  console.log('\n  INTERPRETATION:')
  console.log('  ───────────────')
  console.log('  If "0 runs" bucket has winners → signal is NOT from course history')
  console.log('  If signal grows with runs → information density bias')
  console.log('  If signal works at 1-2 runs → genuine course familiarity')
  console.log('\n═══════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })