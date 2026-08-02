// Point-in-Time Backtest Context Builder
// Reconstructs the full engine context using only data available before a target date.
// Eliminates future data leakage for valid backtesting.

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..', '..')

function loadJson(p) {
  try {
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch { return null }
}

function placedPositions(fieldSize) {
  if (fieldSize >= 16) return 4
  if (fieldSize >= 8) return 3
  if (fieldSize >= 5) return 2
  return 1
}

// Load static databases once (these don't change between dates)
export function loadStaticDatabases() {
  const raw = loadJson(join(ROOT, 'data', 'trackProfiles.json')) || {}
  return {
    trackProfiles: raw.tracks || raw,  // Handle both wrapped {tracks:{}} and flat formats
    goingDb: loadJson(join(ROOT, 'data', 'going-database.json')) || {},
    distanceDb: loadJson(join(ROOT, 'data', 'distance-database.json')) || {},
    horseProfiles: loadJson(join(ROOT, 'data', 'horses.json')) || {},
    horseProfileDb: loadJson(join(ROOT, 'data', 'horseProfiles.json')) || {},
    replayDb: loadJson(join(ROOT, 'data', 'replay-notes.json')) || {},
    bucketDb: loadJson(join(ROOT, 'data', 'context-buckets.json')) || {},
    learningData: loadJson(join(ROOT, 'data', 'learning.json')) || { records: [], weights: {} },
    paStore: loadJson(join(ROOT, 'data', 'personalAffinity.json')) || {},
  }
}

// Build point-in-time context for a specific target date
// All queries use race_date < targetDate to prevent future leakage
export async function buildPointInTimeContext(db, targetDate, staticDbs) {
  const fourteenDaysAgo = new Date(targetDate)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
  const sinceDate = fourteenDaysAgo.toISOString().slice(0, 10)

  // 1. Trainer form from horse_runs (14-day window before target)
  const trainerForm = await buildTrainerForm(db, sinceDate, targetDate)

  // 2. Jockey form from jockey_runs (14-day window before target)
  const jockeyForm = await buildJockeyForm(db, sinceDate, targetDate)

  // 3. OR history from horse_runs (all data before target)
  const orHistory = await buildORHistoryBefore(db, targetDate)

  // 4. Filter PA store to only include predictions made before targetDate
  const paStore = filterPAStore(staticDbs.paStore, targetDate)

  // 5. Build calibration analytics from learning records before target
  const learningData = staticDbs.learningData
  const recordsBefore = (learningData.records || []).filter(r => {
    const rd = r.date || r.timestamp?.slice(0, 10) || ''
    return rd < targetDate
  })

  return {
    goingDb: staticDbs.goingDb,
    distanceDb: staticDbs.distanceDb,
    replayDb: staticDbs.replayDb,
    bucketDb: staticDbs.bucketDb,
    horseProfiles: staticDbs.horseProfiles,
    horseProfileDb: staticDbs.horseProfileDb,
    races: recordsBefore,
    trainerForm,
    jockeyForm,
    multiplier: learningData.weights?.multiplier || {},
    calibrationData: null, // Will be computed by engine if needed
    orHistory,
    trackProfiles: staticDbs.trackProfiles,
    paStore,
  }
}

// Attach horse memory to runners using point-in-time SQLite queries
export async function attachHorseMemory(db, runners, race, context) {
  if (!db || !runners.length) return runners

  const { getHorseMemoryBatchBefore, calculateHandicapScore, calculateAbilityFromMemory } = await import('./horseMemoryEngine.js')
  const { computeProvenZoneScore, getCohortBaseline } = await import('./horseMemoryEngine.js')

  const orByHorse = {}
  for (const r of runners) {
    if (r.horse) orByHorse[r.horse] = r.or || 0
  }

  // Batch query with date filter
  const horseNames = Object.keys(orByHorse)
  const memoryBatch = await getHorseMemoryBatchBefore(db, horseNames, orByHorse, race.date)

  for (const runner of runners) {
    if (!runner.horse) continue
    const memory = memoryBatch[runner.horse]
    if (memory) {
      const handicapScore = calculateHandicapScore(memory, runner.or || 0)
      const abilityScore = calculateAbilityFromMemory(memory, runner.or || 0, runner.rpr || 0)
      runner.horseMemory = {
        ...memory,
        handicapScore: handicapScore.score,
        handicapLabel: handicapScore.label,
        abilityScore,
      }
    }
  }

  // Proven zone scoring — batch query to avoid N+1
  const GOING_TO_NUM = { 'firm': 1, 'good to firm': 2, 'good': 3, 'good to soft': 4, 'soft': 5, 'heavy': 6 }
  const raceGoingNum = GOING_TO_NUM[String(race.going || '').toLowerCase()] || 0
  const raceFieldSize = race.field_size || runners.length || 0
  const raceClass = race.race_class || ''

  try {
    const horseNames = runners.filter(r => r.horse && r.horseMemory).map(r => r.horse)
    if (horseNames.length > 0) {
      const placeholders = horseNames.map(() => '?').join(',')
      const zoneRows = await db.all(
        `SELECT * FROM horse_runs WHERE horse_name IN (${placeholders}) AND race_date < ? ORDER BY horse_name, race_date DESC LIMIT 2000`,
        [...horseNames, race.date]
      )
      const rowsByHorse = {}
      for (const row of zoneRows) {
        if (!rowsByHorse[row.horse_name]) rowsByHorse[row.horse_name] = []
        if (rowsByHorse[row.horse_name].length < 50) rowsByHorse[row.horse_name].push(row)
      }

      // Batch cohort baseline queries — cache by trainer|course key
      const cohortCache = new Map()
      const trainerCoursePairs = runners
        .filter(r => r.horse && r.horseMemory)
        .map(r => `${r.trainer || ''}|${race.course || ''}`)
        .filter((v, i, a) => a.indexOf(v) === i)

      for (const pair of trainerCoursePairs) {
        const [trainer, course] = pair.split('|')
        if (!trainer) continue
        try {
          const query = course
            ? `SELECT COUNT(*) as total, SUM(CASE WHEN finish_position = 1 THEN 1 ELSE 0 END) as wins,
               AVG(CASE WHEN finish_position = 1 THEN field_size ELSE NULL END) as avgWinFieldSize,
               AVG(CASE WHEN finish_position = 1 THEN or_rating ELSE NULL END) as avgWinOR
               FROM horse_runs WHERE trainer = ? AND course = ?`
            : `SELECT COUNT(*) as total, SUM(CASE WHEN finish_position = 1 THEN 1 ELSE 0 END) as wins,
               AVG(CASE WHEN finish_position = 1 THEN field_size ELSE NULL END) as avgWinFieldSize,
               AVG(CASE WHEN finish_position = 1 THEN or_rating ELSE NULL END) as avgWinOR
               FROM horse_runs WHERE trainer = ?`
          const row = await db.get(query, course ? [trainer, course] : [trainer])
          if (row && row.total >= 5) {
            cohortCache.set(pair, {
              winRate: row.wins / row.total,
              totalRuns: row.total,
              totalWins: row.wins || 0,
              avgWinFieldSize: Math.round(row.avgWinFieldSize || 0),
              avgWinOR: Math.round(row.avgWinOR || 0),
            })
          }
        } catch {}
      }

      for (const runner of runners) {
        if (!runner.horse || !runner.horseMemory) continue
        const rows = rowsByHorse[runner.horse]
        if (!rows || !rows.length) continue
        const pair = `${runner.trainer || ''}|${race.course || ''}`
        const cohort = cohortCache.get(pair) || null
        const zone = computeProvenZoneScore(rows, {
          or: runner.or || 0,
          goingNum: raceGoingNum,
          going: race.going || '',
          distanceFurlongs: race.distance_furlongs || 0,
          fieldSize: raceFieldSize,
          raceClass,
        }, cohort)
        runner.horseMemory.provenZoneScore = zone.score
        runner.horseMemory.provenZoneDetails = zone.details
        runner.horseMemory.provenZoneInZone = zone.inZone
        runner.horseMemory.provenZoneAnchor = zone.anchor || null
      }
    }
  } catch {}

  return runners
}

// Filter PA store to only include verification history before targetDate
function filterPAStore(paStore, targetDate) {
  if (!paStore || !paStore.horses) return paStore

  const filtered = { ...paStore, horses: {} }
  for (const [horseName, profile] of Object.entries(paStore.horses)) {
    if (!profile) continue
    const filteredProfile = { ...profile }

    // Filter systemVerificationHistory.historicalPredictions
    if (profile.systemVerificationHistory?.historicalPredictions) {
      filteredProfile.systemVerificationHistory = {
        ...profile.systemVerificationHistory,
        historicalPredictions: profile.systemVerificationHistory.historicalPredictions.filter(p => {
          // Extract date from raceKey format: "course|time|YYYY-MM-DD"
          const parts = (p.raceKey || '').split('|')
          const predDate = parts[parts.length - 1] || ''
          return predDate < targetDate
        }),
      }
      // Recompute counts
      const preds = filteredProfile.systemVerificationHistory.historicalPredictions
      filteredProfile.systemVerificationHistory.totalPredictionsGenerated = preds.length
      filteredProfile.systemVerificationHistory.highAffinityThresholdRuns = preds.length
      filteredProfile.systemVerificationHistory.highAffinityWins = preds.filter(p => p.actualWon).length
    }

    // Keep macroMetrics and affinityProfiles as-is (they're computed from previous_results, not future data)
    filtered.horses[horseName] = filteredProfile
  }
  return filtered
}

// Build trainer form from horse_runs in date window
async function buildTrainerForm(db, sinceDate, beforeDate) {
  if (!db) return {}
  try {
    const rows = await db.all(
      `SELECT trainer, finish_position, field_size FROM horse_runs
       WHERE race_date >= ? AND race_date < ? AND trainer != ''`,
      [sinceDate, beforeDate]
    )
    const form = {}
    for (const r of rows) {
      const t = r.trainer
      if (!form[t]) form[t] = { runs: 0, wins: 0, places: 0 }
      form[t].runs++
      if (r.finish_position === 1) form[t].wins++
      if (r.finish_position > 0 && r.finish_position <= placedPositions(r.field_size || 0)) form[t].places++
    }
    for (const t of Object.keys(form)) {
      form[t].winRate = form[t].runs > 0 ? Math.round((form[t].wins / form[t].runs) * 100 * 10) / 10 : 0
      form[t].placeRate = form[t].runs > 0 ? Math.round((form[t].places / form[t].runs) * 100 * 10) / 10 : 0
    }
    return form
  } catch { return {} }
}

// Build jockey form from jockey_runs in date window
async function buildJockeyForm(db, sinceDate, beforeDate) {
  if (!db) return {}
  try {
    const rows = await db.all(
      `SELECT jockey_name, course, finish_position, field_size FROM jockey_runs
       WHERE race_date >= ? AND race_date < ? AND jockey_name != ''`,
      [sinceDate, beforeDate]
    )
    const form = {}
    for (const r of rows) {
      const j = r.jockey_name
      if (!form[j]) form[j] = { runs: 0, wins: 0, places: 0, byCourse: {} }
      form[j].runs++
      if (r.finish_position === 1) form[j].wins++
      if (r.finish_position > 0 && r.finish_position <= placedPositions(r.field_size || 0)) form[j].places++
      const c = (r.course || '').toLowerCase()
      if (c) {
        if (!form[j].byCourse[c]) form[j].byCourse[c] = { runs: 0, wins: 0 }
        form[j].byCourse[c].runs++
        if (r.finish_position === 1) form[j].byCourse[c].wins++
      }
    }
    for (const j of Object.keys(form)) {
      form[j].winRate = form[j].runs > 0 ? Math.round((form[j].wins / form[j].runs) * 100 * 10) / 10 : 0
      form[j].placeRate = form[j].runs > 0 ? Math.round((form[j].places / form[j].runs) * 100 * 10) / 10 : 0
      for (const c of Object.keys(form[j].byCourse)) {
        const cr = form[j].byCourse[c]
        cr.winRate = cr.runs > 0 ? Math.round((cr.wins / cr.runs) * 100 * 10) / 10 : 0
      }
    }
    return form
  } catch { return {} }
}

// Build OR history from horse_runs before targetDate
async function buildORHistoryBefore(db, beforeDate) {
  if (!db) return {}
  try {
    const rows = await db.all(
      `SELECT horse_name, or_rating, finish_position FROM horse_runs
       WHERE race_date < ? AND or_rating > 0`,
      [beforeDate]
    )
    const OR_BANDS = [
      { key: 'novice', min: 0, max: 100 },
      { key: 'low', min: 101, max: 120 },
      { key: 'mid', min: 121, max: 140 },
      { key: 'high', min: 141, max: 160 },
      { key: 'elite', min: 161, max: 999 },
    ]
    function classifyORBand(or) {
      for (const b of OR_BANDS) {
        if (or >= b.min && or <= b.max) return b.key
      }
      return 'mid'
    }
    const history = {}
    for (const r of rows) {
      const h = r.horse_name
      if (!h) continue
      if (!history[h]) {
        history[h] = { runs: 0, wins: 0, places: 0, bands: {} }
        for (const b of OR_BANDS) {
          history[h].bands[b.key] = { runs: 0, wins: 0, places: 0 }
        }
      }
      const bandKey = classifyORBand(r.or_rating)
      history[h].runs++
      if (r.finish_position === 1) history[h].wins++
      if (r.finish_position > 0 && r.finish_position <= 3) history[h].places++
      history[h].bands[bandKey].runs++
      if (r.finish_position === 1) history[h].bands[bandKey].wins++
      if (r.finish_position > 0 && r.finish_position <= 3) history[h].bands[bandKey].places++
    }
    return history
  } catch { return {} }
}

/**
 * Build RP data mock from backtest cache race data.
 * Derives approximate Racing Post data (RPR, speed trends, trainer)
 * from the backtest cache format for dual-mode engine testing.
 *
 * @param {object} race - Race object from backtest cache
 * @returns {Record<string, { horseName, rpr, ts, speedTrend, highestRPR, trainer }>}
 */
export function buildRPDataMock(race) {
  const dataMap = {}
  const runners = race.runners || []

  for (const runner of runners) {
    const name = runner.horse || ''
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '').trim()

    const rpr = runner.rpr || 0
    const form = runner.form || ''
    const trainer = runner.trainer || ''

    // Build speed trend from form string (same logic as rpWorker.js)
    const formChars = form.split('')
    const speedTrend = formChars.slice(0, 5).reverse().map(c => {
      if (c === '1') return 100
      if (c === '2') return 90
      if (c === '3') return 80
      if (c === '4') return 70
      if (c === '5') return 60
      if (c >= '6' && c <= '9') return 50 - (parseInt(c) - 6) * 5
      return 0
    }).filter(v => v > 0)

    // Highest RPR from previous_results
    const prevRPRs = (runner.previous_results || [])
      .map(r => r.rpr || 0)
      .filter(r => r > 0)
    const highestRPR = prevRPRs.length > 0 ? Math.max(...prevRPRs) : rpr

    dataMap[key] = {
      horseName: name,
      rpr: rpr || null,
      ts: null, // TopSpeed not in backtest cache
      speedTrend,
      highestRPR,
      trainer,
      lastRaceMargin: 0, // Margin not in backtest cache
    }
  }

  return dataMap
}
