import type { Race, Runner } from '../lib/types'

interface SectionalTrackerProps {
  race: Race
}

function classifySectional(runner: Runner) {
  const score = runner.score || 0
  const triggers = runner.replayTriggers || []

  if (score >= 90 && triggers.length >= 1) {
    return {
      label: 'Explosive Finish',
      style: 'text-green-400 border-green-500/20 bg-green-500/10',
    }
  }

  if (score >= 75) {
    return {
      label: 'Strong Closer',
      style: 'text-cyan-300 border-cyan-500/20 bg-cyan-500/10',
    }
  }

  if (score >= 60) {
    return {
      label: 'Balanced Pace',
      style: 'text-amber-300 border-amber-500/20 bg-amber-500/10',
    }
  }

  return {
    label: 'Weak Finish',
    style: 'text-red-400 border-red-500/20 bg-red-500/10',
  }
}

export default function SectionalTracker({ race }: SectionalTrackerProps) {
  const runners = (race.runners || [])
    .map((runner: Runner) => ({
      ...runner,
      sectional: classifySectional(runner),
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))

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
