import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import http from 'http'

import { Server } from 'socket.io'

import { generateConfidence } from './src/lib/confidenceEngine.js'
import { generateSignals } from './src/lib/signalEngine.js'
import { analyzeMarketMovement } from './src/lib/marketEngine.js'
import { runApexEngine } from './src/lib/apexEngine.js'
import { storeRunnerSnapshot, getSnapshotsByRace, getSnapshotsByHorse, getSnapshotsByVerdict, getSnapshotsByDateRange, getSnapshotStats } from './src/lib/historicalSnapshotStore.js'
import { recordRun, getConditionDBStats, getHorseProfile, matchConditions } from './src/lib/conditionDB.js'
import { fetchNonRunners } from './src/lib/nonRunnerScraper.js'
import { fetchATRResults } from './src/lib/atrResultsScraper.js'
import { REPLAY_TAG_LIBRARY, TAG_TO_CATEGORY, generateAutoSummary, computeWatchlistPriority, getRecommendedConditions, getAvoidTags, extractTagsFromNotes } from './src/lib/replayTagLibrary.js'
import { getCourseProfile } from './src/lib/courseProfiles.js'
import { buildHorseProfile, computeProfileAdjustment } from './src/lib/horseProfileEngine.js'

import {
  analyzeHistoricalPerformance,
  buildLearningRecord,
  learnFromResults,
  learnFromBuckets,
} from './src/lib/learningEngine.js'

import { ingestRaceResults } from './src/lib/resultEngine.js'
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

const PORT = process.env.PORT || 3000

const MIN_CONFIDENCE = 75
const VALID_MOVEMENTS = ['STEAMER', 'STRONG_STEAMER']

const HORSE_DB_PATH = path.join(process.cwd(), 'data', 'horses.json')
const MARKET_DB_PATH = path.join(process.cwd(), 'data', 'market.json')
const ALERT_DB_PATH = path.join(process.cwd(), 'data', 'alerts.json')
const LEARNING_DB_PATH = path.join(process.cwd(), 'data', 'learning.json')
const PREDICTIONS_DB_PATH = path.join(process.cwd(), 'data', 'predictions.json')
const DAILY_PICKS_PATH = path.join(process.cwd(), 'data', 'daily-picks.json')
const REPLAY_NOTES_PATH = path.join(process.cwd(), 'data', 'replay-notes.json')
const NON_RUNNER_PATH = path.join(process.cwd(), 'data', 'non-runners.json')
const GOING_DB_PATH = path.join(process.cwd(), 'data', 'going-database.json')
const DISTANCE_DB_PATH = path.join(process.cwd(), 'data', 'distance-database.json')
const BUCKET_DB_PATH = path.join(process.cwd(), 'data', 'context-buckets.json')
const CALIBRATION_DB_PATH = path.join(process.cwd(), 'data', 'calibration.json')
const TRAINER_FORM_PATH = path.join(process.cwd(), 'data', 'trainer-form.json')
const JOCKEY_FORM_PATH = path.join(process.cwd(), 'data', 'jockey-form.json')

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

const HORSE_DATABASE = loadDatabase(HORSE_DB_PATH)
const MARKET_DATABASE = loadDatabase(MARKET_DB_PATH)
const ALERT_DATABASE = loadDatabase(ALERT_DB_PATH)
const PREDICTIONS_DATABASE = loadDatabase(PREDICTIONS_DB_PATH)
const GOING_DATABASE = loadDatabase(GOING_DB_PATH)
const DISTANCE_DATABASE = loadDatabase(DISTANCE_DB_PATH)
const BUCKET_DATABASE = loadDatabase(BUCKET_DB_PATH)

const LEARNING_DATABASE = loadDatabase(LEARNING_DB_PATH)
const learningLoaded = LEARNING_DATABASE?.records?.length > 0 || LEARNING_DATABASE?.races?.length > 0
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
const NON_RUNNER_DATABASE = loadDatabase(NON_RUNNER_PATH)

const TRAINER_FORM_DATABASE = loadDatabase(TRAINER_FORM_PATH) || {}
const JOCKEY_FORM_DATABASE = loadDatabase(JOCKEY_FORM_PATH) || {}

const LIVE_STATE = {
  racecards: [],
  nonRunners: [],
  updatedAt: null,
  loading: true,
}

const ATR_LINK_CACHE = new Map()
const ATR_REQUEST_QUEUE = []
let ATR_PROCESSING = false
const ATR_REQUEST_DELAY = 2000

function queueAtrRequest(fn) {
  return new Promise((resolve) => {
    ATR_REQUEST_QUEUE.push({ fn, resolve })
    if (!ATR_PROCESSING) processAtrQueue()
  })
}

async function processAtrQueue() {
  if (ATR_REQUEST_QUEUE.length === 0) {
    ATR_PROCESSING = false
    return
  }
  ATR_PROCESSING = true
  const { fn, resolve } = ATR_REQUEST_QUEUE.shift()
  try {
    const result = await fn()
    resolve(result)
  } catch (e) {
    resolve(null)
  }
  await new Promise(r => setTimeout(r, ATR_REQUEST_DELAY))
  processAtrQueue()
}

function findPredictionForRunner(race, runner) {
  const course = String(race.course || '').trim()
  const date = String(race.date || '')
  const raceKey = `${course}-${date}`
  const horseName = String(runner.horse || '').trim()

  const candidates = Object.entries(PREDICTIONS_DATABASE)
    .filter(([key]) => key.includes(raceKey))
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
    breakdown: aiProfile.breakdown || null,
    timestamp: new Date().toISOString(),
  }

  if (existingIndex >= 0) {
    PREDICTIONS_DATABASE[raceId][existingIndex] = prediction
  } else {
    PREDICTIONS_DATABASE[raceId].push(prediction)
  }
}

function formatAtrRacecardDate(date = '') {
  const parsedDate = new Date(`${date}T00:00:00`)

  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }

  const day = String(parsedDate.getDate()).padStart(2, '0')
  const month = parsedDate.toLocaleString('en-GB', {
    month: 'long',
  })
  const year = parsedDate.getFullYear()

  return `${day}-${month}-${year}`
}

