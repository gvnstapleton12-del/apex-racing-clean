import { useState } from 'react'

interface BettingModesProps {
  races: any[]
}

export default function BettingModes({ races }: BettingModesProps) {
  const [mode, setMode] = useState('balanced')

  const runners = races.flatMap((race: any) =>
    (race.runners || []).map((runner: any) => ({
      ...runner,
      race: race.race_name,
      course: race.course,
      time: race.off_time,
    }))
  )

  const filtered = runners.filter((runner: any) => {
    const score = runner.score || 0

    if (mode === 'safe') {
      return score >= 85
    }

    if (mode === 'balanced') {
      return score >= 75
    }

    return score >= 65
  })

  const sorted = filtered
    .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
    .slice(0, 10)

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='flex items-center justify-between mb-5'>
        <div>
          <h2 className='text-2xl font-bold'>Betting Modes</h2>

          <p className='text-muted-foreground'>
            Switch between risk-adjusted APEX strategies
          </p>
        </div>

        <div className='flex gap-2'>
          {['safe', 'balanced', 'aggressive'].map((item) => (
            <button
              key={item}
              onClick={() => setMode(item)}
              className={`px-4 py-2 rounded-lg border capitalize transition ${
                mode === item
                  ? 'bg-amber-500 text-black border-amber-500'
                  : 'bg-background'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className='space-y-3'>
        {sorted.map((runner: any, index: number) => (
          <div
            key={index}
            className='rounded-xl border p-4 flex items-center justify-between'
          >
            <div>
              <p className='text-sm text-muted-foreground'>
                {runner.time} · {runner.course}
              </p>

              <h3 className='font-bold text-lg mt-1'>
                {runner.horse}
              </h3>

              <p className='text-sm text-muted-foreground'>
                {runner.race}
              </p>
            </div>

            <div className='text-right'>
              <p className='text-3xl font-bold text-amber-400'>
                {runner.score}
              </p>

              <p className='text-sm text-muted-foreground'>
                {runner.odds}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
