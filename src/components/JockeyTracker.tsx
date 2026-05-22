import type { Race, Runner } from '../lib/types'

interface JockeyTrackerProps {
  races: Race[]
}

function calculateJockeyMetrics(races: Race[]) {
  const jockeys: Record<string, {
    jockey: string
    rides: number
    totalScore: number
    avgScore: number
    eliteRides: number
  }> = {}

  races.forEach((race: Race) => {
    ;(race.runners || []).forEach((runner: Runner) => {
      const jockey = runner.jockey || 'Unknown'

      if (!jockeys[jockey]) {
        jockeys[jockey] = {
          jockey,
          rides: 0,
          totalScore: 0,
          avgScore: 0,
          eliteRides: 0,
        }
      }

      jockeys[jockey].rides += 1
      jockeys[jockey].totalScore += runner.score || 0

      if ((runner.score || 0) >= 85) {
        jockeys[jockey].eliteRides += 1
      }

      jockeys[jockey].avgScore = Math.round(
        jockeys[jockey].totalScore / jockeys[jockey].rides
      )
    })
  })

  return Object.values(jockeys)
    .filter((jockey) => jockey.rides >= 2)
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 10)
}

export default function JockeyTracker({ races }: JockeyTrackerProps) {
  const jockeys = calculateJockeyMetrics(races)

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Jockey Tracker</h2>

        <p className='text-muted-foreground'>
          Jockey confidence and elite ride analytics
        </p>
      </div>

      <div className='space-y-3'>
        {jockeys.map((jockey, index) => (
          <div
            key={jockey.jockey}
            className='rounded-xl border p-4 flex items-center justify-between'
          >
            <div>
              <div className='flex items-center gap-2 mb-2'>
                <span className='text-xs px-2 py-1 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300'>
                  #{index + 1}
                </span>

                <p className='text-sm text-muted-foreground'>
                  {jockey.rides} rides · {jockey.eliteRides} elite
                </p>
              </div>

              <h3 className='font-bold text-lg'>
                {jockey.jockey}
              </h3>
            </div>

            <div className='text-right'>
              <p className='text-3xl font-bold text-amber-400'>
                {jockey.avgScore}
              </p>

              <p className='text-sm text-muted-foreground'>
                Avg APEX Score
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
