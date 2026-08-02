import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import http from 'http'
import { spawn } from 'child_process'

import { Server } from 'socket.io'

import { generateSignals } from './src/lib/signalEngine.js'
import { analyzeMarketMovement } from './src/lib/marketEngine.js'
import { runApexEngine } from './src/lib/apexEngine.js'
import { selectionQuality } from './src/lib/selectionQuality.js'
import { REPLAY_TAG_LIBRARY, TAG_TO_CATEGORY, generateAutoSummary, computeWatchlistPriority, getRecommendedConditions, getAvoidTags, extractTagsFromNotes } from './src/lib/replayTagLibrary.js'
import { getCourseProfile } from './src/lib/courseProfiles.js'
import { buildHorseProfile, computeProfileAdjustment } from './src/lib/horseProfileEngine.js'
import { fetchAtrRacecards, fetchAtrRatings } from './src/lib/scrapers/atrScraper.js'
import { initHorseDb, createTables, closeHorseDb, saveJockeyRun, insertShadowWatch, getPendingShadowWatches, settleShadowWatch, getShadowWatchStats, insertBacktestRuns, getBacktestLabels, getBacktestSummary, deleteBacktestLabel } from './src/lib/horseMemoryDb.js'
import { getHorseMemory, getHorseMemoryBatch, calculateHandicapScore, calculateAbilityFromMemory, computeProvenZoneScore, getCohortBaseline } from './src/lib/horseMemoryEngine.js'
import { saveHorseRun, savePreviousResults } from './src/lib/saveHorseRun.js'
import { recordTrackBiasResult, backfillFromHistorical, getAllTrackBiasStats, saveTrackBiasStore, getTrackBiasStore } from './src/lib/trackBiasLearner.js'
import { checkRaceExclusion } from './src/lib/trackProfile.js'
import { recordAffinityPrediction, verifyAffinityResult, saveAffinityStore, initAffinityStore } from './src/lib/personalAffinity.js'
import { initPgStore, pgLoad, pgSave, hasPg } from './src/lib/pgStore.js'

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error.message)
  console.error(error.stack)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason)
})

import {
  analyzeHistoricalPerformance,
  learnFromResults,
  learnFromBuckets,
} from './src/lib/learningEngine.js'

import {
  createCalibrationRecord,
  computeCalibrationBuckets,
  computeCalibrationByGrade,
  computeCalibrationByBetQuality,
  computePlaceCalibration,
} from './src/lib/calibrationEngine.js'
import { computeAllSegmentations } from './src/lib/segmentationEngine.js'
import {
  computeAntiOverfitReport,
  applyProtectedAdjustment,
} from './src/lib/antiOverfit.js'
import { retry } from './src/lib/utils/retry.js'
import { processPostRaceCommentary, flushReplayDb, bootstrapReplaysFromLearningDb } from './src/lib/replayBridge.js'
import { LruCache } from './src/lib/utils/lruCache.js'
import { fetchSlRacecards, fetchSlResults } from './src/lib/scrapers/sportingLifeScraper.js'
import { closeBrowser } from './src/lib/scrapers/browserPool.js'
import { computeTrainerFreshness, getFreshFactor, getTrainerFreshnessProfile, loadFreshnessDb, saveFreshnessDb } from './src/lib/trainerFreshness.js'
import { buildORHistory } from './src/lib/classModel.js'
import { recordRun, recordRunBatch } from './src/lib/conditionDB.js'
import { computePerformanceRating, updatePerformanceRating, computeActualPerformance, getStoredPR, savePerformanceRatingStore } from './src/lib/performanceRating.js'
import { normalizeGoingString } from './src/lib/normalizeGoing.js'


dotenv.config()

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: '*',
  },
})

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use(express.static(path.join(process.cwd(), 'dist')))

const PORT = process.env.PORT || 3000

const MIN_CONFIDENCE = 75
const VALID_MOVEMENTS = ['STEAMER', 'STRONG_STEAMER']

const API_CACHE = new LruCache(50, 300000)

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
]

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

const HORSE_DB_PATH = path.join(process.cwd(), 'data', 'horses.json')
const MARKET_DB_PATH = path.join(process.cwd(), 'data', 'market.json')
const ALERT_DB_PATH = path.join(process.cwd(), 'data', 'alerts.json')
const LEARNING_DB_PATH = path.join(process.cwd(), 'data', 'learning.json')
const PREDICTIONS_DB_PATH = path.join(process.cwd(), 'data', 'predictions.json')
const DAILY_PICKS_PATH = path.join(process.cwd(), 'data', 'daily-picks.json')
const REPLAY_NOTES_PATH = path.join(process.cwd(), 'data', 'replay-notes.json')
const GOING_DB_PATH = path.join(process.cwd(), 'data', 'going-database.json')
const DISTANCE_DB_PATH = path.join(process.cwd(), 'data', 'distance-database.json')
const BUCKET_DB_PATH = path.join(process.cwd(), 'data', 'context-buckets.json')
const CALIBRATION_DB_PATH = path.join(process.cwd(), 'data', 'calibration.json')
const HISTORICAL_DB_PATH = path.join(process.cwd(), 'data', 'historical.json')
const TRAINER_FORM_PATH = path.join(process.cwd(), 'data', 'trainer-form.json')
const JOCKEY_FORM_PATH = path.join(process.cwd(), 'data', 'jockey-form.json')
const HORSE_MEMORY_DB_PATH = path.join(process.cwd(), 'data', 'apex-horses.db')
const TRACK_PROFILES_PATH = path.join(process.cwd(), 'data', 'trackProfiles.json')
const HORSE_PROFILES_PATH = path.join(process.cwd(), 'data', 'horseProfiles.json')
const COUNTERFACTUAL_DB_PATH = path.join(process.cwd(), 'data', 'counterfactual-log.json')
const LIVE_PICKS_LOG_PATH = path.join(process.cwd(), 'data', 'live-picks-log.json')

let HORSE_MEMORY_DB = null
let BACKFILL_IN_PROGRESS = false

function normalizeHorseName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function resolveOdds(runner = {}) {
  const fields = [
    runner.odds,
    runner.price,
    runner.sp,
    runner.spOdds,
    runner.sp_odds,
    runner.starting_price,
    runner.industry_sp,
    runner.returned,
    runner.bf_odds,
    runner.betfair_odds,
    runner.bf,
    runner.best_odds,
    runner.best_odds_value,
    runner.forecast_price,
    runner.early_price,
    runner.ep,
    runner.bp,
    runner.bookmaker_price,
  ]

  for (const val of fields) {
    const num = Number(val)
    if (num > 1 && Number.isFinite(num)) return num
  }

  if (runner.oddsDecimal) {
    const num = Number(runner.oddsDecimal)
    if (num > 1 && Number.isFinite(num)) return num
  }

  if (runner.spDecimal) {
    const num = Number(runner.spDecimal)
    if (num > 1 && Number.isFinite(num)) return num
  }

  return 0
}

function shouldTrackBet(aiProfile, marketMovement) {
  const confidence = Number(aiProfile?.confidence || 0)

  if (confidence < MIN_CONFIDENCE) {
    return false
  }

  if (
    !VALID_MOVEMENTS.includes(
      marketMovement?.movement
    )
  ) {
    return false
  }

  return true
}



function classifyEngine(grade, odds) {
  const coreGrades = ['S', 'A', 'B', 'B+']
  const isCoreGrade = coreGrades.includes(grade)
  const isCoreOdds = odds > 0 && odds <= 9.0
  if (isCoreGrade && isCoreOdds) return 'CORE'
  return 'CHAOS'
}

function applyEngineRouting(runner, engine, odds) {
  const isCore = engine === 'CORE'

  let winProb = runner.winProb
  let placeProb = runner.placeProb
  let stakeType = 'kelly'
  let maxStake = 0.05
  let betFilterStatus = ''

  if (isCore) {
    if (odds <= 4.0) {
      winProb *= 0.78
      placeProb *= 0.78
    } else if (odds <= 7.0) {
      winProb *= 0.22
      placeProb *= 0.22
    } else if (odds <= 9.0) {
      winProb *= 0.29
      placeProb *= 0.29
    }
    stakeType = 'kelly'
    maxStake = 0.05
  } else {
    if (odds >= 10.0) {
      winProb *= 0.85
      placeProb *= 0.85
    }
    if (odds >= 13.0) {
      winProb *= 0.50
      placeProb *= 0.50
      betFilterStatus = 'HIGH RISK'
    }
    stakeType = 'flat'
    maxStake = 0.01
  }

  return { winProb, placeProb, stakeType, maxStake, betFilterStatus }
}

function storeHistoricalRecord(runner, race, apexResult) {
  const id = `${race.course}-${race.off_time}-${race.date}-${runner.horse}`
  if (HISTORICAL_ID_SET.has(id)) return
  const odds = runner.odds || runner.price || 0
  const grade = runner.selectionQuality?.grade || ''
  
  // NaN Safety Assertions
  const score = runner.finalScore
  const confidence = runner.confidenceScore
  
  // Compute edge from fairOdds vs odds (matching estimateWinProb formula)
  const fairOdds = runner.fairOdds || runner.selectionQuality?.fairOdds || 0
  const edge = fairOdds > 0 && odds > 0 ? (fairOdds - odds) / odds : 0
  const prob = runner.winProb
  
  if (score !== undefined && isNaN(Number(score))) console.error('[NaN] finalScore NaN for', runner.horse)
  if (confidence !== undefined && isNaN(Number(confidence))) console.error('[NaN] confidenceScore NaN for', runner.horse)
  if (runner.winProb !== undefined && isNaN(Number(runner.winProb))) console.error('[NaN] winProb NaN for', runner.horse)
  if (runner.placeProb !== undefined && isNaN(Number(runner.placeProb))) console.error('[NaN] placeProb NaN for', runner.horse)
  if (runner.odds !== undefined && runner.odds !== null && isNaN(Number(runner.odds))) console.error('[NaN] odds NaN for', runner.horse)
  
  const betFilterVerdict = apexResult?.betFilter?.verdict
  
  // Determine if this is a "no bet" selection with explicit rejection reasons
  const rejectedBy = []
  if (edge <= 0) rejectedBy.push('NEGATIVE_EDGE')
  if (!prob || prob <= 0) rejectedBy.push('ZERO_PROBABILITY')
  if (!odds || odds <= 1) rejectedBy.push('INVALID_ODDS')
  if (confidence !== undefined && confidence < 10) rejectedBy.push('LOW_CONFIDENCE')
  
  // Relaxed: noBet only if >= 2 clear reasons, or auto-skip + at least one reason
  const noBet = rejectedBy.length >= 2 || (betFilterVerdict === 'AUTO SKIP' && rejectedBy.length > 0)

  HISTORICAL_DATABASE.records.push({
    id,
    horse: runner.horse,
    horse_id: runner.horse_id || '',
    course: race.course,
    date: race.date,
    off_time: race.off_time,
    race_type: race.race_type || race.raceType || '',
    going: race.going || '',
    distance: race.distance || race.distancef || '',
    field_size: race.field_size || race.fieldSize || race.runners?.length || 0,
    class: race.class || '',
    or: runner.or || 0,
    rpr: runner.rpr || 0,
    performanceRating: runner.performanceRating || null,
    trainer: runner.trainer || '',
    jockey: runner.jockey || '',
    finalScore: score,
    winProb: prob,
    rawBayesianProb: runner.rawBayesianProb ?? null,
    plattProb: runner.plattProb ?? null,
    placeProb: runner.placeProb,
    valueEdge: edge,
    fairOdds: runner.fairOdds || runner.selectionQuality?.fairOdds || 0,
    marketOdds: runner.marketOdds || runner.selectionQuality?.marketOdds || 0,
    confidenceScore: confidence,
    grade,
    betQuality: runner.selectionQuality?.label || runner.betQuality || '',
    powerScore: runner.power?.total,
    paceScore: runner.pace?.score,
    humanScore: runner.human?.score,
    marketScore: runner.market?.score,
    runningStyle: runner.runningStyle,
    odds,
    takenOdds: odds,
    last_run: runner.last_run || 0,
    volatility: apexResult?.volatility?.chaos,
    volatilityLabel: apexResult?.volatility?.label,
    betFilter: betFilterVerdict,
    noBet,
    rejectedBy,
    engine: classifyEngine(grade, odds),
    actual_position: null,
    actual_won: null,
    actual_placed: null,
    actual_odds: null,
    spOdds: null,
    closingOdds: null,
    clv: null,
    resulted: false,
    timestamp: new Date().toISOString(),
  })
  HISTORICAL_ID_SET.add(id)
}

function loadDatabase(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {}
    }

    return JSON.parse(
      fs.readFileSync(filePath)
    )
  } catch (error) {
    console.error('Failed to load DB:', error)
    return {}
  }
}

async function saveDatabase(filePath, database) {
  try {
    await fs.promises.mkdir(path.dirname(filePath), {
      recursive: true,
    })

    const json = JSON.stringify(database)
    const tmpPath = filePath + '.tmp'
    try {
      await fs.promises.writeFile(tmpPath, json)
      await fs.promises.rename(tmpPath, filePath)
    } catch (atomicErr) {
      // Fallback: direct write if atomic fails (Windows rename issues with large files)
      await fs.promises.writeFile(filePath, json)
    }
  } catch (error) {
    console.error('Failed to save DB:', error)
  }
}

function pgSaveDebounced(key, data) {
  if (!hasPg()) return
  clearTimeout(pgSaveTimers[key])
  pgSaveTimers[key] = setTimeout(() => pgSave(key, data).catch(() => {}), 5000)
}
const pgSaveTimers = {}

const HORSE_DATABASE = loadDatabase(HORSE_DB_PATH)
const MARKET_DATABASE = loadDatabase(MARKET_DB_PATH)
const ALERT_DATABASE = loadDatabase(ALERT_DB_PATH)
const PREDICTIONS_DATABASE = (() => { const db = loadDatabase(PREDICTIONS_DB_PATH); return Array.isArray(db) ? {} : db })()
const GOING_DATABASE = loadDatabase(GOING_DB_PATH)
const DISTANCE_DATABASE = loadDatabase(DISTANCE_DB_PATH)
const BUCKET_DATABASE = loadDatabase(BUCKET_DB_PATH)
const COUNTERFACTUAL_DATABASE = (() => { const db = loadDatabase(COUNTERFACTUAL_DB_PATH); const base = Array.isArray(db) ? { observations: [], stats: {} } : (db || {}); if (!base.observations) base.observations = []; if (!base.stats) base.stats = {}; return base })()

// Live picks log: tracks every live pick generated for honest performance measurement
// Structure: { "2026-06-19": { picks: [{ horse, course, offTime, odds, score, timestamp }], stats: { won, placed, lost, pending } } }
const LIVE_PICKS_LOG = (() => { const db = loadDatabase(LIVE_PICKS_LOG_PATH); return db || {} })()

const LEARNING_DATABASE = loadDatabase(LEARNING_DB_PATH) || {}
if (!LEARNING_DATABASE.records) LEARNING_DATABASE.records = []
if (!LEARNING_DATABASE.races) LEARNING_DATABASE.races = []
if (!LEARNING_DATABASE.analytics) LEARNING_DATABASE.analytics = {}
if (!LEARNING_DATABASE.weights) LEARNING_DATABASE.weights = {}
const learningLoaded = LEARNING_DATABASE.records.length > 0 || LEARNING_DATABASE.races.length > 0
const learningDb = learningLoaded
  ? LEARNING_DATABASE
  : {
      records: [],
      races: [],
      analytics: {},
      weights: {
        multiplier: { class: 1.3, stride: 1.1, trainer: 0.7, traffic: 0.8, clv: 0.5 },
      },
    }

const CALIBRATION_DATABASE = loadDatabase(CALIBRATION_DB_PATH)?.records
  ? loadDatabase(CALIBRATION_DB_PATH)
  : {
      records: [],
      analytics: {},
    }

// Recompute calibration analytics on startup if missing or stale
if (CALIBRATION_DATABASE.records?.length > 0 && (!CALIBRATION_DATABASE.analytics?.byProbability?.buckets || CALIBRATION_DATABASE.analytics.buckets?.length === 0)) {
  console.log(`[Startup] Recomputing calibration analytics from ${CALIBRATION_DATABASE.records.length} records`)
  CALIBRATION_DATABASE.analytics = {
    byProbability: computeCalibrationBuckets(CALIBRATION_DATABASE.records),
    byPlaceProbability: computePlaceCalibration(CALIBRATION_DATABASE.records),
    byGrade: computeCalibrationByGrade(CALIBRATION_DATABASE.records),
    byBetQuality: computeCalibrationByBetQuality(CALIBRATION_DATABASE.records),
    segments: computeAllSegmentations(CALIBRATION_DATABASE.records),
    lastUpdated: new Date().toISOString(),
  }
  saveDatabase(CALIBRATION_DB_PATH, CALIBRATION_DATABASE)
}

// ensure seeded multipliers even if loading existing file with empty weights
if (!learningDb.weights?.multiplier?.class) {
  learningDb.weights = {
    multiplier: { class: 1.3, stride: 1.1, trainer: 0.7, traffic: 1.0, clv: 0.8 },
  }
}

const DAILY_PICKS_DATABASE = loadDatabase(DAILY_PICKS_PATH)
const REPLAY_NOTES_DATABASE = loadDatabase(REPLAY_NOTES_PATH)

// Auto-bootstrap replay notes from historical commentary if file is empty/missing
if (Object.keys(REPLAY_NOTES_DATABASE).length === 0 && LEARNING_DATABASE.races?.length > 0) {
  bootstrapReplaysFromLearningDb(LEARNING_DATABASE)
  Object.assign(REPLAY_NOTES_DATABASE, loadDatabase(REPLAY_NOTES_PATH))
}

const TRAINER_FORM_DATABASE = loadDatabase(TRAINER_FORM_PATH) || {}
const JOCKEY_FORM_DATABASE = loadDatabase(JOCKEY_FORM_PATH) || {}

const HISTORICAL_DATABASE = loadDatabase(HISTORICAL_DB_PATH)?.records
  ? loadDatabase(HISTORICAL_DB_PATH)
  : { records: [] }

let TRAINER_FRESHNESS_DB = (() => {
  const loaded = loadDatabase(path.join(process.cwd(), 'data', 'trainer-freshness.json'))
  return loaded.trainers ? loaded : { trainers: {}, overall: {}, meta: {} }
})()
let OR_HISTORY = buildORHistory(LEARNING_DATABASE.records || [])
const TRACK_PROFILES = loadDatabase(TRACK_PROFILES_PATH) || {}

// O(1) lookup sets — avoid O(n) scans in storeHistoricalRecord and logActivationZone
const HISTORICAL_ID_SET = new Set((HISTORICAL_DATABASE.records || []).map(r => r.id))
const COUNTERFACTUAL_ID_MAP = new Map()
for (const obs of (COUNTERFACTUAL_DATABASE.observations || [])) {
  if (obs.id) COUNTERFACTUAL_ID_MAP.set(obs.id, obs)
}

let HORSE_PROFILES_DATABASE = {}
try {
  HORSE_PROFILES_DATABASE = JSON.parse(fs.readFileSync(HORSE_PROFILES_PATH, 'utf8'))
  console.log(`[Init] Loaded ${Object.keys(HORSE_PROFILES_DATABASE).length} horse profiles`)
} catch (e) {
  console.warn('[Init] No horseProfiles.json found, profiles disabled:', e.message)
}

// Horse Memory SQLite Database
async function initHorseMemory() {
  try {
    HORSE_MEMORY_DB = await initHorseDb()
    await createTables(HORSE_MEMORY_DB)
    console.log('[Horse Memory] Database initialized')
  } catch (error) {
    console.error('[Horse Memory] Failed to initialize:', error.message)
  }
}
initHorseMemory()

const LIVE_STATE = {
  racecards: [],
  updatedAt: null,
  loading: true,
  processingComplete: false,
  atrLoading: false,
  lockedNap: null,
  lockedPicks: null,
  lockedDate: null,
}

function findPredictionForRunner(race, runner) {
  const course = String(race.course || '').trim()
  const date = String(race.date || '')
  const offTime = String(race.off_time || '')
  const raceKey = `${course}-${offTime}-${date}`
  const horseName = String(runner.horse || '').trim()

  const candidates = Object.entries(PREDICTIONS_DATABASE)
    .filter(([key]) => key.includes(raceKey) || key.includes(`${course}-${date}`))
    .flatMap(([, preds]) => preds)

  return candidates.find(
    (p) => String(p.horse || '').trim() === horseName || normalizeHorseName(p.horse) === normalizeHorseName(horseName)
  )
}

function logPrediction(race, runner, aiProfile) {
  const raceId = `${race.course}-${race.off_time}-${race.date}`

  if (!PREDICTIONS_DATABASE[raceId]) {
    PREDICTIONS_DATABASE[raceId] = []
  }

  const existingIndex = PREDICTIONS_DATABASE[raceId].findIndex(
    (entry) => entry.horse === runner.horse
  )

  const prediction = {
    date: race.date,
    race: `${race.course} ${race.off_time}`,
    course: race.course,
    offTime: race.off_time,
    horse: runner.horse,
    trainer: runner.trainer || '',
    odds: runner.odds || runner.price || 0,
    confidence: aiProfile.confidence,
    estimatedWinProbability:
      aiProfile.estimatedWinProbability,
    predictedWinProb: aiProfile.estimatedWinProbability || 0,
    plattProb: aiProfile.plattProb ?? null,
    predictedPlaceProb: aiProfile.placeProb || 0,
    impliedProbability:
      aiProfile.impliedProbability,
    valueEdge: aiProfile.valueEdge,
    completeness: aiProfile.completeness,
    grade: aiProfile.grade || '',
    betQuality: aiProfile.betQuality || '',
    personalAffinity: runner.personalAffinity?.adjustment ?? null,
    previousRuns: (runner.previous_results || []).length,
    going: normalizeGoingString(race.going || ''),
    breakdown: aiProfile.breakdown || null,
    timestamp: new Date().toISOString(),
  }

  if (existingIndex >= 0) {
    PREDICTIONS_DATABASE[raceId][existingIndex] = prediction
  } else {
    PREDICTIONS_DATABASE[raceId].push(prediction)
  }
}

function createAlert(horseId, horse, type, message, severity = 'MEDIUM') {
  if (!ALERT_DATABASE[horseId]) {
    ALERT_DATABASE[horseId] = []
  }
  const alert = { horse, type, message, severity, timestamp: new Date().toISOString() }
  ALERT_DATABASE[horseId].unshift(alert)
  ALERT_DATABASE[horseId] = ALERT_DATABASE[horseId].slice(0, 50)
  io.emit('new-alert', alert)
}

const PA_ACTIVATION_ZONE_MIN = 0.05
const PA_ACTIVATION_ZONE_MAX = 0.50

function logActivationZone(runner, race, odds) {
  const pa = runner.personalAffinity?.adjustment
  if (pa === null || pa === undefined) return
  if (pa < PA_ACTIVATION_ZONE_MIN || pa > PA_ACTIVATION_ZONE_MAX) return

  const raceKey = race.race_id || `${race.course}-${race.off_time}-${race.date}`
  const horseName = String(runner.horse || '').trim()
  const obsId = `${raceKey}--${horseName}`

  const fieldSize = (race.runners || []).length
  const score = runner.finalScore || 0
  const winProb = runner.winProb ?? null

  const isAboveThreshold = pa >= 0.30

  const entry = {
    id: obsId,
    race_id: race.race_id || null,
    date: race.date,
    course: race.course,
    offTime: race.off_time,
    raceName: race.race_name || '',
    horse: horseName,
    trainer: runner.trainer || '',
    odds: odds || 0,
    pa,
    paBin: isAboveThreshold ? '+0.3 to +0.5' : '0 to +0.3',
    score,
    winProb,
    betQuality: runner.betQuality || '',
    selectionQuality: runner.selectionQuality?.label || '',
    fieldSize,
    type: race.type || '',
    going: race.going || '',
    distance: race.distance || '',
    result: null,
    position: null,
    timestamp: new Date().toISOString(),
  }

  const existingIdx = COUNTERFACTUAL_ID_MAP.get(obsId)
  if (existingIdx !== undefined) {
    COUNTERFACTUAL_DATABASE.observations[existingIdx] = entry
  } else {
    const newIdx = COUNTERFACTUAL_DATABASE.observations.length
    COUNTERFACTUAL_DATABASE.observations.push(entry)
    COUNTERFACTUAL_ID_MAP.set(obsId, newIdx)
  }
}

function matchCounterfactualWithResults(races) {
  let matchCount = 0
  const obs = COUNTERFACTUAL_DATABASE.observations || []
  if (!races || !Array.isArray(races)) return

  races.forEach((race) => {
    const rawDate = String(race.date || (race.off_dt || '').slice(0, 10) || '')
    const date = rawDate.replace(/[/]/g, '-')
    if (!date) return

    const runners = race.runners || []
    const fieldSize = runners.length

    runners.forEach((runner) => {
      const rName = normalizeHorseName(runner.horse)
      const rCourse = normalizeCourse(race.course)
      const entry = obs.find(o => {
        if (o.race_id && race.race_id) {
          return o.race_id === race.race_id &&
            normalizeHorseName(o.horse) === rName &&
            o.result === null
        }
        return normalizeHorseName(o.horse) === rName &&
          normalizeCourse(o.course) === rCourse &&
          o.date === date &&
          o.result === null
      })
      if (!entry) return

      const pos = normalizePosition(runner.position || runner.pos)
      if (pos === 1) entry.result = 'won'
      else if (pos > 1 && pos <= placedPositions(fieldSize)) entry.result = 'placed'
      else if (pos > 0) entry.result = 'lost'
      entry.position = pos
      entry.fieldSize = fieldSize
      matchCount++
    })
  })

  if (matchCount > 0) {
    console.log(`[COUNTERFACTUAL] Matched ${matchCount} activation zone observations with results`)
    updateCounterfactualStats()
    saveDatabase(COUNTERFACTUAL_DB_PATH, COUNTERFACTUAL_DATABASE)
    pgSaveDebounced('counterfactual', COUNTERFACTUAL_DATABASE)
  }
}

function updateCounterfactualStats() {
  const obs = COUNTERFACTUAL_DATABASE.observations
  const resolved = obs.filter(o => o.result)
  const zones = {
    'below_0.3': { total: 0, won: 0, placed: 0, lost: 0, pending: 0 },
    'above_0.3': { total: 0, won: 0, placed: 0, lost: 0, pending: 0 },
  }

  obs.forEach(o => {
    const bucket = o.pa >= 0.30 ? 'above_0.3' : 'below_0.3'
    zones[bucket].total++
    if (o.result === 'won') zones[bucket].won++
    else if (o.result === 'placed') zones[bucket].placed++
    else if (o.result === 'lost') zones[bucket].lost++
    else zones[bucket].pending++
  })

  zones['below_0.3'].winRate = zones['below_0.3'].total > 0
    ? Math.round((zones['below_0.3'].won / Math.max(1, zones['below_0.3'].total - zones['below_0.3'].pending)) * 1000) / 10 : 0
  zones['above_0.3'].winRate = zones['above_0.3'].total > 0
    ? Math.round((zones['above_0.3'].won / Math.max(1, zones['above_0.3'].total - zones['above_0.3'].pending)) * 1000) / 10 : 0

  COUNTERFACTUAL_DATABASE.stats = zones
}

