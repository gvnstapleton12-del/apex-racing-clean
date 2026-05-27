import { formatOffTime } from '../lib/formatTime'
import { getScore, generateInsight } from '../lib/engine'
import type { Race, Runner } from '../lib/types'

function selectHorse(horse: string, race: { course?: string; off_time?: string }) {
  window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse, course: race.course, offTime: race.off_time } }))
}

interface AIInsightFeedProps {
  races: Race[]
}

export default function AIInsightFeed({ races }: AIInsightFeedProps) {
  const insights = races.flatMap((race: Race) =>
    (race.runners || [])
      .filter((runner: Runner) => getScore(runner) >= 70)
      .slice(0, 3)
      .map((runner: Runner) => ({
        horse: runner.horse,
        race: race.race_name,
        course: race.course,
        time: formatOffTime(race),
        off_time: race.off_time,
        score: getScore(runner),
        insight: generateInsight(runner),
      }))
  )

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>AI Insight Feed</h2>

        <p className='text-muted-foreground'>
          Generated intelligence observations from APEX
        </p>
      </div>

      <div className='space-y-4'>
        {insights.map((item, index: number) => (
          <div
            key={index}
            className='rounded-xl border p-5 bg-gradient-to-br from-zinc-900 to-black'
          >
            <div className='flex items-center justify-between mb-3'>
              <div>
                <p className='text-sm text-muted-foreground'>
                  {item.time} · {item.course}
                </p>

                <h3 className='text-xl font-bold mt-1'>
                  <button type='button' className='hover:text-amber-300 transition text-left' onClick={() => selectHorse(item.horse!, item)}>
                    {item.horse}
                  </button>
                </h3>
              </div>

              <div className='text-right'>
                <p className='text-3xl font-bold text-cyan-300'>
                  {item.score}
                </p>
              </div>
            </div>

            <p className='text-sm text-muted-foreground mb-3'>
              {item.race}
            </p>

            <div className='rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-4'>
              <p className='text-cyan-100 text-sm leading-relaxed'>
                {item.insight}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
