import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

const toFileUrl = (p) => new URL(`file:///${p.replace(/\\/g, '/')}`).href
const { runApexEngine } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'apexEngine.js')))
const { buildORHistory } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'classModel.js')))

const CACHE_DIR = join(ROOT, 'data', 'backtest-cache')
const RESULTS_PATH = join(ROOT, 'data', 'backtest-results-current.json')
const TRACKS_PATH = join(ROOT, 'data', 'trackProfiles.json')

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
  console.log('  PROMOTION SOURCE AUDIT')
  console.log('═══════════════════════════════════════════════════════\n')
  console.log(`Analyzing ${closeMisses.length} close misses...\n`)

  let processed = 0
  const promotionDrivers = {
    'Course only': [],
    'Course + Distance': [],
    'Course + Ground': [],
    'Course + Power': [],
    'Other combinations': [],
    'Other': []
  }

  for (const cm of closeMisses) {
    const cacheData = cacheByDate[cm.date]
    if (!cacheData) continue

    const race = cacheData.find(r =>
      (r.race_id || '') === cm.raceId &&
      (r.course || '') === cm.course
    )
    if (!race) continue

    const raceType = detectRaceType(race)
    const engineRunners = (race.runners || []).map(r => ({
      horse: r.horse,
      horse_id: r.horse_id || '',
      odds: 2,
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
      field_size: race.runners.length,
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
    } catch (err) {
      continue
    }

    const preds = engineResult.racecards || []
    const winnerPred = preds.find(p => p.horse === cm.winner.horse)
    const pickPred = preds.find(p => p.horse === cm.pick.horse)

    if (!winnerPred || !pickPred) continue

    // Identify which features drove the promotion
    const wFeatures = winnerPred.features || {}
    const pFeatures = pickPred.features || {}
    const wCourseAffinity = winnerPred.personalAffinity?.courseAdj || 0
    const pCourseAffinity = pickPred.personalAffinity?.courseAdj || 0
    const wDistanceAffinity = winnerPred.personalAffinity?.distanceAdj || 0
    const pDistanceAffinity = pickPred.personalAffinity?.distanceAdj || 0
    const wGoingAffinity = winnerPred.personalAffinity?.goingAdj || 0
    const pGoingAffinity = pickPred.personalAffinity?.goingAdj || 0

    const drivers = []
    if (wCourseAffinity > pCourseAffinity + 1) drivers.push('Course')
    if (wDistanceAffinity > pDistanceAffinity + 1) drivers.push('Distance')
    if (wGoingAffinity > pGoingAffinity + 1) drivers.push('Ground')
    if (wFeatures.power > pFeatures.power + 1) drivers.push('Power')

    let category
    if (drivers.length === 0) category = 'Other'
    else if (drivers.length === 1 && drivers[0] === 'Course') category = 'Course only'
    else if (drivers.includes('Course') && drivers.includes('Distance')) category = 'Course + Distance'
    else if (drivers.includes('Course') && drivers.includes('Ground')) category = 'Course + Ground'
    else if (drivers.includes('Course') && drivers.includes('Power')) category = 'Course + Power'
    else category = 'Other combinations'

    promotionDrivers[category].push(cm)
    processed++
  }

  console.log('  Driver              Count   % of Total')
  console.log('  ─────────────────── ────── ──────────')
  for (const [driver, races] of Object.entries(promotionDrivers)) {
    const pct = (races.length / processed * 100).toFixed(1)
    console.log(`  ${driver.padEnd(20)} ${String(races.length).padStart(5)}  ${pct.padStart(6)}%`)
  }

  console.log('\n  INTERPRETATION:')
  console.log('  ───────────────')
  console.log('  If "Course only" is dominant → course affinity is the primary driver')
  console.log('  If "Other combinations" is high → multiple factors interacting')
  console.log('  If "Other" is high → may be capturing something else')
  console.log('\n═══════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })