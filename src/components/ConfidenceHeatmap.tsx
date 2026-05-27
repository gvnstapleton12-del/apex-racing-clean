import { formatOffTime } from '../lib/formatTime'
import { getScore, sortByScore, getConfidenceStyle } from '../lib/engine'
import type { Race, Runner } from '../lib/types'

function selectHorse(horse: string, race: { course?: string; off_time?: string }) {
  window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse, course: race.course, offTime: race.off_time } }))
}

interface ConfidenceHeatmapProps {
  races: Race[]
}

export default function ConfidenceHeatmap({ races }: ConfidenceHeatmapProps) {
  const runners = races.flatMap((race: Race) =>
    (race.runners || []).map((runner: Runner) => ({
      horse: runner.horse,
      score: getScore(runner),
      race: race.race_name,
      course: race.course,
      time: formatOffTime(race),
      off_time: race.off_time,
    }))
  )

  const sorted = sortByScore(runners as unknown as Runner[])
    .slice(0, 20) as unknown as typeof runners

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Confidence Heatmap</h2>

        <p className='text-muted-foreground'>
          Engine confidence across today's runners
        </p>
      </div>

      <div className='grid gap-3'>
        {sorted.map((runner, index: number) => {
          const confidence = getConfidence(runner.score)

          return (
            <div
              key={index}
              className='rounded-xl border p-4 flex items-center justify-between'
            >
              <div>
                <p className='text-sm text-muted-foreground'>
                  {runner.time} · {runner.course}
                </p>

                <h3 className='font-semibold text-lg mt-1'>
                  <button type='button' className='hover:text-amber-300 transition text-left' onClick={() => selectHorse(runner.horse!, runner)}>
                    {runner.horse}
                  </button>
                </h3>

                <p className='text-sm text-muted-foreground'>
                  {runner.race}
                </p>
              </div>

              <div className='text-right'>
                <div
                  className={`text-xs px-3 py-1 rounded-lg border ${confidence.style}`}
                >
                  {confidence.label}
                </div>

                <p className='text-2xl font-bold mt-2'>
                  {runner.score}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