function buildAtrRacecardUrl(race = {}) {
  const course = String(race.course || '')
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/\s+/g, '-')
  const date = formatAtrRacecardDate(race.date)
  const offDateTime =
    String(race.off_dt || '').match(/T(\d{2}):(\d{2})/)
  const offTime = offDateTime
    ? `${offDateTime[1]}${offDateTime[2]}`
    : String(race.off_time || '').replace(':', '')

  if (!course || !date || !offTime) {
    return null
  }

  return `https://m.attheraces.com/racecard/${course}/${date}/${offTime}`
}

function toAtrPopupUrl(href = '') {
  const fullUrl = href.startsWith('http')
    ? href
    : `https://www.attheraces.com${href}`

  return fullUrl
    .replace('https://m.attheraces.com', 'https://www.attheraces.com')
    .replace('/form/horse/', '/form-popup/horse/')
}

const ATR_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
  'cache-control': 'no-cache',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
}

async function fetchAtrPageText(url) {
  try {
    const response = await fetch(url, {
      headers: ATR_HEADERS,
      referrerPolicy: 'no-referrer-when-downgrade',
    })
    if (!response.ok) {
      return null
    }
    return await response.text()
  } catch {
    return null
  }
}

function extractHorseLinks(html) {
  const links = {}
  for (const match of html.matchAll(/href="([^"]*\/form\/horse\/([^"]+))"/g)) {
    const href = match[1]
    const parts = href.split('?')[0].split('/')
    const horseSlug = parts[parts.indexOf('horse') + 1]
    const horseName = horseSlug.replace(/-/g, ' ')
    const normalized = normalizeHorseName(horseName)
    if (normalized && !links[normalized]) {
      links[normalized] = toAtrPopupUrl(href)
    }
  }
  return links
}

function extractBestOdds(html) {
  const odds = {}

  for (const match of html.matchAll(/<div[^>]*id="row-(\d+)"[^>]*data-bestprice="([\d.]+)"[^>]*>/g)) {
    const price = parseFloat(match[2])
    if (price <= 1) continue

    const rowStart = match.index
    const rowEnd = Math.min(rowStart + 2000, html.length)
    const rowHtml = html.substring(rowStart, rowEnd)
    const cellMatch = rowHtml.match(/id="([A-Z][A-Za-z0-9]+)-\d+"/)
    if (cellMatch) {
      const normalized = normalizeHorseName(cellMatch[1])
      if (!odds[normalized]) {
        odds[normalized] = price
      }
    }
  }

  if (Object.keys(odds).length === 0) {
    for (const match of html.matchAll(/id="([A-Z][A-Za-z0-9]+)-\d+"[^>]*data-dp="([\d.]+)"/g)) {
      const price = parseFloat(match[2])
      const normalized = normalizeHorseName(match[1])
      if (price > 1 && !odds[normalized]) {
        odds[normalized] = price
      }
    }
  }

  return odds
}

async function fetchAtrRacecardData(race = {}) {
  const region = (race.region || '').toUpperCase()
  if (region !== 'GB' && region !== 'IRE') {
    return { links: {}, odds: {} }
  }

  const mobileUrl = buildAtrRacecardUrl(race)

  if (!mobileUrl) {
    return { links: {}, odds: {} }
  }

  const cached = ATR_LINK_CACHE.get(mobileUrl)

  if (cached) {
    return cached
  }

  return queueAtrRequest(async () => {
    const links = {}
    const odds = {}

    try {
      const mobileHtml = await fetchAtrPageText(mobileUrl)

      if (mobileHtml) {
        Object.assign(links, extractHorseLinks(mobileHtml))
      }

      const desktopUrl = mobileUrl.replace('m.attheraces.com', 'www.attheraces.com')
      const desktopHtml = await fetchAtrPageText(desktopUrl)

      if (desktopHtml) {
        Object.assign(odds, extractBestOdds(desktopHtml))

        if (Object.keys(links).length === 0) {
          Object.assign(links, extractHorseLinks(desktopHtml))
        }
      }

      if (Object.keys(odds).length > 0) {
        console.log(`[ATR ODDS] ${Object.keys(odds).length} odds found for ${mobileUrl}`)
      }

      const result = { links, odds }
      ATR_LINK_CACHE.set(mobileUrl, result)

      return result
    } catch (error) {
      console.error('Failed to fetch ATR racecard data:', error.message)
      return { links: {}, odds: {} }
    }
  })
}

async function fetchAtrHorseLinks(race = {}) {
  const data = await fetchAtrRacecardData(race)
  return data.links
}

function buildAtrResultsUrl(race = {}) {
  const url = buildAtrRacecardUrl(race)
  if (!url) return null
  return url.replace('/racecard/', '/race/')
}

function extractRacePositionsFromHtml(html, race) {
  const knownNames = new Map()
  ;(race.runners || []).forEach((r) => {
    const n = normalizeHorseName(r.horse)
    if (n) knownNames.set(n, r.horse)
  })

  const seen = new Set()
  const ordered = []

  for (const match of html.matchAll(/href="([^"]*\/form\/horse\/([^"]+))"/g)) {
    const name = decodeURIComponent(match[2].replace(/-/g, ' '))
    const normalized = normalizeHorseName(name)
    if (!normalized || seen.has(normalized)) continue
    if (!knownNames.has(normalized)) continue
    seen.add(normalized)

    const ctxStart = Math.max(0, match.index - 100)
    const ctxEnd = Math.min(html.length, match.index + 100)
    const ctx = html.substring(ctxStart, ctxEnd)
    let sp = 0
    const spMatch = ctx.match(/(\d+)\/(\d+)/)
    if (spMatch) sp = parseInt(spMatch[1], 10) / parseInt(spMatch[2], 10) + 1

    ordered.push({ normalized, name: knownNames.get(normalized), sp })
  }

  return ordered.map((r, i) => ({ ...r, position: i + 1 }))
}

async function scrapeAtrResultForRace(race) {
  const url = buildAtrResultsUrl(race)
  if (!url) return null

  return queueAtrRequest(async () => {
    try {
      const html = await fetchAtrPageText(url)
      if (!html || html.length < 1000) return null
      const positions = extractRacePositionsFromHtml(html, race)
      if (positions.length === 0) {
        const desktopUrl = url.replace('m.attheraces.com', 'www.attheraces.com')
        const desktopHtml = await fetchAtrPageText(desktopUrl)
        if (desktopHtml && desktopHtml.length >= 1000) {
          const desktopPositions = extractRacePositionsFromHtml(desktopHtml, race)
          return desktopPositions.length > 0 ? desktopPositions : null
        }
        return null
      }
      return positions
    } catch {
      return null
    }
  })
}

async function scrapeFinishedRaceResults() {
  const races = LIVE_STATE.racecards || []
  const now = new Date()

  const finished = races.filter((race) => {
    const region = (race.region || '').toUpperCase()
    if (region !== 'GB' && region !== 'IRE') return false
    const offDt = race.off_dt || ''
    if (!offDt) return false
    const raceTime = new Date(offDt)
    if (isNaN(raceTime.getTime())) return false
    return raceTime < now
  })

  if (finished.length === 0) return

  let scrapedCount = 0
  const resultRaces = []

  for (const race of finished) {
    const alreadyStored = (LEARNING_DATABASE.races || []).some(
      (r) => r.course === race.course && r.off_time === race.off_time && r.date === race.date
    )
    if (alreadyStored) continue

    await new Promise(r => setTimeout(r, ATR_REQUEST_DELAY))
    const positions = await scrapeAtrResultForRace(race)
    if (!positions) continue

    const sortedRunners = [...(race.runners || [])]
    const resultRunners = sortedRunners.map((runner) => {
      const normalized = normalizeHorseName(runner.horse)
      const found = positions.find((p) => p.normalized === normalized)
      return { ...runner, position: found ? found.position : 0, sp: found?.sp || runner.odds || 0 }
    })

    const winningOdds = positions.find((p) => p.position === 1)?.sp || 0
    console.log(`[ATR RESULTS] ${race.course} ${race.off_time} — ${positions.length} positions, SP ${winningOdds.toFixed(2)}`)

    resultRaces.push({ ...race, runners: resultRunners })
    scrapedCount++
  }

  if (resultRaces.length === 0) return
  await processScrapedResults(resultRaces)
}

async function processScrapedResults(resultRaces) {
  const existingCount = LEARNING_DATABASE.records.length

  resultRaces.forEach((race) => {
    const runners = race.runners || []
    runners.forEach((runner) => {
      const pos = Number(runner.position || 0)
      if (pos < 1) return
      const prediction = findPredictionForRunner(race, runner)
      LEARNING_DATABASE.records.push({
        horse: runner.horse,
        course: race.course,
        offTime: race.off_time,
        position: pos,
        won: pos === 1,
        spOdds: resolveOdds(runner),
        aiConfidence: prediction?.confidence || runner.finalScore || 0,
        signal: 'ATR_SCRAPE',
        marketMovement: 'N/A',
        timestamp: new Date().toISOString(),
        resultProcessed: true,
        breakdown: prediction?.breakdown || null,
        weights: prediction?.weights || null,
      })
    })
  })

  LEARNING_DATABASE.races = [...(LEARNING_DATABASE.races || []), ...resultRaces]

  if (LEARNING_DATABASE.records.length > existingCount) {
    LEARNING_DATABASE.analytics = analyzeHistoricalPerformance(LEARNING_DATABASE.records)

    const rawLearning = learnFromResults(LEARNING_DATABASE.records, LEARNING_DATABASE.weights || {})
    if (rawLearning.adjusted) {
      const protectedResult = applyProtectedAdjustment(
        LEARNING_DATABASE.weights?.multiplier || {},
        rawLearning.weights.multiplier || {},
        LEARNING_DATABASE.records
      )
      if (protectedResult.adjusted) {
        LEARNING_DATABASE.weights = { multiplier: protectedResult.weights }
        LEARNING_DATABASE.lastLearningRun = {
          date: new Date().toISOString(),
          totalRecords: rawLearning.totalRecords,
          winners: rawLearning.winners,
          analysis: rawLearning.analysis,
          protected: true,
          learningRate: protectedResult.learningRate,
          outliersSuppressed: protectedResult.outliersSuppressed,
        }
      }
    }

    saveDatabase(LEARNING_DB_PATH, LEARNING_DATABASE)
    matchDailyPicksWithResults(resultRaces)
    saveDatabase(DAILY_PICKS_PATH, DAILY_PICKS_DATABASE)

    // Update trainer/jockey form tracking
    resultRaces.forEach((race) => {
      const runners = race.runners || []
      runners.forEach((runner) => {
        const pos = Number(runner.position || 0)
        if (pos < 1) return

        const trainer = runner.trainer || race.trainer
        const jockey = runner.jockey

        if (trainer) {
          if (!TRAINER_FORM_DATABASE[trainer]) TRAINER_FORM_DATABASE[trainer] = { runs: 0, wins: 0, places: 0, last10: [] }
          const tf = TRAINER_FORM_DATABASE[trainer]
          tf.runs++
          if (pos === 1) tf.wins++
          if (pos >= 2 && pos <= 4) tf.places++
          tf.last10.push(pos === 1 ? 1 : 0)
          if (tf.last10.length > 20) tf.last10.shift()
        }

        if (jockey) {
          if (!JOCKEY_FORM_DATABASE[jockey]) JOCKEY_FORM_DATABASE[jockey] = { runs: 0, wins: 0, places: 0, last10: [] }
          const jf = JOCKEY_FORM_DATABASE[jockey]
          jf.runs++
          if (pos === 1) jf.wins++
          if (pos >= 2 && pos <= 4) jf.places++
          jf.last10.push(pos === 1 ? 1 : 0)
          if (jf.last10.length > 20) jf.last10.shift()
        }
      })
    })

    saveDatabase(TRAINER_FORM_PATH, TRAINER_FORM_DATABASE)
    saveDatabase(JOCKEY_FORM_PATH, JOCKEY_FORM_DATABASE)

    resultRaces.forEach((race) => {
      const runners = race.runners || []
      const raceGoing = race.going || ''
      const raceSurface = race.surface || ''
      const raceDist = race.distance_f || ''
      runners.forEach((runner) => {
        const horseId = runner.horse_id || runner.horse
        const position = Number(runner.position || 0)
        if (!horseId || position < 1) return

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
          dProf.performances.push({ distance: distVal, won: position === 1, placed: position >= 2 && position <= 4, date: new Date().toISOString() })
        }
      })
    })

    saveDatabase(GOING_DB_PATH, GOING_DATABASE)
    saveDatabase(DISTANCE_DB_PATH, DISTANCE_DATABASE)

    console.log(`[ATR RESULTS] Stored ${resultRaces.length} races (${LEARNING_DATABASE.records.length - existingCount} records)`)
  }
}

function createAlert(
  horseId,
  horse,
  type,
  message,
  severity = 'MEDIUM'
) {
  if (!ALERT_DATABASE[horseId]) {
    ALERT_DATABASE[horseId] = []
  }

  const alert = {
    horse,
    type,
    message,
    severity,
    timestamp: new Date().toISOString(),
  }

  ALERT_DATABASE[horseId].unshift(alert)

  ALERT_DATABASE[horseId] = ALERT_DATABASE[horseId].slice(0, 50)

  io.emit('new-alert', alert)
}

async function scrapeTimeformRacecards(dateStr) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
  }
  const url = `https://www.timeform.com/horse-racing/racecards?meetingDate=${dateStr}`

  try {
    const res = await fetch(url, { headers, timeout: 30000, redirect: 'follow' })
    if (!res.ok) return []
    const html = await res.text()
    if (html.length < 5000) return []

    const races = []
    const meetingHeaders = [...html.matchAll(/<div[^>]*class="w-racecard-grid-meeting-header[^"]*"[^>]*data-course-id="(\d+)"[^>]*>/gi)]

    for (const header of meetingHeaders) {
      const courseId = header[1]
      const blockStart = header.index
      const blockEnd = Math.min(html.length, blockStart + 50000)
      const block = html.substring(blockStart, blockEnd)

      const courseMatch = block.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i)
      if (!courseMatch) continue
      const course = courseMatch[1].trim()

      const goingMatch = block.match(/<i>Going<\/i><b>([^<]+)<\/b>/i)
      const going = goingMatch ? goingMatch[1].trim() : ''

      const raceLinks = [...block.matchAll(/href="\/horse-racing\/racecards\/([^"]*\/(\d{4})-(\d{2})-(\d{2})\/(\d{4})\/(\d+)\/(\d+)\/[^"]*)"[^>]*>([^<]+)<\/a>/gi)]

      for (const rl of raceLinks) {
        const raceUrl = rl[1]
        const raceTime = rl[5]
        const raceId = rl[7]
        const raceName = rl[8].trim()

        const formattedTime = `${raceTime.slice(0, 2)}:${raceTime.slice(2)}`
        const raceDate = `${rl[2]}-${rl[3]}-${rl[4]}`

        races.push({
          race_id: `${course}-${formattedTime}-${raceId}`,
          race_name: `${course} ${formattedTime}`,
          course,
          off_time: formattedTime,
          date: raceDate,
          region: course.toLowerCase().includes('(ire)') ? 'IRE' : 'GB',
          going,
          _timeformUrl: `https://www.timeform.com/horse-racing/racecards/${raceUrl}`,
          runners: [],
        })
      }
    }

    return races
  } catch (e) {
    console.log(`[TIMEFORM] Failed to scrape racecards for ${dateStr}: ${e.message}`)
    return []
  }
}