function cleanRaceName(name = '') {
  return String(name)
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/www\.[^\s]+/gi, '')
    .replace(/[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/[^\s]*)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function getHorseRunsForZone(db, horseName) {
  if (!db || !horseName) return []
  try {
    return await db.all(
      `SELECT * FROM horse_runs WHERE horse_name = ? ORDER BY race_date DESC LIMIT 50`,
      [horseName]
    )
  } catch { return [] }
}

async function processRace(race) {
  const startTime = Date.now()
  const raceLabel = `${race.course} ${race.off_time}`
  try {
    const runners = race.runners || []

    const exclusionReason = checkRaceExclusion(race)
    if (exclusionReason) {
      console.log(`[EXCLUDE] ${raceLabel} - ${race.race_name || ''} - ${exclusionReason}`)
      return {
        race_id: race.race_id,
        course: race.course,
        race_name: race.race_name,
        off_time: race.off_time,
        date: race.date,
        distance_f: race.distance_f,
        runners: [],
        excluded: true,
        exclusionReason,
        processingTime: Date.now() - startTime,
      }
    }

    // NaN Safety Assertions at pipeline entry
    if (runners.length > 0) {
      runners.forEach((r, i) => {
        const checks = [
          ['odds', r.odds], ['winProb', r.winProb], ['position', r.position],
          ['horse_id', r.horse_id], ['draw', r.draw], ['age', r.age],
        ]
        checks.forEach(([name, val]) => {
          if (val !== null && val !== undefined && val !== '' && isNaN(Number(val))) {
            console.error(`[NaN] Runner ${r.horse} field "${name}" = ${val} (${typeof val})`)
          }
        })
      })
    }

    if (runners.length < 5) {
      return {
        ...race,
        race_name: cleanRaceName(race.race_name),
        betFilter: { verdict: 'AUTO SKIP', reason: 'Small field (<5 runners)' },
      }
    }

    console.time(`[processRace] ${raceLabel} horseMemory`)
    const raceRunners = race.runners || []
    const orByHorse = {}
    for (const r of raceRunners) {
      if (r.horse) orByHorse[r.horse] = r.or || 0
    }
    if (!global.__horseMemCache) global.__horseMemCache = new Map()
    const uncached = Object.keys(orByHorse).filter(h => !global.__horseMemCache.has(h))
    if (uncached.length > 0) {
      const batch = await getHorseMemoryBatch(HORSE_MEMORY_DB, uncached, orByHorse)
      for (const [name, mem] of Object.entries(batch)) {
        global.__horseMemCache.set(name, mem)
      }
      for (const name of uncached) {
        if (!global.__horseMemCache.has(name)) {
          global.__horseMemCache.set(name, null)
        }
      }
    }
    for (const runner of raceRunners) {
      if (!runner.horse) continue
      const memory = global.__horseMemCache.get(runner.horse)
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

    const raceGoingNum = { 'firm': 1, 'good to firm': 2, 'good': 3, 'good to soft': 4, 'soft': 5, 'heavy': 6 }[String(race.going || '').toLowerCase()] || 0
    const raceFieldSize = race.field_size || race.fieldSize || raceRunners.length || 0
    const raceClass = race.race_class || race.class || ''
    const raceDistF = race.distance_furlongs || 0
    const uniqueTrainers = [...new Set(raceRunners.map(r => r.trainer).filter(Boolean))]
    const trainerBaselines = {}
    for (const t of uniqueTrainers) {
      trainerBaselines[t] = await getCohortBaseline(HORSE_MEMORY_DB, t, race.course || '')
    }
    for (const runner of raceRunners) {
      if (!runner.horse || !runner.horseMemory) continue
      const runs = runner.horseMemory.rawRuns
      if (!runs || !runs.length) continue
      const cohort = trainerBaselines[runner.trainer] || null
      const zone = computeProvenZoneScore(runs, {
        or: runner.or || 0,
        goingNum: raceGoingNum,
        going: race.going || '',
        distanceFurlongs: raceDistF,
        fieldSize: raceFieldSize,
        raceClass,
      }, cohort)
      runner.horseMemory.provenZoneScore = zone.score
      runner.horseMemory.provenZoneDetails = zone.details
      runner.horseMemory.provenZoneInZone = zone.inZone
      runner.horseMemory.provenZoneAnchor = zone.anchor || null
    }
    const enrichedRunners = raceRunners
    console.timeEnd(`[processRace] ${raceLabel} horseMemory`)

    console.time(`[processRace] ${raceLabel} apexEngine`)
    const apexResult = runApexEngine(enrichedRunners, race, {
      goingDb: GOING_DATABASE,
      distanceDb: DISTANCE_DATABASE,
      replayDb: REPLAY_NOTES_DATABASE,
      bucketDb: BUCKET_DATABASE,
      horseProfiles: HORSE_DATABASE,
      horseProfileDb: HORSE_PROFILES_DATABASE,
      races: LEARNING_DATABASE.races || [],
      trainerForm: TRAINER_FORM_DATABASE,
      jockeyForm: JOCKEY_FORM_DATABASE,
      multiplier: LEARNING_DATABASE.weights?.multiplier || {},
      calibrationData: CALIBRATION_DATABASE.analytics || null,
      horseMemoryDb: HORSE_MEMORY_DB,
      orHistory: OR_HISTORY,
      trackProfiles: TRACK_PROFILES,
    })
    console.timeEnd(`[processRace] ${raceLabel} apexEngine`)

    // Yield to event loop after CPU-heavy engine — allows HTTP requests during enrichment
    await new Promise(resolve => setImmediate(resolve))

    const enriched = apexResult.racecards || []

    console.time(`[processRace] ${raceLabel} enrich`)
    const scoredRunners = enriched.map((runner) => {
      const horseId = runner.horse_id || runner.horse
      if (!HORSE_DATABASE[horseId]) {
        HORSE_DATABASE[horseId] = { horse: runner.horse, runs: 0, bestScore: 0 }
      }
      if (!HORSE_DATABASE[horseId].profile) {
        HORSE_DATABASE[horseId].profile = buildHorseProfile(horseId, LEARNING_DATABASE.races || [])
      }
      const horseProfile = HORSE_DATABASE[horseId].profile
      const profileAdj = computeProfileAdjustment(horseProfile, race)
      const previousOdds = MARKET_DATABASE[horseId]?.lastOdds || runner.odds
      const marketMovement = analyzeMarketMovement({ horse: runner.horse, currentOdds: runner.odds, previousOdds, aiConfidence: runner.finalScore })
      MARKET_DATABASE[horseId] = { horse: runner.horse, lastOdds: runner.odds, movement: marketMovement.movement, updatedAt: new Date().toISOString() }
      const bettingSignals = generateSignals({ ...runner, aiProfile: { confidence: runner.finalScore }, marketMovement })
      if (marketMovement.alert) {
        createAlert(horseId, runner.horse, marketMovement.alert.type, marketMovement.alert.message, marketMovement.alert.severity)
      }

      // Apply CORE/CHAOS engine routing
      const odds = Number(runner.odds || 0)
      const grade = runner.selectionQuality?.grade || ''
      const engine = classifyEngine(grade, odds)

      // Apply trainer freshness factor
      const freshFactor = getFreshFactor(runner.trainer, runner.last_run, TRAINER_FRESHNESS_DB)
      if (freshFactor !== 1.0 && runner.last_run > 0) {
        runner.finalScore = Math.round(runner.finalScore * freshFactor)
      }

      const routed = applyEngineRouting(runner, engine, odds)

      logPrediction(race, runner, { confidence: runner.finalScore, estimatedWinProbability: routed.winProb, plattProb: runner.plattProb ?? null, placeProb: routed.placeProb, grade: runner.selectionQuality?.grade || '', betQuality: runner.betQuality || runner.selectionQuality?.label || '', breakdown: { powerScore: runner.power?.total, paceScore: runner.pace?.score, humanAdj: runner.human?.score, marketAdj: runner.market?.score, runningStyle: runner.runningStyle } })
      storeHistoricalRecord(runner, race, apexResult)
      logActivationZone(runner, race, odds)

      // Shadow sandbox: track close-miss selections (SPECULATIVE / BORDERLINE)
      const bq = runner.betQuality || runner.selectionQuality?.label || ''
      if ((bq === 'SPECULATIVE' || bq === 'BORDERLINE') && HORSE_MEMORY_DB && odds >= 2.0) {
        const offTimeShort = (race.off_time || '').slice(0, 5)
        insertShadowWatch(HORSE_MEMORY_DB, {
          race_id: `${race.course}-${offTimeShort}-${race.date}`,
          course: race.course,
          off_time: offTimeShort,
          race_date: race.date,
          horse_name: runner.horse,
          horse_id: runner.horse_id || null,
          market_odds: odds,
          model_wp: routed.winProb,
          apex_score: runner.finalScore,
          bet_quality: bq,
          pa_adj: runner.personalAffinity?.adjustment ?? 0,
          reason_logged: bq === 'BORDERLINE' ? 'PA near zero threshold' : 'Value below gate but score adequate',
        })
      }

      return {
        horse: runner.horse,
        horse_id: runner.horse_id,
        atrUrl: runner.atrUrl,
        age: runner.age,
        sex: runner.sex,
        sex_code: runner.sex_code,
        colour: runner.colour,
        region: runner.region,
        dam: runner.dam,
        sire: runner.sire,
        damsire: runner.damsire,
        trainer: runner.trainer,
        owner: runner.owner,
        number: runner.number,
        draw: runner.draw,
        position: runner.position,
        headgear: runner.headgear,
        draw: runner.draw || 0,
        lbs: runner.lbs,
        ofr: runner.ofr,
        or: runner.or,
        rpr: runner.rpr || 0,
        bha_trend: runner.bha_trend || 0,
        jockey: runner.jockey,
        last_run: runner.last_run,
        form: runner.form,
        odds: runner.odds,
        fairOdds: runner.fairOdds || runner.selectionQuality?.fairOdds || 0,
        valueEdge: (() => {
          const fairOdds = runner.fairOdds || runner.selectionQuality?.fairOdds || 0
          const oddsVal = Number(runner.odds || 0)
          return fairOdds > 0 && oddsVal > 0 ? (fairOdds - oddsVal) / oddsVal : 0
        })(),
        runningStyle: runner.runningStyle,
        earlyPaceScore: runner.earlyPaceScore || null,
        finalScore: runner.finalScore,
        winProb: routed.winProb,
        placeProb: routed.placeProb,
        engine: engine,
        stakeType: routed.stakeType,
        maxStake: routed.maxStake,
        betFilterStatus: routed.betFilterStatus || '',
        probBand: runner.probBand,
        probRange: runner.probRange,
        probTier: runner.probTier,
        confidenceScore: runner.confidenceScore,
        betQuality: runner.betQuality,
        selectionQuality: (() => {
          return selectionQuality(
            routed.winProb,
            runner.odds,
            runner.confidenceTier?.label || runner.probBand || '',
            runner.volatility || 0,
            runner.uncertainty?.uncertainty || 0,
            runner.market?.score || 0
          )
        })(),
        powerScore: runner.power?.total,
        paceScore: runner.pace?.score,
        humanScore: runner.human?.score,
        marketScore: runner.market?.score,
        energy: runner.energy || null,
        paceCompat: runner.paceCompat || null,
        trackProfile: runner.trackProfile || null,
        personalAffinity: runner.personalAffinity || null,
        classModel: runner.classModel || null,
        performanceRating: runner.classModel?.rprORSource === 'PR' ? {
          pr: runner.classModel.rprORGap + (runner.or || 0),
          gap: runner.classModel.rprORGap,
          source: 'PR',
        } : (runner.classModel?.rprORSource === 'RPR' && runner.previous_results?.length > 0 ? (() => {
          const pr = computePerformanceRating(runner.previous_results, runner.or || 0, race.type || '')
          return pr.runs > 0 ? { pr: pr.pr, gap: pr.gap, source: 'PR' } : null
        })() : null),
        freshFactor,
        score: runner.winnerScore,
        finalScore: runner.finalScore,
        bettingSignals,
        marketMovement,
        elimination: runner.elimination,
        previous_results: runner.previous_results || [],
      }
    })

    // Diagnostic: log PA data for first runner of first race only
    if (scoredRunners.length > 0 && !global.__paDiagLogged) {
      const sr = scoredRunners[0]
      const rawRunner = (race.runners || [])[0] || {}
      const pa = sr.personalAffinity || {}
      const bd = pa.breakdown || {}
      const rawPR = rawRunner.previous_results || []
      const fmt = (v, d = 3) => v != null ? Number(v).toFixed(d) : '—'
      console.log(`[PA-DIAG] ┌─ ${sr.horse} (${rawRunner.course_name || race.course} ${race.date})`)
      console.log(`[PA-DIAG] │  runs: ${rawPR.length}  factor: ${fmt(pa.factor)}  conf: ${fmt(pa.confidence, 0)}%  adj: ${fmt(pa.adjustment)}`)
      console.log(`[PA-DIAG] │  track:  wr=${fmt(bd.track?.winRate, 0)}%  conf=${fmt(bd.track?.confidence, 0)}%  adj=${fmt(bd.track?.adjustment)}`)
      console.log(`[PA-DIAG] │  dir:    runs=${bd.direction?.runs ?? '—'}  conf=${fmt(bd.direction?.confidence, 0)}%  adj=${fmt(bd.direction?.adjustment)}`)
      console.log(`[PA-DIAG] │  dist:   runs=${bd.distance?.runs ?? '—'}  conf=${fmt(bd.distance?.confidence, 0)}%  adj=${fmt(bd.distance?.adjustment)}`)
      console.log(`[PA-DIAG] │  going:  runs=${bd.going?.runs ?? '—'}  conf=${fmt(bd.going?.confidence, 0)}%  adj=${fmt(bd.going?.adjustment)}`)
      console.log(`[PA-DIAG] │  draw:   adj=${fmt(bd.drawStyle?.adjustment)}  conf=${fmt(bd.drawStyle?.confidence, 0)}%`)
      console.log(`[PA-DIAG] └─ note: ${pa.note}`)
      global.__paDiagLogged = true
    }

    for (const sr of scoredRunners) {
      try {
        recordAffinityPrediction(sr.horse, race, sr)
      } catch { /* silent */ }
    }
    try { saveAffinityStore() } catch { /* silent */ }

    console.timeEnd(`[processRace] ${raceLabel} enrich`)

    return {
      ...race,
      race_name: cleanRaceName(race.race_name),
      paceMap: apexResult.paceMap,
      raceShape: apexResult.raceShape || null,
      volatility: apexResult.volatility,
      betFilter: apexResult.betFilter,
      runners: scoredRunners.sort((a, b) => b.finalScore - a.finalScore),
    }
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[processRace] Error ${race.course} ${race.off_time} (${elapsed}ms):`, error.message)
    return {
      ...race,
      race_name: cleanRaceName(race.race_name),
      runners: [],
      betFilter: { verdict: 'ERROR', reason: error.message },
      paceMap: {},
      volatility: { chaos: 0, label: 'N/A' },
        }
      }

      const pgCf = await pgLoad('counterfactual')
      if (pgCf && typeof pgCf === 'object' && pgCf.observations?.length > 0) {
        COUNTERFACTUAL_DATABASE.observations = pgCf.observations
        COUNTERFACTUAL_DATABASE.stats = pgCf.stats || {}
        console.log(`[PG] Loaded counterfactual log from Postgres: ${pgCf.observations.length} observations`)
      } else {
        const fileCf = loadDatabase(COUNTERFACTUAL_DB_PATH)
        if (fileCf?.observations?.length > 0) {
          COUNTERFACTUAL_DATABASE.observations = fileCf.observations
          COUNTERFACTUAL_DATABASE.stats = fileCf.stats || {}
          await pgSave('counterfactual', COUNTERFACTUAL_DATABASE)
          console.log(`[PG] Seeded counterfactual log from file: ${fileCf.observations.length} observations`)
        }
      }
    }

async function fetchLiveMeetings() {
  try {
    console.log('[LiveMeetings] Fetching Sporting Life racecards...')
    if (!LIVE_STATE.racecards || LIVE_STATE.racecards.length === 0) {
      LIVE_STATE.processingComplete = false
    }

    const cacheKey = 'racecards:sl'
    const cached = API_CACHE.get(cacheKey)
    if (cached) {
      console.log('[LiveMeetings] Serving from cache')
      LIVE_STATE.racecards = cached
      LIVE_STATE.updatedAt = new Date().toISOString()
      LIVE_STATE.loading = false
      LIVE_STATE.processingComplete = true
      io.emit('live-update', buildLightweightState())
      return
    }

    console.time('[Startup] fetchSlRacecards')
    const today = new Date().toISOString().split('T')[0]
    let scrapeResult
    try {
      scrapeResult = await Promise.race([
        retry(() => fetchSlRacecards(today), 2, 2000),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Racecard scrape timeout (5min)')), 300000))
      ])
    } catch (e) {
      console.error('[LiveMeetings] Racecard scrape failed/timed out:', e.message)
      scrapeResult = { races: [], abandoned: [] }
    }
    console.timeEnd('[Startup] fetchSlRacecards')
    // Close shared browser pool to free memory — racecards are done, ATR has its own browser
    try { await closeBrowser() } catch {}
    const rawRaces = scrapeResult?.races || scrapeResult || []
    const abandonedMeetings = scrapeResult?.abandoned || []

    if (abandonedMeetings.length > 0) {
      LIVE_STATE.abandoned = abandonedMeetings.map(m => ({
        name: m.name,
        slug: m.slug,
        date: m.date,
      }))
    } else {
      LIVE_STATE.abandoned = []
    }

    if (!rawRaces || rawRaces.length === 0) {
      console.log('[LiveMeetings] No races found on Sporting Life')
      LIVE_STATE.loading = false
      return
    }

    console.log(`[LiveMeetings] Processing ${rawRaces.length} races from Sporting Life...`)

    // Phase 1: Process races in parallel batches (concurrency = 4)
    console.time('[LiveMeetings] processRaces')
    const processed = []
    const CONCURRENCY = 4

    for (let batch = 0; batch < rawRaces.length; batch += CONCURRENCY) {
      const batchRaces = rawRaces.slice(batch, batch + CONCURRENCY)
      const results = await Promise.allSettled(
        batchRaces.map(race => processRace(race))
      )
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'fulfilled') {
          processed.push(results[j].value)
        } else {
          const race = batchRaces[j]
          console.error(`[processRace] Error ${race.course} ${race.off_time}: ${results[j].reason?.message}`)
        }
      }

      const totalRunners = processed.reduce((sum, r) => sum + (r.runners?.length || 0), 0)
      console.log(`[LiveMeetings] ${Math.min(batch + CONCURRENCY, rawRaces.length)}/${rawRaces.length} races processed, ${totalRunners} runners`)
      LIVE_STATE.racecards = [...processed]
      LIVE_STATE.updatedAt = new Date().toISOString()
      LIVE_STATE.loading = false
      API_CACHE.set(cacheKey, processed)
      io.emit('live-update', buildLightweightState())
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    // Broadcast scored races IMMEDIATELY — picks visible within ~30s
    console.timeEnd('[LiveMeetings] processRaces')
    LIVE_STATE.racecards = processed
    LIVE_STATE.updatedAt = new Date().toISOString()
    LIVE_STATE.loading = false
    LIVE_STATE.processingComplete = true
    LIVE_STATE.atrLoading = true
    API_CACHE.set(cacheKey, processed)
    io.emit('live-update', buildLightweightState())
    console.log(`[LiveMeetings] Broadcasted ${processed.length} races (pre-ATR)`)

    if (!LIVE_STATE.lockedDate || LIVE_STATE.lockedDate !== today) {
      const allRunners = processed.flatMap(r => (r.runners || []).map(runner => ({ ...runner, course: r.course, off_time: r.off_time, race_id: r.race_id })))
      const bettable = allRunners.filter(r => r.betQuality !== 'NO BET' && (r.score || 0) > 0 && r.odds > 0)
      const sorted = bettable.sort((a, b) => (b.score || 0) - (a.score || 0))
      if (sorted.length > 0) {
        LIVE_STATE.lockedNap = sorted[0]
        LIVE_STATE.lockedDate = today
        console.log(`[NAP] Locked: ${sorted[0].horse} at ${sorted[0].course} ${sorted[0].off_time} (score: ${sorted[0].score})`)
      }
    }

    // Phase 2: ATR ratings — DISABLED (source returns 404, Chromium crashes on 1.5Gi RAM)
    LIVE_STATE.atrLoading = false

    // Phase 3: Racing Post data in background — adds RPR, TopSpeed, stats
    ;(async () => {
      try {
        console.log('[RP] Fetching Racing Post data (background)...')
        const rpData = await spawnRPWorker(today)
        const rpCount = Object.keys(rpData).length
        console.log(`[RP] Got data for ${rpCount} horses`)

        if (rpCount > 0) {
          // Merge RP data into runners — add TopSpeed and stats where missing
          let rpMerged = 0
          for (const race of processed) {
            let raceChanged = false
            const updatedRunners = (race.runners || []).map(runner => {
              const key = normalizeHorseName(runner.horse || runner.horse_name || '')
              const rp = rpData[key]
              if (!rp) return runner

              const updates = {}

              // Add TopSpeed if not present
              if (rp.ts && (!runner.ts || runner.ts === 0)) {
                updates.ts = rp.ts
                raceChanged = true
              }

              // Add RPR from Racing Post if SL didn't provide one
              if (rp.rpr && (!runner.rpr || runner.rpr === 0)) {
                updates.rpr = rp.rpr
                raceChanged = true
              }

              // Add form from RP if SL didn't provide one
              if (rp.form && (!runner.form || runner.form === '')) {
                updates.form = rp.form
                raceChanged = true
              }

              // Merge RP stats into runner for engine access
              if (rp.courseRuns > 0 || rp.distRuns > 0 || rp.goingRuns > 0) {
                updates.rpStats = {
                  courseWins: rp.courseWinRate,
                  courseRuns: rp.courseRuns,
                  distWins: rp.distWinRate,
                  distRuns: rp.distRuns,
                  goingWins: rp.goingWinRate,
                  goingRuns: rp.goingRuns,
                }
                raceChanged = true
              }

              // Store speed trend for outlier detection
              if (rp.speedTrend && rp.speedTrend.length >= 2) {
                updates.speedTrend = rp.speedTrend
                raceChanged = true
              }

              if (Object.keys(updates).length > 0) {
                rpMerged++
                return { ...runner, ...updates }
              }
              return runner
            })

            if (raceChanged) {
              race.runners = updatedRunners
              try {
                const rescored = await processRace({ ...race, runners: updatedRunners })
                Object.assign(race, rescored)
              } catch (e) {
                console.error(`[RP] Re-score failed ${race.course}: ${e.message}`)
              }
            }
          }

          console.log(`[RP] Merged ${rpMerged} horse profiles, re-scored affected races`)
          LIVE_STATE.racecards = processed
          API_CACHE.set(cacheKey, processed)
          io.emit('live-update', buildLightweightState())
          console.log('[RP] Re-broadcasted with RP data')
        }
      } catch (error) {
        console.error('[RP] Background fetch failed:', error.message)
      }
    })()

    // ATR Odds disabled — ATR racecard pages require JavaScript rendering (Chromium),
    // which can't run on 1.5Gi RAM server. SL odds + RP Worker cover this data.
    // ;(async () => {
    //   try {
    //     console.log('[ATR Odds] Fetching ATR odds (background)...')
    //     const atrRaces = await Promise.race([
    //       fetchAtrRacecards(today),
    //       new Promise((_, reject) => setTimeout(() => reject(new Error('ATR odds timeout (30s)')), 30000))
    //     ])
    //     if (atrRaces && atrRaces.length > 0) {
    //       let oddsMerged = 0
    //       processed.forEach((race) => {
    //         const atrMatch = atrRaces.find(
    //           (ar) => normalizeCourse(ar.course) === normalizeCourse(race.course) &&
    //             String(ar.off_time || '').replace(':', '') === String(race.off_time || '').replace(':', '')
    //         )
    //         if (atrMatch && atrMatch.runners) {
    //           race.runners = (race.runners || []).map((runner) => {
    //             const atrRunner = atrMatch.runners.find(
    //               (ar) => normalizeHorseName(ar.horse) === normalizeHorseName(runner.horse)
    //             )
    //             if (atrRunner && atrRunner.sp && atrRunner.sp > 0) {
    //               const slOdds = runner.odds
    //               const atrOdds = atrRunner.sp
    //               if (String(slOdds) !== String(atrOdds)) {
    //                 console.log(`[ODDS] ${runner.horse}: SL=${slOdds} ATR=${atrOdds} → using ATR`)
    //                 oddsMerged++
    //               }
    //               return { ...runner, odds: atrOdds, atrOdds }
    //             }
    //             return runner
    //           })
    //         }
    //       })
    //       console.log(`[ATR Odds] Merged ${oddsMerged} ATR odds`)
    //       LIVE_STATE.racecards = processed
    //       API_CACHE.set(cacheKey, { ...processed, _date: today })
    //       io.emit('live-update', buildLightweightState())
    //     }
    //   } catch (error) {
    //     console.error('[ATR Odds] Fetch failed:', error.message)
    //   }
    // })()

    // Persist enriched racecard data for OR/PR gap backfill
    try {
      const enrichedCache = (processed || []).map(race => ({
        race_id: race.race_id,
        race_name: race.race_name || '',
        course: race.course,
        off_time: race.off_time,
        date: race.date,
        going: race.going || '',
        distance_f: race.distance_f || '',
        race_class: race.race_class || 0,
        surface: race.surface || '',
        excluded: race.excluded || false,
        exclusionReason: race.exclusionReason || null,
        runners: (race.runners || []).map(r => ({
          horse: r.horse,
          jockey: r.jockey || '',
          trainer: r.trainer || '',
          or: r.or,
          previous_results: r.previous_results || [],
          performanceRating: r.performanceRating || null,
        })),
      }))
      saveDatabase(path.join(process.cwd(), 'data', 'racecard-enriched.json'), { races: enrichedCache, savedAt: new Date().toISOString() })
    } catch (e) {
      console.error('[LiveMeetings] Failed to save enriched cache:', e.message)
    }

    try {
      saveDatabase(MARKET_DB_PATH, MARKET_DATABASE)
      saveDatabase(ALERT_DB_PATH, ALERT_DATABASE)
      saveDatabase(PREDICTIONS_DB_PATH, PREDICTIONS_DATABASE)
      pgSaveDebounced('predictions', PREDICTIONS_DATABASE)
      saveDatabase(HISTORICAL_DB_PATH, HISTORICAL_DATABASE)
    } catch (error) {
      console.error('[LiveMeetings] Database save failed:', error.message)
    }
    io.emit('live-update', buildLightweightState())
    console.log(`Broadcasted ${processed.length} races from Sporting Life`)
  } catch (error) {
    console.error('[LiveMeetings] Error:', error.message)
    console.error(error.stack)
    LIVE_STATE.loading = false
  }
}

const BACKTEST_CACHE_DIR = path.join(process.cwd(), 'data', 'backtest-cache')

function saveBacktestCache(races) {
  if (!races || !races.length) return
  const byDate = {}
  for (const race of races) {
    const d = race.date
    if (!d) continue
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(race)
  }
  for (const [date, dateRaces] of Object.entries(byDate)) {
    const cachePath = path.join(BACKTEST_CACHE_DIR, `results-${date}.json`)
    let existing = []
    try {
      if (fs.existsSync(cachePath)) {
        existing = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
      }
    } catch {}
    const existingIds = new Set(existing.map(r => r.race_id || `${r.course}-${r.off_time || r.off}`))
    const newRaces = dateRaces
      .filter(r => !existingIds.has(r.race_id || `${r.course}-${r.off_time || r.off}`))
      .map(r => ({
        race_id: r.race_id || `${r.course}-${r.off_time || r.off}`,
        course: r.course || '',
        race_name: r.race_name || '',
        going: r.going || '',
        distance_f: r.distance_f || '',
        race_class: r.race_class || 0,
        date: r.date || '',
        runners: (r.runners || []).map(runner => ({
          horse: runner.horse || '',
          horse_id: runner.horse_id || '',
          position: runner.position || 0,
          odds: runner.odds || 0,
          sp: runner.sp || 0,
          or: runner.or || 0,
          rpr: runner.rpr || 0,
          draw: runner.draw || 0,
          jockey: runner.jockey || '',
          trainer: runner.trainer || '',
          form: runner.form || '',
          age: runner.age || 0,
          sex: runner.sex || '',
          lbs: runner.lbs || '',
          last_run: runner.last_run || 0,
          previous_results: runner.previous_results || [],
        })),
      }))
    if (newRaces.length > 0) {
      const merged = [...existing, ...newRaces]
      try {
        if (!fs.existsSync(BACKTEST_CACHE_DIR)) fs.mkdirSync(BACKTEST_CACHE_DIR, { recursive: true })
        fs.writeFileSync(cachePath, JSON.stringify(merged, null, 0))
        console.log(`[BacktestCache] Saved ${newRaces.length} new races for ${date} (total: ${merged.length})`)
      } catch (err) {
        console.error(`[BacktestCache] Failed to write ${cachePath}: ${err.message}`)
      }
    }
  }
}

async function matchResultsToCalibration(races) {
  let matched = 0

  // Build set of existing calibration record keys to avoid duplicates
  const existingCalKeys = new Set(
    CALIBRATION_DATABASE.records.map(r => `${r.horse}-${r.course}-${r.date}-${r.race}`)
  )

  // Build set of existing learning record keys to avoid duplicates
  const existingLearnKeys = new Set(
    (LEARNING_DATABASE.records || []).map(r => r.id || `${r.horse}-${r.raceKey || ''}`)
  )

  races.forEach((race) => {
    const runners = race.runners || []

    runners.forEach((runner) => {
      const id = `${race.course}-${race.off_time}-${race.date}-${runner.horse}`
      const position = normalizePosition(runner.position)
      const rec = HISTORICAL_DATABASE.records.find((r) => r.id === id)

      // Track OR/PR gap for testing (runs for all runners with OR + PR data)
      if (rec && rec.or > 0 && rec.orPrGap == null) {
        const preRacePR = runner.performanceRating?.pr || rec.performanceRating?.pr || 0
        if (preRacePR > 0) {
          rec.orPrGap = Math.round((preRacePR - rec.or) * 10) / 10
        }
      }

      if (rec && !rec.resulted) {
        const spOdds = resolveOdds(runner)
        rec.actual_position = position
        rec.actual_won = position === 1
        rec.actual_placed = position >= 1 && position <= placedPositions(rec.field_size || 0)
        rec.actual_odds = spOdds
        rec.spOdds = spOdds
        rec.closingOdds = spOdds

        // Recompute edge using SP instead of stale pre-race odds
        if (spOdds > 0 && rec.fairOdds > 0) {
          rec.odds = spOdds
          const spEdge = (rec.fairOdds - spOdds) / spOdds
          rec.valueEdge = Math.round(spEdge * 10000) / 10000
          rec.rejectedBy = []
          if (spEdge <= 0) rec.rejectedBy.push('NEGATIVE_EDGE')
          if (!rec.winProb || rec.winProb <= 0) rec.rejectedBy.push('ZERO_PROBABILITY')
          if (spOdds <= 1) rec.rejectedBy.push('INVALID_ODDS')
          if (rec.confidenceScore !== undefined && rec.confidenceScore < 10) rec.rejectedBy.push('LOW_CONFIDENCE')
          rec.noBet = rec.rejectedBy.length >= 2 || (rec.betFilter === 'AUTO SKIP' && rec.rejectedBy.length > 0)
        }

        if (rec.takenOdds > 0 && spOdds > 0) {
          rec.clv = ((rec.takenOdds - spOdds) / spOdds)
        }
        if (!rec.last_run && runner.last_run) rec.last_run = runner.last_run
        if (!rec.trainer && runner.trainer) rec.trainer = runner.trainer
        rec.resulted = true
        if (runner.finish_distance) rec.finish_distance = runner.finish_distance

        recordTrackBiasResult(race.course, runner.runningStyle, position, rec.field_size)

        const affinityRaceKey = `${race.course}|${race.off_time || ''}|${race.date || ''}`
        try {
          verifyAffinityResult(runner.horse, affinityRaceKey, position, runner.finish_distance, runner.runningStyle)
        } catch { /* silent */ }

        // Update Performance Rating with this result
        const horseBha = rec.or || runner.or || 0
        if (horseBha > 0 && position > 0) {
          const actualPerf = computeActualPerformance(
            position,
            rec.field_size || runners.length,
            horseBha,
            race.race_class || '',
            runner.finish_distance
          )
          if (actualPerf !== null) {
            const storedPR = getStoredPR(runner.horse)
            const currentPR = storedPR?.pr || horseBha
            const prUpdate = updatePerformanceRating(runner.horse, actualPerf, currentPR)
            if (prUpdate.delta !== 0) {
              console.log(`[PerfRating] ${runner.horse}: PR ${currentPR} → ${prUpdate.newPR} (${prUpdate.delta > 0 ? '+' : ''}${prUpdate.delta}, run #${prUpdate.runCount})`)
            }
          }
        }
      }

      const prediction = findPredictionForRunner(race, runner)

      if (prediction) {
        const calKey = `${prediction.horse}-${prediction.course}-${prediction.date}-${prediction.race}`

        // Update existing calibration record with actual results
        if (existingCalKeys.has(calKey)) {
          const existingCal = CALIBRATION_DATABASE.records.find(
            r => `${r.horse}-${r.course}-${r.date}-${r.race}` === calKey
          )
          if (existingCal && !existingCal.actualPosition) {
            existingCal.actualPosition = position
            existingCal.actualWon = position === 1
            existingCal.actualPlaced = position >= 1 && position <= placedPositions(existingCal.fieldSize || 0)
            existingCal.actualOdds = resolveOdds(runner)
            if (!existingCal.going) existingCal.going = normalizeGoingString(prediction.going || race.going || '')
          }
          return
        }

        const calRecord = createCalibrationRecord({
          ...prediction,
          going: normalizeGoingString(race.going || prediction.going || ''),
          fieldSize: race.field_size || race.fieldSize || 0,
          trainer: runner.trainer || '',
          raceType: race.race_type || race.raceType || '',
        }, {
          position,
          spOdds: resolveOdds(runner),
        })

        CALIBRATION_DATABASE.records.push(calRecord)
        existingCalKeys.add(calKey)

        // Also create learning record for anti-overfit/learning engine
        const raceKey = `${race.course}-${race.off_time || ''}-${race.date}`
        const learnId = `${runner.horse}-${raceKey}`
        if (existingLearnKeys.has(learnId)) return

        LEARNING_DATABASE.records.push({
          id: learnId,
          raceKey,
          horse: runner.horse,
          trainer: runner.trainer || '',
          or: runner.or || 0,
          last_run: runner.last_run || 0,
          position,
          won: position === 1,
          spOdds: resolveOdds(runner),
          aiConfidence: Number(prediction.confidence || prediction.finalScore || 75),
          signal: prediction.signal || 'AUTO_MATCH',
          marketMovement: prediction.marketMovement || 'UNKNOWN',
          timestamp: new Date().toISOString(),
          resultProcessed: true,
          breakdown: prediction.breakdown || null,
          weights: prediction.weights || null,
        })
        existingLearnKeys.add(learnId)

        matched++
      }
    })
  })

  if (matched > 0) {
    CALIBRATION_DATABASE.analytics = {
      byProbability: computeCalibrationBuckets(CALIBRATION_DATABASE.records),
      byPlaceProbability: computePlaceCalibration(CALIBRATION_DATABASE.records),
      byGrade: computeCalibrationByGrade(CALIBRATION_DATABASE.records),
      byBetQuality: computeCalibrationByBetQuality(CALIBRATION_DATABASE.records),
      segments: computeAllSegmentations(CALIBRATION_DATABASE.records),
      lastUpdated: new Date().toISOString(),
    }
    saveDatabase(CALIBRATION_DB_PATH, CALIBRATION_DATABASE)

    const existingWeights = LEARNING_DATABASE.weights || {}
    const rawLearningResult = learnFromResults(LEARNING_DATABASE.records, existingWeights)
    if (rawLearningResult.adjusted) {
      const protectedResult = applyProtectedAdjustment(
        existingWeights.multiplier || {},
        rawLearningResult.weights.multiplier || {},
        LEARNING_DATABASE.records
      )
      if (protectedResult.adjusted) {
        LEARNING_DATABASE.weights = { multiplier: protectedResult.weights }
        LEARNING_DATABASE.lastLearningRun = {
          date: new Date().toISOString(),
          totalRecords: rawLearningResult.totalRecords,
          winners: rawLearningResult.winners,
          analysis: rawLearningResult.analysis,
          protected: true,
          learningRate: protectedResult.learningRate,
          outliersSuppressed: protectedResult.outliersSuppressed,
        }
        console.log('[Learning] Weights adjusted:', JSON.stringify(protectedResult.weights))
      }
    } else {
      console.log('[Learning] Skipped:', rawLearningResult.reason)
    }

    saveDatabase(LEARNING_DB_PATH, LEARNING_DATABASE)

    TRAINER_FRESHNESS_DB = computeTrainerFreshness(races, TRAINER_FRESHNESS_DB)
    const freshnessPath = path.join(process.cwd(), 'data', 'trainer-freshness.json')
    saveDatabase(freshnessPath, TRAINER_FRESHNESS_DB)
    console.log(`[Freshness] Updated trainer freshness: ${Object.keys(TRAINER_FRESHNESS_DB.trainers).length} trainers`)

    // Update trainer form database (last 14 days)
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    const cutoffDate = fourteenDaysAgo.toISOString().slice(0, 10)
    
    // Build trainer form from all historical results
    const trainerForm = {}
    const allRaces = LEARNING_DATABASE.races || []
    allRaces.forEach(race => {
      if (!race.date || race.date < cutoffDate) return
      const runners = race.runners || []
      runners.forEach(runner => {
        const trainer = runner.trainer
        if (!trainer) return
        if (!trainerForm[trainer]) {
          trainerForm[trainer] = { runs: 0, wins: 0, places: 0, lastUpdate: race.date }
        }
        const pos = normalizePosition(runner.position)
        if (pos > 0) {
          trainerForm[trainer].runs++
          if (pos === 1) trainerForm[trainer].wins++
          if (pos <= placedPositions(race.field_size || runners.length)) trainerForm[trainer].places++
        }
      })
    })
    
    // Calculate win rates
    Object.keys(trainerForm).forEach(trainer => {
      const t = trainerForm[trainer]
      t.winRate = t.runs > 0 ? Math.round((t.wins / t.runs) * 100 * 10) / 10 : 0
      t.placeRate = t.runs > 0 ? Math.round((t.places / t.runs) * 100 * 10) / 10 : 0
    })
    
    Object.assign(TRAINER_FORM_DATABASE, trainerForm)
    saveDatabase(TRAINER_FORM_PATH, TRAINER_FORM_DATABASE)
    console.log(`[TrainerForm] Updated: ${Object.keys(trainerForm).length} trainers in last 14 days`)

    // Update jockey form database (last 14 days) — mirrors trainer form builder
    const jockeyForm = {}
    allRaces.forEach(race => {
      if (!race.date || race.date < cutoffDate) return
      const runners = race.runners || []
      const fSize = race.field_size || runners.length
      runners.forEach(runner => {
        const jockey = runner.jockey
        if (!jockey) return
        if (!jockeyForm[jockey]) {
          jockeyForm[jockey] = { runs: 0, wins: 0, places: 0, lastUpdate: race.date, byCourse: {} }
        }
        const pos = normalizePosition(runner.position)
        if (pos > 0) {
          jockeyForm[jockey].runs++
          if (pos === 1) jockeyForm[jockey].wins++
          if (pos <= placedPositions(fSize)) jockeyForm[jockey].places++
        }
        const course = (race.course || '').toLowerCase()
        if (course) {
          if (!jockeyForm[jockey].byCourse[course]) {
            jockeyForm[jockey].byCourse[course] = { runs: 0, wins: 0 }
          }
          if (pos > 0) {
            jockeyForm[jockey].byCourse[course].runs++
            if (pos === 1) jockeyForm[jockey].byCourse[course].wins++
          }
        }
      })
    })
    Object.keys(jockeyForm).forEach(jockey => {
      const j = jockeyForm[jockey]
      j.winRate = j.runs > 0 ? Math.round((j.wins / j.runs) * 100 * 10) / 10 : 0
      j.placeRate = j.runs > 0 ? Math.round((j.places / j.runs) * 100 * 10) / 10 : 0
      Object.keys(j.byCourse).forEach(course => {
        const c = j.byCourse[course]
        c.winRate = c.runs > 0 ? Math.round((c.wins / c.runs) * 100 * 10) / 10 : 0
      })
    })
    Object.assign(JOCKEY_FORM_DATABASE, jockeyForm)
    saveDatabase(JOCKEY_FORM_PATH, JOCKEY_FORM_DATABASE)
    console.log(`[JockeyForm] Updated: ${Object.keys(jockeyForm).length} jockeys in last 14 days`)

    OR_HISTORY = buildORHistory(LEARNING_DATABASE.records || [])
    console.log(`[OR History] Built OR profiles for ${Object.keys(OR_HISTORY).length} horses`)

    const trackBiasPath = path.join(process.cwd(), 'data', 'trackBiasLearning.json')
    saveTrackBiasStore()
    console.log(`[Track Bias] Saved track bias learning data`)

    savePerformanceRatingStore()
    console.log(`[PerfRating] Saved performance rating data`)

    console.log(`[Calibration] Matched ${matched} runners for calibration, saved learning records`)
  }

  // Save full race objects to backtest-cache for point-in-time backtesting
  saveBacktestCache(races)

  // Match results against daily picks so the home tab shows W/P/L
  matchDailyPicksWithResults(races)
  matchCounterfactualWithResults(races)

  // Settle shadow watch records (SPECULATIVE / BORDERLINE close misses)
  if (HORSE_MEMORY_DB) {
    try {
      const pending = await getPendingShadowWatches(HORSE_MEMORY_DB)
      let settled = 0
      const dateStr = races[0]?.date || ''
      for (const watch of pending) {
        if (dateStr && watch.race_date !== dateStr) continue
        for (const race of races) {
          if ((race.course || '').toLowerCase() !== (watch.course || '').toLowerCase()) continue
          if (race.date !== watch.race_date) continue
          const runner = (race.runners || []).find(r => (r.horse || '').toLowerCase() === (watch.horse_name || '').toLowerCase())
          if (runner && runner.position > 0) {
            const pnl = runner.position === 1 ? (watch.market_odds - 1) : -1
            await settleShadowWatch(HORSE_MEMORY_DB, watch.id, runner.position, pnl)
            settled++
            break
          }
        }
      }
      if (settled > 0) console.log(`[Shadow Watch] Auto-settled ${settled} records for ${dateStr}`)
    } catch (e) {
      console.error(`[Shadow Watch] Settlement error: ${e.message}`)
    }
  }
}

function isBstDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')
  const year = d.getUTCFullYear()
  const bstStart = new Date(Date.UTC(year, 2, 31))
  bstStart.setUTCDate(bstStart.getUTCDate() - bstStart.getUTCDay())
  bstStart.setUTCHours(1, 0, 0, 0)
  const bstEnd = new Date(Date.UTC(year, 9, 31))
  bstEnd.setUTCDate(bstEnd.getUTCDate() - bstEnd.getUTCDay())
  bstEnd.setUTCHours(1, 0, 0, 0)
  return d >= bstStart && d < bstEnd
}

let migrationDone = false
function migrateLearningDb() {
  if (migrationDone) return
  migrationDone = true
  const existingRaces = LEARNING_DATABASE.races || []
  let migrated = false
  for (const r of existingRaces) {
    if (r.race_id && /^\D+\-\d+/.test(r.race_id)) {
      r.race_id = r.race_id.replace(/^.*-/, '')
      migrated = true
    }
    if (r.off_time && r.date && /^\d{1,2}:\d{2}:\d{2}$/.test(r.off_time) && isBstDate(r.date)) {
      const [h, m, s] = r.off_time.split(':')
      r.off_time = `${String(parseInt(h, 10) + 1).padStart(2, '0')}:${m}:${s}`
      migrated = true
    }
  }
  if (migrated) {
    saveDatabase(LEARNING_DB_PATH, LEARNING_DATABASE)
    console.log('[Migration] Updated learning.json race_id format + BST times')
  }
}

async function fetchResultsForDate(dateStr) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    // Only skip scraping for past dates if we already have data
    // For today, always re-scrape since races finish throughout the day
    if (dateStr !== today) {
      const existingDateRaces = (LEARNING_DATABASE.races || []).filter(r => r.date === dateStr && r.off_time)
      const hasPendingPicks = DAILY_PICKS_DATABASE[dateStr]?.stats?.pending > 0
      if (existingDateRaces.length >= 10 && !hasPendingPicks) {
        console.log(`[Results] Already have ${existingDateRaces.length} races for ${dateStr}, skipping scrape`)
        matchResultsToCalibration(existingDateRaces)
        matchCounterfactualWithResults(existingDateRaces)
        matchDailyPicksWithResults(existingDateRaces)

        // Settle shadow watch records on skip path too
        if (HORSE_MEMORY_DB) {
          try {
            const pending = await getPendingShadowWatches(HORSE_MEMORY_DB)
            let settled = 0
            for (const watch of pending) {
              if (watch.race_date !== dateStr) continue
              for (const race of existingDateRaces) {
                if ((race.course || '').toLowerCase() !== (watch.course || '').toLowerCase()) continue
                if (race.date !== watch.race_date) continue
                const runner = (race.runners || []).find(r => (r.horse || '').toLowerCase() === (watch.horse_name || '').toLowerCase())
                if (runner && runner.position > 0) {
                  const pnl = runner.position === 1 ? (watch.market_odds - 1) : -1
                  await settleShadowWatch(HORSE_MEMORY_DB, watch.id, runner.position, pnl)
                  settled++
                  break
                }
              }
            }
            if (settled > 0) console.log(`[Shadow Watch] Auto-settled ${settled} records for ${dateStr}`)
          } catch (e) {
            console.error(`[Shadow Watch] Settlement error: ${e.message}`)
          }
        }

        // Also record runs for condition database on skip path
        let conditionRecorded = 0
        for (const race of existingDateRaces) {
          if (race.runners && race.runners.length > 0 && race.going) {
            try {
              recordRun(race)
              conditionRecorded++
            } catch (e) {
              // silently skip
            }
          }
        }
        if (conditionRecorded > 0) {
          console.log(`[ConditionDB] Recorded ${conditionRecorded} races with full metadata`)
        }

        return existingDateRaces.length
      }
    }

    console.log(`[Results] Fetching results for ${dateStr}...`)
    const resultRaces = await retry(() => fetchSlResults(dateStr), 2, 2000)

    if (!resultRaces || resultRaces.length === 0) {
      console.log(`[Results] No results scraped for ${dateStr}, matching against existing DB races`)
      const existingRaces = (LEARNING_DATABASE.races || []).filter(r => r.date === dateStr)
      if (existingRaces.length > 0) matchDailyPicksWithResults(existingRaces)
      return 0
    }

    console.log(`[Results] Found ${resultRaces.length} races for ${dateStr}`)

    try {
      const existingRaces = LEARNING_DATABASE.races || []

      const existingById = new Map(existingRaces.map(r => [r.race_id, r]))

      // Load enriched racecard cache for race-level metadata (going, distance, class)
      let enrichedById = new Map()
      try {
        const enrichedDb = loadDatabase(path.join(process.cwd(), 'data', 'racecard-enriched.json'))
        const enrichedRaces = enrichedDb.races || []
        enrichedById = new Map(enrichedRaces.map(r => [r.race_id, r]))
      } catch (e) {
        // enriched cache may not exist yet
      }

      const mergedRaces = resultRaces.map(resultRace => {
        const existing = existingById.get(resultRace.race_id)
        const enriched = enrichedById.get(resultRace.race_id)

        // Prefer enriched racecard data for race-level metadata (results scraper leaves these empty)
        const meta = enriched || existing || {}

        // Merge result runners with existing racecard runners to preserve OR/RPR/PR
        const mergedRunners = resultRace.runners.map(resultRunner => {
          const existingRunner = existing?.runners?.find(r =>
            (r.horse || '').toLowerCase().trim() === (resultRunner.horse || '').toLowerCase().trim()
          )
          if (existingRunner) {
            return { ...resultRunner, or: existingRunner.or, rpr: existingRunner.rpr, performanceRating: existingRunner.performanceRating }
          }
          return resultRunner
        })

        // Copy race-level metadata from racecard (going, distance, class) since results scraper doesn't capture these
        return {
          ...resultRace,
          going: resultRace.going || meta.going || '',
          distance_f: resultRace.distance_f || meta.distance_f || '',
          race_class: resultRace.race_class || meta.race_class || 0,
          surface: resultRace.surface || meta.surface || '',
          distanceFurlongs: parseFloat(meta.distance_f) || 0,
          raceClass: meta.race_class ? String(meta.race_class) : '',
          runners: mergedRunners
        }
      })
      
      // Replace existing races with merged versions, add any new ones
      const mergedIds = new Set(mergedRaces.map(r => r.race_id))
      const unchangedRaces = existingRaces.filter(r => !mergedIds.has(r.race_id))
      LEARNING_DATABASE.races = [...unchangedRaces, ...mergedRaces]
      console.log(`[Results] Stored/merged ${mergedRaces.length} races for ${dateStr}`)
      saveDatabase(LEARNING_DB_PATH, LEARNING_DATABASE)

      // Auto-populate replay notes from post-race run descriptions
      for (const race of mergedRaces) {
        for (const runner of race.runners || []) {
          const postRaceText = runner.ride_description || runner.commentary || ''
          if (postRaceText && runner.horse) {
            processPostRaceCommentary({
              horse: runner.horse,
              course: race.course,
              date: dateStr,
              commentary: postRaceText,
              position: runner.position,
              finishDistance: runner.finish_distance,
            })
          }
        }
      }
      flushReplayDb()
    } catch (saveError) {
      console.error(`[Results] Error saving ${dateStr}:`, saveError.message)
      return 0
    }

    // Match all scraped results (new + existing) against predictions for calibration
    const dateRaces = (LEARNING_DATABASE.races || []).filter(r => r.date === dateStr && r.off_time)
    matchResultsToCalibration(dateRaces)
    matchDailyPicksWithResults(dateRaces)

    // Populate condition database so conditionAdj factor can activate
    let conditionRecorded = 0
    for (const race of dateRaces) {
      if (race.runners && race.runners.length > 0 && race.going) {
        try {
          recordRun(race)
          conditionRecorded++
        } catch (e) {
          // silently skip
        }
      }
    }
    if (conditionRecorded > 0) {
      console.log(`[ConditionDB] Recorded ${conditionRecorded} races with full metadata`)
    }

    saveDatabase(HISTORICAL_DB_PATH, HISTORICAL_DATABASE)

    return resultRaces.length
  } catch (error) {
    console.error(`[Results] Error fetching ${dateStr}:`, error.message)
    return 0
  }
}

function spawnAtrWorker(dateStr, races) {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val) } }
    const workerPath = path.join(process.cwd(), 'src', 'lib', 'scrapers', 'atrWorker.js')
    const worker = spawn('node', [workerPath], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })
    let stdout = '', stderr = ''
    worker.stdout?.on('data', d => { stdout += d; process.stdout.write(`[ATR Worker] ${d}`) })
    worker.stderr?.on('data', d => { stderr += d; process.stderr.write(`[ATR Worker] ${d}`) })
    const timeout = setTimeout(() => {
      worker.kill('SIGTERM')
      settle(reject, new Error('ATR worker timeout (5min)'))
    }, 5 * 60 * 1000)
    worker.on('message', (msg) => {
      clearTimeout(timeout)
      if (msg.type === 'result') settle(resolve, msg.ratings)
      else if (msg.type === 'error') settle(reject, new Error(msg.error))
    })
    worker.on('error', (err) => { clearTimeout(timeout); settle(reject, err) })
    worker.on('exit', (code) => {
      clearTimeout(timeout)
      if (!settled) settle(reject, new Error(`ATR worker exited ${code}: ${stderr.slice(-200)}`))
    })
    worker.send({ type: 'scrape', dateStr, races })
  })
}

function spawnRPWorker(dateStr) {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val) } }
    const workerPath = path.join(process.cwd(), 'src', 'lib', 'scrapers', 'rpWorker.js')
    const worker = spawn('node', [workerPath], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })
    let stdout = '', stderr = ''
    worker.stdout?.on('data', d => { stdout += d; process.stdout.write(`[RP Worker] ${d}`) })
    worker.stderr?.on('data', d => { stderr += d; process.stderr.write(`[RP Worker] ${d}`) })
    const timeout = setTimeout(() => {
      worker.kill('SIGTERM')
      settle(resolve, {}) // Resolve empty on timeout — don't block pipeline
    }, 5 * 60 * 1000)
    worker.on('message', (msg) => {
      clearTimeout(timeout)
      if (msg.type === 'result') settle(resolve, msg.data || {})
      else if (msg.type === 'error') {
        console.error(`[RP Worker] Error: ${msg.error}`)
        settle(resolve, {}) // Resolve empty on error
      }
    })
    worker.on('error', (err) => { clearTimeout(timeout); settle(resolve, {}) })
    worker.on('exit', (code) => {
      clearTimeout(timeout)
      if (!settled) {
        console.error(`[RP Worker] exited ${code}: ${stderr.slice(-200)}`)
        settle(resolve, {}) // Resolve empty on exit
      }
    })
    worker.send({ type: 'scrape', dateStr })
  })
}

async function fetchTodayResults() {
  // Fetch last 3 days + today to catch any missed dates
  const dates = [0, 1, 2, 3].map(i => {
    const d = new Date(Date.now() - i * 86400000)
    return d.toISOString().split('T')[0]
  })

  console.time('[Results] fetchTodayResults')
  for (const d of dates) {
    await fetchResultsForDate(d)
  }
  console.timeEnd('[Results] fetchTodayResults')
}

function buildLightweightState() {
  const racecards = (LIVE_STATE.racecards || []).map(race => ({
    race_id: race.race_id,
    course: race.course,
    date: race.date,
    off_time: race.off_time,
    off_dt: race.off_dt,
    race_name: race.race_name,
    distance_f: race.distance_f,
    region: race.region,
    pattern: race.pattern,
    race_class: race.race_class,
    type: race.type,
    age_band: race.age_band,
    rating_band: race.rating_band,
    sex_restriction: race.sex_restriction,
    prize: race.prize,
    field_size: race.field_size,
    going: race.going,
    surface: race.surface,
    race_status: race.race_status,
    paceMap: race.paceMap,
    raceShape: race.raceShape || null,
    volatility: race.volatility,
    betFilter: race.betFilter,
    runners: (race.runners || []).map(r => ({
      horse: r.horse,
      horse_id: r.horse_id,
      atrUrl: r.atrUrl,
      age: r.age,
      sex: r.sex,
      sex_code: r.sex_code,
      colour: r.colour,
      region: r.region,
      dam: r.dam,
      sire: r.sire,
      damsire: r.damsire,
      trainer: r.trainer,
      owner: r.owner,
      number: r.number,
      draw: r.draw,
      position: r.position,
      headgear: r.headgear,
      lbs: r.lbs,
      ofr: r.ofr,
      or: r.or,
      rpr: r.rpr,
      bha_trend: r.bha_trend || 0,
      jockey: r.jockey,
      last_run: r.last_run,
      form: r.form,
      odds: r.odds,
      runningStyle: r.runningStyle,
      earlyPaceScore: r.earlyPaceScore || null,
      energy: r.energy || null,
      trackProfile: r.trackProfile || null,
      classModel: r.classModel || null,
      finalScore: r.finalScore,
      winProb: r.winProb,
      plattProb: r.plattProb ?? null,
      placeProb: r.placeProb,
      probBand: r.probBand,
      probRange: r.probRange,
      probTier: r.probTier,
      confidenceScore: r.confidenceScore,
      betQuality: r.betQuality,
      selectionQuality: r.selectionQuality,
      powerScore: r.powerScore,
      paceScore: r.paceScore,
      humanScore: r.humanScore,
      marketScore: r.marketScore,
      score: r.score,
      performanceRating: r.performanceRating || null,
      previous_results: r.previous_results || [],
      horseProfile: r.horseProfile || null,
      marketMovement: MARKET_DATABASE[r.horse_id] || MARKET_DATABASE[r.horse] || null,
      personalAffinity: r.personalAffinity || null,
      engineLabel: r.engineLabel || null,
      triggerReason: r.triggerReason || null,
    })),
  }))

  return {
    racecards,
    abandoned: LIVE_STATE.abandoned || [],
    updatedAt: LIVE_STATE.updatedAt,
    loading: LIVE_STATE.loading,
    processingComplete: LIVE_STATE.processingComplete,
    atrLoading: LIVE_STATE.atrLoading,
    lockedNap: LIVE_STATE.lockedNap || null,
  }
}

io.on('connection', (socket) => {
  console.log('Client connected')
  try {
    socket.emit('live-update', buildLightweightState())
  } catch (error) {
    console.error('[Socket] live-update error:', error.message)
    socket.emit('live-update', { racecards: [], loading: false })
  }
})

// Health check endpoint — returns server status for monitoring
app.get('/api/health', (_req, res) => {
  const uptime = process.uptime()
  const mem = process.memoryUsage()
  const raceCount = LIVE_STATE.racecards?.length || 0
  const runnerCount = (LIVE_STATE.racecards || []).reduce((s, r) => s + (r.runners?.length || 0), 0)

  res.json({
    status: raceCount > 0 ? 'ok' : 'degraded',
    uptime: Math.round(uptime),
    races: raceCount,
    runners: runnerCount,
    processingComplete: LIVE_STATE.processingComplete,
    atrLoading: LIVE_STATE.atrLoading,
    updatedAt: LIVE_STATE.updatedAt,
    memory: { rss: Math.round(mem.rss / 1024 / 1024), heap: Math.round(mem.heapUsed / 1024 / 1024) },
  })
})

app.get('/api/live-state', (_req, res) => {
  const timeout = setTimeout(() => {
    res.status(504).json({ error: 'Request timeout' })
  }, 8000)

  try {
    const state = buildLightweightState()
    clearTimeout(timeout)
    res.json(state)
  } catch (error) {
    clearTimeout(timeout)
    console.error('[API] live-state error:', error.message)
    res.status(500).json({ error: 'Failed to build state', details: error.message })
  }
})

app.get('/api/alerts', (_req, res) => {
  const alerts = Object.values(ALERT_DATABASE)
    .flat()
    .slice(0, 100)

  res.json(alerts)
})

app.get('/api/market-movers', (_req, res) => {
  res.json(Object.values(MARKET_DATABASE))
})

app.get('/api/predictions', (_req, res) => {
  res.json(PREDICTIONS_DATABASE)
})

function normalizeCourse(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\b(july|rowley|mile|course|racecourse)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePosition(val) {
  const n = Number(val)
  if (Number.isNaN(n)) return 0
  if (n < 1) return 0
  return n
}

function placedPositions(fieldSize) {
  if (fieldSize >= 16) return 4
  if (fieldSize >= 8) return 3
  if (fieldSize >= 5) return 2
  return 1
}

function matchDailyPicksWithResults(races) {
  let matchCount = 0

  // Only match picks with actual results — no pre-race NR detection
  races.forEach((race) => {
    const rawDate = String(race.date || (race.off_dt || '').slice(0, 10) || '')
    const date = rawDate.replace(/[/]/g, '-')
    if (!date || !DAILY_PICKS_DATABASE[date]) return

    const dailyPicks = DAILY_PICKS_DATABASE[date].picks || []
    const runners = race.runners || []
    const fieldSize = runners.length

    runners.forEach((runner) => {
      const match = dailyPicks.find(
        (p) => {
          if (p.race_id && race.race_id) {
            return p.race_id === race.race_id &&
              normalizeHorseName(p.horse) === normalizeHorseName(runner.horse)
          }
          return normalizeHorseName(p.horse) === normalizeHorseName(runner.horse) &&
            normalizeCourse(p.course) === normalizeCourse(race.course)
        }
      )
      if (match && match.result === null) {
        const pos = normalizePosition(runner.position || runner.pos)
        if (pos === 1) match.result = 'won'
        else if (pos > 1 && pos <= placedPositions(fieldSize)) match.result = 'placed'
        else if (pos > 0) match.result = 'lost'
        match.position = pos
        match.fieldSize = fieldSize
        matchCount++
      }
    })
  })

  if (matchCount > 0) {
    console.log(`[DAILY PICKS] Matched ${matchCount} runners with results`)
  }

  Object.keys(DAILY_PICKS_DATABASE).forEach((date) => {
    const entry = DAILY_PICKS_DATABASE[date]
    const picks = entry.picks || []
    const won = picks.filter((p) => p.result === 'won').length
    const placed = picks.filter((p) => p.result === 'placed').length
    const lost = picks.filter((p) => p.result === 'lost').length
    const nr = picks.filter((p) => p.result === 'nr').length
    entry.stats = { won, placed, lost, nr, pending: picks.length - won - placed - lost - nr }
  })

  saveDatabase(DAILY_PICKS_PATH, DAILY_PICKS_DATABASE)
  pgSaveDebounced('daily-picks', DAILY_PICKS_DATABASE)
}

app.post('/api/daily-picks', (req, res) => {
  const { date, picks, force } = req.body
  if (!date || !Array.isArray(picks)) {
    return res.status(400).json({ error: 'Invalid format' })
  }

  const existing = DAILY_PICKS_DATABASE[date]
  if (existing && existing.picks && existing.picks.length > 0 && !force) {
    // Merge: keep picks that already have results, update pending ones, add new races
    const existingByRace = new Map(existing.picks.map(p => [p.race_id || `${p.course}|${p.offTime}`, p]))
    const incomingKeys = new Set(picks.map(p => p.race_id || `${p.course}|${p.offTime}`))
    let updated = 0
    let added = 0
    let kept = 0
    let pruned = 0

    // Prune stale picks: pending picks for races no longer in the racecard AND off time has passed
    const ukNowStr = new Date().toLocaleString('en-US', { timeZone: 'Europe/London' })
    const ukNow = new Date(ukNowStr)
    const [pYear, pMonth, pDay] = date.split('-')
    for (const [key, pick] of existingByRace) {
      if (pick.result || pick.frozen) continue
      if (incomingKeys.has(key)) continue
      const [h, m] = (pick.offTime || '').split(':')
      if (pYear && h) {
        const raceUK = new Date(pYear, pMonth - 1, pDay, h, m, 0).toLocaleString('en-US', { timeZone: 'Europe/London' })
        const offDT = new Date(raceUK)
        if (ukNow.getTime() > offDT.getTime() + 60 * 60 * 1000) {
          existingByRace.delete(key)
          pruned++
        }
      }
    }

    for (const p of picks) {
      const key = p.race_id || `${p.course}|${p.offTime}`
      const old = existingByRace.get(key)
      if (old && old.result) {
        // Pick already resulted — keep the result
        kept++
        continue
      }
      // Frozen pick — already locked within 30 min of off time
      if (old && old.frozen) {
        kept++
        continue
      }
      // 30-minute execution lock — reuse ukNow from prune block above
      const [year, month, day] = date.split('-')
      const [hour, minute] = (p.offTime || '').split(':')
      let isFrozen = false
      if (year && hour) {
        const raceUKStr = new Date(year, month - 1, day, hour, minute, 0).toLocaleString('en-US', { timeZone: 'Europe/London' })
        const offDateTime = new Date(raceUKStr)
        const minutesUntilOff = (offDateTime - ukNow) / 60000
        if (minutesUntilOff <= 30 && minutesUntilOff > -60) {
          isFrozen = true
        }
      }
      // Update pending pick or add new race
      if (old) updated++
      else added++
      existingByRace.set(key, {
        race_id: p.race_id || null,
        horse: p.horse,
        course: p.course,
        offTime: p.offTime,
        raceName: p.raceName,
        score: p.score,
        grade: p.grade,
        odds: p.odds,
        form: p.form,
        draw: p.draw,
        going: p.going || '',
        fieldSize: p.fieldSize || 0,
        winProb: p.winProb ?? null,
        finalScore: p.finalScore ?? null,
        plattProb: p.plattProb ?? null,
        fairOdds: p.fairOdds ?? null,
        probConfidence: p.probConfidence ?? null,
        valueEdge: p.valueEdge ?? 0,
        kellyStake: p.kellyStake ?? null,
        betType: p.betType || null,
        or: p.or ?? null,
        rpr: p.rpr ?? null,
        performanceRating: p.performanceRating ?? null,
        marketMovement: p.marketMovement || null,
        personalAffinity: p.personalAffinity || null,
        betQuality: p.betQuality || null,
        engineLabel: p.engineLabel || null,
        triggerReason: p.triggerReason || null,
        result: null,
        position: null,
        frozen: isFrozen,
        frozenAt: isFrozen ? new Date().toISOString() : null,
      })
    }
    existing.picks = Array.from(existingByRace.values())
    existing.stats = {
      won: existing.picks.filter(p => p.result === 'won').length,
      placed: existing.picks.filter(p => p.result === 'placed').length,
      lost: existing.picks.filter(p => p.result === 'lost').length,
      nr: existing.picks.filter(p => p.result === 'nr').length,
      pending: existing.picks.filter(p => !p.result).length,
    }
    if (updated + added + pruned > 0) {
      console.log(`[DAILY PICKS] Merged ${date}: ${updated} updated, ${added} added, ${kept} kept, ${pruned} pruned`)
    }
    saveDatabase(DAILY_PICKS_PATH, DAILY_PICKS_DATABASE)
    pgSaveDebounced('daily-picks', DAILY_PICKS_DATABASE)

    // Immediately match against any existing results
    const dateResults = (LEARNING_DATABASE.races || []).filter(r => r.date === date && r.off_time)
    if (dateResults.length > 0) {
      matchDailyPicksWithResults(dateResults)
      matchCounterfactualWithResults(dateResults)
      saveDatabase(DAILY_PICKS_PATH, DAILY_PICKS_DATABASE)
      pgSaveDebounced('daily-picks', DAILY_PICKS_DATABASE)
    }
    return res.json({ saved: true, merged: true, date, count: existing.picks.length, updated, added, kept })
  }

  DAILY_PICKS_DATABASE[date] = {
    picks: picks.map((p) => {
      const ukNowStr = new Date().toLocaleString('en-US', { timeZone: 'Europe/London' })
      const ukNow = new Date(ukNowStr)
      const [year, month, day] = date.split('-')
      const [hour, minute] = (p.offTime || '').split(':')
      let isFrozen = false
      if (year && hour) {
        const raceUKStr = new Date(year, month - 1, day, hour, minute, 0).toLocaleString('en-US', { timeZone: 'Europe/London' })
        const offDateTime = new Date(raceUKStr)
        const minutesUntilOff = (offDateTime - ukNow) / 60000
        if (minutesUntilOff <= 30 && minutesUntilOff > -60) isFrozen = true
      }
      return {
        race_id: p.race_id || null,
        horse: p.horse,
        course: p.course,
        offTime: p.offTime,
        raceName: p.raceName,
        score: p.score,
        grade: p.grade,
        odds: p.odds,
        form: p.form,
        draw: p.draw,
        going: p.going || '',
        fieldSize: p.fieldSize || 0,
        winProb: p.winProb ?? null,
        finalScore: p.finalScore ?? null,
        plattProb: p.plattProb ?? null,
        fairOdds: p.fairOdds ?? null,
        probConfidence: p.probConfidence ?? null,
        valueEdge: p.valueEdge ?? 0,
        kellyStake: p.kellyStake ?? null,
        betType: p.betType || null,
        or: p.or ?? null,
        rpr: p.rpr ?? null,
        performanceRating: p.performanceRating ?? null,
        marketMovement: p.marketMovement || null,
        personalAffinity: p.personalAffinity || null,
        betQuality: p.betQuality || null,
        engineLabel: p.engineLabel || null,
        triggerReason: p.triggerReason || null,
        result: p.result || null,
        position: p.position || null,
        frozen: isFrozen,
        frozenAt: isFrozen ? new Date().toISOString() : null,
      }
    }),
    stats: { won: 0, placed: 0, lost: 0, nr: 0, pending: picks.length },
  }

  saveDatabase(DAILY_PICKS_PATH, DAILY_PICKS_DATABASE)
  pgSaveDebounced('daily-picks', DAILY_PICKS_DATABASE)

  // Immediately match against any existing results
  const dateResults = (LEARNING_DATABASE.races || []).filter(r => r.date === date && r.off_time)
  if (dateResults.length > 0) {
    matchDailyPicksWithResults(dateResults)
    matchCounterfactualWithResults(dateResults)
    saveDatabase(DAILY_PICKS_PATH, DAILY_PICKS_DATABASE)
    pgSaveDebounced('daily-picks', DAILY_PICKS_DATABASE)
  }

  res.json({ saved: true, date, count: picks.length })
})

app.get('/api/daily-picks', (_req, res) => {
  // Re-match against any new results before serving
  const allResultRaces = (LEARNING_DATABASE.races || []).filter(r => r.off_time)
  matchDailyPicksWithResults(allResultRaces)
  matchCounterfactualWithResults(allResultRaces)
  res.json(DAILY_PICKS_DATABASE)
})

app.post('/api/results/backfill', async (req, res) => {
  const { dates } = req.body
  if (!Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'dates array required' })
  }
  console.log(`[Backfill] Fetching results for ${dates.length} dates: ${dates.join(', ')}`)
  BACKFILL_IN_PROGRESS = true
  try {
    const results = {}
    for (const date of dates) {
      try {
        const count = await fetchResultsForDate(date)
        results[date] = count
      } catch (e) {
        results[date] = `error: ${e.message}`
      }
    }
    // Re-match daily picks with the newly scraped results
    const allResultRaces = (LEARNING_DATABASE.races || []).filter(r => r.off_time)
    matchDailyPicksWithResults(allResultRaces)
    matchCounterfactualWithResults(allResultRaces)
    res.json({ ok: true, results })
  } finally {
    BACKFILL_IN_PROGRESS = false
  }
})

