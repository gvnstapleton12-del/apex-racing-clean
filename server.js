import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

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

const HORSE_DATABASE = loadDatabase(HORSE_DB_PATH)
const REPLAY_DATABASE = loadDatabase(REPLAY_DB_PATH)

const LIVE_STATE = {
  racecards: [],
  updatedAt: null,
  loading: true,
}

function generateReplayFlags(runner, score) {
  const flags = []

  if (score >= 80) {
    flags.push('Strong Finish')
  }

  if (runner.form?.includes('0')) {
    flags.push('Potential Bounce Back')
  }

  if (runner.odds && parseFloat(runner.odds) > 10) {
    flags.push('Hidden Value Runner')
  }

  if (runner.draw && Number(runner.draw) > 10) {
    flags.push('Wide Draw Challenge')
  }

  return flags
}

async function fetchLiveMeetings() {
  try {
    console.log('Refreshing live meetings...')

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

    const processed = racecards.map((race) => {
      const runners = race.runners || []

      const scoredRunners = runners.map((runner) => {
        let score = 50

        if (runner.form?.includes('1')) score += 15
        if (runner.form?.includes('2')) score += 10

        if (runner.odds && parseFloat(runner.odds) < 6) {
          score += 15
        }

        const replayFlags = generateReplayFlags(
          runner,
          score
        )

        const horseId =
          runner.horse_id || runner.horse

        if (!HORSE_DATABASE[horseId]) {
          HORSE_DATABASE[horseId] = {
            horse: runner.horse,
            runs: 0,
            wins: 0,
            averageScore: 0,
            bestScore: 0,
            replayFlags: [],
            courses: [],
            notes: [],
            trainer: runner.trainer,
            jockey: runner.jockey,
            marketSupport: 0,
          }
        }

        if (!REPLAY_DATABASE[horseId]) {
          REPLAY_DATABASE[horseId] = {
            horse: runner.horse,
            replayNotes: [],
          }
        }

        const profile = HORSE_DATABASE[horseId]

        profile.runs += 1
        profile.lastSeen = new Date().toISOString()

        profile.bestScore = Math.max(
          profile.bestScore,
          score
        )

        profile.averageScore = Math.round(
          (
            profile.averageScore *
              (profile.runs - 1) +
            score
          ) / profile.runs
        )

        if (
          !profile.courses.includes(race.course)
        ) {
          profile.courses.push(race.course)
        }

        replayFlags.forEach((flag) => {
          if (
            !profile.replayFlags.includes(flag)
          ) {
            profile.replayFlags.push(flag)
          }

          REPLAY_DATABASE[
            horseId
          ].replayNotes.push({
            date: new Date().toISOString(),
            race: race.race_name,
            course: race.course,
            note: flag,
            confidence: score,
          })
        })

        return {
          ...runner,
          score,
          replayTriggers: replayFlags,
          horseProfile: profile,
        }
      })

      return {
        ...race,
        runners: scoredRunners.sort(
          (a, b) => b.score - a.score
        ),
      }
    })

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

    console.log(
      `Loaded ${processed.length} races`
    )

    console.log(
      `Tracked ${
        Object.keys(HORSE_DATABASE).length
      } horses`
    )

    console.log(
      `Replay intelligence active for ${
        Object.keys(REPLAY_DATABASE).length
      } horses`
    )
  } catch (error) {
    console.error('Live engine failed:', error)
  }
}

fetchLiveMeetings().catch(console.error)

setInterval(() => {
  fetchLiveMeetings().catch(console.error)
}, 60000)

app.get('/api/live-state', (_req, res) => {
  res.json(LIVE_STATE)
})

app.get('/api/horses', (_req, res) => {
  res.json(HORSE_DATABASE)
})

app.get('/api/replay-flags', (_req, res) => {
  res.json(REPLAY_DATABASE)
})

app.listen(PORT, () => {
  console.log(
    `APEX live engine running on port ${PORT}`
  )
})