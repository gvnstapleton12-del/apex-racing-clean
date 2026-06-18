import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import http from 'http'

import { Server } from 'socket.io'

import { generateSignals } from './src/lib/signalEngine.js'
import { analyzeMarketMovement } from './src/lib/marketEngine.js'
import { runApexEngine } from './src/lib/apexEngine.js'
import { selectionQuality } from './src/lib/selectionQuality.js'
import { REPLAY_TAG_LIBRARY, TAG_TO_CATEGORY, generateAutoSummary, computeWatchlistPriority, getRecommendedConditions, getAvoidTags, extractTagsFromNotes } from './src/lib/replayTagLibrary.js'
import { getCourseProfile } from './src/lib/courseProfiles.js'
import { buildHorseProfile, computeProfileAdjustment } from './src/lib/horseProfileEngine.js'
import { fetchAtrRacecards, fetchAtrRatings } from './src/lib/scrapers/atrScraper.js'
import { initHorseDb, createTables, closeHorseDb } from './src/lib/horseMemoryDb.js'
import { getHorseMemory, getHorseMemoryBatch, calculateHandicapScore, calculateAbilityFromMemory } from './src/lib/horseMemoryEngine.js'
import { saveHorseRun } from './src/lib/saveHorseRun.js'
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

let HORSE_MEMORY_DB = null

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
  const exists = HISTORICAL_DATABASE.records.some((r) => r.id === id)
  if (exists) return
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