async function scrapeTimeformRaceDetails(race) {
  if (!race._timeformUrl) return null

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
  }

  try {
    const res = await fetch(race._timeformUrl, { headers, timeout: 30000, redirect: 'follow' })
    if (!res.ok) return null
    const html = await res.text()
    if (html.length < 5000) return null

    const horseRegex = /href="\/horse-racing\/horse\/form\/([^"]*)"[^>]*>([^<]+)<\/a>/gi
    const seen = new Set()
    const runners = []
    let match

    while ((match = horseRegex.exec(html)) !== null) {
      const slug = match[1]
      const name = match[2].trim()
      if (!name || seen.has(name)) continue
      seen.add(name)

      const idMatch = slug.match(/\/(\d{12,})\//)
      const horseId = idMatch ? idMatch[1] : name

      runners.push({
        horse: name,
        horse_id: horseId,
        odds: '',
        position: 0,
        _timeformSlug: slug,
      })
    }

    return runners
  } catch (e) {
    console.log(`[TIMEFORM] Failed to scrape race details for ${race.course} ${race.off_time}: ${e.message}`)
    return null
  }
}

async function scrapeTimeformResults(dateStr) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
  }
  const url = `https://www.timeform.com/horse-racing/results?meetingDate=${dateStr}`

  try {
    const res = await fetch(url, { headers, timeout: 30000, redirect: 'follow' })
    if (!res.ok) return []
    const html = await res.text()
    if (html.length < 5000) return []

    const races = []
    const meetingHeaders = [...html.matchAll(/<div[^>]*class="w-racecard-grid-meeting-header[^"]*"[^>]*data-course-id="(\d+)"[^>]*>/gi)]

    for (const header of meetingHeaders) {
      const blockStart = header.index
      const blockEnd = Math.min(html.length, blockStart + 50000)
      const block = html.substring(blockStart, blockEnd)

      const courseMatch = block.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i)
      if (!courseMatch) continue
      const course = courseMatch[1].trim()

      const raceLinks = [...block.matchAll(/href="\/horse-racing\/results\/([^"]*\/(\d{4})-(\d{2})-(\d{2})\/(\d{4})\/(\d+)\/(\d+)\/[^"]*)"[^>]*>([^<]+)<\/a>/gi)]

      for (const rl of raceLinks) {
        const raceUrl = rl[1]
        const raceTime = rl[5]
        const raceId = rl[7]
        const raceName = rl[8].trim()

        const formattedTime = `${raceTime.slice(0, 2)}:${raceTime.slice(2)}`
        const raceDate = `${rl[2]}-${rl[3]}-${rl[4]}`

        races.push({
          race_id: `${course}-${formattedTime}-${raceId}`,
          race_name: `${course} ${formattedTime}`,
          course,
          off_time: formattedTime,
          date: raceDate,
          region: course.toLowerCase().includes('(ire)') ? 'IRE' : 'GB',
          _timeformUrl: `https://www.timeform.com/horse-racing/results/${raceUrl}`,
          runners: [],
        })
      }
    }

    return races
  } catch (e) {
    console.log(`[TIMEFORM] Failed to scrape results for ${dateStr}: ${e.message}`)
    return []
  }
}

