import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const toFileUrl = (p) => new URL(`file:///${p.replace(/\\/g, '/')}`).href
const { runApexEngine } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'apexEngine.js')))
const { buildORHistory } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'classModel.js')))

// ── Paths ──
const CACHE_DIR = join(ROOT, 'data', 'backtest-cache')
const RESULTS_PATH = join(ROOT, 'data', 'backtest-results-current.json')
const TRACKS_PATH = join(ROOT, 'data', 'trackProfiles.json')
const OUT_JSON = join(ROOT, 'analysis', 'promotion-attribution.json')
const OUT_CSV = join(ROOT, 'analysis', 'promotion-attribution.csv')

const MIN_RUNNERS = 5
const MINOR_THRESHOLD = 0.5
const MAJOR_THRESHOLD = 2.0

// ── Effective weights on qualityAdjustedScore ──
const EFFECTIVE_WEIGHTS = {
  power:            0.150,
  paceCompat:       0.155,
  raceShape:        0.200,
  ground:           0.030,
  distance:         0.030,
  trainerForm:      0.030,
  courseAffinity:   0.02625,  // 0.0105 * 2.5 (current ×2.5 multiplier)
  distanceAffinity: 0.009,
  goingAffinity:    0.0075,
  rprORGap:         0.020,
  orFit:            0.030,
  personalAffinity: 0.030,
}

const FEATURE_NAMES = Object.keys(EFFECTIVE_WEIGHTS)

// ── Helpers ──
function loadJson(p) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null }
  catch { return null }
}

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

// ── Feature extraction from fresh engine output ──
function extractFeature(runner) {
  const hq = runner.horseQuality || {}
  const nc = runner.newComponents || {}
  const cm = runner.classModel || {}
  const pa = runner.personalAffinity || {}
  const paBreak = pa.breakdown || {}

  return {
    power:            hq.power ?? 0,
    paceCompat:       runner.paceCompat?.compatibility ?? 50,
    raceShape:        runner.raceShapeSuitability ?? 50,
    ground:           nc.ground ?? 50,
    distance:         nc.distance ?? 50,
    trainerForm:      nc.trainerForm ?? 50,
    courseAffinity:   pa.courseAdj ?? 0,
    distanceAffinity: pa.distanceAdj ?? 0,
    goingAffinity:    pa.goingAdj ?? 0,
    rprORGap:         cm.rprORGap ?? 0,
    orFit:            cm.orFitScore ?? 50,
    personalAffinity: pa.adjustment ?? 0,
  }
}

