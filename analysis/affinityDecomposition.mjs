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
const OUT_PATH = './analysis/affinity-decomposition.json'

function loadJson(p) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null }
  catch { return null }
}

const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'))
const TRACK_PROFILES = loadJson(TRACKS_PATH) || {}
const TRAINER_FORM_DB = {}
for (const [k, v] of Object.entries(loadJson('./data/trainer-form.json') || {})) TRAINER_FORM_DB[k.toLowerCase()] = v
const JOCKEY_FORM_DB = {}
for (const [k, v] of Object.entries(loadJson('./data/jockey-form.json') || {})) JOCKEY_FORM_DB[k.toLowerCase()] = v
const LEARNING_DB = loadJson('./data/learning.json') || {}
const OR_HISTORY = buildORHistory(LEARNING_DB.records || [])
const LEARNING_RACES = LEARNING_DB.races || []
const MULTIPLIER = LEARNING_DB.weights?.multiplier || {}
const GOING_DB = loadJson('./data/going-database.json') || {}
const DISTANCE_DB = loadJson('./data/distance-database.json') || {}

// ── Race map → close misses ──
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
  closeMisses.push({
    raceId: winner.raceId, course: winner.course, date: winner.date,
    pick: { horse: sorted[0].horse }, winner: { horse: winner.horse, rank: winner.rank },
  })
}
console.log(`Found ${closeMisses.length} close misses`)

// ── Cache ──
const cacheFiles = readdirSync(CACHE_DIR).filter(f => f.startsWith('results-') && f.endsWith('.json')).sort()
const cacheByDate = {}
for (const f of cacheFiles) cacheByDate[f.replace('results-','').replace('.json','')] = loadJson(join(CACHE_DIR, f))

function decimalFromOdds(o) {
  if (!o || o <= 0) return 0
  if (typeof o === 'string') { const m = o.match(/^(\d+)\/(\d+)$/); return m ? 1 + parseInt(m[1])/parseInt(m[2]) : parseFloat(o) || 0 }
  return o
}

function detectRaceType(race) {
  const n = (race.race_name || '').toLowerCase()
  if (/(hurdle|chase|nh\s*flat|national hunt)/.test(n)) return 'Jumps'
  const runners = race.runners || []; let hc = 0, fc = 0
  for (const r of runners) for (const pr of (r.previous_results || [])) { const rt = (pr.run_type || '').toUpperCase(); if (rt === 'HURDLE'||rt==='CHASE'||rt==='NH_FLAT') hc++; else if (rt==='FLAT') fc++ }
  return hc > fc ? 'Jumps' : 'Flat'
}

// ── Process ──
let processed = 0, engineErrors = 0, matchFailures = 0
const records = []

