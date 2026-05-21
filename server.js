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

function normalizeHorseName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function resolveOdds(runner = {}) {
  return (
    runner.spOdds ||
    runner.sp ||
    runner.price ||
    runner.odds ||
    runner.industry_sp ||
    runner.starting_price ||
    runner.returned ||
    0
  )
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

const LEARNING_DATABASE = loadDatabase(LEARNING_DB_PATH)?.records
  ? loadDatabase(LEARNING_DB_PATH)
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
if (!LEARNING_DATABASE.weights?.multiplier?.class) {
  LEARNING_DATABASE.weights = {
    multiplier: { class: 1.3, stride: 1.1, trainer: 0.7, traffic: 1.0, clv: 0.8 },
  }
}

const DAILY_PICKS_DATABASE = loadDatabase(DAILY_PICKS_PATH)
const REPLAY_NOTES_DATABASE = loadDatabase(REPLAY_NOTES_PATH)
const NON_RUNNER_DATABASE = loadDatabase(NON_RUNNER_PATH)

const LIVE_STATE = {
  racecards: [],
  updatedAt: null,
  loading: true,
}

const ATR_LINK_CACHE = new Map()

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

async function fetchAtrHorseLinks(race = {}) {
  const racecardUrl = buildAtrRacecardUrl(race)

  if (!racecardUrl) {
    return {}
  }

  const cached = ATR_LINK_CACHE.get(racecardUrl)

  if (cached) {
    return cached
  }

  try {
    const response = await fetch(racecardUrl, {
      headers: {
        accept: 'text/html',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
      },
    })

    if (!response.ok) {
      return {}
    }

    const html = await response.text()
    const links = {}

    for (const match of html.matchAll(
      /href="([^"]*\/form\/horse\/([^"]+))"/g
    )) {
      const href = match[1]
      const parts = href.split('?')[0].split('/')
      const horseSlug = parts[parts.indexOf('horse') + 1]
      const horseName = horseSlug.replace(/-/g, ' ')
      const normalized = normalizeHorseName(horseName)

      if (normalized && !links[normalized]) {
        links[normalized] = toAtrPopupUrl(href)
      }
    }

    ATR_LINK_CACHE.set(racecardUrl, links)

    return links
  } catch (error) {
    console.error('Failed to fetch ATR links:', error.message)
    return {}
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

async function fetchLiveMeetings() {
  try {
    console.log('Refreshing live meetings...')

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

    const processed = await Promise.all(racecards.map(async (race) => {
      const atrHorseLinks = await fetchAtrHorseLinks(race)
      const runners = race.runners || []

      const apexResult = runApexEngine(runners, race, {
        goingDb: GOING_DATABASE,
        distanceDb: DISTANCE_DATABASE,
        replayDb: REPLAY_NOTES_DATABASE,
        bucketDb: BUCKET_DATABASE,
      })

      const scoredRunners = apexResult.racecards.map((runner) => {
        const horseId = runner.horse_id || runner.horse
        const atrFormUrl = atrHorseLinks[normalizeHorseName(runner.horse)]

        if (!HORSE_DATABASE[horseId]) {
          HORSE_DATABASE[horseId] = { horse: runner.horse, runs: 0, bestScore: 0 }
        }

        const previousOdds = MARKET_DATABASE[horseId]?.lastOdds || runner.odds

        const marketMovement = analyzeMarketMovement({
          horse: runner.horse,
          currentOdds: runner.odds,
          previousOdds,
          aiConfidence: runner.finalScore,
        })

        MARKET_DATABASE[horseId] = {
          horse: runner.horse,
          lastOdds: runner.odds,
          movement: marketMovement.movement,
          updatedAt: new Date().toISOString(),
        }

        const bettingSignals = generateSignals({
          ...runner,
          aiProfile: { confidence: runner.finalScore },
          marketMovement,
        })

        if (marketMovement.alert) {
          createAlert(horseId, runner.horse, marketMovement.alert.type, marketMovement.alert.message, marketMovement.alert.severity)
        }

        logPrediction(race, runner, {
          confidence: runner.finalScore,
          estimatedWinProbability: runner.winProb,
          placeProb: runner.placeProb,
          grade: runner.selectionQuality?.grade || '',
          betQuality: runner.selectionQuality?.label || runner.betQuality || '',
          breakdown: {
            powerScore: runner.power?.total,
            paceScore: runner.pace?.score,
            humanAdj: runner.human?.score,
            marketAdj: runner.market?.score,
            runningStyle: runner.runningStyle,
          },
        })

        return {
          ...runner,
          atrFormUrl,
          bettingSignals,
          marketMovement,
          elimination: runner.elimination,
          powerScore: runner.power?.total,
          paceScore: runner.pace?.score,
          humanScore: runner.human?.score,
          marketScore: runner.market?.score,
          finalScore: runner.finalScore,
          winProb: runner.winProb,
          placeProb: runner.placeProb,
          placeTraits: runner.placeTraits,
          confidenceLabel: runner.confidenceLabel,
          confidenceScore: runner.confidenceScore,
          betQuality: runner.betQuality,
          selectionQuality: runner.selectionQuality,
          runningStyle: runner.runningStyle,
        }
      })

      return {
        ...race,
        paceMap: apexResult.paceMap,
        volatility: apexResult.volatility,
        runners: scoredRunners.sort((a, b) => b.finalScore - a.finalScore),
      }
    }))

    LIVE_STATE.racecards = processed
    LIVE_STATE.updatedAt = new Date().toISOString()
    LIVE_STATE.loading = false

    saveDatabase(MARKET_DB_PATH, MARKET_DATABASE)
    saveDatabase(ALERT_DB_PATH, ALERT_DATABASE)
    saveDatabase(PREDICTIONS_DB_PATH, PREDICTIONS_DATABASE)

    io.emit('live-update', LIVE_STATE)

    console.log(`Broadcasted ${processed.length} races`)
    console.log(
      `Tracked predictions: ${Object.keys(PREDICTIONS_DATABASE).length}`
    )
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

    if (LEARNING_DATABASE.records.length > existingCount) {
      LEARNING_DATABASE.analytics = analyzeHistoricalPerformance(
        LEARNING_DATABASE.records
      )

      const learningResult = learnFromResults(
        LEARNING_DATABASE.records,
        LEARNING_DATABASE.weights || {}
      )

      if (learningResult.adjusted) {
        LEARNING_DATABASE.weights = learningResult.weights
        LEARNING_DATABASE.lastLearningRun = {
          date: new Date().toISOString(),
          totalRecords: learningResult.totalRecords,
          winners: learningResult.winners,
          analysis: learningResult.analysis,
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
setInterval(fetchLiveMeetings, 60000)

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
  const { horse, course, tags, notes, adjustment } = req.body
  if (!horse) {
    return res.status(400).json({ error: 'Horse name required' })
  }

  const key = `${horse}|${course || ''}`
  const existing = REPLAY_NOTES_DATABASE[key]

  REPLAY_NOTES_DATABASE[key] = {
    horse,
    course: course || '',
    tags: tags || [],
    notes: notes || '',
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

    LEARNING_DATABASE.races = races

    LEARNING_DATABASE.analytics = analyzeHistoricalPerformance(
      LEARNING_DATABASE.records
    )

    const existingWeights = LEARNING_DATABASE.weights || {}
    const learningResult = learnFromResults(
      LEARNING_DATABASE.records,
      existingWeights
    )

    if (learningResult.adjusted) {
      LEARNING_DATABASE.weights = learningResult.weights
      LEARNING_DATABASE.lastLearningRun = {
        date: new Date().toISOString(),
        totalRecords: learningResult.totalRecords,
        winners: learningResult.winners,
        analysis: learningResult.analysis,
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
      learning: learningResult,
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

server.listen(PORT, () => {
  console.log(`APEX websocket engine running on ${PORT}`)
})