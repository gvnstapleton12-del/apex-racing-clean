import { formatOffTime } from '../lib/formatTime'

interface VolatilityGaugeProps {
  races: any[]
}

function calculateVolatility(runners: any[]) {
  if (!runners || runners.length === 0) return 0

  const scores = runners.map((r: any) => r.score || 0)

  const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length

  const variance = scores.reduce((acc: number, score: number) => {
    return acc + Math.pow(score - avg, 2)
  }, 0) / scores.length

  return Math.round(Math.sqrt(variance))
}

export default function VolatilityGauge({ races }: VolatilityGaugeProps) {
  const raceVolatility = races.map((race: any) => {
    const volatility = calculateVolatility(race.runners || [])

    let label = 'Stable'
    let style = 'text-green-400 border-green-500/20 bg-green-500/10'

    if (volatility >= 15) {
      label = 'High Chaos'
      style = 'text-red-400 border-red-500/20 bg-red-500/10'
    } else if (volatility >= 8) {
      label = 'Volatile'
      style = 'text-amber-400 border-amber-500/20 bg-amber-500/10'
    }

    return {
      race: race.race_name,
      course: race.course,
      time: formatOffTime(race),
      volatility,
      label,
      style,
    }
  })

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Volatility Gauge</h2>

        <p className='text-muted-foreground'>
          Measures confidence instability and race chaos
        </p>
      </div>

      <div className='space-y-3'>
        {raceVolatility.map((race: any, index: number) => (
          <div
            key={index}
            className='rounded-xl border p-4 flex items-center justify-between'
          >
            <div>
              <p className='text-sm text-muted-foreground'>
                {race.time} · {race.course}
              </p>

              <h3 className='font-semibold text-lg mt-1'>
                {race.race}
              </h3>
            </div>

            <div className='text-right'>
              <div
                className={`text-xs px-3 py-1 rounded-lg border ${race.style}`}
              >
                {race.label}
              </div>

              <p className='mt-2 text-xl font-bold'>
                {race.volatility}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
