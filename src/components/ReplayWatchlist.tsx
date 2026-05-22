import { formatOffTime } from '../lib/formatTime'
import type { Race, Runner, ReplayTrigger } from '../lib/types'

function selectHorse(horse: string, race: { course?: string; off_time?: string }) {
  window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse, course: race.course, offTime: race.off_time } }))
}

interface ReplayWatchlistProps {
  races: Race[]
}

export default function ReplayWatchlist({ races }: ReplayWatchlistProps) {
  const flagged = races.flatMap((race: Race) =>
    (race.runners || [])
      .filter((runner: Runner) =>
        runner.replayTriggers && runner.replayTriggers.length > 0
      )
      .map((runner: Runner) => ({
        horse: runner.horse,
        race: race.race_name,
        course: race.course,
        time: formatOffTime(race),
        off_time: race.off_time,
        triggers: runner.replayTriggers!,
        highSeverity: runner.replayTriggers!.some((t: ReplayTrigger) => t.severity === 'high'),
      }))
  )

  const sorted = flagged.sort((a, b) => {
    if (a.highSeverity && !b.highSeverity) return -1
    if (!a.highSeverity && b.highSeverity) return 1
    return 0
  })

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Replay Watchlist</h2>
        <p className='text-muted-foreground'>
          Horses flagged by replay intelligence {flagged.length > 0 ? `(${flagged.length})` : ''}
        </p>
      </div>
      <div className='space-y-4'>
        {flagged.length === 0 ? (
          <div className='rounded-xl border p-5 text-muted-foreground'>
            No replay triggers detected.
          </div>
        ) : (
          flagged.map((item, index: number) => (
            <div
              key={index}
              className={`rounded-xl border p-4 ${item.highSeverity ? 'border-red-500/30' : ''}`}
            >
              <div className='flex items-center gap-2 mb-2'>
                <span className={`text-xs px-2 py-1 rounded-lg ${item.highSeverity ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'}`}>
                  {item.highSeverity ? 'HIGH PRIORITY' : 'WATCHLIST'}
                </span>
                <p className='text-sm text-muted-foreground'>
                  {item.time} · {item.course}
                </p>
              </div>
              <h3 className='font-bold text-lg'>
                <button type='button' className='hover:text-amber-300 transition text-left' onClick={() => selectHorse(item.horse!, item)}>
                  {item.horse}
                </button>
              </h3>
              <p className='text-sm text-muted-foreground mb-2'>{item.race}</p>
              <div className='flex gap-2 flex-wrap'>
                {item.triggers.map((trigger: ReplayTrigger) => (
                  <span
                    key={trigger.key}
                    className={`text-xs px-2 py-1 rounded-lg border ${
                      trigger.severity === 'high' ? 'border-red-500/20 bg-red-500/10 text-red-400' :
                      trigger.severity === 'medium' ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' :
                      'border-cyan-500/20 bg-cyan-500/10 text-cyan-300'
                    }`}
                  >
                    {trigger.label}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