app.delete('/api/daily-picks/:date', (req, res) => {
  const { date } = req.params
  if (!date) return res.status(400).json({ error: 'Date required' })
  delete DAILY_PICKS_DATABASE[date]
  saveDatabase(DAILY_PICKS_PATH, DAILY_PICKS_DATABASE)
  pgSaveDebounced('daily-picks', DAILY_PICKS_DATABASE)
  res.json({ deleted: true, date })
})

// Live picks tracking — honest performance measurement without survivorship bias
app.post('/api/live-picks/log', (req, res) => {
  const { date, picks } = req.body
  if (!date || !Array.isArray(picks)) {
    return res.status(400).json({ error: 'date and picks array required' })
  }
  if (!LIVE_PICKS_LOG[date]) {
    LIVE_PICKS_LOG[date] = { picks: [], stats: { won: 0, placed: 0, lost: 0, nr: 0, pending: 0 } }
  }
  const log = LIVE_PICKS_LOG[date]
  // Prune picks for races no longer in the current racecard (stale non-resulted picks)
  const activeKeys = new Set(picks.map(p => `${p.course}|${p.offTime}`))
  log.picks = log.picks.filter(p => {
    const key = `${p.course}|${p.offTime}`
    return activeKeys.has(key) || p.result
  })
  // Dedupe by race (course|offTime) — one pick per race, replace on refresh
  // If the horse changed, always replace (even if old pick has a result)
  const raceMap = new Map(log.picks.map(p => [`${p.course}|${p.offTime}`, p]))
  for (const p of picks) {
    const raceKey = `${p.course}|${p.offTime}`
    const existing = raceMap.get(raceKey)
    const horseChanged = existing && existing.horse !== p.horse
    // Replace if: different horse, or higher score with no result yet, or no existing pick
    if (!existing || horseChanged || (p.score > (existing.score || 0) && !existing.result)) {
      raceMap.set(raceKey, {
        horse: p.horse,
        course: p.course,
        offTime: p.offTime || '',
        odds: p.odds || 0,
        score: p.score || 0,
        winProb: p.winProb ?? null,
        personalAffinity: p.personalAffinity ?? null,
        apexScore: p.apexScore ?? null,
        betQuality: p.betQuality ?? null,
        engineLabel: p.engineLabel ?? null,
        triggerReason: p.triggerReason ?? null,
        betType: p.betType ?? null,
        raceId: p.raceId ?? null,
        timestamp: new Date().toISOString(),
      })
    }
  }
  log.picks = Array.from(raceMap.values())
  // Recalculate stats
  const won = log.picks.filter(p => p.result === 'won').length
  const placed = log.picks.filter(p => p.result === 'placed').length
  const lost = log.picks.filter(p => p.result === 'lost').length
  const nr = log.picks.filter(p => p.result === 'nr').length
  log.stats = { won, placed, lost, nr, pending: log.picks.length - won - placed - lost - nr }
  saveDatabase(LIVE_PICKS_LOG_PATH, LIVE_PICKS_LOG)
  res.json({ saved: true, total: log.picks.length, stats: log.stats })
})

app.get('/api/live-picks/stats', (_req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const log = LIVE_PICKS_LOG[today] || { picks: [], stats: { won: 0, placed: 0, lost: 0, nr: 0, pending: 0 } }

  // Re-match against latest results
  const allResultRaces = (LEARNING_DATABASE.races || []).filter(r => r.off_time)
  let matchCount = 0
  for (const race of allResultRaces) {
    const raceDate = String(race.date || (race.off_dt || '').slice(0, 10) || '').replace(/[/]/g, '-')
    if (raceDate !== today) continue
    const runners = race.runners || []
    const fieldSize = runners.length
    for (const runner of runners) {
      const match = log.picks.find(p =>
        normalizeHorseName(p.horse) === normalizeHorseName(runner.horse) &&
        normalizeCourse(p.course) === normalizeCourse(race.course)
      )
      if (match && !match.result) {
        const pos = normalizePosition(runner.position || runner.pos)
        if (pos === 1) match.result = 'won'
        else if (pos > 1 && pos <= placedPositions(fieldSize)) match.result = 'placed'
        else if (pos > 0) match.result = 'lost'
        match.position = pos
        match.fieldSize = fieldSize
        matchCount++
      }
    }
  }
  // Recalculate stats
  const won = log.picks.filter(p => p.result === 'won').length
  const placed = log.picks.filter(p => p.result === 'placed').length
  const lost = log.picks.filter(p => p.result === 'lost').length
  const nr = log.picks.filter(p => p.result === 'nr').length
  log.stats = { won, placed, lost, nr, pending: log.picks.length - won - placed - lost - nr }
  if (matchCount > 0) saveDatabase(LIVE_PICKS_LOG_PATH, LIVE_PICKS_LOG)

  // Calculate ROI
  let roi = 0
  for (const p of log.picks) {
    if (p.result === 'won') roi += (p.odds - 1)
    else if (p.result === 'lost') roi -= 1
  }
  const resolved = won + placed + lost
  const roiPct = resolved > 0 ? (roi / resolved * 100).toFixed(1) : '0'

  // Main bets only (WIN/PLACE bet types)
  const mainPicks = log.picks.filter(p => p.betType === 'WIN' || p.betType === 'PLACE')
  const mWon = mainPicks.filter(p => p.result === 'won').length
  const mPlaced = mainPicks.filter(p => p.result === 'placed').length
  const mLost = mainPicks.filter(p => p.result === 'lost').length
  const mNr = mainPicks.filter(p => p.result === 'nr').length
  let mRoi = 0
  for (const p of mainPicks) {
    if (p.result === 'won') mRoi += (p.odds - 1)
    else if (p.result === 'lost') mRoi -= 1
  }
  const mResolved = mWon + mPlaced + mLost
  const mRoiPct = mResolved > 0 ? (mRoi / mResolved * 100).toFixed(1) : '0'

  res.json({
    date: today,
    stats: log.stats,
    roi: parseFloat(roiPct),
    mainBets: { won: mWon, placed: mPlaced, lost: mLost, nr: mNr, total: mainPicks.length, roi: parseFloat(mRoiPct) },
    picks: log.picks,
  })
})

// Home page widgets: PA coverage, PA signal performance, rolling calibration
app.get('/api/home-widgets', (_req, res) => {
  const records = CALIBRATION_DATABASE.records || []
  const now = Date.now()
  const DAY = 86400000

  // 1. PA Coverage — PA was never stored in calibration records
  // Show honest "no data" until we start persisting PA
  const withPA = records.filter(r => r.personalAffinity != null && typeof r.personalAffinity === 'number')
  const paPositive = withPA.filter(r => r.personalAffinity > 0)
  const paNegative = withPA.filter(r => r.personalAffinity <= 0)
  const paCoverage = records.length > 0 ? (withPA.length / records.length * 100).toFixed(1) : '0'

  // 2. PA Signal — only compute if we have PA data
  const paBands = [
    { label: 'PA Strong (>5)', filter: r => r.personalAffinity > 5 },
    { label: 'PA Positive (0-5)', filter: r => r.personalAffinity > 0 && r.personalAffinity <= 5 },
    { label: 'PA Weak (-2-0)', filter: r => r.personalAffinity > -2 && r.personalAffinity <= 0 },
    { label: 'PA Negative (<-2)', filter: r => r.personalAffinity <= -2 },
  ]
  const paSignal = paBands.map(band => {
    const subset = withPA.filter(band.filter)
    const wins = subset.filter(r => r.actualWon).length
    const total = subset.length
    const wr = total > 0 ? (wins / total * 100).toFixed(1) : '—'
    let roi = 0
    for (const r of subset) {
      if (r.actualWon) roi += ((Number(r.actualOdds) || 2) - 1)
      else roi -= 1
    }
    const roiPct = total > 0 ? (roi / total * 100).toFixed(1) : '—'
    return { label: band.label, total, wins, wr, roiPct }
  })

  // 3. Rolling Calibration — uses CALIBRATION_DATABASE which has predictedWinProb + actualWon
  const wpBands = [
    { label: '0-6%', min: 0, max: 6 },
    { label: '6-12%', min: 6, max: 12 },
    { label: '12-20%', min: 12, max: 20 },
    { label: '20-40%', min: 20, max: 40 },
    { label: '40%+', min: 40, max: 100 },
  ]

  function computeCalibration(days) {
    const cutoff = now - days * DAY
    const subset = records.filter(r => {
      const d = r.date ? new Date(r.date).getTime() : 0
      return d >= cutoff
    })
    return wpBands.map(band => {
      const bucket = subset.filter(r => {
        const wp = Number(r.predictedWinProb) || 0
        return wp >= band.min && wp < band.max
      })
      const wins = bucket.filter(r => r.actualWon).length
      const avgPred = bucket.length > 0
        ? (bucket.reduce((s, r) => s + (Number(r.predictedWinProb) || 0), 0) / bucket.length).toFixed(1)
        : '—'
      const actualWR = bucket.length > 0 ? (wins / bucket.length * 100).toFixed(1) : '—'
      const error = avgPred !== '—' && actualWR !== '—'
        ? (Number(avgPred) - Number(actualWR)).toFixed(1)
        : '—'
      return { label: band.label, n: bucket.length, avgPred, actualWR, error }
    })
  }

  res.json({
    paCoverage: {
      total: records.length,
      withPA: withPA.length,
      paPositive: paPositive.length,
      paNegative: paNegative.length,
      coveragePct: paCoverage,
    },
    paSignal,
    cal30: computeCalibration(30),
    cal90: computeCalibration(90),
  })
})

app.get('/api/replay-notes', (_req, res) => {
  res.json(REPLAY_NOTES_DATABASE)
})

app.post('/api/replay-notes', (req, res) => {
  const { horse, course, tags, notes, adjustment, confidence } = req.body
  if (!horse) {
    return res.status(400).json({ error: 'Horse name required' })
  }

  const key = `${horse}|${course || ''}`
  const existing = REPLAY_NOTES_DATABASE[key]

  const allTags = tags && tags.length > 0 ? tags : extractTagsFromNotes(notes || '')
  const posTags = allTags.filter((t) => {
    const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[t])
    return def && def.score > 0
  })
  const negTags = allTags.filter((t) => {
    const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[t])
    return def && def.score < 0
  })

  const categoryScores = { finishing_energy: 0, pace_suitability: 0, trip_efficiency: 0, mental_professionalism: 0 }
  allTags.forEach((t) => {
    const cat = TAG_TO_CATEGORY[t]
    if (cat && categoryScores[cat] !== undefined) {
      const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[t])
      categoryScores[cat] += def ? def.score : 0
    }
  })

  const summary = notes || generateAutoSummary(allTags)
  const courseProfile = getCourseProfile(course)

  REPLAY_NOTES_DATABASE[key] = {
    horse,
    course: course || '',
    course_profile: courseProfile,
    tags: allTags,
    positive_tags: posTags.map((t) => {
      const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[t])
      return { tag: t, score: def ? def.score : 0 }
    }),
    negative_tags: negTags.map((t) => {
      const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[t])
      return { tag: t, score: def ? def.score : 0 }
    }),
    category_scores: categoryScores,
    notes: notes || '',
    summary,
    recommended_conditions: getRecommendedConditions(allTags),
    avoid_tags: getAvoidTags(allTags),
    watchlist_priority: computeWatchlistPriority(allTags),
    confidence: confidence != null ? confidence : null,
    adjustment: Math.max(-10, Math.min(10, Number(adjustment) || 0)),
    reviewedAt: new Date().toISOString(),
    reviewCount: (existing?.reviewCount || 0) + 1,
  }

  saveDatabase(REPLAY_NOTES_PATH, REPLAY_NOTES_DATABASE)
  res.json({ saved: true, key })
})

app.get('/api/learning-stats', (_req, res) => {
  const records = LEARNING_DATABASE.records || []
  const totalBets = records.length
  const winners = records.filter(r => r.won === true).length
  const losers = records.filter(r => r.won === false).length
  const winRate = totalBets > 0 ? ((winners / totalBets) * 100) : 0

  let totalROI = 0
  let avgConf = 0
  if (totalBets > 0) {
    let profit = 0
    let confSum = 0
    for (const r of records) {
      if (r.won && r.spOdds) {
        profit += r.spOdds - 1
      } else {
        profit -= 1
      }
      confSum += Number(r.aiConfidence || 0)
    }
    totalROI = (profit / totalBets) * 100
    avgConf = Math.round(confSum / totalBets)
  }

  const signalCounts = {}
  const signalWins = {}
  for (const r of records) {
    const sig = r.signal || 'UNKNOWN'
    signalCounts[sig] = (signalCounts[sig] || 0) + 1
    if (r.won) signalWins[sig] = (signalWins[sig] || 0) + 1
  }
  const profitableSignals = Object.entries(signalCounts).map(([signal, runs]) => ({
    signal,
    runs,
    wins: signalWins[signal] || 0,
    strikeRate: runs > 0 ? ((signalWins[signal] || 0) / runs * 100) : 0,
  })).sort((a, b) => b.runs - a.runs)

  const bands = [
    { band: 'high', min: 80, max: 100, wins: 0, runs: 0, strikeRate: 0 },
    { band: 'medium', min: 50, max: 79, wins: 0, runs: 0, strikeRate: 0 },
    { band: 'low', min: 0, max: 49, wins: 0, runs: 0, strikeRate: 0 },
  ]
  for (const r of records) {
    const conf = Number(r.aiConfidence || 0)
    const b = bands.find(b => conf >= b.min && conf <= b.max) || bands[2]
    b.runs++
    if (r.won) b.wins++
  }
  for (const b of bands) {
    b.strikeRate = b.runs > 0 ? ((b.wins / b.runs) * 100) : 0
  }

  res.json({
    totalBets,
    winners,
    losers,
    strikeRate: winRate,
    roi: totalROI,
    averageConfidence: avgConf,
    profitableSignals,
    confidenceBands: bands,
    weights: LEARNING_DATABASE.weights || {},
    lastLearningRun: LEARNING_DATABASE.lastLearningRun || null,
  })
})

app.get('/api/results', (_req, res) => {
  const results = LEARNING_DATABASE.races || []
  const liveRaces = LIVE_STATE.racecards || []
  if (liveRaces.length > 0) {
    const oddsLookup = new Map()
    for (const race of liveRaces) {
      for (const runner of (race.runners || [])) {
        const name = (runner.horse || '').toLowerCase().trim()
        const odds = runner.sp || runner.odds || 0
        if (name && odds > 0) oddsLookup.set(`${name}|${race.course}`, odds)
      }
    }
    for (const race of results) {
      for (const runner of (race.runners || [])) {
        if ((!runner.odds || runner.odds === 0) && (!runner.sp || runner.sp === 0)) {
          const name = (runner.horse || '').toLowerCase().trim()
          const odds = oddsLookup.get(`${name}|${race.course}`)
          if (odds) runner.sp = odds
        }
      }
    }
  }
  res.json(results)
})

app.post('/api/backfill', async (_req, res) => {
  res.json({ ok: true, message: 'ATR backfill will run automatically once IP unblocks. Currently blocked — check logs for status.', dates: [...new Set((LEARNING_DATABASE.races || []).map(r => r.date || (r.off_dt ? r.off_dt.slice(0, 10) : null)).filter(Boolean))].sort().reverse() })
})

