import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

const CACHE_DIR = join('data', 'backtest-cache')
const PROFILES_PATH = join('data', 'trackProfiles.json')
const MIN_RACES_FOR_STATS = 10

// ── Load existing profiles ──
const profiles = JSON.parse(readFileSync(PROFILES_PATH, 'utf8'))
const tracks = profiles.tracks || {}

// ── Load all cache files ──
const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json')).sort()
console.log(`Loading ${files.length} cache files...`)

const trackData = {}

for (const file of files) {
  const data = JSON.parse(readFileSync(join(CACHE_DIR, file), 'utf8'))
  for (const race of data) {
    const course = race.course
    if (!course) continue
    if (!trackData[course]) {
      trackData[course] = { races: [], runners: [] }
    }
    trackData[course].races.push(race)
    for (const runner of (race.runners || [])) {
      trackData[course].runners.push({
        ...runner,
        going: race.going,
        distance_f: race.distance_f,
        race_class: race.race_class,
        field_size: race.runners?.length || 0,
        date: race.date,
      })
    }
  }
}

console.log(`Found ${Object.keys(trackData).length} tracks with data`)

// ─ Helper: parse distance to furlongs ─
function toFurlongs(dist) {
  if (!dist) return 0
  const m = String(dist).match(/(\d+)m\s*(\d*)f?\s*(\d*)y?/)
  if (m) {
    const miles = Number(m[1]) || 0
    const furlongs = Number(m[2]) || 0
    const yards = Number(m[3]) || 0
    return miles * 8 + furlongs + yards / 220
  }
  return parseFloat(String(dist).replace(/[^0-9.]/g, '')) || 0
}

// ── Helper: normalize going ──
function normalizeGoing(going) {
  if (!going) return 'unknown'
  const g = going.toLowerCase()
  if (g.includes('heavy')) return 'Heavy'
  if (g.includes('soft')) return 'Soft'
  if (g.includes('good to soft')) return 'Good to Soft'
  if (g.includes('good to firm')) return 'Good to Firm'
  if (g.includes('good')) return 'Good'
  if (g.includes('firm')) return 'Firm'
  if (g.includes('standard') || g.includes('slow')) return 'Standard'
  return 'Other'
}

// ── Helper: distance band ──
function distanceBand(f) {
  if (f <= 5) return '5f'
  if (f <= 6) return '6f'
  if (f <= 7) return '7f'
  if (f <= 8) return '1m'
  if (f <= 10) return '1m2f'
  if (f <= 12) return '1m4f'
  if (f <= 14) return '1m6f'
  return '2m+'
}

// ── Compute stats per track ──
const results = {}

