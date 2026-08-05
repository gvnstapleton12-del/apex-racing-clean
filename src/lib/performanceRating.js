import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

const STORE_PATH = resolve('data/performanceRating.json')
const FIELD_SCALE_MAX = 15
const ADAPTIVE_WEIGHTS = { many: 0.35, medium: 0.45, few: 0.6 }
const ADJUSTMENT_CAPS = { handicap: { max: 4, min: -3 }, nonHandicap: { max: 2, min: -1 } }
const MARGIN_PER_LENGTH = 0.5

const DISTANCE_MAP = {
  'hd': 0.25,
  'nk': 0.5,
  'sh': 0.25,
  's.h.': 0.25,
  'nse': 0.5,
  'ns': 0.5,
  '¾': 0.75,
  '3/4': 0.75,
  '½': 0.5,
  '1/2': 0.5,
  '¼': 0.25,
  '1/4': 0.25,
  'dst': 99,
  'dist': 99,
}

export function parseFinishDistance(str) {
  if (!str || str === '' || str === '0') return 0
  const s = String(str).trim().toLowerCase()
  if (DISTANCE_MAP[s]) return DISTANCE_MAP[s]
  const num = parseFloat(s.replace(/\s+/g, '.'))
  if (!isNaN(num) && num > 0) return num
  const parts = s.match(/^(\d+)\s*([½¼¾]|1\/[24]|3\/4)$/)
  if (parts) {
    const whole = parseInt(parts[1], 10)
    let frac = 0
    if (parts[2] === '½' || parts[2] === '1/2') frac = 0.5
    else if (parts[2] === '¼' || parts[2] === '1/4') frac = 0.25
    else if (parts[2] === '¾' || parts[2] === '3/4') frac = 0.75
    return whole + frac
  }
  return 0
}

function marginAdjustment(finishDistance, position) {
  const fd = typeof finishDistance === 'number' ? finishDistance : parseFinishDistance(finishDistance)
  if (position === 1) return fd * MARGIN_PER_LENGTH
  return -fd * MARGIN_PER_LENGTH * 0.5
}

let store = null

function loadStore() {
  if (store) return store
  try {
    store = JSON.parse(readFileSync(STORE_PATH, 'utf8'))
  } catch {
    store = { horses: {} }
  }
  return store
}

function saveStore() {
  if (!store) return
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true })
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
  } catch (e) {
    console.error('[PerfRating] Failed to save:', e.message)
  }
}

function recencyWeight(runCount) {
  if (runCount >= 5) return ADAPTIVE_WEIGHTS.many
  if (runCount >= 3) return ADAPTIVE_WEIGHTS.medium
  return ADAPTIVE_WEIGHTS.few
}

function classBonus(raceClass) {
  const cls = Number(raceClass) || 0
  if (cls >= 1 && cls <= 2) return 3
  if (cls >= 3 && cls <= 4) return 1
  if (cls === 5) return 0
  if (cls >= 6) return -1
  return 0
}

export function computeRunRating(run) {
  const position = Number(run.position) || 0
  const runnerCount = Number(run.runner_count) || 0
  const bha = Number(run.bha) || 0

  if (position <= 0 || runnerCount <= 0 || bha <= 0) return null

  const percentile = 1 - (position - 1) / Math.max(runnerCount - 1, 1)
  const fieldScale = Math.min(runnerCount * 0.8, FIELD_SCALE_MAX)
  const bonus = classBonus(run.race_class)
  const marginAdj = marginAdjustment(run.finish_distance, position)

  return Math.round((bha + percentile * fieldScale + bonus + marginAdj) * 10) / 10
}

const SL_RUN_TYPE_MAP = {
  FLAT: 'Flat',
  HURDLE: 'Hurdle',
  CHASE: 'Chase',
  N_H_FLAT: 'NH Flat',
  NH_FLAT: 'NH Flat',
}

function normalizeRunType(rt) {
  return SL_RUN_TYPE_MAP[rt?.toUpperCase()] || 'Flat'
}

function isCodeCompatible(horseCode, raceCode) {
  if (horseCode === raceCode) return true
  const jumps = ['Hurdle', 'Chase', 'NH Flat']
  if (jumps.includes(horseCode) && jumps.includes(raceCode)) return true
  return false
}

function normalizeRaceType(raceType) {
  if (!raceType) return 'Flat'
  const lower = raceType.toLowerCase()
  if (lower.includes('chase') || lower.includes('steeple')) return 'Chase'
  if (lower.includes('hurdle')) return 'Hurdle'
  if (lower.includes('nh flat') || lower.includes('national hunt flat') || lower.includes('bumper')) return 'NH Flat'
  return 'Flat'
}