for (const cm of closeMisses) {
  const race = cacheByDate[cm.date]?.find(r => (r.race_id||'') === cm.raceId && (r.course||'') === cm.course)
  if (!race) { engineErrors++; continue }

  const raceType = detectRaceType(race)
  const engineRunners = (race.runners || []).map(r => ({
    horse: r.horse, horse_id: r.horse_id || '', odds: decimalFromOdds(r.odds) || 2,
    or: r.or || 0, rpr: r.rpr || 0, draw: r.draw || 0, jockey: r.jockey || '',
    trainer: r.trainer || '', form: r.form || '', age: r.age || 0, sex: r.sex || '',
    lbs: r.lbs || '', last_run: r.last_run || 0, previous_results: r.previous_results || [],
    runningStyle: null, marketMovement: 'UNKNOWN', headgear: { items: [], firstTimeItems: [] }, weight: '',
  }))

  let engineResult
  try {
    engineResult = runApexEngine(engineRunners, {
      course: race.course || '', off_time: '', date: race.date || '',
      going: race.going || '', distance_f: race.distance_f || '',
      race_class: race.race_class || 0, type: raceType === 'Jumps' ? 'Hurdle' : 'Flat',
      race_name: race.race_name || '', surface: '', field_size: engineRunners.length,
    }, {
      goingDb: GOING_DB, distanceDb: DISTANCE_DB, trainerForm: TRAINER_FORM_DB,
      jockeyForm: JOCKEY_FORM_DB, orHistory: OR_HISTORY, races: LEARNING_RACES,
      multiplier: MULTIPLIER, trackProfiles: TRACK_PROFILES,
    })
  } catch { engineErrors++; continue }

  const preds = engineResult.racecards || []
  const wPred = preds.find(p => p.horse === cm.winner.horse)
  const pPred = preds.find(p => p.horse === cm.pick.horse)
  if (!wPred || !pPred) { matchFailures++; continue }

  // Extract personalAffinity subcomponents
  function extractPAComponents(runner) {
    const pa = runner.personalAffinity || {}
    const bd = pa.breakdown || {}
    const trk = bd.track || {}
    const dst = bd.distance || {}
    const gng = bd.going || {}
    const ds = bd.drawStyle || {}

    return {
      // Raw adjustments (already scaled by sub-weights)
      trackAdj: trk.adjustment ?? 0,
      distanceAdj: dst.adjustment ?? 0,
      goingAdj: gng.adjustment ?? 0,
      drawStyleAdj: ds.adjustment ?? 0,
      // Raw win rates / bonuses
      trackWR: trk.winRate ?? 0,
      distanceWR: dst.winRate ?? 0,
      goingWR: gng.winRate ?? 0,
      drawStyleBonus: ds.bonus ?? 0,
      // Data availability
      trackRuns: trk.runs ?? trk.confidence != null ? Math.round(trk.confidence * 20) : 0,
      distanceRuns: dst.runs ?? 0,
      goingRuns: gng.runs ?? 0,
      distanceGated: dst.gated ?? false,
      goingGated: gng.gated ?? false,
      // Confidence
      trackConfidence: trk.confidence ?? 0,
      distanceConfidence: dst.confidence ?? 0,
      goingConfidence: gng.confidence ?? 0,
      dsConfidence: ds.confidence ?? 0,
      // Overall adjustment
      totalAdjustment: pa.adjustment ?? 0,
    }
  }

  const wPA = extractPAComponents(wPred)
  const pPA = extractPAComponents(pPred)

  // Compute deltas
  const subcomponents = ['trackAdj','distanceAdj','goingAdj','drawStyleAdj','trackWR','distanceWR','goingWR','drawStyleBonus','distanceGated','goingGated','trackConfidence','distanceConfidence','goingConfidence','dsConfidence','totalAdjustment']
  const deltas = {}
  for (const comp of subcomponents) {
    deltas[comp] = Math.round(((wPA[comp] ?? 0) - (pPA[comp] ?? 0)) * 1000) / 1000
  }

  // Which subcomponent contributed most?
  const contribKeys = ['trackAdj','distanceAdj','goingAdj','drawStyleAdj']
  const contributions = contribKeys.map(k => ({ key: k, delta: deltas[k] })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const topContributor = contributions[0]

  records.push({
    raceId: cm.raceId, course: cm.course, winner: cm.winner.horse, pick: cm.pick.horse, rank: cm.winner.rank,
    winnerPA: wPA,
    pickPA: pPA,
    deltas,
    topContributor: topContributor.delta > 0 ? topContributor.key : 'none',
    contributions,
  })
  processed++
}

// ── Aggregate ──
function median(arr) {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2
}

const FOCUS_KEYS = ['trackAdj','distanceAdj','goingAdj','drawStyleAdj','totalAdjustment','trackWR','drawStyleBonus','distanceGated','goingGated']

const stats = {}
for (const comp of FOCUS_KEYS) {
  const vals = records.map(r => r.deltas[comp])
  const winBetter = records.filter(r => r.deltas[comp] > 0).length
  stats[comp] = {
    avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 1000) / 1000,
    median: median(vals),
    min: Math.min(...vals),
    max: Math.max(...vals),
    winnerBetter: winBetter,
    winnerBetterPct: Math.round(winBetter / records.length * 100),
    winnerGap: Math.round((records.length - winBetter) / records.length * 100),
  }
}

// Promotion driver counts (which subcomponent had largest positive delta)
const driverCounts = {}
for (const r of records) {
  driverCounts[r.topContributor] = (driverCounts[r.topContributor] || 0) + 1
}

// ── Data coverage ──
const trackHasData = records.filter(r => r.winnerPA.trackAdj !== 0 || r.pickPA.trackAdj !== 0).length
const distHasData = records.filter(r => !r.winnerPA.distanceGated || !r.pickPA.distanceGated).length
const goingHasData = records.filter(r => !r.winnerPA.goingGated || !r.pickPA.goingGated).length
const dsHasData = records.filter(r => r.winnerPA.drawStyleBonus !== 0 || r.pickPA.drawStyleBonus !== 0).length

// ── Output ──
console.log('\n═══════════════════════════════════════════════════════')
console.log('  PERSONAL AFFINITY DECOMPOSITION v2')
console.log('═══════════════════════════════════════════════════════\n')

console.log(`  Races: ${processed}, records: ${records.length}\n`)

