import { formatOffTime } from '../lib/formatTime'

interface ValueIndexProps {
  races: any[]
}

function parseOdds(odds?: string) {
  if (!odds) return 1

  if (odds.includes('/')) {
    const [a, b] = odds.split('/').map(Number)
    return a / b + 1
  }

  const n = parseFloat(odds)
  return isNaN(n) ? 1 : n
}

export default function ValueIndex({ races }: ValueIndexProps) {
  const valueRunners = races.flatMap((race: any) =>
    (race.runners || []).map((runner: any) => {
      const odds = parseOdds(runner.odds)
      const score = runner.score || 0

      const valueIndex = Number(((score / odds) * 10).toFixed(1))

      return {
        horse: runner.horse,
        race: race.race_name,
        course: race.course,
        time: formatOffTime(race),
        odds: runner.odds,
        score,
        valueIndex,
      }
    })
  )

  const sorted = valueRunners
    .sort((a: any, b: any) => b.valueIndex - a.valueIndex)
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
