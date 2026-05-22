import { formatOffTime } from '../lib/formatTime'
import { parseOdds } from '../lib/parseOdds'
import type { Race, Runner } from '../lib/types'

function selectHorse(horse: string, race: { course?: string; off_time?: string }) {
  window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse, course: race.course, offTime: race.off_time } }))
}

interface ValueIndexProps {
  races: Race[]
}

export default function ValueIndex({ races }: ValueIndexProps) {
  const valueRunners = races.flatMap((race: Race) =>
    (race.runners || []).map((runner: Runner) => {
      const odds = parseOdds(runner.odds)
      const score = runner.score || 0

      const valueIndex = Number(((score / odds) * 10).toFixed(1))

      return {
        horse: runner.horse,
        race: race.race_name,
        course: race.course,
        time: formatOffTime(race),
        off_time: race.off_time,
        odds: runner.odds,
        score,
        valueIndex,
      }
    })
  )

  const sorted = valueRunners
    .sort((a, b) => b.valueIndex - a.valueIndex)
    .slice(0, 15)

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Value Index</h2>

        <p className='text-muted-foreground'>
          Model-derived value opportunities across today's races
        </p>
      </div>

      <div className='space-y-3'>
        {sorted.map((runner, index: number) => (
          <div
            key={index}
            className='rounded-xl border p-4 flex items-center justify-between'
          >
            <div>
              <p className='text-sm text-muted-foreground'>
                {runner.time} · {runner.course}
              </p>

              <h3 className='font-bold text-lg mt-1'>
                <button type='button' className='hover:text-amber-300 transition text-left' onClick={() => selectHorse(runner.horse!, runner)}>
                  {runner.horse}
                </button>
              </h3>

              <p className='text-sm text-muted-foreground'>
                {runner.race}
              </p>
            </div>

            <div className='text-right'>
              <div className='text-xs px-3 py-1 rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-300'>
                VALUE INDEX
              </div>

              <p className='text-3xl font-bold text-cyan-300 mt-2'>
                {runner.valueIndex}
              </p>

              <p className='text-sm text-muted-foreground'>
                {runner.odds} · Score {runner.score}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