async function scrapeTimeformRaceResults(race) {
  if (!race._timeformUrl) return null

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
  }

  try {
    const res = await fetch(race._timeformUrl, { headers, timeout: 30000, redirect: 'follow' })
    if (!res.ok) return null
    const html = await res.text()
    if (html.length < 5000) return null

    const positions = []
    const horseRegex = /href="\/horse-racing\/horse\/form\/([^"]*)"[^>]*>([^<]+)<\/a>/gi
    const seen = new Set()
    let pos = 0
    let match

    while ((match = horseRegex.exec(html)) !== null) {
      const name = match[2].trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      pos++

      const normalized = normalizeHorseName(name)
      positions.push({ normalized, name, position: pos })
    }

    return positions.length > 0 ? positions : null
  } catch (e) {
    console.log(`[TIMEFORM] Failed to scrape results for ${race.course} ${race.off_time}: ${e.message}`)
    return null
  }
}

async function backfillPreviousDaysResults(daysBack = 7) {
  const now = new Date()
  let totalNew = 0

  for (let i = 1; i <= daysBack; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)

    await new Promise(r => setTimeout(r, 2000))
    const races = await scrapeTimeformResults(dateStr)
    if (races.length === 0) continue

    console.log(`[TIMEFORM BACKFILL] ${dateStr}: ${races.length} races found`)

    const resultRaces = []
    for (const race of races) {
      const alreadyStored = (LEARNING_DATABASE.races || []).some(
        (r) => r.course === race.course && r.off_time === race.off_time && r.date === race.date
      )
      if (alreadyStored) continue

      await new Promise(r => setTimeout(r, 2000))
      const positions = await scrapeTimeformRaceResults(race)
      if (!positions) continue

      const racecardRaces = await scrapeTimeformRacecards(dateStr)
      const matchingRace = racecardRaces.find(r => r.course === race.course && r.off_time === race.off_time)
      const runners = matchingRace ? (await scrapeTimeformRaceDetails(matchingRace)) || [] : []

      const resultRunners = runners.map((runner) => {
        const normalized = normalizeHorseName(runner.horse)
        const found = positions.find((p) => p.normalized === normalized)
        return { ...runner, position: found ? found.position : 0 }
      })

      console.log(`[TIMEFORM BACKFILL] ${dateStr} ${race.course} ${race.off_time} — ${positions.length} positions, ${resultRunners.length} runners`)
      resultRaces.push({ ...race, runners: resultRunners })
    }

    if (resultRaces.length > 0) {
      await processScrapedResults(resultRaces)
      totalNew += resultRaces.length
    }
  }

  if (totalNew > 0) {
    console.log(`[TIMEFORM BACKFILL] Stored ${totalNew} races from previous ${daysBack} days`)
  }
}

