import { formatOffTime } from '../lib/formatTime'
import { parseOdds } from '../lib/parseOdds'
import type { Race, Runner, ReplayTrigger } from '../lib/types'

interface MarketMoverBoardProps {
  races: Race[]
}

export default function MarketMoverBoard({ races }: MarketMoverBoardProps) {
  const movers = races.flatMap((race: Race) =>
    (race.runners || [])
      .filter((runner: Runner) => {
        if (!runner.odds) return false
        const odds = parseOdds(runner.odds)
        return odds <= 5
      })
      .map((runner: Runner) => ({
        horse: runner.horse,
        odds: runner.odds,
        score: runner.score,
        race: race.race_name,
        course: race.course,
        time: formatOffTime(race),
        triggers: runner.replayTriggers || [],
      }))
  )

  const sorted = movers.sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  )

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Market Movers</h2>

        <p className='text-muted-foreground'>
          Strongly backed runners with APEX confidence
        </p>
      </div>

      <div className='space-y-3'>
        {sorted.map((runner, index: number) => (
          <div
            key={index}
            className='rounded-xl border p-4 flex items-center justify-between'
          >
            <div>
              <div className='flex items-center gap-2 mb-2'>
                <span className='text-xs px-2 py-1 rounded-lg border border-green-500/20 bg-green-500/10 text-green-400'>
                  MARKET SUPPORT
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
                {runner.triggers.map((trigger: ReplayTrigger) => (
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
              <p className='text-2xl font-bold text-green-400'>
                {runner.odds}
              </p>

              <p className='text-sm text-muted-foreground mt-1'>
                Score {runner.score}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
