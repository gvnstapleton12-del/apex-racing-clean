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

function loadHorseDatabase() {
  try {
    if (!fs.existsSync(HORSE_DB_PATH)) {
      return {}
    }

    const raw = fs.readFileSync(HORSE_DB_PATH)

    return JSON.parse(raw)
  } catch (error) {
    console.error('Failed to load horse DB:', error)
    return {}
  }
}

function saveHorseDatabase(database) {
  try {
    fs.mkdirSync(path.dirname(HORSE_DB_PATH), {
      recursive: true,
    })

    fs.writeFileSync(
      HORSE_DB_PATH,
      JSON.stringify(database, null, 2)
    )
  } catch (error) {
    console.error('Failed to save horse DB:', error)
  }
}

const HORSE_DATABASE = loadHorseDatabase()

const LIVE_STATE = {
  racecards: [],
  updatedAt: null,
  loading: true,
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

        const horseId = runner.horse_id || runner.horse

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

        if (!profile.courses.includes(race.course)) {
          profile.courses.push(race.course)
        }

        if (score >= 80) {
          if (
            !profile.replayFlags.includes(
              'High Confidence Profile'
            )
          ) {
            profile.replayFlags.push(
              'High Confidence Profile'
            )
          }
        }

        return {
          ...runner,
          score,
          replayTriggers:
            score >= 80
              ? ['Strong Form Profile']
              : [],
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

    saveHorseDatabase(HORSE_DATABASE)

    console.log(
      `Loaded ${processed.length} races`
    )

    console.log(
      `Tracked ${Object.keys(HORSE_DATABASE).length} horses`
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

app.listen(PORT, () => {
  console.log(
    `APEX live engine running on port ${PORT}`
  )
})