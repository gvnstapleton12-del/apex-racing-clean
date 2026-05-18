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
app.use(express.json())

const PORT = process.env.PORT || 3000

const HORSE_DB_PATH = path.join(
  process.cwd(),
  'data',
  'horses.json'
)

const MARKET_DB_PATH = path.join(
  process.cwd(),
  'data',
  'market.json'
)

const ALERT_DB_PATH = path.join(
  process.cwd(),
  'data',
  'alerts.json'
)

const LEARNING_DB_PATH = path.join(
  process.cwd(),
  'data',
  'learning.json'
)

function loadDatabase(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {}
    }

    const raw = fs.readFileSync(filePath)

    return JSON.parse(raw)
  } catch (error) {
    console.error(
      'Failed to load DB:',
      error
    )

    return {}
  }
}

function saveDatabase(
  filePath,
  database
) {
  try {
    fs.mkdirSync(path.dirname(filePath), {
      recursive: true,
    })

    fs.writeFileSync(
      filePath,
      JSON.stringify(database, null, 2)
    )
  } catch (error) {
    console.error(
      'Failed to save DB:',
      error
    )
  }
}

const HORSE_DATABASE = loadDatabase(
  HORSE_DB_PATH
)

const MARKET_DATABASE = loadDatabase(
  MARKET_DB_PATH
)

const ALERT_DATABASE = loadDatabase(
  ALERT_DB_PATH
)

const LEARNING_DATABASE = loadDatabase(
  LEARNING_DB_PATH
)

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
    timestamp:
      new Date().toISOString(),
  }

  ALERT_DATABASE[horseId].unshift(
    alert
  )

  ALERT_DATABASE[horseId] =
    ALERT_DATABASE[horseId].slice(
      0,
      50
    )

  io.emit('new-alert', alert)
}

function storeLearningRecord(record) {
  if (!LEARNING_DATABASE.records) {
    LEARNING_DATABASE.records = []
  }

  LEARNING_DATABASE.records.unshift(
    record
  )

  LEARNING_DATABASE.records =
    LEARNING_DATABASE.records.slice(
      0,
      5000
    )

  LEARNING_DATABASE.analytics =
    analyzeHistoricalPerformance(
      LEARNING_DATABASE.records
    )
}

async function fetchLiveMeetings() {
  try {
    console.log(
      'Refreshing live meetings...'
    )

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

    const racecards =
      data.racecards || []

    const processed = racecards.map(
      (race) => {
        const runners =
          race.runners || []

        const scoredRunners =
          runners.map((runner) => {
            const horseId =
              runner.horse_id ||
              runner.horse

            if (
              !HORSE_DATABASE[horseId]
            ) {
              HORSE_DATABASE[
                horseId
              ] = {
                horse: runner.horse,
                runs: 0,
                bestScore: 0,
              }
            }

            const previousOdds =
              MARKET_DATABASE[
                horseId
              ]?.lastOdds ||
              runner.odds

            const aiProfile =
              generateConfidence({
                ...runner,
                horseProfile:
                  HORSE_DATABASE[
                    horseId
                  ],
              })

            const marketMovement =
              analyzeMarketMovement({
                horse: runner.horse,
                currentOdds:
                  runner.odds,
                previousOdds,
                aiConfidence:
                  aiProfile.confidence,
              })

            MARKET_DATABASE[
              horseId
            ] = {
              horse: runner.horse,
              lastOdds: runner.odds,
              movement:
                marketMovement.movement,
              updatedAt:
                new Date().toISOString(),
            }

            if (
              marketMovement.alert
            ) {
              createAlert(
                horseId,
                runner.horse,
                marketMovement.alert
                  .type,
                marketMovement.alert
                  .message,
                marketMovement.alert
                  .severity
              )
            }

            const bettingSignals =
              generateSignals({
                ...runner,
                aiProfile,
                marketMovement,
              })

            const learningRecord =
              buildLearningRecord({
                horse: runner.horse,
                aiConfidence:
                  aiProfile.confidence,
                signal:
                  bettingSignals?.[0]
                    ?.type || 'NONE',
                spOdds:
                  runner.odds || 0,
                position: 0,
                marketMovement:
                  marketMovement.movement,
              })

            storeLearningRecord(
              learningRecord
            )

            return {
              ...runner,
              aiProfile,
              bettingSignals,
              marketMovement,
            }
          })

        return {
          ...race,
          runners:
            scoredRunners.sort(
              (a, b) =>
                b.aiProfile
                  .confidence -
                a.aiProfile
                  .confidence
            ),
        }
      }
    )

    const ingestion =
      ingestRaceResults(
        processed,
        LEARNING_DATABASE
      )

    LEARNING_DATABASE.records =
      ingestion.learningDatabase
        .records

    LEARNING_DATABASE.analytics =
      analyzeHistoricalPerformance(
        LEARNING_DATABASE.records
      )

    LIVE_STATE.racecards =
      processed

    LIVE_STATE.updatedAt =
      new Date().toISOString()

    LIVE_STATE.loading = false

    saveDatabase(
      MARKET_DB_PATH,
      MARKET_DATABASE
    )

    saveDatabase(
      ALERT_DB_PATH,
      ALERT_DATABASE
    )

    saveDatabase(
      LEARNING_DB_PATH,
      LEARNING_DATABASE
    )

    io.emit(
      'live-update',
      LIVE_STATE
    )

    console.log(
      `Broadcasted ${processed.length} races`
    )

    console.log(
      `Learning records: ${LEARNING_DATABASE.records.length}`
    )
  } catch (error) {
    console.error(error)
  }
}

fetchLiveMeetings()

setInterval(
  fetchLiveMeetings,
  60000
)

io.on('connection', (socket) => {
  console.log('Client connected')

  socket.emit(
    'live-update',
    LIVE_STATE
  )
})

app.get(
  '/api/live-state',
  (_req, res) => {
    res.json(LIVE_STATE)
  }
)

app.get('/api/alerts', (_req, res) => {
  const alerts = Object.values(
    ALERT_DATABASE
  )
    .flat()
    .slice(0, 100)

  res.json(alerts)
})

app.get(
  '/api/market-movers',
  (_req, res) => {
    res.json(
      Object.values(
        MARKET_DATABASE
      )
    )
  }
)

app.get(
  '/api/learning-stats',
  (_req, res) => {
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
  }
)

app.get('/api/results', (_req, res) => {
  res.json(
    LEARNING_DATABASE.records || []
  )
})

server.listen(PORT, () => {
  console.log(
    `APEX websocket engine running on ${PORT}`
  )
})