console.log('  Component             Avg Δ    Med Δ   Winner+    %    NormWt')
console.log('  ──────────────────── ──────── ──────── ──────── ──── ──────')
const sorted = [...FOCUS_KEYS].sort((a, b) => Math.abs(stats[b].avg) - Math.abs(stats[a].avg))
for (const comp of sorted) {
  const s = stats[comp]
  const sa = s.avg >= 0 ? '+' : ''
  const sm = s.median >= 0 ? '+' : ''
  const weight = comp === 'trackAdj' ? '×0.35' : comp === 'distanceAdj' ? '×0.30' : comp === 'goingAdj' ? '×0.25' : comp === 'drawStyleAdj' ? '×0.10' : comp === 'totalAdjustment' ? '—' : comp === 'trackWR' ? 'raw' : comp === 'drawStyleBonus' ? 'raw' : '—'
  console.log(`  ${comp.padEnd(20)} ${sa}${s.avg.toFixed(4).padStart(8)} ${sm}${s.median.toFixed(4).padStart(7)} ${String(s.winnerBetter).padStart(5)}/${records.length} ${s.winnerBetterPct}%  ${weight}`)
}

console.log('\n  PROMOTION DRIVERS (largest +delta subcomponent):')
const sortedD = Object.entries(driverCounts).sort((a, b) => b[1] - a[1])
for (const [driver, count] of sortedD) {
  const pct = Math.round(count / records.length * 100)
  console.log(`  ${driver.padEnd(18)} ${String(count).padStart(4)}/${records.length} (${pct}%)`)
}

console.log('\n  DATA COVERAGE:')
console.log(`  Track (has any data):    ${trackHasData}/${records.length} (${Math.round(trackHasData/records.length*100)}%)`)
console.log(`  Distance (not gated):    ${distHasData}/${records.length} (${Math.round(distHasData/records.length*100)}%)`)
console.log(`  Going (not gated):       ${goingHasData}/${records.length} (${Math.round(goingHasData/records.length*100)}%)`)
console.log(`  DrawStyle (non-zero):    ${dsHasData}/${records.length} (${Math.round(dsHasData/records.length*100)}%)`)

// Raw track WR decomposition (before weight scaling)
console.log('\n  RAW TRACK WIN RATE DELTA (before ×0.35 weight):')
const rawTrackDeltas = records.map(r => r.deltas.trackWR)
const rawTrackWinBetter = records.filter(r => r.deltas.trackWR > 0).length
const rawTrackAvg = rawTrackDeltas.reduce((s, v) => s + v, 0) / rawTrackDeltas.length
console.log(`  Winner Better:  ${rawTrackWinBetter}/${records.length} (${Math.round(rawTrackWinBetter/records.length*100)}%)`)
console.log(`  Avg Delta:      ${rawTrackAvg >= 0 ? '+' : ''}${(rawTrackAvg * 100).toFixed(1)}pp`)

// Raw distance WR
const rawDistDeltas = records.filter(r => !r.winnerPA.distanceGated || !r.pickPA.distanceGated).map(r => r.deltas.distanceWR)
if (rawDistDeltas.length > 0) {
  const rawDistWinBetter = records.filter(r => !r.winnerPA.distanceGated || !r.pickPA.distanceGated).filter(r => r.deltas.distanceWR > 0).length
  const rawDistAvg = rawDistDeltas.reduce((s, v) => s + v, 0) / rawDistDeltas.length
  console.log(`\n  RAW DISTANCE WR DELTA (ungated only, n=${rawDistDeltas.length}):`)
  console.log(`  Winner Better:  ${rawDistWinBetter}/${rawDistDeltas.length} (${Math.round(rawDistWinBetter/rawDistDeltas.length*100)}%)`)
  console.log(`  Avg Delta:      ${rawDistAvg >= 0 ? '+' : ''}${(rawDistAvg * 100).toFixed(1)}pp`)
}

// DrawStyle bonus decomposition
const rawDSDeltas = records.map(r => r.deltas.drawStyleBonus)
const rawDSWinBetter = records.filter(r => r.deltas.drawStyleBonus > 0).length
const rawDSAvg = rawDSDeltas.reduce((s, v) => s + v, 0) / rawDSDeltas.length
console.log(`\n  RAW DRAWSTYLE BONUS DELTA (before ×0.10 weight):`)
console.log(`  Winner Better:  ${rawDSWinBetter}/${records.length} (${Math.round(rawDSWinBetter/records.length*100)}%)`)
console.log(`  Avg Delta:      ${rawDSAvg >= 0 ? '+' : ''}${(rawDSAvg * 100).toFixed(2)}pp`)

// Save
writeFileSync(OUT_PATH, JSON.stringify({
  summary: { races: processed, records: records.length, engineErrors, matchFailures, stats: Object.fromEntries(Object.entries(stats).filter(([k]) => FOCUS_KEYS.includes(k))), driverCounts, dataCoverage: { track: trackHasData, distance: distHasData, going: goingHasData, drawStyle: dsHasData, total: records.length } },
  records: records.map(r => ({ raceId: r.raceId, course: r.course, winner: r.winner, pick: r.pick, rank: r.rank, topContributor: r.topContributor, deltas: r.deltas })),
}, null, 2))

console.log(`\n  Saved to ${OUT_PATH}`)
console.log('═══════════════════════════════════════════════════════\n')
