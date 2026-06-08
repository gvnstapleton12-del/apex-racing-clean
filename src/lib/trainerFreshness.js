import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve } from 'path'

const DB_PATH = resolve('data/trainer-freshness.json')

const LAYOFF_BANDS = {
  '0_14':   { min: 0,  max: 14,  label: 'Very Fresh' },
  '14_30':  { min: 14, max: 30,  label: 'Fresh' },
  '30_60':  { min: 30, max: 60,  label: 'Moderate' },
  '60_120': { min: 60, max: 120, label: 'Break' },
  '120_240': { min: 120, max: 240, label: 'Long Break' },
  '240_plus': { min: 240, max: Infinity, label: 'Extended' },
}

const BAND_KEYS = Object.keys(LAYOFF_BANDS)

const MIN_SAMPLE_FOR_DIRECT = 20
const BAYESIAN_M = 10

function classifyBand(days) {
  for (const [key, band] of Object.entries(LAYOFF_BANDS)) {
    if (days >= band.min && days < band.max) return key
  }
  return '240_plus'
}

function bayesianAdjust(wins, runs, leagueWinRate) {
  if (runs < MIN_SAMPLE_FOR_DIRECT) {
    return ((wins + BAYESIAN_M * leagueWinRate) / (runs + BAYESIAN_M))
  }
  return wins / runs
}

export function computeTrainerFreshness(races = [], existingDb = null) {
  const db = existingDb || { trainers: {}, overall: {}, meta: {} }
  if (!db.trainers) db.trainers = {}
  if (!db.overall) db.overall = {}

  for (const race of races) {
    for (const runner of (race.runners || [])) {
      const trainer = runner.trainer
      const lastRun = Number(runner.last_run || 0)
      const position = Number(runner.position || runner.pos || 0)

      if (!trainer || !lastRun || lastRun <= 0 || position <= 0) continue

      const band = classifyBand(lastRun)
      if (!db.trainers[trainer]) {
        db.trainers[trainer] = {}
        for (const bk of BAND_KEYS) {
          db.trainers[trainer][bk] = { wins: 0, runs: 0 }
        }
      }

      db.trainers[trainer][band].runs++
      if (position === 1) db.trainers[trainer][band].wins++

      db.overall[band] = db.overall[band] || { wins: 0, runs: 0 }
      db.overall[band].runs++
      if (position === 1) db.overall[band].wins++
    }
  }

  for (const band of BAND_KEYS) {
    const o = db.overall[band] || { wins: 0, runs: 0 }
    o.winRate = o.runs > 0 ? o.wins / o.runs : 0
  }

  for (const trainer of Object.keys(db.trainers)) {
    for (const band of BAND_KEYS) {
      const t = db.trainers[trainer][band]
      const o = db.overall[band] || { wins: 0, runs: 0 }
      t.adjustedRate = bayesianAdjust(t.wins, t.runs, o.winRate)
      t.directRate = t.runs > 0 ? t.wins / t.runs : 0
    }
  }

  db.meta = {
    totalTrainers: Object.keys(db.trainers).length,
    totalBands: BAND_KEYS.length,
    lastUpdated: new Date().toISOString(),
  }

  return db
}

export function getFreshFactor(trainer, lastRunDays, db) {
  if (!trainer || !lastRunDays || lastRunDays <= 0) return 1.0

  const band = classifyBand(lastRunDays)
  const trainerData = db?.trainers?.[trainer]
  const overall = db?.overall?.[band]

  if (!trainerData || !overall || overall.winRate <= 0) return 1.0

  const trainerRate = trainerData[band]?.adjustedRate || 0
  if (trainerRate <= 0) return 1.0

  const factor = trainerRate / overall.winRate
  return Math.max(0.5, Math.min(2.0, factor))
}

export function getTrainerFreshnessProfile(trainer, db) {
  if (!trainer || !db?.trainers?.[trainer]) return null

  const profile = { trainer, bands: {} }
  for (const band of BAND_KEYS) {
    const t = db.trainers[trainer][band] || { wins: 0, runs: 0, adjustedRate: 0 }
    const o = db.overall[band] || { winRate: 0 }
    profile.bands[band] = {
      label: LAYOFF_BANDS[band].label,
      wins: t.wins,
      runs: t.runs,
      directRate: t.runs > 0 ? ((t.wins / t.runs) * 100).toFixed(1) + '%' : 'N/A',
      adjustedRate: (t.adjustedRate * 100).toFixed(1) + '%',
      factor: o.winRate > 0 ? (t.adjustedRate / o.winRate).toFixed(2) : 'N/A',
      sample:
        t.runs < 5 ? 'VERY LOW' :
        t.runs < 10 ? 'LOW' :
        t.runs < 20 ? 'MODERATE' : 'ADEQUATE',
    }
  }
  return profile
}

export async function loadFreshnessDb() {
  try {
    if (existsSync(DB_PATH)) {
      return JSON.parse(await readFile(DB_PATH, 'utf8'))
    }
  } catch (e) {}
  return { trainers: {}, overall: {}, meta: {} }
}

export async function saveFreshnessDb(db) {
  await writeFile(DB_PATH, JSON.stringify(db, null, 2))
}

export { LAYOFF_BANDS, BAND_KEYS, classifyBand }
