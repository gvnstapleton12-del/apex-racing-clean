import { formatOffTime } from '../lib/formatTime'
import { getScore, filterLiveAlerts, groupByTrainerWithMin } from '../lib/engine'
import type { Race, Runner, ReplayTrigger } from '../lib/types'

function selectHorse(horse: string, race: { course?: string; off_time?: string }) {
  window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse, course: race.course, offTime: race.off_time } }))
}

interface StableAlertsProps {
  races: Race[]
}

export default function StableAlerts({ races }: StableAlertsProps) {
  const alerts = races.flatMap((race: Race) =>
    filterLiveAlerts(race.runners || []).map((runner: Runner) => ({
      horse: runner.horse,
      trainer: runner.trainer,
      score: getScore(runner),
      odds: runner.odds,
      race: race.race_name,
      course: race.course,
      time: formatOffTime(race),
      off_time: race.off_time,
      triggers: runner.replayTriggers || [],
    }))
  )

  const trainerAlerts = groupByTrainerWithMin(alerts, 2)

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Stable Alerts</h2>

        <p className='text-muted-foreground'>
          Trainers with multiple high-confidence runners today
        </p>
      </div>

      <div className='space-y-4'>
        {trainerAlerts.length === 0 ? (
          <div className='rounded-xl border p-5 text-muted-foreground'>
            No major stable alerts detected.
          </div>
        ) : (
          trainerAlerts.map((stable, index: number) => (
            <div
              key={index}
              className='rounded-xl border p-5'
            >
              <div className='flex items-center justify-between mb-4'>
                <div>
                  <h3 className='text-xl font-bold'>
                    {stable.trainer}
                  </h3>

                  <p className='text-sm text-muted-foreground'>
                    {stable.runners.length} strong runners detected
                  </p>
                </div>

                <span className='text-xs px-3 py-1 rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-300'>
                  STABLE ALERT
                </span>
              </div>

              <div className='space-y-3'>
                {stable.runners.map((runner, runnerIndex: number) => (
                  <div
                    key={runnerIndex}
                    className='rounded-lg border p-4 flex items-center justify-between'
                  >
                    <div>
                      <p className='font-semibold'>
                        <button type='button' className='hover:text-amber-300 transition text-left' onClick={() => selectHorse(runner.horse!, runner)}>
                          {runner.horse}
                        </button>
                      </p>

                      <p className='text-sm text-muted-foreground'>
                        {runner.time} · {runner.course}
                      </p>
                    </div>

                    <div className='text-right'>
                      <p className='text-lg font-bold text-purple-300'>
                        {runner.score}
                      </p>

                      <p className='text-sm text-muted-foreground'>
                        {runner.odds}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