app.post('/api/upload-results', (req, res) => {
  try {
    const races =
      req.body.results ||
      req.body.racecards ||
      req.body.data ||
      req.body

    if (!Array.isArray(races)) {
      return res.status(400).json({
        error: 'Invalid results format',
      })
    }

    races.forEach((race) => {
      const runners = race.runners || []

      runners.forEach((runner) => {
        const prediction = findPredictionForRunner(race, runner)

        const record = {
          horse: runner.horse,
          position: normalizePosition(runner.position),
          won: normalizePosition(runner.position) === 1,
          spOdds: resolveOdds(runner),
          aiConfidence: Number(runner.aiConfidence || prediction?.confidence || 75),
          signal: runner.signal || 'UPLOAD',
          marketMovement: runner.marketMovement || 'UNKNOWN',
          timestamp: new Date().toISOString(),
          resultProcessed: true,
          breakdown: prediction?.breakdown || null,
          weights: prediction?.weights || null,
        }

        LEARNING_DATABASE.records.push(record)
      })
    })

    const existingIds = new Set((LEARNING_DATABASE.races || []).map(r => r.race_id || `${r.course}-${r.off_time || r.off}`))
    const newRaces = races.filter(r => !existingIds.has(r.race_id || `${r.course}-${r.off_time || r.off}`))
    LEARNING_DATABASE.races = [...(LEARNING_DATABASE.races || []), ...newRaces]

    LEARNING_DATABASE.analytics = analyzeHistoricalPerformance(
      LEARNING_DATABASE.records
    )

    const existingWeights = LEARNING_DATABASE.weights || {}
    const rawLearningResult = learnFromResults(
      LEARNING_DATABASE.records,
      existingWeights
    )

    if (rawLearningResult.adjusted) {
      const protectedResult = applyProtectedAdjustment(
        existingWeights.multiplier || {},
        rawLearningResult.weights.multiplier || {},
        LEARNING_DATABASE.records
      )

      if (protectedResult.adjusted) {
        LEARNING_DATABASE.weights = { multiplier: protectedResult.weights }
        LEARNING_DATABASE.lastLearningRun = {
          date: new Date().toISOString(),
          totalRecords: rawLearningResult.totalRecords,
          winners: rawLearningResult.winners,
          analysis: rawLearningResult.analysis,
          protected: true,
          learningRate: protectedResult.learningRate,
          outliersSuppressed: protectedResult.outliersSuppressed,
        }
      } else {
        LEARNING_DATABASE.lastLearningRun = {
          date: new Date().toISOString(),
          totalRecords: rawLearningResult.totalRecords,
          winners: rawLearningResult.winners,
          analysis: rawLearningResult.analysis,
          protected: false,
          blockedReason: protectedResult.reason,
        }
      }
    }

    saveDatabase(LEARNING_DB_PATH, LEARNING_DATABASE)

    matchDailyPicksWithResults(races)
    matchCounterfactualWithResults(races)

    const pickDates = Object.keys(DAILY_PICKS_DATABASE)
    pickDates.forEach((date) => saveDatabase(DAILY_PICKS_PATH, DAILY_PICKS_DATABASE))
    pgSaveDebounced('daily-picks', DAILY_PICKS_DATABASE)

    races.forEach((race) => {
      const runners = race.runners || []
      const raceGoing = race.going || ''
      const raceSurface = race.surface || ''
      const raceDist = race.distance_f || ''

      runners.forEach((runner) => {
        const horseId = runner.horse_id || runner.horse
        
        // Save to Horse Memory SQLite Database
        if (HORSE_MEMORY_DB && runner.horse) {
          saveHorseRun(HORSE_MEMORY_DB, {
            horse_name: runner.horse,
            horse_id: horseId,
            race_date: race.date || new Date().toISOString().split('T')[0],
            course: race.course || '',
            distance: raceDist,
            going: raceGoing,
            or_rating: runner.or || runner.ofr || 0,
            rpr_rating: runner.rpr || 0,
            finish_position: normalizePosition(runner.position) || 0,
            starting_price: resolveOdds(runner),
            race_class: race.race_class || race.class || '',
            field_size: race.field_size || race.fieldSize || runners.length,
            trainer: runner.trainer || '',
            jockey: runner.jockey || '',
          }, TRACK_PROFILES).then(saved => {
            if (!saved) {
              console.error('[Horse Memory] Failed to save run for', runner.horse)
            }
          })
          if (runner.jockey) {
            saveJockeyRun(HORSE_MEMORY_DB, {
              jockey: runner.jockey,
              course: race.course || '',
              race_date: race.date || new Date().toISOString().split('T')[0],
              finish_position: normalizePosition(runner.position) || 0,
              field_size: race.field_size || race.fieldSize || runners.length,
              sp_odds: resolveOdds(runner),
              race_class: race.race_class || race.class || '',
            })
          }
          // Save previous_results to horse_runs — massively backfills RPR/OR/distance/going data
          if (runner.previous_results?.length > 0) {
            savePreviousResults(HORSE_MEMORY_DB, runner.horse, horseId, runner.previous_results, TRACK_PROFILES)
          }
        }
        const position = normalizePosition(runner.position)
        if (!horseId) return

        if (!GOING_DATABASE[horseId]) GOING_DATABASE[horseId] = { byGoing: {}, bySurface: {} }
        const gProf = GOING_DATABASE[horseId]
        const goingKey = raceGoing || 'Unknown'
        if (!gProf.byGoing[goingKey]) gProf.byGoing[goingKey] = { runs: 0, wins: 0, places: 0 }
        gProf.byGoing[goingKey].runs++
        if (position === 1) gProf.byGoing[goingKey].wins++
        if (position >= 2 && position <= 4) gProf.byGoing[goingKey].places++

        const surfaceKey = raceSurface || 'Unknown'
        if (!gProf.bySurface[surfaceKey]) gProf.bySurface[surfaceKey] = { runs: 0, wins: 0, places: 0 }
        gProf.bySurface[surfaceKey].runs++
        if (position === 1) gProf.bySurface[surfaceKey].wins++
        if (position >= 2 && position <= 4) gProf.bySurface[surfaceKey].places++

        if (!DISTANCE_DATABASE[horseId]) DISTANCE_DATABASE[horseId] = { lastDistance: 0, performances: [] }
        const dProf = DISTANCE_DATABASE[horseId]
        const distVal = parseFloat(String(raceDist).replace(/[^0-9.]/g, '')) || 0
        if (distVal > 0) {
          dProf.lastDistance = distVal
          if (position >= 1) {
            dProf.performances.push({ distance: distVal, won: position === 1, placed: position >= 2 && position <= 4, date: new Date().toISOString() })
          }
        }
      })
    })

    saveDatabase(GOING_DB_PATH, GOING_DATABASE)
    saveDatabase(DISTANCE_DB_PATH, DISTANCE_DATABASE)

    const bucketResult = learnFromBuckets(BUCKET_DATABASE, races.map((race) => {
      const runners = race.runners || []
      const predictions = runners.map((runner) => {
        const pred = findPredictionForRunner(race, runner)
        return {
          powerScore: pred?.breakdown?.powerScore || 50,
          paceScore: pred?.breakdown?.paceScore || 0,
          humanScore: pred?.breakdown?.humanAdj || 0,
          marketScore: pred?.breakdown?.marketAdj || 0,
          trainerRtf: Number(runner.trainer_rtf || 0),
        }
      })
      const results = runners.map((runner) => ({
        position: normalizePosition(runner.position),
      }))
      return { race, predictions, results }
    }))

    if (bucketResult.updated) {
      saveDatabase(BUCKET_DB_PATH, BUCKET_DATABASE)
    }

    races.forEach((race) => {
      const runners = race.runners || []

      runners.forEach((runner) => {
        const id = `${race.course}-${race.off_time}-${race.date}-${runner.horse}`
        const position = normalizePosition(runner.position)
        const rec = HISTORICAL_DATABASE.records.find((r) => r.id === id)
        if (rec && !rec.resulted) {
          rec.actual_position = position
          rec.actual_won = position === 1
          rec.actual_placed = position >= 1 && position <= placedPositions(rec.field_size || 0)
          rec.actual_odds = resolveOdds(runner)
          rec.spOdds = runner.sp || runner.spOdds || null
          rec.closingOdds = resolveOdds(runner)
          if (rec.takenOdds > 0 && rec.closingOdds > 0) {
            rec.clv = ((rec.takenOdds - rec.closingOdds) / rec.closingOdds)
          }
          rec.resulted = true
        }

        const prediction = findPredictionForRunner(race, runner)

        if (prediction) {
          const calRecord = createCalibrationRecord({
            ...prediction,
            going: normalizeGoingString(race.going || prediction.going || ''),
            fieldSize: race.field_size || race.fieldSize || 0,
            trainer: runner.trainer || '',
            raceType: race.race_type || race.raceType || '',
          }, {
            position,
            spOdds: resolveOdds(runner),
          })

          CALIBRATION_DATABASE.records.push(calRecord)
        }
      })
    })

    saveDatabase(HISTORICAL_DB_PATH, HISTORICAL_DATABASE)

    CALIBRATION_DATABASE.analytics = {
      byProbability: computeCalibrationBuckets(CALIBRATION_DATABASE.records),
      byPlaceProbability: computePlaceCalibration(CALIBRATION_DATABASE.records),
      byGrade: computeCalibrationByGrade(CALIBRATION_DATABASE.records),
      byBetQuality: computeCalibrationByBetQuality(CALIBRATION_DATABASE.records),
      segments: computeAllSegmentations(CALIBRATION_DATABASE.records),
      lastUpdated: new Date().toISOString(),
    }

    saveDatabase(CALIBRATION_DB_PATH, CALIBRATION_DATABASE)

    console.log(`[UPLOAD] Processed ${races.length} races - daily pick dates: [${pickDates.join(', ')}]`)

    res.json({
      success: true,
      processedRaces: races.length,
      totalRecords: LEARNING_DATABASE.records.length,
      analytics: LEARNING_DATABASE.analytics,
      learning: rawLearningResult,
    })
  } catch (error) {
    console.error(error)

    res.status(500).json({
      error: 'Failed to process results',
    })
  }
})

app.get('/api/calibration', (_req, res) => {
  res.json({
    records: CALIBRATION_DATABASE.records,
    analytics: CALIBRATION_DATABASE.analytics,
  })
})

app.delete('/api/calibration', (_req, res) => {
  CALIBRATION_DATABASE.records = []
  CALIBRATION_DATABASE.analytics = {}
  saveDatabase(CALIBRATION_DB_PATH, CALIBRATION_DATABASE)
  res.json({ success: true, message: 'Calibration data cleared' })
})

app.get('/api/historical', (req, res) => {
  const { limit = 200, offset = 0, course, date, grade, resulted } = req.query
  let filtered = HISTORICAL_DATABASE.records
  if (course) filtered = filtered.filter((r) => String(r.course || '').toLowerCase().includes(String(course).toLowerCase()))
  if (date) filtered = filtered.filter((r) => r.date === date)
  if (grade) filtered = filtered.filter((r) => r.grade === grade)
  if (resulted === 'true') filtered = filtered.filter((r) => r.resulted)
  if (resulted === 'false') filtered = filtered.filter((r) => !r.resulted)
  const total = filtered.length
  const sorted = [...filtered].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  const records = sorted.slice(Number(offset), Number(offset) + Number(limit))
  res.json({ records, total, offset: Number(offset), limit: Number(limit) })
})

