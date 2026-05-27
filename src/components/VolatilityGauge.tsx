import { formatOffTime } from '../lib/formatTime'
import { calculateRaceVolatility, getVolatilityLabel } from '../lib/engine'
import type { Race } from '../lib/types'

interface VolatilityGaugeProps {
  races: Race[]
}

export default function VolatilityGauge({ races }: VolatilityGaugeProps) {
  const raceVolatility = races.map((race: Race) => {
    const volatility = calculateRaceVolatility(race.runners || [])
    const { label, style } = getVolatilityLabel(volatility)

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
        {raceVolatility.map((race, index: number) => (
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