async function processRace(race) {
  const runners = race.runners || []

  if (runners.length < 5) {
    return {
      ...race,
      runners: [],
      betFilter: { verdict: 'AUTO SKIP', reason: 'Small field (<5 runners)' },
      paceMap: {},
      volatility: { chaos: 0, label: 'N/A' },
    }
  }

  const atrData = await fetchAtrRacecardData(race)
  const atrHorseLinks = atrData.links
  const atrOdds = atrData.odds

  const enrichedRunners = (race.runners || []).map((r) => {
    const normalized = normalizeHorseName(r.horse)
    const atrPrice = atrOdds[normalized]
    if (atrPrice && (!r.odds || Number(r.odds) <= 1)) {
      return { ...r, odds: atrPrice }
    }
    return r
  })

  const apexResult = runApexEngine(enrichedRunners, race, {
    goingDb: GOING_DATABASE,
    distanceDb: DISTANCE_DATABASE,
    replayDb: REPLAY_NOTES_DATABASE,
    bucketDb: BUCKET_DATABASE,
    horseProfiles: HORSE_DATABASE,
    races: LEARNING_DATABASE.races || [],
    trainerForm: TRAINER_FORM_DATABASE,
    jockeyForm: JOCKEY_FORM_DATABASE,
  })

  const scoredRunners = apexResult.racecards.map((runner) => {
    const horseId = runner.horse_id || runner.horse
    const atrFormUrl = atrHorseLinks[normalizeHorseName(runner.horse)]
    if (!HORSE_DATABASE[horseId]) {
      HORSE_DATABASE[horseId] = { horse: runner.horse, runs: 0, bestScore: 0 }
    }
    const horseProfile = buildHorseProfile(horseId, LEARNING_DATABASE.races || [])
    const profileAdj = computeProfileAdjustment(horseProfile, race)
    if (horseProfile) {
      HORSE_DATABASE[horseId].profile = horseProfile
      HORSE_DATABASE[horseId].profile_adjustment = profileAdj
    }
    const previousOdds = MARKET_DATABASE[horseId]?.lastOdds || runner.odds
    const marketMovement = analyzeMarketMovement({ horse: runner.horse, currentOdds: runner.odds, previousOdds, aiConfidence: runner.finalScore })
    MARKET_DATABASE[horseId] = { horse: runner.horse, lastOdds: runner.odds, movement: marketMovement.movement, updatedAt: new Date().toISOString() }
    const bettingSignals = generateSignals({ ...runner, aiProfile: { confidence: runner.finalScore }, marketMovement })
    if (marketMovement.alert) {
      createAlert(horseId, runner.horse, marketMovement.alert.type, marketMovement.alert.message, marketMovement.alert.severity)
    }
    logPrediction(race, runner, { confidence: runner.finalScore, estimatedWinProbability: runner.winProb, placeProb: runner.placeProb, grade: runner.selectionQuality?.grade || '', betQuality: runner.selectionQuality?.label || runner.betQuality || '', breakdown: { powerScore: runner.power?.total, paceScore: runner.pace?.score, humanAdj: runner.human?.score, marketAdj: runner.market?.score, runningStyle: runner.runningStyle } })

    // Store historical snapshot
    if (runner.snapshot) {
      const raceId = `${race.course?.toLowerCase().replace(/\s+/g, '_')}_${race.date?.replace(/-/g, '_')}_${race.off_time?.replace(/:/g, '_')}`
      storeRunnerSnapshot({
        raceId,
        runId: `run_${Date.now()}_${runner.horse?.replace(/\s+/g, '_').toLowerCase() || 'unknown'}`,
        horseId: runner.horse_id || runner.horse || 'unknown',
        horseName: runner.horse || 'Unknown',
        timestamp: runner.snapshot.timestamp,
        signals: runner.snapshot.signals,
        scores: runner.snapshot.scores,
        commentary: runner.snapshot.commentary,
      })
    }

    return { ...runner, atrFormUrl, bettingSignals, marketMovement, elimination: runner.elimination, powerScore: runner.power?.total, paceScore: runner.pace?.score, humanScore: runner.human?.score, marketScore: runner.market?.score, finalScore: runner.finalScore, winProb: runner.winProb, placeProb: runner.placeProb, placeTraits: runner.placeTraits, interactions: runner.interactions, horseQuality: runner.horseQuality, simulation: runner.simulation, marketModel: runner.marketModel, valueEngine: runner.valueEngine, bankrollEngine: runner.bankrollEngine, scenarioFlags: runner.scenarioFlags, explanation: runner.explanation, confidenceTier: runner.confidenceTier, confidenceLabel: runner.confidenceLabel, confidenceScore: runner.confidenceScore, score: runner.finalScore, betQuality: runner.betQuality, selectionQuality: runner.selectionQuality, runningStyle: runner.runningStyle }
  })

  return {
    ...race,
    paceMap: apexResult.paceMap,
    volatility: apexResult.volatility,
    betFilter: apexResult.betFilter,
    runners: scoredRunners.sort((a, b) => b.finalScore - a.finalScore),
  }
}