// Decision audit endpoint - traces full decision pipeline for a sample race
app.get('/api/decision-audit', (_req, res) => {
  try {
    const records = HISTORICAL_DATABASE.records
    const recent = records.filter(r => r.resulted).slice(-50)
    
    if (recent.length === 0) {
      return res.json({ error: 'No resulted races found' })
    }

    // Pick one race with mixed verdicts if possible
    const raceKey = `${recent[0].course}-${recent[0].off_time}`
    const raceRecords = recent.filter(r => `${r.course}-${r.off_time}` === raceKey)
    
    const audit = raceRecords.map(r => ({
      horse: r.horse,
      probability: r.winProb,
      fair_odds: r.fairOdds,
      market_odds: r.odds,
      edge: r.valueEdge,
      confidence: r.confidenceScore,
      grade: r.grade,
      betFilter: r.betFilter,
      noBet: r.noBet,
      engine: r.engine,
      actual_position: r.actual_position,
      actual_won: r.actual_won,
      actual_odds: r.actual_odds,
      // Decision trace fields
      powerScore: r.powerScore,
      paceScore: r.paceScore,
      humanScore: r.humanScore,
      marketScore: r.marketScore,
      volatility: r.volatility,
      volatilityLabel: r.volatilityLabel,
      selectionQuality: r.selectionQuality,
      betQuality: r.betQuality,
    }))

    res.json({
      race: raceKey,
      runners: audit,
      summary: {
        total: audit.length,
        bettable: audit.filter(r => !r.noBet).length,
        rejected: audit.filter(r => r.noBet).length,
        winners: audit.filter(r => r.actual_won).length,
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Suppression breakdown endpoint - counts WHY selections were rejected
app.get('/api/suppression-breakdown', (_req, res) => {
  try {
    const records = HISTORICAL_DATABASE.records
    const resulted = records.filter(r => r.resulted)
    
    const breakdown = {
      total: resulted.length,
      bettable: 0,
      rejected: 0,
      reasons: {
        low_edge: 0,
        confidence_fail: 0,
        missing_data: 0,
        pace_uncertainty: 0,
        odds_mismatch: 0,
        nan_fallback: 0,
        safety_override: 0,
        small_field: 0,
        high_risk: 0,
        caution: 0,
        auto_skip: 0,
        unknown: 0,
      }
    }

    resulted.forEach(r => {
      if (!r.noBet) {
        breakdown.bettable++
        return
      }
      
      breakdown.rejected++
      
      // Classify rejection reason
      const edge = r.valueEdge || 0
      const conf = r.confidenceScore || 0
      const hasOdds = r.odds && r.odds > 0
      const hasProb = r.winProb && r.winProb > 0
      const hasScores = r.powerScore !== undefined && r.paceScore !== undefined
      
      if (isNaN(edge) || isNaN(conf)) {
        breakdown.reasons.nan_fallback++
      } else if (!hasOdds || !hasProb) {
        breakdown.reasons.missing_data++
      } else if (r.betFilter === 'AUTO SKIP') {
        breakdown.reasons.auto_skip++
      } else if (r.betFilter === 'HIGH RISK') {
        breakdown.reasons.high_risk++
      } else if (r.betFilter === 'CAUTION') {
        breakdown.reasons.caution++
      } else if (edge <= 0) {
        breakdown.reasons.low_edge++
      } else if (conf < 50) {
        breakdown.reasons.confidence_fail++
      } else if (!hasScores) {
        breakdown.reasons.missing_data++
      } else {
        breakdown.reasons.unknown++
      }
    })

    res.json(breakdown)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/historical/stats', (_req, res) => {
  const records = HISTORICAL_DATABASE.records
  const resulted = records.filter((r) => r.resulted)
  const resolved = resulted.filter((r) => normalizePosition(r.actual_position) > 0)
  
  // Backfill noBet field and rejectedBy for old records
  resolved.forEach((r) => {
    if (r.noBet === undefined || r.rejectedBy === undefined) {
      // Compute edge from fairOdds vs odds (matching estimateWinProb formula)
      const fairOdds = Number(r.fairOdds || 0)
      const odds = Number(r.odds || 0)
      const correctEdge = fairOdds > 0 && odds > 0 ? (fairOdds - odds) / odds : 0
      r.valueEdge = Math.round(correctEdge * 10000) / 10000

      const rejectedBy = []
      if (correctEdge <= 0) rejectedBy.push('NEGATIVE_EDGE')
      if (!r.winProb || r.winProb <= 0) rejectedBy.push('ZERO_PROBABILITY')
      if (!odds || odds <= 1) rejectedBy.push('INVALID_ODDS')
      if (r.confidenceScore !== undefined && r.confidenceScore < 10) rejectedBy.push('LOW_CONFIDENCE')
      const isAutoSkip = r.betFilter === 'AUTO SKIP'

      r.noBet = rejectedBy.length >= 2 || (isAutoSkip && rejectedBy.length > 0)
      r.rejectedBy = rejectedBy
    }
  })
  
  // Filter to only include bettable selections for analytics
  const bettable = resolved.filter((r) => !r.noBet)
  const won = bettable.filter((r) => r.actual_won)

  // Backfill engine field for old records
  bettable.forEach((r) => {
    if (!r.engine) {
      r.engine = classifyEngine(r.grade, r.odds)
    }
  })

  function isPlaced(r) {
    const pos = normalizePosition(r.actual_position)
    if (pos < 1) return false
    const fs = Number(r.field_size)
    if (!fs || fs < 3) return pos <= 4
    return pos <= placedPositions(fs)
  }
  const placed = bettable.filter(isPlaced)

  function median(arr) {
    if (arr.length === 0) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  function bucketRoi(bucket) {
    const n = bucket.length
    if (n === 0) return 0
    const returned = bucket.reduce((sum, r) => sum + (r.actual_won ? (r.actual_odds || r.odds || 0) : 0), 0)
    return ((returned - n) / n) * 100
  }

  const overallRoi = bucketRoi(bettable)

  console.log('[Historical Stats]', JSON.stringify({
    total: records.length,
    resolved: resolved.length,
    bettable: bettable.length,
    invalidPositions: resulted.length - resolved.length,
    winners: won.length,
    placed: placed.length,
    winRate: bettable.length > 0 ? ((won.length / bettable.length) * 100).toFixed(1) + '%' : 'N/A',
    placeRate: bettable.length > 0 ? ((placed.length / bettable.length) * 100).toFixed(1) + '%' : 'N/A',
    roi: overallRoi.toFixed(1) + '%',
  }))

  const bands = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  const byWinProb = bands.map((band) => {
    const inBand = bettable.filter((r) => {
      const wp = (r.winProb > 1 ? r.winProb : (r.winProb || 0) * 100)
      const prev = bands[bands.indexOf(band) - 1] || 0
      return wp > prev && wp <= band
    })
    const wins = inBand.filter((r) => r.actual_won)
    return {
      band: `${bands[bands.indexOf(band) - 1] || 0}-${band}%`,
      total: inBand.length,
      wins: wins.length,
      winRate: inBand.length > 0 ? wins.length / inBand.length : 0,
      roi: bucketRoi(inBand),
    }
  })

  const byGrade = [...new Set(bettable.map((r) => r.grade).filter(Boolean))].sort().map((grade) => {
    const inGrade = bettable.filter((r) => r.grade === grade)
    const wins = inGrade.filter((r) => r.actual_won)
    return {
      grade,
      total: inGrade.length,
      wins: wins.length,
      winRate: inGrade.length > 0 ? wins.length / inGrade.length : 0,
      roi: bucketRoi(inGrade),
    }
  })

  const byBetQuality = [...new Set(bettable.map((r) => r.betQuality).filter(Boolean))].sort().map((bq) => {
    const inBq = bettable.filter((r) => r.betQuality === bq)
    const wins = inBq.filter((r) => r.actual_won)
    return {
      betQuality: bq,
      total: inBq.length,
      wins: wins.length,
      winRate: inBq.length > 0 ? wins.length / inBq.length : 0,
      roi: bucketRoi(inBq),
    }
  })

  res.json({
    total: records.length,
    resulted: resolved.length,
    bettable: bettable.length,
    invalidPositions: resulted.length - resolved.length,
    winners: won.length,
    winRate: bettable.length > 0 ? won.length / bettable.length : 0,
    roi: overallRoi,
    placedCount: placed.length,
    placeRate: bettable.length > 0 ? placed.length / bettable.length : 0,
    byWinProb,
    byGrade,
    byBetQuality,

    byOddsBand: [
      { label: '≤3/1', min: 1, max: 4.0 },
      { label: '4/1–8/1', min: 5.0, max: 9.0 },
      { label: '9/1–16/1', min: 10.0, max: 17.0 },
      { label: '16/1+', min: 18.0, max: Infinity },
    ].map((band) => {
      const inBand = bettable.filter((r) => {
        const odds = Number(r.odds || r.actual_odds || 0)
        return odds >= band.min && odds <= band.max
      })
      const wins = inBand.filter((r) => r.actual_won)
      return {
        band: band.label,
        total: inBand.length,
        wins: wins.length,
        winRate: inBand.length > 0 ? wins.length / inBand.length : 0,
        avgOdds: inBand.length > 0 ? inBand.reduce((s, r) => s + Number(r.odds || r.actual_odds || 0), 0) / inBand.length : 0,
        roi: bucketRoi(inBand),
      }
    }),

    gradeOddsMatrix: [...new Set(bettable.map((r) => r.grade).filter(Boolean))].sort().map((grade) => ({
      grade,
      bands: [
        { label: '≤3/1', min: 1, max: 4.0 },
        { label: '4/1–8/1', min: 5.0, max: 9.0 },
        { label: '9/1–16/1', min: 10.0, max: 17.0 },
        { label: '16/1+', min: 18.0, max: Infinity },
      ].map((band) => {
        const inCell = bettable.filter((r) => {
          if (r.grade !== grade) return false
          const odds = Number(r.odds || r.actual_odds || 0)
          return odds >= band.min && odds <= band.max
        })
        const wins = inCell.filter((r) => r.actual_won)
        return {
          band: band.label,
          total: inCell.length,
          wins: wins.length,
          roi: inCell.length > 0 ? bucketRoi(inCell) : null,
        }
      }),
    })),

    winnerOddsDistribution: (() => {
      const winnerOdds = won.map((r) => Number(r.takenOdds || r.odds || 0)).filter((o) => o > 0).sort((a, b) => a - b)
      if (winnerOdds.length === 0) return null
      const mid = Math.floor(winnerOdds.length / 2)
      const p90 = winnerOdds[Math.floor(winnerOdds.length * 0.9)]
      return {
        count: winnerOdds.length,
        mean: (winnerOdds.reduce((s, o) => s + o, 0) / winnerOdds.length).toFixed(1),
        median: (winnerOdds.length % 2 !== 0 ? winnerOdds[mid] : (winnerOdds[mid - 1] + winnerOdds[mid]) / 2).toFixed(1),
        p90: p90 ? p90.toFixed(1) : null,
        min: winnerOdds[0].toFixed(1),
        max: winnerOdds[winnerOdds.length - 1].toFixed(1),
      }
    })(),

    clv: (() => {
      const withClv = bettable.filter((r) => r.clv !== null && r.clv !== undefined && isFinite(r.clv))
      if (withClv.length === 0) return null
      const clvs = withClv.map((r) => r.clv)
      const positive = clvs.filter((c) => c > 0).length
      const sorted = [...clvs].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return {
        count: withClv.length,
        meanPct: ((clvs.reduce((s, c) => s + c, 0) / clvs.length) * 100).toFixed(1),
        medianPct: ((sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) * 100).toFixed(1),
        positiveRate: (positive / withClv.length * 100).toFixed(1),
        avgWinClv: (() => {
          const winClvs = won.filter((r) => r.clv !== null && isFinite(r.clv)).map((r) => r.clv)
          return winClvs.length > 0 ? ((winClvs.reduce((s, c) => s + c, 0) / winClvs.length) * 100).toFixed(1) : null
        })(),
      }
    })(),

    engines: (() => {
      function engineStats(label, bucket) {
        const bWon = bucket.filter((r) => r.actual_won)
        const bPlaced = bucket.filter(isPlaced)
        const bClv = bucket.filter((r) => r.clv !== null && r.clv !== undefined && isFinite(r.clv))
        const clvs = bClv.map((r) => r.clv)
        const clvMean = clvs.length > 0 ? (clvs.reduce((s, c) => s + c, 0) / clvs.length) * 100 : null
        return {
          label,
          total: bucket.length,
          winners: bWon.length,
          winRate: bucket.length > 0 ? bWon.length / bucket.length : 0,
          placed: bPlaced.length,
          placeRate: bucket.length > 0 ? bPlaced.length / bucket.length : 0,
          roi: bucketRoi(bucket),
          avgOdds: bucket.length > 0 ? bucket.reduce((s, r) => s + Number(r.odds || 0), 0) / bucket.length : 0,
          clvMean: clvMean !== null ? clvMean.toFixed(1) : null,
        }
      }

      function calibrationByProb(bucket) {
        const bands = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100]
        return bands.map((band) => {
          const inBand = bucket.filter((r) => {
            const wp = (r.winProb > 1 ? r.winProb : (r.winProb || 0) * 100)
            const prev = bands[bands.indexOf(band) - 1] || 0
            return wp > prev && wp <= band
          })
          const wins = inBand.filter((r) => r.actual_won)
          const expected = bands[bands.indexOf(band) - 1] || 0
          const midpoint = (expected + band) / 2
          const actual = inBand.length > 0 ? (wins.length / inBand.length) * 100 : 0
          return {
            band: `${expected}-${band}%`,
            expected: midpoint,
            actual: Math.round(actual * 10) / 10,
            total: inBand.length,
            wins: wins.length,
            calibrationError: Math.round((actual - midpoint) * 10) / 10,
          }
        })
      }

      const coreRecs = bettable.filter((r) => r.engine === 'CORE')
      const chaosRecs = bettable.filter((r) => r.engine === 'CHAOS')
      const coreGrades = ['S', 'A', 'B', 'B+']
      const bRecs = bettable.filter((r) => coreGrades.includes(r.grade))
      
      // B/B+ calibration at 4/1-12/1 — the identified sweet spot
      const bCalibration = (() => {
        const oddsBands = [
          { label: '4/1–6/1', min: 5.0, max: 7.0 },
          { label: '6/1–8/1', min: 7.1, max: 9.0 },
          { label: '8/1–10/1', min: 9.1, max: 11.0 },
          { label: '10/1–12/1', min: 11.1, max: 13.0 },
          { label: '12/1–16/1', min: 13.1, max: 17.0 },
          { label: '16/1+', min: 17.1, max: Infinity },
        ]
        return oddsBands.map((band) => {
          const inBand = bRecs.filter((r) => {
            const odds = Number(r.odds || 0)
            return odds >= band.min && odds <= band.max
          })
          const wins = inBand.filter((r) => r.actual_won)
          const avgProb = inBand.length > 0 ? inBand.reduce((s, r) => s + (r.winProb || 0), 0) / inBand.length : 0
          const actual = inBand.length > 0 ? (wins.length / inBand.length) * 100 : 0
          return {
            band: band.label,
            total: inBand.length,
            wins: wins.length,
            winRate: Math.round(actual * 10) / 10,
            avgPredictedProb: Math.round(avgProb * 10) / 10,
            calibrationError: Math.round((actual - avgProb) * 10) / 10,
            roi: bucketRoi(inBand),
            avgOdds: inBand.length > 0 ? inBand.reduce((s, r) => s + Number(r.odds || 0), 0) / inBand.length : 0,
          }
        }).filter(b => b.total > 0)
      })()
      
      return {
        CORE: engineStats('CORE', coreRecs),
        CHAOS: engineStats('CHAOS', chaosRecs),
        calibration: {
          CORE: calibrationByProb(coreRecs),
          CHAOS: calibrationByProb(chaosRecs),
        },
        bCalibration,
      }
    })(),

    noBetAnalysis: (() => {
      // Diagnostic logging
      if (resolved.length > 0) {
        const sample = resolved.slice(0, 3).map(r => ({
          horse: r.horse,
          betFilter: r.betFilter,
          valueEdge: r.valueEdge,
          edge: r.edge,
          engine: r.engine,
          noBet: r.noBet,
        }))
        console.log('[NO BET DEBUG] Sample records:', JSON.stringify(sample, null, 2))
        console.log('[NO BET DEBUG] Total resolved:', resolved.length)
        console.log('[NO BET DEBUG] Records with betFilter:', resolved.filter(r => r.betFilter).length)
        console.log('[NO BET DEBUG] Records with valueEdge:', resolved.filter(r => r.valueEdge !== undefined).length)
        console.log('[NO BET DEBUG] Records with noBet field:', resolved.filter(r => r.noBet !== undefined).length)
      }

      // Filter based on recalculated noBet field (not raw betFilter)
      const rejected = resolved.filter((r) => r.noBet)
      const accepted = resolved.filter((r) => !r.noBet)
      const rejWon = rejected.filter((r) => r.actual_won)
      const accWon = accepted.filter((r) => r.actual_won)
      const byVerdict = {}
      for (const r of rejected) {
        const v = r.betFilter || 'NO_FILTER'
        if (!byVerdict[v]) byVerdict[v] = { total: 0, wins: 0 }
        byVerdict[v].total++
        if (r.actual_won) byVerdict[v].wins++
      }
      return {
        rejected: {
          total: rejected.length,
          winners: rejWon.length,
          winRate: rejected.length > 0 ? rejWon.length / rejected.length : 0,
          roi: bucketRoi(rejected),
        },
        accepted: {
          total: accepted.length,
          winners: accWon.length,
          winRate: accepted.length > 0 ? accWon.length / accepted.length : 0,
          roi: bucketRoi(accepted),
        },
        byVerdict: Object.entries(byVerdict).map(([verdict, data]) => ({
          verdict,
          total: data.total,
          wins: data.wins,
          winRate: data.total > 0 ? data.wins / data.total : 0,
        })),
      }
    })(),

    clvByOddsBand: (() => {
      const bands = [
        { label: '≤3/1', min: 1, max: 4.0 },
        { label: '4/1–8/1', min: 5.0, max: 9.0 },
        { label: '9/1–16/1', min: 10.0, max: 17.0 },
        { label: '16/1+', min: 18.0, max: Infinity },
      ]

      return bands.map((band) => {
        const inBand = bettable.filter((r) => {
          const odds = Number(r.odds || r.actual_odds || 0)
          return odds >= band.min && odds <= band.max
        })

        const withClv = inBand.filter((r) => r.clv !== null && r.clv !== undefined && isFinite(r.clv))
        const clvs = withClv.map((r) => r.clv)
        const positive = clvs.filter((c) => c > 0).length

        const wonInBand = inBand.filter((r) => r.actual_won)
        const wonWithClv = wonInBand.filter((r) => r.clv !== null && r.clv !== undefined && isFinite(r.clv))
        const wonClvs = wonWithClv.map((r) => r.clv)

        const sorted = [...clvs].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        const medianClv = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

        return {
          band: band.label,
          total: inBand.length,
          withClv: withClv.length,
          meanClv: clvs.length > 0 ? ((clvs.reduce((s, c) => s + c, 0) / clvs.length) * 100).toFixed(1) : null,
          medianClv: sorted.length > 0 ? (medianClv * 100).toFixed(1) : null,
          positiveRate: withClv.length > 0 ? ((positive / withClv.length) * 100).toFixed(1) : null,
          avgWinClv: wonClvs.length > 0 ? ((wonClvs.reduce((s, c) => s + c, 0) / wonClvs.length) * 100).toFixed(1) : null,
        }
      })
    })(),

    lastUpdated: bettable.length > 0 ? bettable[bettable.length - 1].timestamp : null,
  })
})

app.get('/api/anti-overfit', (_req, res) => {
  const report = computeAntiOverfitReport(
    LEARNING_DATABASE.records,
    LEARNING_DATABASE.weights?.multiplier || {}
  )
  res.json(report)
})

app.get('/api/trainer-freshness', (_req, res) => {
  res.json(TRAINER_FRESHNESS_DB)
})

app.get('/api/trainer-freshness/:trainer', (req, res) => {
  const profile = getTrainerFreshnessProfile(req.params.trainer, TRAINER_FRESHNESS_DB)
  if (!profile) return res.status(404).json({ error: 'Trainer not found' })
  res.json(profile)
})

app.get('/api/track-bias-learning', (_req, res) => {
  res.json(getAllTrackBiasStats())
})

app.get('/api/track-bias-learning/:course', (req, res) => {
  const stats = getAllTrackBiasStats()[req.params.course]
  if (!stats) return res.status(404).json({ error: 'Course not found' })
  res.json(stats)
})

app.get('/api/or-pr-gap', (_req, res) => {
  const records = (HISTORICAL_DATABASE.records || []).filter(r => r.resulted && r.orPrGap != null)
  
  const bands = [
    { label: '-20+', min: -Infinity, max: -20 },
    { label: '-19 to -15', min: -19, max: -15 },
    { label: '-14 to -10', min: -14, max: -10 },
    { label: '-9 to -5', min: -9, max: -5 },
    { label: '-4 to 0', min: -4, max: 0 },
    { label: '+1 to +4', min: 1, max: 4 },
    { label: '+5 to +9', min: 5, max: 9 },
    { label: '+10 to +14', min: 10, max: 14 },
    { label: '+15+', min: 15, max: Infinity },
  ]
  
  const stats = bands.map(band => {
    const inBand = records.filter(r => r.orPrGap >= band.min && r.orPrGap < band.max)
    const wins = inBand.filter(r => r.actual_position === 1).length
    const places = inBand.filter(r => r.actual_position >= 1 && r.actual_position <= 3).length
    return {
      ...band,
      total: inBand.length,
      wins,
      places,
      winRate: inBand.length > 0 ? ((wins / inBand.length) * 100).toFixed(1) : null,
      placeRate: inBand.length > 0 ? ((places / inBand.length) * 100).toFixed(1) : null,
      avgOdds: inBand.length > 0 ? (inBand.reduce((s, r) => s + (r.actual_odds || 0), 0) / inBand.length).toFixed(2) : null,
    }
  })
  
  res.json({
    total: records.length,
    bands: stats,
    samples: records.slice(-20).map(r => ({
      horse: r.horse,
      course: r.course,
      or: r.or,
      pr: r.or + r.orPrGap,
      gap: r.orPrGap,
      position: r.actual_position,
      odds: r.actual_odds,
    })),
  })
})

app.get('/api/horse-affinity/:horseName', (req, res) => {
  try {
    const { horseName } = req.params
    if (!horseName) {
      return res.status(400).json({ error: 'Horse name parameter is required.' })
    }

    const filePath = path.join(process.cwd(), 'data', 'personalAffinity.json')
    if (!fs.existsSync(filePath)) {
      return res.json({ horseName, hasDenseData: false, metrics: { track: {}, distance: {}, going: {}, drawStyle: {} }, message: 'UNKNOWN_BLENDED: Hierarchical fallback routing active (k=30).' })
    }

    const affinityData = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const normalizedKey = horseName.trim().toLowerCase()
    const profile = affinityData.horses?.[normalizedKey]

    if (!profile) {
      return res.json({ horseName, hasDenseData: false, metrics: { track: {}, distance: {}, going: {}, drawStyle: {} }, message: 'UNKNOWN_BLENDED: Hierarchical fallback routing active (k=30).' })
    }

    const ap = profile.affinityProfiles || {}
    const trackCourses = ap.track?.courses || {}
    const trackArchetypes = ap.track?.archetypes || {}
    const distanceBuckets = ap.distance || {}
    const goingBuckets = ap.going || {}
    const runningStyleBuckets = ap.runningStyle || {}

    const hasDenseData = Object.keys(trackCourses).length > 0

    const bestArchetype = Object.entries(trackArchetypes)
      .filter(([, v]) => v.effectiveRuns >= 2)
      .sort((a, b) => (b[1].weightedWins / b[1].effectiveRuns) - (a[1].weightedWins / a[1].effectiveRuns))
      .map(([k]) => k)[0] || 'Unclassified Grinder'

    const bestTrackEntry = Object.entries(trackCourses)
      .sort((a, b) => (b[1].wins / b[1].runs) - (a[1].wins / a[1].runs))
      .map(([k, v]) => ({ track: k, wr: (v.wins / v.runs).toFixed(3), runs: v.runs }))[0]

    const bestDistanceEntry = Object.entries(distanceBuckets)
      .sort((a, b) => (b[1].wins / b[1].runs) - (a[1].wins / a[1].runs))
      .map(([k, v]) => ({ distance: k, wr: (v.wins / v.runs).toFixed(3), runs: v.runs }))[0]

    const bestGoingEntry = Object.entries(goingBuckets)
      .sort((a, b) => (b[1].wins / b[1].runs) - (a[1].wins / a[1].runs))
      .map(([k, v]) => ({ going: k, wr: (v.wins / v.runs).toFixed(3), runs: v.runs }))[0]

    const styleEntries = Object.entries(runningStyleBuckets)
      .filter(([, v]) => v.runs >= 1)
      .sort((a, b) => (b[1].wins / b[1].runs) - (a[1].wins / a[1].runs))
      .map(([k, v]) => ({ style: k, wr: v.runs > 0 ? (v.wins / v.runs).toFixed(3) : '0', runs: v.runs }))

    const frEntry = styleEntries.find(e => e.style === 'FR')
    const railLock = !!(frEntry && parseFloat(frEntry.wr) > 0.35)

    const staminaValid = !!(Object.entries(distanceBuckets).some(([, v]) => {
      const wr = v.runs > 0 ? v.wins / v.runs : 0
      return wr > 0.20
    }))

    return res.json({
      horseName,
      hasDenseData,
      archetype: bestArchetype.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      confidenceScore: profile.macroMetrics?.globalModelConfidence || 0.50,
      metrics: {
        track: bestTrackEntry ? { [`${bestTrackEntry.track}`]: parseFloat(bestTrackEntry.wr) } : {},
        distance: bestDistanceEntry ? { [`${bestDistanceEntry.distance}`]: parseFloat(bestDistanceEntry.wr) } : {},
        going: bestGoingEntry ? { [`${bestGoingEntry.going}`]: parseFloat(bestGoingEntry.wr) } : {},
        drawStyle: styleEntries.length > 0 ? Object.fromEntries(styleEntries.map(e => [e.style, parseFloat(e.wr)])) : {},
      },
      badges: { railLock, staminaValid },
    })
  } catch (error) {
    console.error(`API Error fetching affinity for ${req.params.horseName}:`, error)
    return res.status(500).json({ error: 'Internal pipeline error fetching structural affinity records.' })
  }
})

// ── PA Gate Live Monitor ──
// Honest naming: every section declares what subset it measures.
// Bettable filter: single definition (wp>=6%, odds>=2, positive edge, not NO BET/WEAK_COMPAT).
// Gate classification checks PA first, then betQuality — never the reverse.
app.get('/api/pa-gate-monitor', (_req, res) => {
  try {
    const db = PREDICTIONS_DATABASE || {}
    const races = LEARNING_DATABASE.races || []
    const resultMap = {}
    for (const race of races) {
      if (!race.runners) continue
      for (const r of race.runners) {
        const key = `${race.course}|${race.date}|${(r.horse||'').toLowerCase()}`
        resultMap[key] = r.position
      }
    }

    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const cutoff = threeDaysAgo.toISOString().slice(0, 10)

    // Dataset summary counters
    let totalWithResults = 0
    let totalWithPA = 0
    let totalPAPositive = 0
    let totalPANull = 0
    let dateEarliest = null
    let dateLatest = null

    // Single bettable filter — used everywhere for consistency
    const isBettable = (p) => {
      const bq = p.betQuality || ''
      if (bq === 'NO BET' || bq === 'WEAK_COMPAT') return false
      const wp = (p.estimatedWinProbability ?? p.predictedWinProb ?? 0) / 100
      if (wp < 0.06) return false
      if (Number(p.odds || 0) < 2.0) return false
      const impliedProb = 1 / Number(p.odds || 2)
      return (wp - impliedProb) > 0
    }

    // Gate classification: check PA FIRST, then betQuality.
    // A horse with betQuality='VALUE' but pa=-3 is "PA KILLED", not "passed".
    // pa=null means PA data was unavailable — classified as "no PA data".
    let engineSelected = 0, engineSelectedWins = 0, engineSelectedPL = 0
    let engineSelected3d = 0, engineSelected3dWins = 0, engineSelected3dPL = 0
    let paKilled = 0, paKilledWins = 0, paKilledPL = 0
    let paKilled3d = 0, paKilled3dWins = 0, paKilled3dPL = 0
    let noPAData = 0, noPADataWins = 0, noPADataPL = 0
    let noPAData3d = 0, noPAData3dWins = 0, noPAData3dPL = 0

    // Contender monitor: all predictions with valid PA, split by PA sign (no betQuality filter)
    let contPAPos = 0, contPAPosWins = 0
    let contPAPos3d = 0, contPAPos3dWins = 0
    let contPANeg = 0, contPANegWins = 0
    let contPANeg3d = 0, contPANeg3dWins = 0

    // Bettable monitor: isBettable() predictions, split by PA sign
    let betPAPos = 0, betPAPosWins = 0, betPAPosPL = 0
    let betPAPos3d = 0, betPAPos3dWins = 0, betPAPos3dPL = 0
    let betPANeg = 0, betPANegWins = 0, betPANegPL = 0
    let betPANeg3d = 0, betPANeg3dWins = 0, betPANeg3dPL = 0

    // Calibration by PA band — all predictions with valid PA and wp>0
    const calBands = [
      { label: '<=0', min: -Infinity, max: 0, count: 0, wins: 0, sumPred: 0 },
      { label: '0-2', min: 0, max: 2, count: 0, wins: 0, sumPred: 0 },
      { label: '2-5', min: 2, max: 5, count: 0, wins: 0, sumPred: 0 },
      { label: '5+', min: 5, max: Infinity, count: 0, wins: 0, sumPred: 0 },
    ]

    // PA band performance — isBettable() AND PA>0 (same filter as bettable monitor PA+ branch)
    const paPerfBands = [
      { label: '0-2', min: 0, max: 2 },
      { label: '2-5', min: 2, max: 5 },
      { label: '5+', min: 5, max: Infinity },
    ]
    const allTime = paPerfBands.map(b => ({ ...b, count: 0, wins: 0, stakes: 0, returns: 0, sumOdds: 0, sumEdge: 0 }))
    const threeDay = paPerfBands.map(b => ({ ...b, count: 0, wins: 0, stakes: 0, returns: 0, sumOdds: 0, sumEdge: 0 }))

    for (const racePreds of Object.values(db)) {
      if (!Array.isArray(racePreds)) continue
      for (const p of racePreds) {
        if (!p.date) continue
        const key = `${p.course}|${p.date}|${(p.horse||'').toLowerCase()}`
        const pos = resultMap[key]
        if (!pos) continue
        const won = pos === 1
        const odds = p.odds || 2
        const pl = won ? (odds - 1) : -1
        const pa = p.personalAffinity
        const wp = (p.estimatedWinProbability ?? p.predictedWinProb ?? 0) / 100
        const pwp = (p.plattProb ?? p.estimatedWinProbability ?? p.predictedWinProb ?? 0) / 100
        const impliedProb = 1 / Number(odds || 2)
        const valEdge = wp - impliedProb
        const isRecent = p.date >= cutoff

        // Dataset summary
        totalWithResults++
        if (pa !== null) totalWithPA++
        if (pa !== null && pa > 0) totalPAPositive++
        if (pa === null) totalPANull++
        if (!dateEarliest || p.date < dateEarliest) dateEarliest = p.date
        if (!dateLatest || p.date > dateLatest) dateLatest = p.date

        // ── Gate classification: PA first, then betQuality ──
        if (pa !== null && pa <= 0) {
          // PA gate killed this horse — regardless of what betQuality says
          paKilled++; if (won) paKilledWins++; paKilledPL += pl
          if (isRecent) { paKilled3d++; if (won) paKilled3dWins++; paKilled3dPL += pl }
        } else if (pa !== null && pa > 0) {
          // PA passed — now check if engine selected it
          if (p.betQuality && p.betQuality !== 'NO BET') {
            engineSelected++; if (won) engineSelectedWins++; engineSelectedPL += pl
            if (isRecent) { engineSelected3d++; if (won) engineSelected3dWins++; engineSelected3dPL += pl }
          } else {
            // PA passed but engine rejected (low prob, negative edge, etc.)
            noPAData++; if (won) noPADataWins++; noPADataPL += pl
            if (isRecent) { noPAData3d++; if (won) noPAData3dWins++; noPAData3dPL += pl }
          }
        } else {
          // PA was null — no PA data available
          noPAData++; if (won) noPADataWins++; noPADataPL += pl
          if (isRecent) { noPAData3d++; if (won) noPAData3dWins++; noPAData3dPL += pl }
        }

        // ── Contender monitor: PA sign split, ignores betQuality ──
        if (pa !== null && pa > 0) {
          contPAPos++; if (won) contPAPosWins++
          if (isRecent) { contPAPos3d++; if (won) contPAPos3dWins++ }
        } else if (pa !== null && pa <= 0) {
          contPANeg++; if (won) contPANegWins++
          if (isRecent) { contPANeg3d++; if (won) contPANeg3dWins++ }
        }
        // pa===null: not counted (no PA data to classify)

        // ── Bettable monitor: isBettable() + PA sign ──
        if (isBettable(p)) {
          if (pa !== null && pa > 0) {
            betPAPos++; if (won) betPAPosWins++; betPAPosPL += pl
            if (isRecent) { betPAPos3d++; if (won) betPAPos3dWins++; betPAPos3dPL += pl }
          } else {
            betPANeg++; if (won) betPANegWins++; betPANegPL += pl
            if (isRecent) { betPANeg3d++; if (won) betPANeg3dWins++; betPANeg3dPL += pl }
          }
        }

        // ── Calibration: all with valid PA and plattProb>0 ──
        if (pa !== null && pwp > 0) {
          for (const band of calBands) {
            if (pa > band.min && pa <= band.max) {
              band.count++; if (won) band.wins++; band.sumPred += pwp
              break
            }
          }
        }

        // ── PA band performance: isBettable() + PA>0 ──
        if (isBettable(p) && pa !== null && pa > 0) {
          for (let i = 0; i < paPerfBands.length; i++) {
            const b = paPerfBands[i]
            if (pa > b.min && pa <= b.max) {
              allTime[i].count++
              allTime[i].stakes++
              allTime[i].returns += won ? odds : 0
              allTime[i].sumOdds += odds
              if (won) allTime[i].wins++
              if (valEdge > 0) allTime[i].sumEdge += valEdge
              if (isRecent) {
                threeDay[i].count++
                threeDay[i].stakes++
                threeDay[i].returns += won ? odds : 0
                threeDay[i].sumOdds += odds
                if (won) threeDay[i].wins++
                if (valEdge > 0) threeDay[i].sumEdge += valEdge
              }
              break
            }
          }
        }
      }
    }

    const wr = (w, n) => n ? +(w / n * 100).toFixed(1) : 0
    const roi = (pl, n) => n ? +(pl / n * 100).toFixed(1) : 0

    const calibration = calBands.map(b => ({
      band: b.label,
      count: b.count,
      avgPred: b.count ? +(b.sumPred / b.count * 100).toFixed(1) : 0,
      actualWR: wr(b.wins, b.count),
      error: b.count ? +((b.wins / b.count - b.sumPred / b.count) * 100).toFixed(1) : 0,
    }))

    res.json({
      // Dataset context — what are we looking at?
      dataset: {
        totalWithResults,
        withPA: totalWithPA,
        withPAPositive: totalPAPositive,
        withPANull: totalPANull,
        paCoverage: totalWithResults ? +(totalPAPositive / totalWithResults * 100).toFixed(1) : 0,
        dateRange: [dateEarliest, dateLatest],
        oddsSource: 'pre-race decimal',
        note: 'PA coverage is % of results-matched predictions with PA>0. PA=null means no historical data for that horse.',
      },
      // Gate classification: PA checked first. "Engine Selected" = PA>0 AND engine wanted to bet.
      gate: {
        engineSelected: { count: engineSelected, wins: engineSelectedWins, roi: roi(engineSelectedPL, engineSelected), wr: wr(engineSelectedWins, engineSelected) },
        engineSelectedThreeDay: { count: engineSelected3d, wins: engineSelected3dWins, roi: roi(engineSelected3dPL, engineSelected3d), wr: wr(engineSelected3dWins, engineSelected3d) },
        paKilled: { count: paKilled, wins: paKilledWins, roi: roi(paKilledPL, paKilled), wr: wr(paKilledWins, paKilled) },
        paKilledThreeDay: { count: paKilled3d, wins: paKilled3dWins, roi: roi(paKilled3dPL, paKilled3d), wr: wr(paKilled3dWins, paKilled3d) },
        noPAData: { count: noPAData, wins: noPADataWins, roi: roi(noPADataPL, noPAData), wr: wr(noPADataWins, noPAData) },
        noPADataThreeDay: { count: noPAData3d, wins: noPAData3dWins, roi: roi(noPAData3dPL, noPAData3d), wr: wr(noPAData3dWins, noPAData3d) },
      },
      // Contender monitor: PA sign split only (no betQuality filter, pa=null excluded)
      contender: {
        paPositive: { count: contPAPos, wins: contPAPosWins, wr: wr(contPAPosWins, contPAPos) },
        paNonPositive: { count: contPANeg, wins: contPANegWins, wr: wr(contPANegWins, contPANeg) },
      },
      contenderThreeDay: {
        paPositive: { count: contPAPos3d, wins: contPAPos3dWins, wr: wr(contPAPos3dWins, contPAPos3d) },
        paNonPositive: { count: contPANeg3d, wins: contPANeg3dWins, wr: wr(contPANeg3dWins, contPANeg3d) },
      },
      // Bettable monitor: isBettable() predictions split by PA sign
      bettable: {
        passed: { count: betPAPos, wins: betPAPosWins, roi: roi(betPAPosPL, betPAPos), wr: wr(betPAPosWins, betPAPos) },
        rejected: { count: betPANeg, wins: betPANegWins, roi: roi(betPANegPL, betPANeg), wr: wr(betPANegWins, betPANeg) },
      },
      bettableThreeDay: {
        passed: { count: betPAPos3d, wins: betPAPos3dWins, roi: roi(betPAPos3dPL, betPAPos3d), wr: wr(betPAPos3dWins, betPAPos3d) },
        rejected: { count: betPANeg3d, wins: betPANeg3dWins, roi: roi(betPANeg3dPL, betPANeg3d), wr: wr(betPANeg3dWins, betPANeg3d) },
      },
      calibration,
      paBandPerformance: {
        allTime: allTime.map(b => {
          const p = b.count ? b.wins / b.count : 0
          const se = b.count > 1 ? Math.sqrt(p * (1 - p) / b.count) : 0
          const ci95 = +(se * 1.96 * 100).toFixed(1)
          const sampleConfidence = b.count >= 100 ? 'high' : b.count >= 30 ? 'moderate' : 'low'
          return {
            band: b.label,
            count: b.count,
            wins: b.wins,
            stakes: b.stakes,
            returns: +b.returns.toFixed(2),
            wr: wr(b.wins, b.count),
            roi: b.stakes ? +((b.returns - b.stakes) / b.stakes * 100).toFixed(1) : 0,
            avgOdds: b.count ? +(b.sumOdds / b.count).toFixed(2) : 0,
            avgEdge: b.count ? +(b.sumEdge / b.count * 100).toFixed(1) : 0,
            ci95,
            reliable: b.count >= 30,
            sampleConfidence,
          }
        }),
        threeDay: threeDay.map(b => {
          const p = b.count ? b.wins / b.count : 0
          const se = b.count > 1 ? Math.sqrt(p * (1 - p) / b.count) : 0
          const ci95 = +(se * 1.96 * 100).toFixed(1)
          const sampleConfidence = b.count >= 100 ? 'high' : b.count >= 30 ? 'moderate' : 'low'
          return {
            band: b.label,
            count: b.count,
            wins: b.wins,
            stakes: b.stakes,
            returns: +b.returns.toFixed(2),
            wr: wr(b.wins, b.count),
            roi: b.stakes ? +((b.returns - b.stakes) / b.stakes * 100).toFixed(1) : 0,
            avgOdds: b.count ? +(b.sumOdds / b.count).toFixed(2) : 0,
            avgEdge: b.count ? +(b.sumEdge / b.count * 100).toFixed(1) : 0,
            ci95,
            reliable: b.count >= 30,
            sampleConfidence,
          }
        }),
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Shadow Watch Sandbox ──
app.get('/api/shadow-watch', async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 60)
    if (!HORSE_MEMORY_DB) return res.json({ records: [], summary: {} })
    const timeout = setTimeout(() => {
      if (!res.headersSent) res.status(504).json({ error: 'Request timeout — database busy' })
    }, 5000)
    const data = await getShadowWatchStats(HORSE_MEMORY_DB, days)
    clearTimeout(timeout)
    if (!res.headersSent) res.json(data)
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message })
  }
})

// ── Counterfactual Activation Zone Log ──
app.get('/api/counterfactual-log', (_req, res) => {
  try {
    updateCounterfactualStats()
    const obs = COUNTERFACTUAL_DATABASE.observations || []
    const stats = COUNTERFACTUAL_DATABASE.stats || {}

    const resolved = obs.filter(o => o.result)
    const pending = obs.filter(o => !o.result)

    const paBinBreakdown = {}
    for (const o of obs) {
      const bin = o.paBin || 'unknown'
      if (!paBinBreakdown[bin]) paBinBreakdown[bin] = { total: 0, won: 0, placed: 0, lost: 0, pending: 0, roi: 0 }
      paBinBreakdown[bin].total++
      if (o.result === 'won') { paBinBreakdown[bin].won++; }
      else if (o.result === 'placed') { paBinBreakdown[bin].placed++; }
      else if (o.result === 'lost') { paBinBreakdown[bin].lost++; }
      else { paBinBreakdown[bin].pending++; }
    }
    for (const bin of Object.keys(paBinBreakdown)) {
      const b = paBinBreakdown[bin]
      const resolved = b.total - b.pending
      b.winRate = resolved > 0 ? Math.round((b.won / resolved) * 1000) / 10 : 0
      b.placedRate = resolved > 0 ? Math.round(((b.won + b.placed) / resolved) * 1000) / 10 : 0
      if (b.won > 0) {
        const wins = obs.filter(o => o.paBin === bin && o.result === 'won')
        b.avgWinOdds = Math.round(wins.reduce((s, o) => s + (o.odds || 2), 0) / wins.length * 10) / 10
      }
    }

    res.json({
      total: obs.length,
      resolved: resolved.length,
      pending: pending.length,
      zones: stats,
      paBinBreakdown,
      recent: obs.slice(-20).reverse(),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PA by Finish Position ──
app.get('/api/pa-by-position', (_req, res) => {
  try {
    const db = PREDICTIONS_DATABASE || {}
    const races = LEARNING_DATABASE.races || []

    const resultMap = {}
    for (const race of races) {
      if (!race.runners) continue
      for (const r of race.runners) {
        const key = `${race.course}|${race.date}|${(r.horse||'').toLowerCase()}`
        resultMap[key] = r.position
      }
    }

    const selections = []
    for (const racePreds of Object.values(db)) {
      if (!Array.isArray(racePreds)) continue
      for (const p of racePreds) {
        const key = `${p.course}|${p.date}|${(p.horse||'').toLowerCase()}`
        const pos = Number(resultMap[key])
        if (!pos || pos < 1) continue

        selections.push({
          pos, horse: p.horse, course: p.course, date: p.date, pa: p.personalAffinity ?? 0,
        })
      }
    }

    const buckets = { winner: { items: [] }, placed: { items: [] }, top4: { items: [] }, unplaced: { items: [] } }
    for (const s of selections) {
      if (s.pos === 1) buckets.winner.items.push(s)
      else if (s.pos <= 3) buckets.placed.items.push(s)
      else if (s.pos <= 4) buckets.top4.items.push(s)
      else buckets.unplaced.items.push(s)
    }

    const bucketStats = {}
    for (const [name, b] of Object.entries(buckets)) {
      const paVals = b.items.map(s => s.pa)
      const n = paVals.length
      const avgPA = n ? paVals.reduce((a, b) => a + b, 0) / n : 0
      const sorted = [...paVals].sort((a, b) => a - b)
      const medianPA = n ? (n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : 0
      const positive = paVals.filter(p => p > 0).length
      bucketStats[name] = {
        count: n, avgPA: Math.round(avgPA * 10) / 10, medianPA: Math.round(medianPA * 10) / 10,
        pctPositive: n ? Math.round(positive / n * 1000) / 10 : 0,
        pctNonPositive: n ? Math.round((n - positive) / n * 1000) / 10 : 0,
      }
    }

    const paBands = [
      { label: '>10', min: 10, max: Infinity },
      { label: '5 to 10', min: 5, max: 10 },
      { label: '3 to 5', min: 3, max: 5 },
      { label: '1 to 3', min: 1, max: 3 },
      { label: '0 to 1', min: 0, max: 1 },
      { label: '-2 to 0', min: -2, max: 0 },
      { label: '-5 to -2', min: -5, max: -2 },
      { label: '<= -5', min: -Infinity, max: -5 },
    ]
    const bandStats = paBands.map(band => {
      const inBand = selections.filter(s => s.pa >= band.min && s.pa < (band.max === Infinity ? Infinity : band.max))
      const n = inBand.length
      if (!n) return null
      const wins = inBand.filter(s => s.pos === 1).length
      const places = inBand.filter(s => s.pos >= 2 && s.pos <= 3).length
      const avgFinish = inBand.reduce((a, s) => a + s.pos, 0) / n
      return {
        band: band.label, count: n, wins, winRate: Math.round(wins / n * 1000) / 10,
        placeRate: Math.round((wins + places) / n * 1000) / 10,
        avgFinishPos: Math.round(avgFinish * 10) / 10,
      }
    }).filter(Boolean)

    res.json({
      totalSelections: selections.length, buckets: bucketStats, bands: bandStats,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Point-in-time backtest endpoint — spawns backtest script as child process, streams progress via SSE
app.get('/api/backtest/stream', (req, res) => {
  const fromDate = req.query.from || '2026-05-21'
  const toDate = req.query.to || '2026-06-21'
  const paGate = req.query['pa-gate'] === 'true'
  let label = req.query.label || `api-${fromDate}`
  if (paGate) label = `${label}-pa-gate`

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const args = ['scripts/backtestPointInTime.mjs', '--from', fromDate, '--to', toDate, '--label', label]
  if (paGate) args.push('--pa-gate')

  const proc = spawn('node', args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] })

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      res.write(`data: ${JSON.stringify({ type: 'progress', message: line })}\n\n`)
    }
  })

  proc.stderr.on('data', (data) => {
    res.write(`data: ${JSON.stringify({ type: 'error', message: data.toString().trim() })}\n\n`)
  })

  proc.on('close', async (code) => {
    if (code === 0 && HORSE_MEMORY_DB) {
      try {
        const outputPath = path.join(process.cwd(), 'data', `backtest-results-${label}.json`)
        const outputData = loadDatabase(outputPath)
        const predictions = Array.isArray(outputData) ? outputData : outputData?.predictions || []
        if (predictions.length > 0) {
          const { saved } = await insertBacktestRuns(HORSE_MEMORY_DB, label, predictions)
          res.write(`data: ${JSON.stringify({ type: 'done', code, label, stored: saved })}\n\n`)
        } else {
          res.write(`data: ${JSON.stringify({ type: 'done', code, label, stored: 0 })}\n\n`)
        }
      } catch (e) {
        res.write(`data: ${JSON.stringify({ type: 'done', code, label, stored: 0, error: e.message })}\n\n`)
      }
    } else {
      res.write(`data: ${JSON.stringify({ type: 'done', code, label })}\n\n`)
    }
    res.end()
  })

  req.on('close', () => {
    proc.kill('SIGTERM')
  })
})

// Synchronous backtest trigger — returns result file path when complete
app.post('/api/backtest/run', async (req, res) => {
  const { startDate, endDate, paGate } = req.body || {}
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate required' })
  }

  const label = `api-${startDate}-${Date.now()}`
  const args = ['scripts/backtestPointInTime.mjs', '--from', startDate, '--to', endDate, '--label', label]
  if (paGate) args.push('--pa-gate')

  console.log(`[Backtest] Starting: ${startDate} to ${endDate}, PA gate: ${paGate}`)

  try {
    const result = await new Promise((resolve, reject) => {
      const proc = spawn('node', args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (d) => { stdout += d.toString() })
      proc.stderr.on('data', (d) => { stderr += d.toString() })
      proc.on('close', (code) => {
        if (code === 0) resolve({ stdout, label })
        else reject(new Error(stderr || `Exit code ${code}`))
      })
      proc.on('error', reject)
    })

    const outputPath = path.join(process.cwd(), `data/backtest-results-${label}.json`)
    console.log(`[Backtest] Complete: ${outputPath}`)
    res.json({ ok: true, outputPath, label, stdout: result.stdout.slice(-2000) })
  } catch (err) {
    console.error(`[Backtest] Failed: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── Backtest Labels ──
app.get('/api/backtest/labels', async (_req, res) => {
  try {
    if (!HORSE_MEMORY_DB) return res.json([])
    const labels = await getBacktestLabels(HORSE_MEMORY_DB)
    res.json(labels)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Backtest Summary ──
app.get('/api/backtest/summary/:label', async (req, res) => {
  try {
    if (!HORSE_MEMORY_DB) return res.json(null)
    const summary = await getBacktestSummary(HORSE_MEMORY_DB, req.params.label)
    res.json(summary)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Backtest Delete ──
app.delete('/api/backtest/label/:label', async (req, res) => {
  try {
    if (!HORSE_MEMORY_DB) return res.json({ deleted: false })
    const deleted = await deleteBacktestLabel(HORSE_MEMORY_DB, req.params.label)
    res.json({ deleted })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/refresh-racecards', async (_req, res) => {
  try {
    console.log('[API] Manual racecard refresh requested')
    await fetchLiveMeetings()
    let backfilled = 0
    try {
      const enrichedDb = loadDatabase(path.join(process.cwd(), 'data', 'racecard-enriched.json'))
      const enrichedRaces = enrichedDb.races || []
      const racesByKey = new Map()
      for (const r of enrichedRaces) {
        const key = `${r.course}-${r.off_time}-${r.date}`
        racesByKey.set(key, r)
      }
      console.log(`[API] Backfill: ${enrichedRaces.length} enriched races, ${racesByKey.size} unique keys`)
      for (const rec of (HISTORICAL_DATABASE.records || [])) {
        if (rec.resulted && rec.orPrGap == null && rec.or > 0) {
          const key = `${rec.course}-${rec.off_time}-${rec.date}`
          const race = racesByKey.get(key)
          if (race) {
            const rr = (race.runners || []).find(r =>
              (r.horse || '').toLowerCase().trim() === (rec.horse || '').toLowerCase().trim()
            )
            if (rr?.performanceRating?.pr > 0) {
              rec.orPrGap = Math.round((rr.performanceRating.pr - rec.or) * 10) / 10
              backfilled++
            }
          }
        }
      }
      if (backfilled > 0) {
        saveDatabase(HISTORICAL_DB_PATH, HISTORICAL_DATABASE)
      }
      console.log(`[API] OR/PR gap backfill complete: ${backfilled} records`)
    } catch (e) {
      console.error('[API] Backfill error:', e.message)
    }
    res.json({ ok: true, message: 'Racecards refreshed', orPrGapBackfilled: backfilled })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})



app.get('/api/debug/state', (_req, res) => {
  res.json({
    races: LIVE_STATE.racecards?.length || 0,
    loading: LIVE_STATE.loading,
    updatedAt: LIVE_STATE.updatedAt,
    abandoned: LIVE_STATE.abandoned,
    sampleRace: LIVE_STATE.racecards?.[0]?.course || 'none'
  })
})

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(process.cwd(), 'dist', 'index.html'))
  }
})

server.listen(PORT, async () => {
  console.log(`APEX websocket engine running on ${PORT}`)

  // Initialize Postgres store and load persistent data
  try {
    // Always load PA store from file (no Postgres required)
    await initAffinityStore()

    const pgReady = await initPgStore()
    if (pgReady) {

      const pgPicks = await pgLoad('daily-picks')
      if (pgPicks && typeof pgPicks === 'object' && Object.keys(pgPicks).length > 0) {
        Object.keys(pgPicks).forEach(date => { DAILY_PICKS_DATABASE[date] = pgPicks[date] })
        console.log(`[PG] Loaded daily-picks from Postgres: ${Object.keys(pgPicks).length} dates`)
      } else {
        const filePicks = loadDatabase(DAILY_PICKS_PATH)
        if (Object.keys(filePicks).length > 0) {
          Object.keys(filePicks).forEach(date => { DAILY_PICKS_DATABASE[date] = filePicks[date] })
          await pgSave('daily-picks', DAILY_PICKS_DATABASE)
          console.log(`[PG] Seeded daily-picks from file: ${Object.keys(filePicks).length} dates`)
        }
      }

      const pgPreds = await pgLoad('predictions')
      if (pgPreds && typeof pgPreds === 'object' && Object.keys(pgPreds).length > 0) {
        Object.assign(PREDICTIONS_DATABASE, pgPreds)
        console.log(`[PG] Loaded predictions from Postgres: ${Object.keys(pgPreds).length} entries`)
      } else {
        const filePreds = loadDatabase(PREDICTIONS_DB_PATH)
        if (Object.keys(filePreds).length > 0) {
          Object.assign(PREDICTIONS_DATABASE, filePreds)
          await pgSave('predictions', PREDICTIONS_DATABASE)
          console.log(`[PG] Seeded predictions from file: ${Object.keys(filePreds).length} entries`)
        }
      }
    }
  } catch (err) {
    console.error('[PG] Startup load error:', err.message)
  }

  console.log('[STARTUP] APEX_DIAGNOSTIC =', process.env.APEX_DIAGNOSTIC)
  if (process.env.APEX_DIAGNOSTIC === '1') {
    console.log('[DIAG TEST] Diagnostic mode ACTIVE - will log signal dilution per race')
  }
  const picksDates = Object.keys(DAILY_PICKS_DATABASE)
  const picksCount = Object.values(DAILY_PICKS_DATABASE).reduce((sum, d) => sum + (d.picks?.length || 0), 0)
  console.log(`[STARTUP] DAILY_PICKS_DATABASE has ${picksDates.length} dates, ${picksCount} total picks`)
  // Global processing lock — prevents scheduler from colliding with startup or backfill
  let isProcessing = false
  let resultsRefreshing = false
  // One-time migration: fix race_id format + GMT→BST times in learning.json
  migrateLearningDb()

  // Fetch today's data on startup with automatic retry (up to 3 attempts)
  async function startupFetchWithRetry(attempt = 1) {
    const MAX_ATTEMPTS = 3
    isProcessing = true
    try {
      await fetchLiveMeetings()
      isProcessing = false

      // Check if we actually got races — if not, retry after delay
      if ((!LIVE_STATE.racecards || LIVE_STATE.racecards.length === 0) && attempt < MAX_ATTEMPTS) {
        console.log(`[Startup] No races loaded (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in 60s...`)
        setTimeout(() => startupFetchWithRetry(attempt + 1), 60 * 1000)
        return
      }

      if (LIVE_STATE.racecards && LIVE_STATE.racecards.length > 0) {
        console.log(`[Startup] Racecards complete (${LIVE_STATE.racecards.length} races), scheduling results fetch in 5s...`)
      } else {
        // Fallback: load from enriched racecard cache if live scrape returned 0
        try {
          const enrichedDb = loadDatabase(path.join(process.cwd(), 'data', 'racecard-enriched.json'))
          const todayStr = new Date().toISOString().split('T')[0]
          const cachedRaces = (enrichedDb.races || []).filter(r => r.date === todayStr)
          if (cachedRaces.length > 0) {
            console.log(`[Startup] Live scrape returned 0 races, falling back to enriched cache: ${cachedRaces.length} races`)
            LIVE_STATE.racecards = cachedRaces
            LIVE_STATE.processingComplete = true
          } else {
            console.log(`[Startup] No races available after ${MAX_ATTEMPTS} attempts — will retry on next scheduler cycle`)
          }
        } catch (e) {
          console.log(`[Startup] No races available after ${MAX_ATTEMPTS} attempts — will retry on next scheduler cycle`)
        }
      }

      setTimeout(async () => {
        isProcessing = true
        try {
          if (!resultsRefreshing) await fetchTodayResults()
        } finally {
          isProcessing = false
        }
      }, 5000)
    } catch (err) {
      console.error(`[Startup] fetchLiveMeetings() failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, err.message)
      isProcessing = false
      if (attempt < MAX_ATTEMPTS) {
        console.log(`[Startup] Retrying in 60s...`)
        setTimeout(() => startupFetchWithRetry(attempt + 1), 60 * 1000)
      }
    }
  }
  startupFetchWithRetry()

  // Backfill track bias learning from historical records
  const trackBiasStore = getTrackBiasStore()
  const coursesWithRuns = Object.values(trackBiasStore.courses || {}).filter(c => c.runs > 0)
  if (coursesWithRuns.length === 0) {
    const backfilled = backfillFromHistorical(HISTORICAL_DATABASE.records || [])
    console.log(`[Track Bias] Backfilled ${backfilled} historical records`)
  } else {
    console.log(`[Track Bias] Loaded existing data for ${coursesWithRuns.length} courses`)
  }

  // Backfill OR/PR gap for existing resulted records
  let orPrGapBackfilled = 0
  const racesById = new Map()
  try {
    const enrichedDb = loadDatabase(path.join(process.cwd(), 'data', 'racecard-enriched.json'))
    const enrichedRaces = enrichedDb.races || []
    for (const r of enrichedRaces) {
      const key = `${r.course}-${r.off_time}-${r.date}`
      racesById.set(key, r)
    }
    console.log(`[OR/PR Gap] Loaded ${enrichedRaces.length} enriched racecard records for backfill`)
  } catch (e) {}
  for (const rec of (HISTORICAL_DATABASE.records || [])) {
    if (rec.resulted && rec.orPrGap == null && rec.or > 0) {
      let pr = 0
      if (rec.performanceRating?.pr > 0) {
        pr = rec.performanceRating.pr
      } else if (rec.previous_results?.length > 0) {
        const prData = computePerformanceRating(rec.previous_results, rec.or, rec.race_type || '')
        if (prData.runs > 0) pr = prData.pr
      } else if (rec.bha_trend && rec.bha_trend !== 0) {
        pr = rec.or - rec.bha_trend * 2.5
      } else {
        const key = `${rec.course}-${rec.off_time}-${rec.date}`
        const race = racesById.get(key)
        if (race) {
          const raceRunner = (race.runners || []).find(r =>
            (r.horse || '').toLowerCase().trim() === (rec.horse || '').toLowerCase().trim()
          )
          if (raceRunner?.performanceRating?.pr > 0) {
            pr = raceRunner.performanceRating.pr
          }
        }
      }
      if (pr > 0) {
        rec.orPrGap = Math.round((pr - rec.or) * 10) / 10
        orPrGapBackfilled++
      }
    }
  }
  if (orPrGapBackfilled > 0) {
    saveDatabase(HISTORICAL_DB_PATH, HISTORICAL_DATABASE)
    console.log(`[OR/PR Gap] Backfilled ${orPrGapBackfilled} historical records`)
  }

  // Backfill condition database from historical races with metadata
  try {
    const conditionDbPath = path.join(process.cwd(), 'data', 'condition_db.json')
    const conditionDb = loadDatabase(conditionDbPath)
    const existingHorseCount = Object.keys(conditionDb.horses || {}).length
    if (existingHorseCount === 0) {
      const allLearningRaces = (LEARNING_DATABASE.races || []).filter(r => r.runners && r.runners.length > 0)
      if (allLearningRaces.length > 0) {
        recordRunBatch(allLearningRaces)
      }
      console.log(`[ConditionDB] Backfilled ${allLearningRaces.length} historical races with full metadata`)
    } else {
      console.log(`[ConditionDB] Loaded existing data for ${existingHorseCount} horses`)
    }
  } catch (e) {
    console.error('[ConditionDB] Backfill error:', e.message)
  }

  // Set up schedulers — skip if DISABLE_SCHEDULER env flag is set
  if (process.env.DISABLE_SCHEDULER === 'true') {
    console.log('[Scheduler] Background automated tasks DISABLED via environment flag')
  } else {
    // Results refresh: every 5 min, but only after first race + 2 min buffer
    // Runs independently of isProcessing — results fetch is lightweight
    // Guard against concurrent execution (Playwright + shared page can deadlock)
    let firstRaceFinishedAt = null
    setInterval(async () => {
      if (BACKFILL_IN_PROGRESS || resultsRefreshing) return
      const today = new Date().toISOString().split('T')[0]

      // Check if any race today has finished
      if (!firstRaceFinishedAt) {
        const races = LIVE_STATE.racecards || []
        const ukNowStr = new Date().toLocaleString('en-US', { timeZone: 'Europe/London' })
        const ukNow = new Date(ukNowStr)
        for (const race of races) {
          const raceDate = race.date || ''
          const offTime = race.off_time || ''
          if (!raceDate || !offTime) continue
          const [year, month, day] = raceDate.split('-')
          const [hour, minute] = offTime.split(':')
          if (!year || !hour) continue
          const raceUKStr = new Date(year, month - 1, day, hour, minute, 0).toLocaleString('en-US', { timeZone: 'Europe/London' })
          const offDateTime = new Date(raceUKStr)
          if (ukNow.getTime() > offDateTime.getTime()) {
            firstRaceFinishedAt = Date.now()
            console.log(`[Scheduler] First race finished (${race.course} ${offTime}), results scraping starts in 2 min`)
            return
          }
        }
        return
      }

      // 2 min buffer after first race finished
      if (Date.now() - firstRaceFinishedAt < 2 * 60 * 1000) {
        return
      }

      try {
        resultsRefreshing = true
        console.log('[Scheduler] Periodic results refresh for', today)
        await fetchResultsForDate(today)
        for (let i = 1; i <= 3; i++) {
          const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
          const dp = DAILY_PICKS_DATABASE[d]
          if (dp?.stats?.pending > 0) {
            console.log(`[Scheduler] Retrying past date ${d} (${dp.stats.pending} pending)`)
            await fetchResultsForDate(d)
          }
        }
      } catch (e) {
        console.error('[Scheduler] Results refresh failed:', e.message)
      } finally {
        resultsRefreshing = false
      }
    }, 5 * 60 * 1000)

    // Refresh racecards every 5 min — only re-scrape when cache expires
    // Cache TTL is 5min, so this picks up odds/NR changes without full reprocess
    setInterval(async () => {
      if (BACKFILL_IN_PROGRESS || isProcessing || LIVE_STATE.atrLoading) return
      // If races already loaded and fully processed, don't re-scrape — data doesn't change mid-day
      if (LIVE_STATE.racecards?.length > 0 && LIVE_STATE.processingComplete) {
        return
      }
      isProcessing = true
      try {
        console.log('[Scheduler] Periodic racecard refresh')
        await fetchLiveMeetings()
      } catch (e) {
        console.error('[Scheduler] Racecard refresh failed:', e.message)
      } finally {
        isProcessing = false
      }
    }, 2 * 60 * 1000)
  }
})

function gracefulShutdown(signal) {
  console.log(`[Shutdown] ${signal} received, closing databases...`)
  Promise.all([
    closeBrowser(),
    HORSE_MEMORY_DB ? closeHorseDb(HORSE_MEMORY_DB) : Promise.resolve(),
  ]).then(() => {
    console.log('[Shutdown] All databases and browser closed')
    process.exit(0)
  }).catch(() => {
    process.exit(1)
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))