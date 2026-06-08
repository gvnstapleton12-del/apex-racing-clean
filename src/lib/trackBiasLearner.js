import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

const STYLES = ['Front Runner', 'Prominent', 'Midfield', 'Hold Up']
const MIN_RUNS_TO_BLEND = 50
const FULLY_LEARNED_RUNS = 500
const BIAS_SCALE = 15
const MAX_BIAS = 20

let store = null
const STORE_PATH = resolve('data/trackBiasLearning.json')

function loadStore() {
  if (store) return store
  try {
    store = JSON.parse(readFileSync(STORE_PATH, 'utf8'))
  } catch {
    store = { courses: {} }
  }
  return store
}

function saveStore() {
  if (!store) return
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true })
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
  } catch (e) {
    console.error('[TrackBias] Failed to save:', e.message)
  }
}

function ensureCourse(course) {
  const db = loadStore()
  if (!db.courses[course]) {
    db.courses[course] = {
      runs: 0,
      wins: 0,
      styles: {},
    }
    for (const s of STYLES) {
      db.courses[course].styles[s] = { runs: 0, wins: 0, places: 0 }
    }
  }
  return db.courses[course]
}

export function recordTrackBiasResult(course, runningStyle, position, fieldSize) {
  if (!course || !runningStyle) return

  const style = STYLES.includes(runningStyle) ? runningStyle : null
  if (!style) return

  const entry = ensureCourse(course)
  entry.runs++

  if (position === 1) entry.wins++

  const styleEntry = entry.styles[style]
  styleEntry.runs++
  if (position === 1) styleEntry.wins++

  const placed = fieldSize <= 4 ? position <= 2
    : fieldSize <= 7 ? position <= 2
    : fieldSize <= 11 ? position <= 3
    : fieldSize <= 15 ? position <= 3
    : position <= 4

  if (placed) styleEntry.places++
}

export function getLearnedBias(course, runningStyle) {
  const db = loadStore()
  const entry = db.courses[course]

  if (!entry || entry.runs < MIN_RUNS_TO_BLEND) return null

  const overallWinRate = entry.wins / entry.runs
  const styleEntry = entry.styles[runningStyle]
  if (!styleEntry || styleEntry.runs < 10) return null

  const styleWinRate = styleEntry.wins / styleEntry.runs
  const rawBias = (styleWinRate - overallWinRate) * BIAS_SCALE

  const confidence = Math.min(1, entry.runs / FULLY_LEARNED_RUNS)
  const clamped = Math.max(-MAX_BIAS, Math.min(MAX_BIAS, rawBias))

  return {
    bias: Math.round(clamped * 100) / 100,
    confidence,
    styleWinRate: Math.round(styleWinRate * 1000) / 1000,
    overallWinRate: Math.round(overallWinRate * 1000) / 1000,
    styleRuns: styleEntry.runs,
    totalRuns: entry.runs,
  }
}

export function getTrackBiasStats(course) {
  const db = loadStore()
  const entry = db.courses[course]
  if (!entry) return null

  const overallWinRate = entry.runs > 0 ? entry.wins / entry.runs : 0

  const styles = {}
  for (const s of STYLES) {
    const se = entry.styles[s]
    if (!se || se.runs === 0) {
      styles[s] = { runs: 0, wins: 0, places: 0, winRate: 0, bias: 0 }
      continue
    }
    const winRate = se.wins / se.runs
    const bias = entry.runs >= MIN_RUNS_TO_BLEND
      ? Math.round(Math.max(-MAX_BIAS, Math.min(MAX_BIAS, (winRate - overallWinRate) * BIAS_SCALE)) * 100) / 100
      : 0
    styles[s] = {
      runs: se.runs,
      wins: se.wins,
      places: se.places,
      winRate: Math.round(winRate * 1000) / 1000,
      bias,
    }
  }

  return {
    course,
    runs: entry.runs,
    wins: entry.wins,
    overallWinRate: Math.round(overallWinRate * 1000) / 1000,
    learned: entry.runs >= MIN_RUNS_TO_BLEND,
    fullyLearned: entry.runs >= FULLY_LEARNED_RUNS,
    confidence: Math.min(1, entry.runs / FULLY_LEARNED_RUNS),
    styles,
  }
}

export function getAllTrackBiasStats() {
  const db = loadStore()
  const result = {}
  for (const course of Object.keys(db.courses)) {
    result[course] = getTrackBiasStats(course)
  }
  return result
}

export function backfillFromHistorical(records) {
  let count = 0
  for (const rec of records) {
    if (!rec.resulted || !rec.course || !rec.runningStyle) continue
    recordTrackBiasResult(rec.course, rec.runningStyle, rec.actual_position, rec.field_size)
    count++
  }
  saveStore()
  return count
}

export function resetStore() {
  store = { courses: {} }
  saveStore()
}

export function saveTrackBiasStore() {
  saveStore()
}

export function getTrackBiasStore() {
  return loadStore()
}