async function fetchLiveMeetings() {
  try {
    console.log('Refreshing live meetings from Racing API...')
    const response = await fetch(
      'https://api.theracingapi.com/v1/racecards/free',
      {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(
              `${process.env.RACING_API_USERNAME}:${process.env.RACING_API_PASSWORD}`
            ).toString('base64'),
        },
      }
    )

    const data = await response.json()
    const racecards = data.racecards || []
    const processed = await Promise.all(racecards.map(processRace))

    LIVE_STATE.racecards = processed
    LIVE_STATE.updatedAt = new Date().toISOString()
    LIVE_STATE.loading = false
    saveDatabase(MARKET_DB_PATH, MARKET_DATABASE)
    saveDatabase(ALERT_DB_PATH, ALERT_DATABASE)
    saveDatabase(PREDICTIONS_DB_PATH, PREDICTIONS_DATABASE)
    io.emit('live-update', LIVE_STATE)
    console.log(`Broadcasted ${processed.length} races from Racing API`)
    scrapeFinishedRaceResults()
  } catch (error) {
    console.error(error)
  }
}

async function fetchTodayResults() {
  try {
    const response = await fetch(
      'https://api.theracingapi.com/v1/results/free',
      {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(
              `${process.env.RACING_API_USERNAME}:${process.env.RACING_API_PASSWORD}`
            ).toString('base64'),
        },
      }
    )

    if (!response.ok) return

    const data = await response.json()
    const resultRaces = data.results || data.racecards || []

    if (resultRaces.length === 0) return

    matchDailyPicksWithResults(resultRaces)

    const existingCount = LEARNING_DATABASE.records.length
    let goingUpdated = false
    let distanceUpdated = false

      resultRaces.forEach((race) => {
      const runners = race.runners || []
      const raceGoing = race.going || ''
      const raceSurface = race.surface || ''
      const raceDist = race.distance_f || ''

      // Record runs in condition database
      recordRun({
        date: race.date || new Date().toISOString().split('T')[0],
        course: race.course || '',
        going: raceGoing,
        distanceFurlongs: parseFloat(String(raceDist).replace(/[^0-9.]/g, '')) || 0,
        raceClass: race.race_class || race.class || '',
        runners: runners.map(r => ({
          horse: r.horse,
          position: Number(r.position || 0),
          or: r.ofr || r.official_rating || r.or || 0,
          rpr: r.rpr || 0,
          weight: r.lbs ? String(r.lbs) + 'lbs' : '',
          odds: resolveOdds(r),
          comments: r.comments || '',
        })),
      })

      runners.forEach((runner) => {
        const horseId = runner.horse_id || runner.horse
        const position = Number(runner.position || 0)

        if (position >= 1) {
          const alreadyRecorded = LEARNING_DATABASE.records.some(
            (r) => r.horse === runner.horse && r.timestamp?.startsWith(new Date().toISOString().split('T')[0])
          )
          if (!alreadyRecorded) {
            const prediction = findPredictionForRunner(race, runner)

            LEARNING_DATABASE.records.push({
              horse: runner.horse,
              position,
              won: position === 1,
              spOdds: resolveOdds(runner),
              aiConfidence: prediction?.confidence || 0,
              signal: 'RESULT_API',
              marketMovement: 'N/A',
              timestamp: new Date().toISOString(),
              resultProcessed: true,
              breakdown: prediction?.breakdown || null,
              weights: prediction?.weights || null,
            })
          }
        }

        if (!GOING_DATABASE[horseId]) {
          GOING_DATABASE[horseId] = { byGoing: {}, bySurface: {} }
        }
        const gProf = GOING_DATABASE[horseId]
        const goingKey = raceGoing || 'Unknown'
        if (!gProf.byGoing[goingKey]) gProf.byGoing[goingKey] = { runs: 0, wins: 0, places: 0 }
        gProf.byGoing[goingKey].runs++
        if (position === 1) gProf.byGoing[goingKey].wins++
        if (position >= 2 && position <= 4) gProf.byGoing[goingKey].places++
        goingUpdated = true

        const surfaceKey = raceSurface || 'Unknown'
        if (!gProf.bySurface[surfaceKey]) gProf.bySurface[surfaceKey] = { runs: 0, wins: 0, places: 0 }
        gProf.bySurface[surfaceKey].runs++
        if (position === 1) gProf.bySurface[surfaceKey].wins++
        if (position >= 2 && position <= 4) gProf.bySurface[surfaceKey].places++

        if (!DISTANCE_DATABASE[horseId]) {
          DISTANCE_DATABASE[horseId] = { lastDistance: 0, performances: [] }
        }
        const dProf = DISTANCE_DATABASE[horseId]
        const distVal = parseFloat(String(raceDist).replace(/[^0-9.]/g, '')) || 0
        if (distVal > 0) {
          dProf.lastDistance = distVal
          if (position >= 1) {
            dProf.performances.push({ distance: distVal, won: position === 1, placed: position >= 2 && position <= 4, date: new Date().toISOString() })
          }
          distanceUpdated = true
        }
      })
    })

    if (goingUpdated) saveDatabase(GOING_DB_PATH, GOING_DATABASE)
    if (distanceUpdated) saveDatabase(DISTANCE_DB_PATH, DISTANCE_DATABASE)

    const bucketResult = learnFromBuckets(BUCKET_DATABASE, resultRaces.map((race) => {
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
        position: Number(runner.position || 0),
      }))
      return { race, predictions, results }
    }))

    if (bucketResult.updated) {
      saveDatabase(BUCKET_DB_PATH, BUCKET_DATABASE)
      console.log(`[BUCKETS] Updated ${bucketResult.bucketCount} buckets`)
    }

    LEARNING_DATABASE.races = [...(LEARNING_DATABASE.races || []), ...resultRaces]

    if (LEARNING_DATABASE.records.length > existingCount) {
      LEARNING_DATABASE.analytics = analyzeHistoricalPerformance(
        LEARNING_DATABASE.records
      )

      const rawLearningResult = learnFromResults(
        LEARNING_DATABASE.records,
        LEARNING_DATABASE.weights || {}
      )

      if (rawLearningResult.adjusted) {
        const protectedResult = applyProtectedAdjustment(
          LEARNING_DATABASE.weights || {},
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
    }

    resultRaces.forEach((race) => {
      const runners = race.runners || []

      runners.forEach((runner) => {
        const prediction = findPredictionForRunner(race, runner)

        if (prediction) {
          const calRecord = createCalibrationRecord({
            ...prediction,
            going: race.going || '',
            fieldSize: race.field_size || race.fieldSize || 0,
            trainer: runner.trainer || '',
            raceType: race.race_type || race.raceType || '',
          }, {
            position: Number(runner.position || 0),
            spOdds: resolveOdds(runner),
          })

          CALIBRATION_DATABASE.records.push(calRecord)
        }
      })
    })

    CALIBRATION_DATABASE.analytics = {
      byProbability: computeCalibrationBuckets(CALIBRATION_DATABASE.records),
      byPlaceProbability: computePlaceCalibration(CALIBRATION_DATABASE.records),
      byGrade: computeCalibrationByGrade(CALIBRATION_DATABASE.records),
      byBetQuality: computeCalibrationByBetQuality(CALIBRATION_DATABASE.records),
      segments: computeAllSegmentations(CALIBRATION_DATABASE.records),
      lastUpdated: new Date().toISOString(),
    }

    saveDatabase(CALIBRATION_DB_PATH, CALIBRATION_DATABASE)
  } catch (error) {
    console.error('Failed to fetch results:', error.message)
  }
}

