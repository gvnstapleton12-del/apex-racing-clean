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

import {
  analyzeHistoricalPerformance,
  buildLearningRecord,
} from './src/lib/learningEngine.js'

import { ingestRaceResults } from './src/lib/resultEngine.js'

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

const LEARNING_DATABASE = {
  records: [],
  analytics: {},
}

const LIVE_STATE = {
  racecards: [],
  updatedAt: null,
  loading: true,
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

    const processed = racecards.map((race) => {
      const runners = race.runners || []

      const scoredRunners = runners.map((runner) => {
        const horseId = runner.horse_id || runner.horse

        if (!HORSE_DATABASE[horseId]) {
          HORSE_DATABASE[horseId] = {
            horse: runner.horse,
            runs: 0,
            bestScore: 0,
          }
        }

        const previousOdds =
          MARKET_DATABASE[horseId]?.lastOdds || runner.odds

        const aiProfile = generateConfidence({
          ...runner,
          horseProfile: HORSE_DATABASE[horseId],
        })

        const marketMovement = analyzeMarketMovement({
          horse: runner.horse,
          currentOdds: runner.odds,
          previousOdds,
          aiConfidence: aiProfile.confidence,
        })

        MARKET_DATABASE[horseId] = {
          horse: runner.horse,
          lastOdds: runner.odds,
          movement: marketMovement.movement,
          updatedAt: new Date().toISOString(),
        }

        const bettingSignals = generateSignals({
          ...runner,
          aiProfile,
          marketMovement,
        })

        if (marketMovement.alert) {
          createAlert(
            horseId,
            runner.horse,
            marketMovement.alert.type,
            marketMovement.alert.message,
            marketMovement.alert.severity
          )
        }

        return {
          ...runner,
          aiProfile,
          bettingSignals,
          marketMovement,
        }
      })

      return {
        ...race,
        runners: scoredRunners.sort(
          (a, b) =>
            b.aiProfile.confidence - a.aiProfile.confidence
        ),
      }
    })

    LIVE_STATE.racecards = processed
    LIVE_STATE.updatedAt = new Date().toISOString()
    LIVE_STATE.loading = false

    saveDatabase(MARKET_DB_PATH, MARKET_DATABASE)
    saveDatabase(ALERT_DB_PATH, ALERT_DATABASE)

    io.emit('live-update', LIVE_STATE)

    console.log(`Broadcasted ${processed.length} races`)
    console.log(
      `Tracked bets: ${LEARNING_DATABASE.records.length}`
    )
  } catch (error) {
    console.error(error)
  }
}

fetchLiveMeetings()
setInterval(fetchLiveMeetings, 60000)

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

app.get('/api/learning-stats', (_req, res) => {
  res.json(
    LEARNING_DATABASE.analytics || {
      totalBets: 0,
      winners: 0,
      strikeRate: 0,
      roi: 0,
      averageConfidence: 0,
      profitableSignals: [],
    }
  )
})

app.get('/api/results', (_req, res) => {
  res.json(LEARNING_DATABASE.records || [])
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

    LEARNING_DATABASE.records = []

    races.forEach((race) => {
      const runners = race.runners || []

      runners.forEach((runner) => {
        LEARNING_DATABASE.records.push({
          horse: runner.horse,
          position: Number(runner.position || 0),
          spOdds: resolveOdds(runner),
          aiConfidence: Number(runner.aiConfidence || 75),
          signal: runner.signal || 'UPLOAD',
          marketMovement: runner.marketMovement || 'UNKNOWN',
          timestamp: new Date().toISOString(),
          resultProcessed: true,
        })
      })
    })

    LEARNING_DATABASE.analytics = analyzeHistoricalPerformance(
      LEARNING_DATABASE.records
    )

    saveDatabase(
      LEARNING_DB_PATH,
      LEARNING_DATABASE
    )

    res.json({
      success: true,
      processedRaces: races.length,
      totalRecords: LEARNING_DATABASE.records.length,
      analytics: LEARNING_DATABASE.analytics,
    })
  } catch (error) {
    console.error(error)

    res.status(500).json({
      error: 'Failed to process results',
    })
  }
})

server.listen(PORT, () => {
  console.log(`APEX websocket engine running on ${PORT}`)
})