import { formatOffTime } from '../lib/formatTime'

interface ReplayWatchlistProps {
  races: any[]
}

export default function ReplayWatchlist({ races }: ReplayWatchlistProps) {
  const flagged = races.flatMap((race: any) =>
    (race.runners || [])
      .filter((runner: any) =>
        runner.replayTriggers && runner.replayTriggers.length > 0
      )
      .map((runner: any) => ({
        horse: runner.horse,
        race: race.race_name,
        course: race.course,
        time: formatOffTime(race),
        triggers: runner.replayTriggers,
      }))
  )

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Replay Watchlist</h2>

        <p className='text-muted-foreground'>
          Horses flagged by replay intelligence
        </p>
      </div>

      <div className='space-y-4'>
        {flagged.length === 0 ? (
          <div className='rounded-xl border p-5 text-muted-foreground'>
            No replay triggers detected.
          </div>
        ) : (
          flagged.map((item: any, index: number) => (
            <div
              key={index}
              className='rounded-xl border p-4 flex items-center justify-between'
            >
              <div>
                <div className='flex items-center gap-2 mb-2'>
                  <span className='text-xs px-2 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20'>
                    WATCHLIST
                  </span>

                  <p className='text-sm text-muted-foreground'>
                    {item.time} · {item.course}
                  </p>
                </div>

                <h3 className='font-bold text-lg'>
                  {item.horse}
                </h3>

                <p className='text-sm text-muted-foreground'>
                  {item.race}
                </p>

                <div className='flex gap-2 mt-3 flex-wrap'>
                  {item.triggers.map((trigger: any) => (
                    <span
                      key={trigger.key}
                      className='text-xs px-2 py-1 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300'
                    >
                      {trigger.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