export function computePerformanceRating(previousResults = [], currentOR = 0, raceType = '') {
  if (!previousResults.length || !currentOR || currentOR <= 0) {
    return { pr: 0, gap: 0, source: 'PR', runs: 0, runRatings: [] }
  }

  const raceCode = normalizeRaceType(raceType)
  const filteredRuns = raceCode
    ? previousResults.filter(run => {
        if (!run.run_type) return true
        return isCodeCompatible(normalizeRunType(run.run_type), raceCode)
      })
    : previousResults

  const sourceRuns = filteredRuns.length > 0 ? filteredRuns : previousResults

  const runRatings = []
  for (const run of sourceRuns) {
    if (!run.bha || Number(run.bha) <= 0) continue
    const rating = computeRunRating(run)
    if (rating !== null) runRatings.push(rating)
  }

  if (runRatings.length === 0) {
    return { pr: 0, gap: 0, source: 'PR', runs: 0, runRatings: [] }
  }

  let weightedSum = 0
  let weightTotal = 0
  for (let i = 0; i < runRatings.length; i++) {
    const weight = Math.max(1, runRatings.length - i)
    weightedSum += runRatings[i] * weight
    weightTotal += weight
  }

  const pr = Math.round((weightedSum / weightTotal) * 10) / 10
  const gap = Math.round((pr - currentOR) * 10) / 10

  return { pr, gap, source: 'PR', runs: runRatings.length, runRatings }
}

export function getPerformanceAdjustment(gap, isHandicap) {
  const caps = isHandicap ? ADJUSTMENT_CAPS.handicap : ADJUSTMENT_CAPS.nonHandicap
  let adjustment = 0
  let label = 'Even'

  if (gap >= 15) {
    adjustment = caps.max
    label = 'Well ahead of mark'
  } else if (gap >= 10) {
    adjustment = isHandicap ? 3 : 1.5
    label = 'Ahead of mark'
  } else if (gap >= 5) {
    adjustment = isHandicap ? 1.5 : 0.5
    label = 'Slightly ahead'
  } else if (gap >= -5) {
    adjustment = 0
    label = 'Even'
  } else if (gap >= -10) {
    adjustment = isHandicap ? -1.5 : -0.5
    label = 'Behind mark'
  } else {
    adjustment = caps.min
    label = 'Well behind mark'
  }

  return { gap, adjustment, label }
}

export function computeActualPerformance(position, runnerCount, bha, raceClass, finishDistance) {
  if (!position || !runnerCount || !bha || position <= 0 || runnerCount <= 0 || bha <= 0) return null

  const percentile = 1 - (position - 1) / Math.max(runnerCount - 1, 1)
  const fieldScale = Math.min(runnerCount * 0.8, FIELD_SCALE_MAX)
  const bonus = classBonus(raceClass)
  const marginAdj = marginAdjustment(finishDistance, position)

  return Math.round((bha + percentile * fieldScale + bonus + marginAdj) * 10) / 10
}

export function updatePerformanceRating(horseName, actualPerformance, currentPR) {
  const db = loadStore()
  const existing = db.horses[horseName] || { pr: 0, runs: 0 }
  const runCount = existing.runs + 1

  let newPR
  if (runCount === 1) {
    newPR = actualPerformance
  } else {
    const rw = recencyWeight(runCount)
    newPR = Math.round((actualPerformance * rw + existing.pr * (1 - rw)) * 10) / 10
  }

  db.horses[horseName] = {
    pr: newPR,
    runs: runCount,
    lastActual: actualPerformance,
    lastUpdated: new Date().toISOString().slice(0, 10),
  }

  return { newPR, delta: runCount === 1 ? 0 : Math.round((newPR - existing.pr) * 10) / 10, runCount }
}

export function getStoredPR(horseName) {
  const db = loadStore()
  return db.horses[horseName] || null
}

export function getAllStoredPRs() {
  return loadStore().horses
}

export function savePerformanceRatingStore() {
  saveStore()
}

export function getPerformanceRatingStore() {
  return loadStore()
}

export function backfillFromHistorical(records) {
  let count = 0
  for (const rec of records) {
    if (!rec.resulted || !rec.horse) continue
    const bha = rec.bha || rec.or || 0
    if (bha <= 0) continue
    const actual = computeActualPerformance(
      rec.actual_position, rec.field_size, bha, rec.race_class || rec.class || '', rec.finish_distance
    )
    if (actual === null) continue
    updatePerformanceRating(rec.horse, actual, 0)
    count++
  }
  saveStore()
  return count
}
