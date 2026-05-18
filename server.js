import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import http from 'http'

import { Server } from 'socket.io'

import { generateConfidence } from './src/lib/confidenceEngine.js'
import { generateSignals } from './src/lib/signalEngine.js'

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

const REPLAY_DB_PATH = path.join(
  process.cwd(),
  'data',
  'replays.json'
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

function loadDatabase(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {}
    }

    const raw = fs.readFileSync(filePath)

    return JSON.parse(raw)
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

const HORSE_DATABASE = loadDatabase(
  HORSE_DB_PATH
)

const REPLAY_DATABASE = loadDatabase(
  REPLAY_DB_PATH
)

const MARKET_DATABASE = loadDatabase(
  MARKET_DB_PATH
)

const ALERT_DATABASE = loadDatabase(
  ALERT_DB_PATH
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
    timestamp: new Date().toISOString(),
  }

  ALERT_DATABASE[horseId].unshift(alert)

  ALERT_DATABASE[horseId] =
    ALERT_DATABASE[horseId].slice(0, 25)

  io.emit('new-alert', alert)
}

function generateReplayFlags(
  runner,
  score
) {
  const flags = []

  if (score >= 80) {
    flags.push('Strong Finish')
  }

  if (runner.form?.includes('0')) {
    flags.push('Potential Bounce Back')
  }

  if (
    runner.odds &&
    parseFloat(runner.odds) > 10
  ) {
    flags.push('Hidden Value Runner')
  }

  return flags
}

async function fetchLiveMeetings() {
  try {
    console.log(
      'Refreshing live meetings...'
    )

    const response = await fetch(
      `https://api.theracingapi.com/v1/racecards/free`,
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

    const processed = racecards.map(
      (race) => {
        const runners = race.runners || []

        const scoredRunners = runners.map(
          (runner) => {
            let score = 50

            if (
              runner.form?.includes('1')
            )
              score += 15

            if (
              runner.form?.includes('2')
            )
              score += 10

            const replayFlags =
              generateReplayFlags(
                runner,
                score
              )

            const horseId =
              runner.horse_id ||
              runner.horse

            if (
              !HORSE_DATABASE[horseId]
            ) {
              HORSE_DATABASE[horseId] = {
                horse: runner.horse,
                runs: 0,
                bestScore: 0,
              }
            }

            const profile =
              HORSE_DATABASE[horseId]

            const market =
              MARKET_DATABASE[horseId] || {}

            const aiProfile =
              generateConfidence({
                ...runner,
                replayTriggers:
                  replayFlags,
                horseProfile: profile,
                market,
              })

            const bettingSignals =
              generateSignals({
                ...runner,
                aiProfile,
                replayTriggers:
                  replayFlags,
                market,
              })

            if (
              aiProfile.confidence >= 90
            ) {
              createAlert(
                horseId,
                runner.horse,
                'ELITE_BET',
                `Elite confidence detected (${aiProfile.confidence}%)`,
                'HIGH'
              )
            }

            return {
              ...runner,
              score,
              replayTriggers:
                replayFlags,
              aiProfile,
              bettingSignals,
            }
          }
        )

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

    LIVE_STATE.racecards = processed

    LIVE_STATE.updatedAt =
      new Date().toISOString()

    LIVE_STATE.loading = false

    saveDatabase(
      ALERT_DB_PATH,
      ALERT_DATABASE
    )

    io.emit('live-update', LIVE_STATE)

    console.log(
      `Broadcasted ${processed.length} races`
    )
  } catch (error) {
    console.error(error)
  }
}

fetchLiveMeetings()

setInterval(fetchLiveMeetings, 30000)

io.on('connection', (socket) => {
  console.log('Client connected')

  socket.emit('live-update', LIVE_STATE)
})

app.get('/api/live-state', (_req, res) => {
  res.json(LIVE_STATE)
})

app.get('/api/alerts', (_req, res) => {
  const alerts = Object.values(
    ALERT_DATABASE
  )
    .flat()
    .slice(0, 100)

  res.json(alerts)
})

server.listen(PORT, () => {
  console.log(
    `APEX websocket engine running on ${PORT}`
  )
})