fetchLiveMeetings()
setInterval(fetchLiveMeetings, 300000)

async function refreshNonRunners() {
  try {
    const courses = await fetchNonRunners()
    LIVE_STATE.nonRunners = courses
    if (courses.length > 0) {
      console.log(`[NonRunners] ${courses.length} courses updated`)
    }
  } catch (error) {
    console.error('[NonRunners] Refresh failed:', error.message)
  }
}

refreshNonRunners()
setInterval(refreshNonRunners, 300000)

async function refreshATRResults() {
  try {
    const races = await fetchATRResults()
    if (races.length === 0) return

    console.log(`[ATR Results] ${races.length} races with results`)

    // Convert ATR format to standard race format for condition DB
    const standardRaces = races.map(race => ({
      date: race.date,
      course: race.course,
      going: '',
      distanceFurlongs: 0,
      raceClass: race.raceClass || '',
      runners: race.runners.map(runner => ({
        horse: runner.horse,
        position: runner.position,
        or: 0,
        rpr: 0,
        weight: '',
        odds: runner.odds,
        comments: '',
      })),
    }))

    // Record in condition DB
    standardRaces.forEach(race => recordRun(race))

    // Also feed into learning DB
    standardRaces.forEach(race => {
      race.runners.forEach(runner => {
        if (runner.position >= 1) {
          const alreadyRecorded = LEARNING_DATABASE.records.some(
            r => r.horse === runner.horse && r.timestamp?.startsWith(race.date)
          )
          if (!alreadyRecorded) {
            LEARNING_DATABASE.records.push({
              horse: runner.horse,
              position: runner.position,
              won: runner.position === 1,
              spOdds: runner.odds,
              aiConfidence: 0,
              signal: 'ATR_RESULT',
              marketMovement: 'N/A',
              timestamp: new Date().toISOString(),
              resultProcessed: true,
            })
          }
        }
      })
    })

    // Update LIVE_STATE
    LIVE_STATE.atrResults = races
    io.emit('atr-results', races)
  } catch (error) {
    console.error('[ATR Results] Refresh failed:', error.message)
  }
}

refreshATRResults()
setInterval(refreshATRResults, 300000)

setTimeout(fetchTodayResults, 30000)
setInterval(fetchTodayResults, 300000)

io.on('connection', (socket) => {
  console.log('Client connected')
  socket.emit('live-update', LIVE_STATE)
})

