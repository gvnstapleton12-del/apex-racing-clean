import { formatOffTime } from '../lib/formatTime'

interface SmartMoneyTrackerProps {
  races: any[]
}

function parseOdds(odds?: string) {
  if (!odds) return null

  if (odds.includes('/')) {
    const [a, b] = odds.split('/').map(Number)
    return a / b + 1
  }

  const n = parseFloat(odds)
  return isNaN(n) ? null : n
}

export default function SmartMoneyTracker({ races }: SmartMoneyTrackerProps) {
  const smartMoney = races.flatMap((race: any) =>
    (race.runners || [])
      .filter((runner: any) => {
        const odds = parseOdds(runner.odds)

        return (
          odds !== null &&
          odds <= 4 &&
          (runner.score || 0) >= 80
        )
      })
      .map((runner: any) => ({
        horse: runner.horse,
        odds: runner.odds,
        score: runner.score,
        race: race.race_name,
        course: race.course,
        time: formatOffTime(race),
        triggers: runner.replayTriggers || [],
      }))
  )

  const sorted = smartMoney.sort(
    (a: any, b: any) => (b.score || 0) - (a.score || 0)
  )

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Smart Money Tracker</h2>

        <p className='text-muted-foreground'>
          Strong market support aligned with APEX confidence
        </p>
      </div>

      <div className='space-y-3'>
        {sorted.length === 0 ? (
          <div className='rounded-xl border p-5 text-muted-foreground'>
            No smart money runners detected.
          </div>
        ) : (
          sorted.map((runner: any, index: number) => (
            <div
              key={index}
              className='rounded-xl border p-4 flex items-center justify-between'
            >
              <div>
                <div className='flex items-center gap-2 mb-2'>
                  <span className='text-xs px-2 py-1 rounded-lg border border-green-500/20 bg-green-500/10 text-green-400'>
                    SMART MONEY
                  </span>

                  <p className='text-sm text-muted-foreground'>
                    {runner.time} · {runner.course}
                  </p>
                </div>

                <h3 className='font-bold text-lg'>
                  {runner.horse}
                </h3>

                <p className='text-sm text-muted-foreground'>
                  {runner.race}
                </p>

                <div className='flex gap-2 mt-2 flex-wrap'>
                  {runner.triggers.map((trigger: any) => (
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
                <p className='text-3xl font-bold text-green-400'>
                  {runner.odds}
                </p>

                <p className='text-sm text-muted-foreground mt-1'>
                  Score {runner.score}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