for (const [course, data] of Object.entries(trackData)) {
  const runners = data.runners
  const raceCount = data.races.length
  const minRaces = raceCount >= MIN_RACES_FOR_STATS

  // Draw bias by distance (among winners only)
  const drawByDist = {}
  for (const r of runners) {
    if (!r.draw || r.draw < 1 || r.position !== 1) continue
    const dist = distanceBand(toFurlongs(r.distance_f))
    if (!drawByDist[dist]) drawByDist[dist] = { wins: 0, drawWins: {} }
    drawByDist[dist].wins++
    const fs = r.field_size || 10
    const third = Math.ceil(fs / 3)
    const drawPos = r.draw <= third ? 'low' : r.draw > fs - third ? 'high' : 'mid'
    drawByDist[dist].drawWins[drawPos] = (drawByDist[dist].drawWins[drawPos] || 0) + 1
  }

  // Going bias
  const goingStats = {}
  for (const r of runners) {
    const going = normalizeGoing(r.going)
    if (!goingStats[going]) goingStats[going] = { wins: 0, total: 0 }
    goingStats[going].total++
    if (r.position === 1) goingStats[going].wins++
  }

  // Distance bias
  const distStats = {}
  for (const r of runners) {
    const band = distanceBand(toFurlongs(r.distance_f))
    if (!distStats[band]) distStats[band] = { wins: 0, total: 0 }
    distStats[band].total++
    if (r.position === 1) distStats[band].wins++
  }

  // Field size effects
  const fieldStats = {}
  for (const r of runners) {
    const fs = r.field_size
    const bucket = fs <= 7 ? 'small' : fs <= 12 ? 'medium' : 'large'
    if (!fieldStats[bucket]) fieldStats[bucket] = { wins: 0, total: 0 }
    fieldStats[bucket].total++
    if (r.position === 1) fieldStats[bucket].wins++
  }

  // Draw bias summary (low vs high vs mid across all distances)
  // Low = bottom third of draw, High = top third, Mid = middle third
  let lowDrawWins = 0, midDrawWins = 0, highDrawWins = 0, drawWinsTotal = 0
  for (const r of runners) {
    if (!r.draw || r.draw < 1 || r.position !== 1) continue
    drawWinsTotal++
    const fs = r.field_size || 10
    const third = Math.ceil(fs / 3)
    const drawPos = r.draw <= third ? 'low' : r.draw > fs - third ? 'high' : 'mid'
    if (drawPos === 'low') lowDrawWins++
    else if (drawPos === 'high') highDrawWins++
    else midDrawWins++
  }

  results[course] = {
    raceCount,
    runnerCount: runners.length,
    minRaces,
    drawBias: drawWinsTotal > 0 ? {
      low: (lowDrawWins / drawWinsTotal * 100).toFixed(1),
      mid: (midDrawWins / drawWinsTotal * 100).toFixed(1),
      high: (highDrawWins / drawWinsTotal * 100).toFixed(1),
      byDistance: Object.fromEntries(
        Object.entries(drawByDist)
          .filter(([, v]) => v.wins >= 3)
          .map(([dist, v]) => [dist, {
            low: ((v.drawWins.low || 0) / v.wins * 100).toFixed(0),
            mid: ((v.drawWins.mid || 0) / v.wins * 100).toFixed(0),
            high: ((v.drawWins.high || 0) / v.wins * 100).toFixed(0),
            wins: v.wins,
          }])
      ),
    } : null,
    goingBias: Object.fromEntries(
      Object.entries(goingStats)
        .filter(([, v]) => v.total >= 3)
        .map(([going, v]) => [going, {
          wr: (v.wins / v.total * 100).toFixed(1),
          runs: v.total,
        }])
    ),
    distanceBias: Object.fromEntries(
      Object.entries(distStats)
        .filter(([, v]) => v.total >= 3)
        .map(([dist, v]) => [dist, {
          wr: (v.wins / v.total * 100).toFixed(1),
          runs: v.total,
        }])
    ),
    fieldSizeBias: Object.fromEntries(
      Object.entries(fieldStats)
        .map(([bucket, v]) => [bucket, {
          wr: (v.wins / v.total * 100).toFixed(1),
          runs: v.total,
        }])
    ),
  }
}

// ── Merge with existing profiles ─
let updated = 0
for (const [course, stats] of Object.entries(results)) {
  if (!tracks[course]) continue

  // Add derived stats
  tracks[course].derivedStats = {
    raceCount: stats.raceCount,
    runnerCount: stats.runnerCount,
    sufficientData: stats.minRaces,
    drawBias: stats.drawBias,
    goingBias: stats.goingBias,
    distanceBias: stats.distanceBias,
    fieldSizeBias: stats.fieldSizeBias,
  }

  // Auto-generate pace bias from draw bias if not present
  if (!tracks[course].paceBiasByGoing && stats.drawBias) {
    const lowPct = parseFloat(stats.drawBias.low) || 25
    const midPct = parseFloat(stats.drawBias.mid) || 35
    const highPct = parseFloat(stats.drawBias.high) || 25
    const other = 100 - lowPct - midPct - highPct
    tracks[course].paceBiasByGoing = {
      fast: { fr: Math.round(lowPct), pr: Math.round(midPct), md: Math.round(midPct * 0.8), hu: Math.round(highPct) },
      soft: { fr: Math.round(lowPct * 0.7), pr: Math.round(midPct * 1.1), md: Math.round(midPct), hu: Math.round(highPct * 1.3) },
    }
  }

  updated++
}

// ── Save ──
writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2))

console.log(`\nUpdated ${updated} tracks with derived stats`)
console.log('Tracks with sufficient data (10+ races):', Object.values(results).filter(r => r.minRaces).length)
console.log('Tracks with insufficient data:', Object.values(results).filter(r => !r.minRaces).length)

// Summary
console.log('\n=== TRACKS WITH DERIVED STATS (top 10 by race count) ===')
Object.entries(results)
  .sort((a, b) => b[1].raceCount - a[1].raceCount)
  .slice(0, 10)
  .forEach(([course, stats]) => {
    const draw = stats.drawBias ? `Draw: Low ${stats.drawBias.low}% / Mid ${stats.drawBias.mid}% / High ${stats.drawBias.high}%` : 'No draw data'
    console.log(`${course.padEnd(20)} | ${stats.raceCount} races | ${draw}`)
  })
