import { formatOffTime } from '../lib/formatTime'

interface AIInsightFeedProps {
  races: any[]
}

function generateInsight(runner: any) {
  if ((runner.score || 0) >= 90) {
    return 'Elite confidence profile detected with strong model alignment.'
  }

  if ((runner.replayTriggers || []).length >= 2) {
    return 'Replay intelligence suggests hidden upside not reflected in market positioning.'
  }

  if ((runner.score || 0) >= 75 && runner.odds) {
    return 'Strong scoring runner with stable confidence metrics.'
  }

  return 'Moderate profile runner requiring market monitoring.'
}

export default function AIInsightFeed({ races }: AIInsightFeedProps) {
  const insights = races.flatMap((race: any) =>
    (race.runners || [])
      .filter((runner: any) => (runner.score || 0) >= 70)
      .slice(0, 3)
      .map((runner: any) => ({
        horse: runner.horse,
        race: race.race_name,
        course: race.course,
        time: formatOffTime(race),
        score: runner.score,
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
        {insights.map((item: any, index: number) => (
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
                  {item.horse}
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
