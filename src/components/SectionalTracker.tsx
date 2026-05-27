import { getScore, classifySectional, sortByScore } from '../lib/engine'
import type { Race, Runner } from '../lib/types'

interface SectionalTrackerProps {
  race: Race
}

export default function SectionalTracker({ race }: SectionalTrackerProps) {
  const runners = sortByScore(race.runners || [])
    .map((runner: Runner) => ({
      ...runner,
      sectional: classifySectional(runner),
    }))

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Sectional Tracker</h2>

        <p className='text-muted-foreground'>
          Late pace and finishing strength projections
        </p>
      </div>

      <div className='space-y-3'>
        {runners.map((runner, index: number) => (
          <div
            key={index}
            className='rounded-xl border p-4 flex items-center justify-between'
          >
            <div>
              <h3 className='font-bold text-lg'>
                {runner.horse}
              </h3>

              <p className='text-sm text-muted-foreground'>
                {runner.jockey} · {runner.trainer}
              </p>
            </div>

            <div className='text-right'>
              <div
                className={`text-xs px-3 py-1 rounded-lg border ${runner.sectional.style}`}
              >
                {runner.sectional.label}
              </div>

              <p className='text-sm text-muted-foreground mt-2'>
                Score {runner.score}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
