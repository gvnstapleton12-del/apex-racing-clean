import { useMemo } from 'react'
import { formatOffTime } from '../lib/formatTime'
import { getScore, filterLiveAlerts, sortByScore } from '../lib/engine'
import type { Race, Runner, ReplayTrigger } from '../lib/types'

function selectHorse(horse: string, race: { course?: string; off_time?: string }) {
  window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse, course: race.course, offTime: race.off_time } }))
}

interface LiveAlertsFeedProps {
  races: Race[]
}

export default function LiveAlertsFeed({ races }: LiveAlertsFeedProps) {
  const alerts = useMemo(() => {
    return races.flatMap((race: Race) =>
      filterLiveAlerts(race.runners || []).map((runner: Runner) => ({
        horse: runner.horse,
        race: race.race_name,
        course: race.course,
        time: formatOffTime(race),
        off_time: race.off_time,
        score: getScore(runner),
        odds: runner.odds,
        triggers: runner.replayTriggers || [],
      }))
    )
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
  }, [races])

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5 flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold'>Live Alerts Feed</h2>

          <p className='text-muted-foreground'>
            Real-time intelligence and confidence alerts
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <div className='h-2 w-2 rounded-full bg-green-400 animate-pulse' />
          <span className='text-sm text-green-400'>LIVE</span>
        </div>
      </div>

      <div className='space-y-3'>
        {alerts.length === 0 ? (
          <div className='rounded-xl border p-5 text-muted-foreground'>
            No live alerts detected.
          </div>
        ) : (
          alerts.map((alert, index: number) => (
            <div
              key={index}
              className='rounded-xl border p-4 flex items-center justify-between bg-gradient-to-r from-zinc-950 to-black'
            >
              <div>
                <div className='flex items-center gap-2 mb-2'>
                  <span className='text-xs px-2 py-1 rounded-lg border border-red-500/20 bg-red-500/10 text-red-300'>
                    ALERT
                  </span>

                  <p className='text-sm text-muted-foreground'>
                    {alert.time} · {alert.course}
                  </p>
                </div>

                <h3 className='font-bold text-lg'>
                  <button type='button' className='hover:text-amber-300 transition text-left' onClick={() => selectHorse(alert.horse!, alert)}>
                    {alert.horse}
                  </button>
                </h3>

                <p className='text-sm text-muted-foreground'>
                  {alert.race}
                </p>

                <div className='flex gap-2 mt-2 flex-wrap'>
                  {alert.triggers.map((trigger: ReplayTrigger) => (
                    <span
                      key={trigger.key}
                      className='text-xs px-2 py-1 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300'
                    >
                      {trigger.short}
                    </span>
                  ))}
                </div>
              </div>

              <div className='text-right'>
                <p className='text-3xl font-bold text-red-300'>
                  {alert.score}
                </p>

                <p className='text-sm text-muted-foreground mt-1'>
                  {alert.odds}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
