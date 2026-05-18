import { useQuery } from '@tanstack/react-query'
import { fetchRacecards } from '@/lib/racingApi'
import { runApexEngineForField } from '@/lib/apexEngine'
import { detectReplayTriggers } from '@/lib/replayTriggers'

export default function Racecards() {
  const { data: races = [], isLoading } = useQuery({
    queryKey: ['racecards'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

  if (isLoading) {
    return (
      <div className='p-6'>
        <div className='border rounded-xl p-6 bg-card'>
          Loading live racecards...
        </div>
      </div>
    )
  }

  return (
    <div className='p-6 space-y-4'>
      <div>
        <h1 className='text-3xl font-bold'>Live Racecards</h1>
        <p className='text-muted-foreground'>UK & Ireland meetings only</p>
      </div>

      {races.map((race: any, index: number) => {
        const scoredRunners = runApexEngineForField(
          (race.runners || []).map((runner: any) => {
            const triggers = detectReplayTriggers(
              {
                form: runner.form,
                odds: runner.odds,
              },
              {
                fieldSize: race.field_size,
                raceName: race.race_name,
              }
            )

            return {
              ...runner,
              replayTriggers: triggers,
            }
          })
        )

        const topRated = scoredRunners?.[0]

        return (
          <div
            key={race.race_id || index}
            className='border rounded-2xl bg-card p-6 space-y-4'
          >
            <div className='flex items-center justify-between'>
              <div>
                <h2 className='text-2xl font-semibold'>
                  {race.race_name}
                </h2>

                <p className='text-muted-foreground'>
                  {race.course} · {race.off_time}
                </p>
              </div>

              <div className='text-right'>
                <p>{race.field_size} runners</p>
                <p className='text-amber-400'>LIVE</p>
              </div>
            </div>

            {topRated && (
              <div className='rounded-xl border border-amber-500/30 bg-amber-500/10 p-4'>
                <p className='text-sm text-amber-300 mb-1'>Top Rated</p>

                <div className='flex items-center justify-between'>
                  <h3 className='text-xl font-bold'>
                    {topRated.horse}
                  </h3>

                  <p className='text-amber-400 font-semibold'>
                    {topRated.score}
                  </p>
                </div>
              </div>
            )}

            <div className='grid gap-3'>
              {scoredRunners.slice(0, 5).map((runner: any, runnerIndex: number) => (
                <div
                  key={runnerIndex}
                  className='border rounded-xl p-4 flex items-center justify-between'
                >
                  <div>
                    <h4 className='font-semibold'>
                      {runner.horse}
                    </h4>

                    <p className='text-sm text-muted-foreground'>
                      {runner.jockey} · {runner.trainer}
                    </p>

                    <div className='flex gap-2 mt-2 flex-wrap'>
                      {(runner.replayTriggers || []).map((trigger: any) => (
                        <span
                          key={trigger.key}
                          className='text-xs px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300'
                        >
                          {trigger.short}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className='text-right'>
                    <p className='font-bold text-lg'>
                      {runner.score}
                    </p>

                    <p className='text-amber-400'>
                      {runner.odds}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