app.get('/api/live-state', (_req, res) => {
  res.json(LIVE_STATE)
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
  return String(name).toLowerCase().replace(/\(.*?\)/g, '').trim()
}

function placedPositions(fieldSize) {
  if (fieldSize <= 4) return 1
  if (fieldSize <= 7) return 2
  if (fieldSize <= 15) return 3
  return 4
}

function matchDailyPicksWithResults(races) {
  let matchCount = 0

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
        const pos = Number(runner.position || runner.pos || 0)
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

  races.forEach((race) => {
    const rawDate = String(race.date || (race.off_dt || '').slice(0, 10) || '')
    const date = rawDate.replace(/[/]/g, '-')
    if (!date || !DAILY_PICKS_DATABASE[date]) return

    const dailyPicks = DAILY_PICKS_DATABASE[date].picks || []
    const raceRunners = new Set(
      (race.runners || []).map((r) => normalizeHorseName(r.horse))
    )

    dailyPicks.forEach((p) => {
      if (p.result !== null) return
      if (
        normalizeCourse(p.course) === normalizeCourse(race.course) &&
        !raceRunners.has(normalizeHorseName(p.horse))
      ) {
        p.result = 'nr'
        p.position = 0
        const nh = normalizeHorseName(p.horse)
        if (!NON_RUNNER_DATABASE[nh]) NON_RUNNER_DATABASE[nh] = []
        NON_RUNNER_DATABASE[nh].push({
          date,
          course: p.course,
          horse: p.horse,
        })
        matchCount++
      }
    })
  })

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
  saveDatabase(NON_RUNNER_PATH, NON_RUNNER_DATABASE)
}

app.post('/api/daily-picks', (req, res) => {
  const { date, picks } = req.body
  if (!date || !Array.isArray(picks)) {
    return res.status(400).json({ error: 'Invalid format' })
  }

  const existing = DAILY_PICKS_DATABASE[date]
  if (existing && existing.picks && existing.picks.some((p) => p.result !== null)) {
    return res.json({ saved: false, reason: 'results already recorded for this date' })
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
  res.json({ saved: true, date, count: picks.length })
})

app.get('/api/daily-picks', (_req, res) => {
  res.json(DAILY_PICKS_DATABASE)
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
  res.json({
    ...(LEARNING_DATABASE.analytics || {
      totalBets: 0,
      winners: 0,
      strikeRate: 0,
      roi: 0,
      averageConfidence: 0,
      profitableSignals: [],
    }),
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

      // Record runs in condition database
      recordRun({
        date: race.date,
        course: race.course,
        going: race.going,
        distanceFurlongs: race.distance_f || race.distanceFurlongs,
        raceClass: race.class || race.raceClass,
        runners: runners.map(r => ({
          horse: r.horse,
          position: Number(r.position || 0),
          or: r.or || 0,
          rpr: r.rpr || 0,
          weight: r.weight || '',
          odds: resolveOdds(r),
          comments: r.comments || '',
        })),
      })

      runners.forEach((runner) => {
        const prediction = findPredictionForRunner(race, runner)

        const record = {
          horse: runner.horse,
          position: Number(runner.position || 0),
          won: Number(runner.position || 0) === 1,
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

    const pickDates = Object.keys(DAILY_PICKS_DATABASE)
    pickDates.forEach((date) => saveDatabase(DAILY_PICKS_PATH, DAILY_PICKS_DATABASE))

    races.forEach((race) => {
      const runners = race.runners || []
      const raceGoing = race.going || ''
      const raceSurface = race.surface || ''
      const raceDist = race.distance_f || ''

      runners.forEach((runner) => {
        const horseId = runner.horse_id || runner.horse
        const position = Number(runner.position || 0)
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
        position: Number(runner.position || 0),
      }))
      return { race, predictions, results }
    }))

    if (bucketResult.updated) {
      saveDatabase(BUCKET_DB_PATH, BUCKET_DATABASE)
    }

    races.forEach((race) => {
      const runners = race.runners || []

      runners.forEach((runner) => {
        const prediction = findPredictionForRunner(race, runner)

        if (prediction) {
          const calRecord = createCalibrationRecord({
            ...prediction,
            going: race.going || '',
            fieldSize: race.field_size || race.fieldSize || 0,
            trainer: runner.trainer || '',
            raceType: race.race_type || race.raceType || '',
          }, {
            position: Number(runner.position || 0),
            spOdds: resolveOdds(runner),
          })

          CALIBRATION_DATABASE.records.push(calRecord)
        }
      })
    })

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

app.get('/api/anti-overfit', (_req, res) => {
  const report = computeAntiOverfitReport(
    LEARNING_DATABASE.records,
    LEARNING_DATABASE.weights?.multiplier || {}
  )
  res.json(report)
})

// Historical Snapshot Routes
app.get('/api/snapshots/stats', (_req, res) => {
  res.json(getSnapshotStats())
})

app.get('/api/snapshots/race/:raceId', (req, res) => {
  res.json(getSnapshotsByRace(req.params.raceId))
})

app.get('/api/snapshots/horse/:horseId', (req, res) => {
  res.json(getSnapshotsByHorse(req.params.horseId))
})

app.get('/api/snapshots/verdict/:verdict', (req, res) => {
  res.json(getSnapshotsByVerdict(req.params.verdict))
})

app.get('/api/snapshots/date-range', (req, res) => {
  const { start, end } = req.query
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params required' })
  }
  res.json(getSnapshotsByDateRange(start, end))
})

app.delete('/api/snapshots/clear', (_req, res) => {
  deleteAllSnapshots()
  res.json({ success: true, message: 'All snapshots cleared' })
})

// Condition DB Routes
app.get('/api/conditions/stats', (_req, res) => {
  res.json(getConditionDBStats())
})

app.get('/api/conditions/horse/:horseName', (req, res) => {
  const profile = getHorseProfile(req.params.horseName)
  if (!profile) return res.status(404).json({ error: 'No data for this horse' })
  res.json(profile)
})

app.get('/api/conditions/match', (req, res) => {
  const { horse, going, distance, raceClass, weight } = req.query
  if (!horse) return res.status(400).json({ error: 'horse query param required' })
  const match = matchConditions(horse, going, distance, raceClass, weight)
  res.json(match)
})

// Non-Runner Routes
app.get('/api/non-runners', async (_req, res) => {
  try {
    const courses = await fetchNonRunners()
    res.json({ courses, updatedAt: new Date().toISOString() })
  } catch (error) {
    res.status(500).json({ error: error.message, courses: [] })
  }
})

// ATR Results Routes
app.get('/api/atr-results', (_req, res) => {
  res.json({ races: LIVE_STATE.atrResults || [], updatedAt: new Date().toISOString() })
})

server.listen(PORT, () => {
  console.log(`APEX websocket engine running on ${PORT}`)
})