import type { Race, Runner } from '../lib/types'

interface PaceMapProps {
  race: Race
}

function detectRunStyle(runner: Runner) {
  const score = runner.score || 0

  if (score >= 90) return 'Leader'
  if (score >= 75) return 'Prominent'
  if (score >= 60) return 'Midfield'

  return 'Hold Up'
}

const styleConfig: Record<string, string> = {
  Leader: 'bg-red-500/20 border-red-500/20 text-red-400',
  Prominent: 'bg-amber-500/20 border-amber-500/20 text-amber-300',
  Midfield: 'bg-cyan-500/20 border-cyan-500/20 text-cyan-300',
  'Hold Up': 'bg-zinc-500/20 border-zinc-500/20 text-zinc-300',
}

export default function PaceMap({ race }: PaceMapProps) {
  const runners = (race.runners || []).map((runner: Runner) => ({
    ...runner,
    style: detectRunStyle(runner),
  }))

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Pace Map</h2>

        <p className='text-muted-foreground'>
          Predicted race shape and tactical positioning
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
                className={`text-xs px-3 py-1 rounded-lg border ${styleConfig[runner.style]}`}
              >
                {runner.style}
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
