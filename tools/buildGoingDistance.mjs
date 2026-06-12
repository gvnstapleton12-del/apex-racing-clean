import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CACHE_DIR = join(ROOT, 'data', 'backtest-cache')

// ── Going shortcode → full name ──
const GOING_MAP = {
  FM: 'Firm', FST: 'Firm', GD: 'Good', GF: 'Good to Firm',
  GS: 'Good to Soft', SFT: 'Soft', HVY: 'Heavy',
  ST: 'All Weather', STS: 'All Weather', YLD: 'Good to Yielding',
}

// ── Distance parser: "1m 4f 6y" → furlongs ──
function parseDistance(distStr) {
  if (!distStr) return 0
  let totalF = 0
  const mMatch = distStr.match(/(\d+)\s*m/)
  const fMatch = distStr.match(/(\d+)\s*f/)
  const yMatch = distStr.match(/(\d+)\s*y/)
  if (mMatch) totalF += parseInt(mMatch[1]) * 8
  if (fMatch) totalF += parseInt(fMatch[1])
  if (yMatch) totalF += parseInt(yMatch[1]) / 220
  if (!mMatch && !fMatch && !yMatch) {
    const num = parseFloat(distStr)
    if (!isNaN(num)) totalF = num
  }
  return Math.round(totalF * 100) / 100
}

// ── Surface from run_type ──
function surfaceFromRunType(runType, courseName) {
  const rt = (runType || '').toUpperCase()
  if (rt === 'FLAT') return 'turf'
  return 'turf'
}

// ── Build databases ──
const goingDb = {}
const distanceDb = {}

const files = readdirSync(CACHE_DIR)
  .filter(f => f.startsWith('results-') && f.endsWith('.json'))
  .sort()

let totalRunners = 0
let totalPrev = 0

for (const file of files) {
  const data = JSON.parse(readFileSync(join(CACHE_DIR, file), 'utf8'))
  for (const race of data) {
    for (const runner of (race.runners || [])) {
      if (!runner.horse || !runner.horse_id) continue
      const hid = runner.horse_id
      totalRunners++

      if (!goingDb[hid]) goingDb[hid] = { byGoing: {}, bySurface: {} }
      if (!distanceDb[hid]) distanceDb[hid] = { lastDistance: 0, performances: [] }

      const prevResults = (runner.previous_results || []).sort((a, b) => {
        if (a.date && b.date) return a.date.localeCompare(b.date)
        return 0
      })

      for (const pr of prevResults) {
        totalPrev++
        const pos = pr.position || 0
        if (pos < 1) continue

        // ── Going DB ──
        const goingKey = GOING_MAP[pr.going_shortcode] || 'Unknown'
        if (!goingDb[hid].byGoing[goingKey]) goingDb[hid].byGoing[goingKey] = { runs: 0, wins: 0, places: 0 }
        goingDb[hid].byGoing[goingKey].runs++
        if (pos === 1) goingDb[hid].byGoing[goingKey].wins++
        if (pos >= 2 && pos <= 4) goingDb[hid].byGoing[goingKey].places++

        const surface = surfaceFromRunType(pr.run_type, race.course)
        if (!goingDb[hid].bySurface[surface]) goingDb[hid].bySurface[surface] = { runs: 0, wins: 0, places: 0 }
        goingDb[hid].bySurface[surface].runs++
        if (pos === 1) goingDb[hid].bySurface[surface].wins++
        if (pos >= 2 && pos <= 4) goingDb[hid].bySurface[surface].places++

        // ── Distance DB ──
        const distF = parseDistance(pr.distance)
        if (distF > 0) {
          distanceDb[hid].lastDistance = distF
          distanceDb[hid].performances.push({
            distance: distF,
            won: pos === 1,
            placed: pos >= 2 && pos <= 4,
            date: pr.date || '',
          })
        }
      }
    }
  }
}

// ── Save ──
writeFileSync(join(ROOT, 'data', 'going-database.json'), JSON.stringify(goingDb, null, 2))
writeFileSync(join(ROOT, 'data', 'distance-database.json'), JSON.stringify(distanceDb, null, 2))

console.log(`Built goingDb: ${Object.keys(goingDb).length} horses, ${totalPrev} records`)
console.log(`Built distanceDb: ${Object.keys(distanceDb).length} horses`)
console.log(`Sample going:`, JSON.stringify(goingDb[Object.keys(goingDb)[0]].byGoing, null, 2))
console.log(`Sample distance:`, JSON.stringify(distanceDb[Object.keys(distanceDb)[0]], null, 2))