function median(arr) {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ── MAIN ──
async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  PROMOTION ATTRIBUTION ANALYSIS')
  console.log('═══════════════════════════════════════════════════════\n')

  // ── Load databases ──
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
  console.log(`  ${Object.keys(TRAINER_FORM_DB).length} trainers, ${Object.keys(OR_HISTORY).length} OR history, ${Object.keys(GOING_DB).length} goingDb, ${Object.keys(DISTANCE_DB).length} distanceDb`)

  // ── Load backtest results ──
  const results = loadJson(RESULTS_PATH)
  if (!results || !Array.isArray(results)) {
    console.error('No backtest results. Run backtest_historical.mjs first.')
    process.exit(1)
  }

  // ── Build race map from backtest results ──
  const raceMap = {}
  for (const r of results) {
    const key = `${r.raceId}||${r.date}||${r.course}`
    if (!raceMap[key]) raceMap[key] = []
    raceMap[key].push(r)
  }

  // ── Step 1: Identify close misses ──
  console.log('\nStep 1: Identifying close misses...')
  const closeMisses = []
  for (const [key, runners] of Object.entries(raceMap)) {
    if (runners.length < MIN_RUNNERS) continue
    const sorted = [...runners].sort((a, b) => (b.winProb || 0) - (a.winProb || 0))
    sorted.forEach((r, i) => { r.rank = i + 1 })
    const winner = sorted.find(r => r.won)
    if (!winner || winner.rank === 1) continue
    closeMisses.push({
      raceId: winner.raceId,
      course: winner.course,
      date: winner.date,
      horse: winner.horse,
      pick: { horse: sorted[0].horse, rank: sorted[0].rank, winProb: sorted[0].winProb },
      winner: { horse: winner.horse, rank: winner.rank, winProb: winner.winProb, odds: winner.odds },
    })
  }
  console.log(`  ${closeMisses.length} close misses (winner ranked #2-5)\n`)

  // ── Load cache files ──
  const cacheFiles = readdirSync(CACHE_DIR)
    .filter(f => f.startsWith('results-') && f.endsWith('.json'))
    .sort()
  const cacheByDate = {}
  for (const f of cacheFiles) {
    const date = f.replace('results-', '').replace('.json', '')
    cacheByDate[date] = loadJson(join(CACHE_DIR, f))
  }

  // ── Step 2: Re-run engine on each close-miss race ──
  console.log('Step 2: Re-running engine on close-miss races...')
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
    } catch (err) {
      engineErrors++; continue
    }

    const preds = engineResult.racecards || []
    const winnerPred = preds.find(p => p.horse === cm.winner.horse)
    const pickPred = preds.find(p => p.horse === cm.pick.horse)

    if (!winnerPred || !pickPred) { matchFailures++; continue }

    // Extract features from fresh engine output
    const wf = extractFeature(winnerPred)
    const pf = extractFeature(pickPred)

    // Compute deltas (winner - pick)
    const deltas = {}
    let totalWeightedDelta = 0
    for (const fn of FEATURE_NAMES) {
      const wVal = wf[fn] ?? 0
      const pVal = pf[fn] ?? 0
      const delta = wVal - pVal
      const weighted = delta * (EFFECTIVE_WEIGHTS[fn] ?? 0)
      deltas[fn] = { raw: delta, weighted }
      totalWeightedDelta += weighted
    }

    // Compute final score deltas
    const finalScoreDelta = (winnerPred.finalScore || 0) - (pickPred.finalScore || 0)
    const qualityDelta = (winnerPred.qualityAdjustedScore || 50) - (pickPred.qualityAdjustedScore || 50)

    // Classify promotion
    const absDelta = Math.abs(finalScoreDelta)
    let promotionType
    if (absDelta >= MAJOR_THRESHOLD) promotionType = 'major'
    else if (absDelta >= MINOR_THRESHOLD) promotionType = 'minor'
    else promotionType = 'none'

    // Determine top contributing feature
    const contributions = FEATURE_NAMES.map(fn => ({
      feature: fn,
      contribution: deltas[fn].weighted,
      rawDelta: deltas[fn].raw,
    })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))

    if (promotionType !== 'none') {
      promotions.push({
        raceId: cm.raceId,
        course: cm.course,
        date: cm.date,
        pick: cm.pick.horse,
        winner: cm.winner.horse,
        promotionType,
        finalScoreDelta,
        qualityDelta,
        totalWeightedDelta,
        topDrivers: contributions.slice(0, 3).map(c => c.feature),
        deltas: { ...deltas },
        contributions,
      })
    }

    processed++
  }

  console.log(`  ${processed} races processed, ${promotions.length} promotions identified\n`)

  // ── Aggregate statistics ──
  const majorPromotions = promotions.filter(p => p.promotionType === 'major')
  const minorPromotions = promotions.filter(p => p.promotionType === 'minor')

  // Count feature as driver (top 3 contributor)
  const driverCounts = { major: {}, minor: {}, total: {} }
  for (const fn of FEATURE_NAMES) {
    driverCounts.major[fn] = 0
    driverCounts.minor[fn] = 0
    driverCounts.total[fn] = 0
  }

  for (const p of promotions) {
    for (const driver of p.topDrivers) {
      if (p.promotionType === 'major') driverCounts.major[driver]++
      else if (p.promotionType === 'minor') driverCounts.minor[driver]++
      driverCounts.total[driver]++
    }
  }

  // Average delta per feature
  const avgDeltas = {}
  for (const fn of FEATURE_NAMES) {
    const vals = promotions.map(p => p.deltas[fn]?.raw ?? 0)
    avgDeltas[fn] = {
      avgRaw: vals.reduce((s, v) => s + v, 0) / vals.length,
      medianRaw: median(vals),
      min: Math.min(...vals),
      max: Math.max(...vals),
    }
  }

  // ── Step 3: Output ──
  // Console: Promotion Driver Attribution
  console.log('═══════════════════════════════════════════════════════')
  console.log('  PROMOTION DRIVER ATTRIBUTION')
  console.log('═══════════════════════════════════════════════════════\n')

  const sortedDrivers = [...FEATURE_NAMES].sort((a, b) => driverCounts.total[b] - driverCounts.total[a])

  console.log('  Driver                 Major     Minor     Total')
  console.log('  ────────────────────── ──────── ──────── ────────')
  for (const fn of sortedDrivers) {
    console.log(`  ${fn.padEnd(22)} ${String(driverCounts.major[fn]).padStart(8)} ${String(driverCounts.minor[fn]).padStart(8)} ${String(driverCounts.total[fn]).padStart(8)}`)
  }

  // Console: Average Delta per Feature
  console.log('\n  AVERAGE CONTRIBUTION TO PROMOTIONS')
  console.log('  Feature                Avg Delta  Median')
  console.log('  ────────────────────── ───────── ───────')

  const sortedAvg = [...FEATURE_NAMES].sort((a, b) =>
    Math.abs(avgDeltas[b].avgRaw) - Math.abs(avgDeltas[a].avgRaw)
  )
  for (const fn of sortedAvg) {
    const sign = avgDeltas[fn].avgRaw >= 0 ? '+' : ''
    console.log(`  ${fn.padEnd(22)} ${sign}${avgDeltas[fn].avgRaw.toFixed(2).padStart(8)}  ${sign}${avgDeltas[fn].medianRaw.toFixed(2).padStart(5)}`)
  }

  console.log('\n  SUMMARY:')
  console.log(`  Total close-miss races:   ${processed}`)
  console.log(`  Major promotions (≥2.0):  ${majorPromotions.length}`)
  console.log(`  Minor promotions (≥0.5):  ${minorPromotions.length}`)
  console.log(`  Engine errors:            ${engineErrors}`)
  console.log(`  Match failures:           ${matchFailures}`)

  // ── Save JSON ──
  const jsonOutput = {
    summary: {
      totalRaces: processed,
      majorPromotions: majorPromotions.length,
      minorPromotions: minorPromotions.length,
      totalPromotions: promotions.length,
    },
    driverAttribution: {},
    avgDeltas: {},
    promotions: promotions.map(p => ({
      raceId: p.raceId,
      course: p.course,
      date: p.date,
      winner: p.winner,
      pick: p.pick,
      promotionType: p.promotionType,
      finalScoreDelta: p.finalScoreDelta,
      qualityDelta: p.qualityDelta,
      topDrivers: p.topDrivers,
      featureDeltas: Object.fromEntries(
        FEATURE_NAMES.map(fn => [fn, p.deltas[fn]?.raw ?? 0])
      ),
    })),
  }

  // Populate driver attribution
  for (const fn of FEATURE_NAMES) {
    jsonOutput.driverAttribution[fn] = {
      major: driverCounts.major[fn],
      minor: driverCounts.minor[fn],
      total: driverCounts.total[fn],
    }
    jsonOutput.avgDeltas[fn] = avgDeltas[fn]
  }

  writeFileSync(OUT_JSON, JSON.stringify(jsonOutput, null, 2))
  console.log(`\n  JSON: ${OUT_JSON}`)

  // ── Save CSV ──
  const csvHeaders = [
    'raceId,course,date,winner,pick,promotionType,finalScoreDelta',
    ...FEATURE_NAMES.map(f => `delta_${f}`),
  ].join(',')

  const csvRows = promotions.map(p => {
    const base = [
      p.raceId, p.course, p.date, p.winner, p.pick, p.promotionType, p.finalScoreDelta.toFixed(2),
    ]
    const deltas = FEATURE_NAMES.map(fn => (p.deltas[fn]?.raw ?? 0).toFixed(2))
    return [...base, ...deltas].join(',')
  })

  writeFileSync(OUT_CSV, csvHeaders + '\n' + csvRows.join('\n'))
  console.log(`  CSV:  ${OUT_CSV}`)

  console.log('\n═══════════════════════════════════════════════════════\n')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })