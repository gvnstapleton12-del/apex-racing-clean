import { formatOffTime } from '../lib/formatTime'

interface PerformanceTimelineProps {
  races: any[]
}

export default function PerformanceTimeline({ races }: PerformanceTimelineProps) {
  const timeline = races
    .flatMap((race: any) =>
      (race.runners || []).map((runner: any) => ({
        horse: runner.horse,
        score: runner.score || 0,
        odds: runner.odds,
        race: race.race_name,
        course: race.course,
        time: formatOffTime(race),
      }))
    )
    .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
    .slice(0, 20)

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Performance Timeline</h2>

        <p className='text-muted-foreground'>
          Chronological confidence flow across today's meetings
        </p>
      </div>

      <div className='space-y-4'>
        {timeline.map((item: any, index: number) => (
          <div
            key={index}
            className='flex items-start gap-4'
          >
            <div className='flex flex-col items-center'>
              <div className='h-4 w-4 rounded-full bg-amber-400' />

              {index !== timeline.length - 1 && (
                <div className='w-px h-16 bg-border mt-2' />
              )}
            </div>

            <div className='flex-1 rounded-xl border p-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    {item.time} · {item.course}
                  </p>

                  <h3 className='font-bold text-lg mt-1'>
                    {item.horse}
                  </h3>

                  <p className='text-sm text-muted-foreground'>
                    {item.race}
                  </p>
                </div>

                <div className='text-right'>
                  <p className='text-3xl font-bold text-amber-400'>
                    {item.score}
                  </p>

                  <p className='text-sm text-muted-foreground'>
                    {item.odds}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
