import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

import { generateConfidence } from './src/lib/confidenceEngine.js'
import { generateSignals } from './src/lib/signalEngine.js'

dotenv.config()

const app = express()

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

  ALERT_DATABASE[horseId].unshift({
    horse,
    type,
    message,
    severity,
    timestamp: new Date().toISOString(),
  })

  ALERT_DATABASE[horseId] =
    ALERT_DATABASE[horseId].slice(0, 25)
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

  if (
    runner.draw &&
    Number(runner.draw) > 10
  ) {
    flags.push('Wide Draw Challenge')
  }

  return flags
}

function parseOdds(odds) {
  if (!odds) return null

  const parsed = parseFloat(odds)

  if (isNaN(parsed)) return null

  return parsed
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

            if (
              runner.odds &&
              parseFloat(runner.odds) < 6
            ) {
              score += 15
            }

            const replayFlags =
              generateReplayFlags(
                runner,
                score
              )

            const horseId =
              runner.horse_id ||
              runner.horse

            const currentOdds =
              parseOdds(runner.odds)

            if (
              !HORSE_DATABASE[horseId]
            ) {
              HORSE_DATABASE[horseId] = {
                horse: runner.horse,
                runs: 0,
                wins: 0,
                averageScore: 0,
                bestScore: 0,
                replayFlags: [],
                courses: [],
                notes: [],
                trainer:
                  runner.trainer,
                jockey: runner.jockey,
                marketSupport: 0,
              }
            }

            if (
              !REPLAY_DATABASE[horseId]
            ) {
              REPLAY_DATABASE[horseId] = {
                horse: runner.horse,
                replayNotes: [],
              }
            }

            if (
              !MARKET_DATABASE[horseId]
            ) {
              MARKET_DATABASE[horseId] = {
                horse: runner.horse,
                openingOdds: currentOdds,
                currentOdds,
                lowestOdds: currentOdds,
                highestOdds: currentOdds,
                movements: [],
                steamCount: 0,
                driftCount: 0,
                marketSignals: [],
              }
            }

            const market =
              MARKET_DATABASE[horseId]

            const profile =
              HORSE_DATABASE[horseId]

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

            if (
              market.steamCount > 2
            ) {
              createAlert(
                horseId,
                runner.horse,
                'MARKET_STEAM',
                'Heavy market support detected',
                'HIGH'
              )
            }

            if (
              replayFlags.includes(
                'Hidden Value Runner'
              )
            ) {
              createAlert(
                horseId,
                runner.horse,
                'HIDDEN_VALUE',
                'Hidden value replay profile detected',
                'MEDIUM'
              )
            }

            if (
              currentOdds &&
              market.currentOdds
            ) {
              const previousOdds =
                market.currentOdds

              const movement =
                previousOdds -
                currentOdds

              if (movement > 1) {
                market.steamCount += 1

                market.marketSignals.push(
                  {
                    type: 'STEAMER',
                    movement,
                    timestamp:
                      new Date().toISOString(),
                  }
                )
              }

              if (movement < -1) {
                market.driftCount += 1

                market.marketSignals.push(
                  {
                    type: 'DRIFTER',
                    movement,
                    timestamp:
                      new Date().toISOString(),
                  }
                )
              }

              market.movements.push({
                previousOdds,
                currentOdds,
                movement,
                timestamp:
                  new Date().toISOString(),
              })

              market.currentOdds =
                currentOdds

              market.lowestOdds =
                Math.min(
                  market.lowestOdds ||
                    currentOdds,
                  currentOdds
                )

              market.highestOdds =
                Math.max(
                  market.highestOdds ||
                    currentOdds,
                  currentOdds
                )
            }

            profile.runs += 1

            profile.lastSeen =
              new Date().toISOString()

            profile.bestScore =
              Math.max(
                profile.bestScore,
                score
              )

            profile.averageScore =
              Math.round(
                (
                  profile.averageScore *
                    (profile.runs -
                      1) +
                  score
                ) / profile.runs
              )

            if (
              !profile.courses.includes(
                race.course
              )
            ) {
              profile.courses.push(
                race.course
              )
            }

            replayFlags.forEach(
              (flag) => {
                if (
                  !profile.replayFlags.includes(
                    flag
                  )
                ) {
                  profile.replayFlags.push(
                    flag
                  )
                }

                REPLAY_DATABASE[
                  horseId
                ].replayNotes.push({
                  date:
                    new Date().toISOString(),
                  race: race.race_name,
                  course: race.course,
                  note: flag,
                  confidence: score,
                })
              }
            )

            return {
              ...runner,
              score,
              replayTriggers:
                replayFlags,
              horseProfile: profile,
              market,
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
      HORSE_DB_PATH,
      HORSE_DATABASE
    )

    saveDatabase(
      REPLAY_DB_PATH,
      REPLAY_DATABASE
    )

    saveDatabase(
      MARKET_DB_PATH,
      MARKET_DATABASE
    )

    saveDatabase(
      ALERT_DB_PATH,
      ALERT_DATABASE
    )

    console.log(
      `Loaded ${processed.length} races`
    )

    console.log(
      'Live alert engine active'
    )
  } catch (error) {
    console.error(
      'Live engine failed:',
      error
    )
  }
}

fetchLiveMeetings().catch(console.error)

setInterval(() => {
  fetchLiveMeetings().catch(
    console.error
  )
}, 60000)

app.get('/api/live-state', (_req, res) => {
  res.json(LIVE_STATE)
})

app.get('/api/horses', (_req, res) => {
  res.json(HORSE_DATABASE)
})

app.get(
  '/api/replay-flags',
  (_req, res) => {
    res.json(REPLAY_DATABASE)
  }
)

app.get(
  '/api/market-movers',
  (_req, res) => {
    const movers = Object.values(
      MARKET_DATABASE
    )
      .sort(
        (a, b) =>
          b.steamCount -
          a.steamCount
      )
      .slice(0, 50)

    res.json(movers)
  }
)

app.get('/api/alerts', (_req, res) => {
  const alerts = Object.values(
    ALERT_DATABASE
  )
    .flat()
    .sort(
      (a, b) =>
        new Date(b.timestamp) -
        new Date(a.timestamp)
    )
    .slice(0, 100)

  res.json(alerts)
})

app.listen(PORT, () => {
  console.log(
    `APEX live engine running on port ${PORT}`
  )
})