function saveDatabase(filePath, database) {
  try {
    fs.mkdirSync(path.dirname(filePath), {
      recursive: true,
    })

    fs.writeFileSync(
      filePath,
      JSON.stringify(database, null, 2)
    )
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

// ensure seeded multipliers even if loading existing file with empty weights
if (!learningDb.weights?.multiplier?.class) {
  learningDb.weights = {
    multiplier: { class: 1.3, stride: 1.1, trainer: 0.7, traffic: 1.0, clv: 0.8 },
  }
}

const DAILY_PICKS_DATABASE = loadDatabase(DAILY_PICKS_PATH)
const REPLAY_NOTES_DATABASE = loadDatabase(REPLAY_NOTES_PATH)

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
    predictedPlaceProb: aiProfile.placeProb || 0,
    impliedProbability:
      aiProfile.impliedProbability,
    valueEdge: aiProfile.valueEdge,
    completeness: aiProfile.completeness,
    grade: aiProfile.grade || '',
    betQuality: aiProfile.betQuality || '',
    personalAffinity: runner.personalAffinity?.adjustment ?? null,
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

  const key = `${race.course}-${race.off_time}-${race.date}`
  const horseName = String(runner.horse || '').trim()
  const obsId = `${key}--${horseName}`

  const fieldSize = (race.runners || []).length
  const score = runner.finalScore || 0
  const winProb = runner.winProb ?? null

  const isAboveThreshold = pa >= 0.30

  const entry = {
    id: obsId,
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

  const existing = COUNTERFACTUAL_DATABASE.observations.findIndex(o => o.id === obsId)
  if (existing >= 0) {
    COUNTERFACTUAL_DATABASE.observations[existing] = entry
  } else {
    COUNTERFACTUAL_DATABASE.observations.push(entry)
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
      const entry = obs.find(o =>
        normalizeHorseName(o.horse) === rName &&
        normalizeCourse(o.course) === rCourse &&
        o.date === date &&
        o.result === null
      )
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

      logPrediction(race, runner, { confidence: runner.finalScore, estimatedWinProbability: routed.winProb, placeProb: routed.placeProb, grade: runner.selectionQuality?.grade || '', betQuality: runner.betQuality || runner.selectionQuality?.label || '', breakdown: { powerScore: runner.power?.total, paceScore: runner.pace?.score, humanAdj: runner.human?.score, marketAdj: runner.market?.score, runningStyle: runner.runningStyle } })
      storeHistoricalRecord(runner, race, apexResult)
      logActivationZone(runner, race, odds)

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

    const cacheKey = 'racecards:sl'
    const cached = API_CACHE.get(cacheKey)
    if (cached) {
      console.log('[LiveMeetings] Serving from cache')
      LIVE_STATE.racecards = cached
      LIVE_STATE.updatedAt = new Date().toISOString()
      LIVE_STATE.loading = false
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

    // Fetch ATR ratings before scoring so engine can use them
    let atrRatings = {}
    try {
      console.time('[Startup] fetchAtrRatings')
      console.log('[LiveMeetings] Fetching ATR ratings...')
      atrRatings = await retry(() => fetchAtrRatings(today, rawRaces), 2, 2000)
      const atrCount = Object.keys(atrRatings).length
      console.timeEnd('[Startup] fetchAtrRatings')
      console.log(`[LiveMeetings] Got ${atrCount} ATR ratings`)
    } catch (error) {
      console.timeEnd('[Startup] fetchAtrRatings')
      console.error('[LiveMeetings] ATR ratings fetch failed:', error.message)
    }

    console.time('[Startup] processRaces')
    const processed = []

    // Build ATR lookup once, not per race
    const normalizedAtrRatings = {}
    for (const [name, rating] of Object.entries(atrRatings)) {
      normalizedAtrRatings[normalizeHorseName(name)] = rating
    }
    for (const race of rawRaces) {
      race.runners = (race.runners || []).map(runner => {
        const key = normalizeHorseName(runner.horse)
        const rating = normalizedAtrRatings[key]
        if (rating && rating > 0 && (!runner.rpr || runner.rpr === 0)) {
          return { ...runner, rpr: rating }
        }
        return runner
      })
    }

    for (let i = 0; i < rawRaces.length; i++) {
      const race = rawRaces[i]
      try {
        const result = await Promise.race([
          processRace(race),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 25000))
        ])
        processed.push(result)
      } catch (e) {
        console.error(`[processRace] Error ${race.course} ${race.off_time}: ${e.message}`)
      }
      if (i % 5 === 4) {
        const totalRunners = processed.reduce((sum, r) => sum + (r.runners?.length || 0), 0)
        console.log(`[LiveMeetings] ${i + 1}/${rawRaces.length} races processed, ${totalRunners} runners`)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    // Broadcast scored races IMMEDIATELY — don't wait for ATR odds
    console.timeEnd('[Startup] processRaces')
    LIVE_STATE.racecards = processed
    LIVE_STATE.updatedAt = new Date().toISOString()
    LIVE_STATE.loading = false
    API_CACHE.set(cacheKey, processed)
    io.emit('live-update', buildLightweightState())
    console.log(`[LiveMeetings] Broadcasted ${processed.length} races (pre-ATR odds)`)

    // Fetch ATR odds as secondary source (non-blocking with 30s hard timeout)
    try {
      console.log('[LiveMeetings] Fetching ATR odds (background)...')
      const atrRaces = await Promise.race([
        fetchAtrRacecards(today),
        new Promise((_, reject) => setTimeout(() => reject(new Error('ATR odds timeout (30s)')), 30000))
      ])
      if (atrRaces && atrRaces.length > 0) {
        let oddsMerged = 0
        processed.forEach((race) => {
          const atrMatch = atrRaces.find(
            (ar) => normalizeCourse(ar.course) === normalizeCourse(race.course) &&
              String(ar.off_time || '').replace(':', '') === String(race.off_time || '').replace(':', '')
          )
          if (atrMatch && atrMatch.runners) {
            race.runners = (race.runners || []).map((runner) => {
              const atrRunner = atrMatch.runners.find(
                (ar) => normalizeHorseName(ar.horse) === normalizeHorseName(runner.horse)
              )
              if (atrRunner && atrRunner.sp && atrRunner.sp > 0) {
                const slOdds = runner.odds
                const atrOdds = atrRunner.sp
                if (String(slOdds) !== String(atrOdds)) {
                  console.log(`[ODDS] ${runner.horse}: SL=${slOdds} ATR=${atrOdds} → using ATR`)
                  oddsMerged++
                }
                return { ...runner, odds: atrOdds, atrOdds }
              }
              return runner
            })
          }
        })
        console.log(`[LiveMeetings] Merged ${oddsMerged} ATR odds`)
        // Re-broadcast with updated ATR odds
        LIVE_STATE.racecards = processed
    API_CACHE.set(cacheKey, { ...processed, _date: today })
        io.emit('live-update', buildLightweightState())
      }
    } catch (error) {
      console.error('[LiveMeetings] ATR odds fetch failed:', error.message)
    }

    // Persist enriched racecard data for OR/PR gap backfill
    try {
      const enrichedCache = (processed || []).map(race => ({
        race_id: race.race_id,
        course: race.course,
        off_time: race.off_time,
        date: race.date,
        going: race.going || '',
        distance_f: race.distance_f || '',
        race_class: race.race_class || 0,
        surface: race.surface || '',
        runners: (race.runners || []).map(r => ({
          horse: r.horse,
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

function matchResultsToCalibration(races) {
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

    OR_HISTORY = buildORHistory(LEARNING_DATABASE.records || [])
    console.log(`[OR History] Built OR profiles for ${Object.keys(OR_HISTORY).length} horses`)

    const trackBiasPath = path.join(process.cwd(), 'data', 'trackBiasLearning.json')
    saveTrackBiasStore()
    console.log(`[Track Bias] Saved track bias learning data`)

    savePerformanceRatingStore()
    console.log(`[PerfRating] Saved performance rating data`)

    console.log(`[Calibration] Matched ${matched} runners for calibration, saved learning records`)
  }

  // Match results against daily picks so the home tab shows W/P/L
  matchDailyPicksWithResults(races)
  matchCounterfactualWithResults(races)
}

async function fetchResultsForDate(dateStr) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    // Only skip scraping for past dates if we already have data
    // For today, always re-scrape since races finish throughout the day
    if (dateStr !== today) {
      const existingDateRaces = (LEARNING_DATABASE.races || []).filter(r => r.date === dateStr && r.off_time)
      if (existingDateRaces.length >= 10) {
        console.log(`[Results] Already have ${existingDateRaces.length} races for ${dateStr}, skipping scrape`)
        matchResultsToCalibration(existingDateRaces)
        matchCounterfactualWithResults(existingDateRaces)

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
      console.log(`[Results] No results found for ${dateStr}`)
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
    } catch (saveError) {
      console.error(`[Results] Error saving ${dateStr}:`, saveError.message)
      return 0
    }

    // Match all scraped results (new + existing) against predictions for calibration
    const dateRaces = (LEARNING_DATABASE.races || []).filter(r => r.date === dateStr && r.off_time)
    matchResultsToCalibration(dateRaces)

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

async function fetchTodayResults() {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  console.time('[Results] fetchTodayResults')
  await Promise.all([
    fetchResultsForDate(yesterday),
    fetchResultsForDate(today),
  ])
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
    })),
  }))

  return {
    racecards,
    abandoned: LIVE_STATE.abandoned || [],
    updatedAt: LIVE_STATE.updatedAt,
    loading: LIVE_STATE.loading,
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
        (p) =>
          normalizeHorseName(p.horse) === normalizeHorseName(runner.horse) &&
          normalizeCourse(p.course) === normalizeCourse(race.course)
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
  if (existing && existing.picks && !force) {
    return res.json({ saved: false, reason: 'picks already saved for this date' })
  }

  DAILY_PICKS_DATABASE[date] = {
    picks: picks.map((p) => ({
      horse: p.horse,
      course: p.course,
      offTime: p.offTime,
      raceName: p.raceName,
      score: p.score,
      grade: p.grade,
      odds: p.odds,
      form: p.form,
      draw: p.draw,
      result: null,
      position: null,
    })),
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

app.delete('/api/daily-picks/:date', (req, res) => {
  const { date } = req.params
  if (!date) return res.status(400).json({ error: 'Date required' })
  delete DAILY_PICKS_DATABASE[date]
  saveDatabase(DAILY_PICKS_PATH, DAILY_PICKS_DATABASE)
  pgSaveDebounced('daily-picks', DAILY_PICKS_DATABASE)
  res.json({ deleted: true, date })
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
  res.json(LEARNING_DATABASE.races || [])
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
        
        // Save to Horse Memory SQLite Database - TEMPORARILY DISABLED
        // if (HORSE_MEMORY_DB && runner.horse) {
        //   saveHorseRun(HORSE_MEMORY_DB, {
        //     horse_name: runner.horse,
        //     horse_id: horseId,
        //     race_date: race.date || new Date().toISOString().split('T')[0],
        //     course: race.course || '',
        //     distance: raceDist,
        //     going: raceGoing,
        //     or_rating: runner.or || runner.ofr || 0,
        //     rpr_rating: runner.rpr || 0,
        //     finish_position: normalizePosition(runner.position) || 0,
        //     starting_price: resolveOdds(runner),
        //     race_class: race.race_class || race.class || '',
        //     field_size: race.field_size || race.fieldSize || runners.length,
        //     trainer: runner.trainer || '',
        //     jockey: runner.jockey || '',
        //   }).then(saved => {
        //     if (!saved) {
        //       console.error('[Horse Memory] Failed to save run for', runner.horse)
        //     }
        //   })
        // }
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
      const wp = (r.winProb || 0) * 100
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
            const wp = (r.winProb || 0) * 100
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
app.get('/api/pa-gate-monitor', (_req, res) => {
  try {
    const db = PREDICTIONS_DATABASE || {}
    const races = LEARNING_DATABASE.races || []
    const resultMap = {}
    for (const race of races) {
      if (!race.runners) continue
      for (const r of race.runners) {
        const key = `${race.course}|${race.off_time}|${race.date}|${(r.horse||'').toLowerCase()}`
        resultMap[key] = r.position
      }
    }

    // Last 3 days only
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const cutoff = threeDaysAgo.toISOString().slice(0, 10)

    let passed = 0, passedWins = 0, passedPL = 0
    let paRejected = 0, paRejectedWins = 0, paRejectedPL = 0
    let otherRejected = 0, otherRejectedWins = 0, otherRejectedPL = 0

    // Contender monitor — all predictions split by PA sign
    let contenderPaPos = 0, contenderPaPosWins = 0
    let contenderPaNonPos = 0, contenderPaNonPosWins = 0

    // Bettable monitor — value-qualified bets split by PA gate
    let bettablePassed = 0, bettablePassedWins = 0, bettablePassedPL = 0
    let bettableRejected = 0, bettableRejectedWins = 0, bettableRejectedPL = 0

    // Calibration by PA band
    const calBands = [
      { label: '<=0', min: -Infinity, max: 0, count: 0, wins: 0, sumPred: 0 },
      { label: '0-2', min: 0, max: 2, count: 0, wins: 0, sumPred: 0 },
      { label: '2-5', min: 2, max: 5, count: 0, wins: 0, sumPred: 0 },
      { label: '5+', min: 5, max: Infinity, count: 0, wins: 0, sumPred: 0 },
    ]

    // PA band performance — bettable selections only
    const isBettableBypass = (p) => {
      const bq = p.betQuality || ''
      if (bq === 'NO BET' || bq === 'WEAK_COMPAT' || bq === 'BORDERLINE') return false
      return bq === 'STRONG VALUE' || bq === 'VALUE' || bq === 'PLAYABLE' || bq === 'SPECULATIVE'
    }
    const paPerfBands = [
      { label: '0-2', min: 0, max: 2 },
      { label: '2-5', min: 2, max: 5 },
      { label: '5+', min: 5, max: Infinity },
    ]
    const allTime = paPerfBands.map(b => ({ ...b, count: 0, wins: 0, stakes: 0, returns: 0, sumOdds: 0, sumEdge: 0 }))
    const threeDay = paPerfBands.map(b => ({ ...b, count: 0, wins: 0, stakes: 0, returns: 0, sumOdds: 0, sumEdge: 0 }))
    const isBettable = (p) => {
      const bq = p.betQuality || ''
      if (bq === 'NO BET' || bq === 'WEAK_COMPAT') return false
      const wp = (p.estimatedWinProbability ?? p.predictedWinProb ?? 0) / 100
      if (wp < 0.06) return false
      if (Number(p.odds || 0) < 2.0) return false
      const impliedProb = 1 / Number(p.odds || 2)
      const edge = wp - impliedProb
      if (edge <= 0) return false
      return true
    }

    for (const racePreds of Object.values(db)) {
      if (!Array.isArray(racePreds)) continue
      for (const p of racePreds) {
        if (!p.date) continue
        const key = `${p.course}|${p.offTime}|${p.date}|${(p.horse||'').toLowerCase()}`
        const pos = resultMap[key]
        if (!pos) continue
        const won = pos === 1
        const odds = p.odds || 2
        const pl = won ? (odds - 1) : -1
        const pa = p.personalAffinity
        const wp = (p.estimatedWinProbability ?? p.predictedWinProb ?? 0) / 100
        const impliedProb = 1 / Number(odds || 2)
        const valEdge = wp - impliedProb
        const isRecent = p.date >= cutoff

        // Original gate classification (3-day window only)
        if (isRecent) {
          if (p.betQuality && p.betQuality !== 'NO BET') {
            passed++; if (won) passedWins++; passedPL += pl
          } else if (pa !== null && pa <= 0) {
            paRejected++; if (won) paRejectedWins++; paRejectedPL += pl
          } else {
            otherRejected++; if (won) otherRejectedWins++; otherRejectedPL += pl
          }
        }

        // Contender monitor — all predictions by PA sign (3-day only)
        if (isRecent) {
          if (pa !== null && pa > 0) {
            contenderPaPos++; if (won) contenderPaPosWins++
          } else if (pa !== null) {
            contenderPaNonPos++; if (won) contenderPaNonPosWins++
          }
        }

        // Bettable monitor — value-qualified bets only (3-day only)
        if (isRecent && isBettable(p)) {
          if (pa !== null && pa > 0) {
            bettablePassed++; if (won) bettablePassedWins++; bettablePassedPL += pl
          } else {
            bettableRejected++; if (won) bettableRejectedWins++; bettableRejectedPL += pl
          }
        }

        // Calibration by PA band — all predictions with results (all-time)
        if (pa !== null && wp > 0) {
          for (const band of calBands) {
            if (pa > band.min && pa <= band.max) {
              band.count++; if (won) band.wins++; band.sumPred += wp
              break
            }
          }
        }

        // PA band performance — bettable selections only (both all-time and 3-day)
        if (isBettableBypass(p) && pa !== null && pa > 0) {
          for (let i = 0; i < paPerfBands.length; i++) {
            const b = paPerfBands[i]
            if (pa > b.min && pa <= b.max) {
              // All-time
              allTime[i].count++
              allTime[i].stakes++
              allTime[i].returns += won ? odds : 0
              allTime[i].sumOdds += odds
              if (won) allTime[i].wins++
              if (valEdge > 0) allTime[i].sumEdge += valEdge
              // 3-day
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

    const calibration = calBands.map(b => ({
      band: b.label,
      count: b.count,
      avgPred: b.count ? +(b.sumPred / b.count * 100).toFixed(1) : 0,
      actualWR: b.count ? +(b.wins / b.count * 100).toFixed(1) : 0,
      error: b.count ? +((b.wins / b.count - b.sumPred / b.count) * 100).toFixed(1) : 0,
    }))

    res.json({
      passed: { count: passed, wins: passedWins, roi: passed ? +(passedPL / passed * 100).toFixed(1) : 0 },
      paRejected: { count: paRejected, wins: paRejectedWins, roi: paRejected ? +(paRejectedPL / paRejected * 100).toFixed(1) : 0 },
      otherRejected: { count: otherRejected, wins: otherRejectedWins, roi: otherRejected ? +(otherRejectedPL / otherRejected * 100).toFixed(1) : 0 },
      contender: {
        paPositive: { count: contenderPaPos, wins: contenderPaPosWins, wr: contenderPaPos ? +(contenderPaPosWins / contenderPaPos * 100).toFixed(1) : 0 },
        paNonPositive: { count: contenderPaNonPos, wins: contenderPaNonPosWins, wr: contenderPaNonPos ? +(contenderPaNonPosWins / contenderPaNonPos * 100).toFixed(1) : 0 },
      },
      bettable: {
        passed: { count: bettablePassed, wins: bettablePassedWins, roi: bettablePassed ? +(bettablePassedPL / bettablePassed * 100).toFixed(1) : 0 },
        rejected: { count: bettableRejected, wins: bettableRejectedWins, roi: bettableRejected ? +(bettableRejectedPL / bettableRejected * 100).toFixed(1) : 0 },
      },
      calibration,
      paBandPerformance: {
        allTime: allTime.map(b => ({
          band: b.label,
          count: b.count,
          wins: b.wins,
          stakes: b.stakes,
          returns: +b.returns.toFixed(2),
          wr: b.count ? +(b.wins / b.count * 100).toFixed(1) : 0,
          roi: b.stakes ? +((b.returns - b.stakes) / b.stakes * 100).toFixed(1) : 0,
          avgOdds: b.count ? +(b.sumOdds / b.count).toFixed(2) : 0,
          avgEdge: b.count ? +(b.sumEdge / b.count * 100).toFixed(1) : 0,
        })),
        threeDay: threeDay.map(b => ({
          band: b.label,
          count: b.count,
          wins: b.wins,
          stakes: b.stakes,
          returns: +b.returns.toFixed(2),
          wr: b.count ? +(b.wins / b.count * 100).toFixed(1) : 0,
          roi: b.stakes ? +((b.returns - b.stakes) / b.stakes * 100).toFixed(1) : 0,
          avgOdds: b.count ? +(b.sumOdds / b.count).toFixed(2) : 0,
          avgEdge: b.count ? +(b.sumEdge / b.count * 100).toFixed(1) : 0,
        })),
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
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
        const key = `${race.course}|${race.off_time}|${race.date}|${(r.horse||'').toLowerCase()}`
        resultMap[key] = r.position
      }
    }

    const selections = []
    for (const racePreds of Object.values(db)) {
      if (!Array.isArray(racePreds)) continue
      for (const p of racePreds) {
        const key = `${p.course}|${p.offTime}|${p.date}|${(p.horse||'').toLowerCase()}`
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
    const pgReady = await initPgStore()
    if (pgReady) {
      await initAffinityStore()

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
  // Fetch today's data on startup
  // Results scraping must wait until fetchLiveMeetings (racecards + ATR) fully completes
  // to avoid two browser processes competing for memory on Railway
  fetchLiveMeetings().then(() => {
    console.log('[Startup] Racecards complete, scheduling results fetch in 5s...')
    setTimeout(() => fetchTodayResults(), 5000)
  })

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

  // Schedule daily racecard fetch at 8am UK time
  function scheduleNext8am() {
    const now = new Date()
    const ukNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }))
    const target = new Date(ukNow)
    target.setHours(8, 0, 0, 0)
    if (target <= ukNow) target.setDate(target.getDate() + 1)
    const msUntil = target.getTime() - ukNow.getTime()
    console.log(`[Scheduler] Next racecard fetch in ${(msUntil / 3600000).toFixed(1)}h`)
    setTimeout(async () => {
      console.log('[Scheduler] 8am racecard fetch triggered')
      try {
        const races = await fetchLiveMeetings()
        console.log(`[Scheduler] Fetched ${Array.isArray(races) ? races.length : '?'} races`)
      } catch (e) {
        console.error('[Scheduler] Fetch failed:', e.message)
      }
      scheduleNext8am()
    }, msUntil)
  }
  scheduleNext8am()

  // Re-scrape today's results every 30 min to pick up newly finished races
  setInterval(async () => {
    const today = new Date().toISOString().split('T')[0]
    try {
      console.log('[Scheduler] Periodic results refresh for', today)
      await fetchResultsForDate(today)
    } catch (e) {
      console.error('[Scheduler] Results refresh failed:', e.message)
    }
  }, 30 * 60 * 1000)

  // Refresh racecards every 15 min to pick up odds changes and non-runners
  setInterval(async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const cacheKey = 'racecards:sl'
      const cached = API_CACHE.get(cacheKey)
      if (cached && cached._date === today) {
        console.log('[Scheduler] Skipping refresh — today\'s races already processed')
        return
      }
      console.log('[Scheduler] Periodic racecard refresh')
      await fetchLiveMeetings()
    } catch (e) {
      console.error('[Scheduler] Racecard refresh failed:', e.message)
    }
  }, 15 * 60 * 1000)
})

function gracefulShutdown(signal) {
  console.log(`[Shutdown] ${signal} received, closing databases...`)
  Promise.all([
    closeBrowser(),
    // HORSE_MEMORY_DB ? closeHorseDb(HORSE_MEMORY_DB) : Promise.resolve(), // TEMPORARILY DISABLED
  ]).then(() => {
    console.log('[Shutdown] All databases and browser closed')
    process.exit(0)
  }).catch(() => {
    process.exit(1)
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))