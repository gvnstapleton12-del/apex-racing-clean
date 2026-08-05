import { aggregateJockeyMetrics } from '../lib/engine'
import type { Race } from '../lib/types'

interface JockeyTrackerProps {
  races: Race[]
}

export default function JockeyTracker({ races }: JockeyTrackerProps) {
  const jockeys = aggregateJockeyMetrics(races)

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
