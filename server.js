import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3000

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
        if (runner.odds && parseFloat(runner.odds) < 6)
          score += 15

        return {
          ...runner,
          score,
          replayTriggers:
            score >= 80
              ? ['Strong Form Profile']
              : [],
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

    console.log(
      `Loaded ${processed.length} races`
    )
  } catch (error) {
    console.error('Live engine failed:', error)
  }
}

await fetchLiveMeetings()

setInterval(async () => {
  await fetchLiveMeetings()
}, 60000)

app.get('/api/live-state', (_req, res) => {
  res.json(LIVE_STATE)
})

app.listen(PORT, () => {
  console.log(
    `APEX live engine running on port ${PORT}`
  )
})