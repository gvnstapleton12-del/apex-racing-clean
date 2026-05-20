import { formatOffTime } from '../lib/formatTime'

interface BestBetCardProps {
  races: any[]
}

export default function BestBetCard({ races }: BestBetCardProps) {
  const selections = races.flatMap((race: any) =>
    (race.runners || []).map((runner: any) => ({
      ...runner,
      raceName: race.race_name,
      course: race.course,
      offTime: formatOffTime(race),
    }))
  )

  const best = selections.sort(
    (a: any, b: any) => (b.score || 0) - (a.score || 0)
  )[0]

  if (!best) {
    return (
      <div className='rounded-2xl border bg-card p-6'>
        No best bet available.
      </div>
    )
  }

  return (
    <div className='rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-black p-6'>
      <div className='flex items-center gap-2 mb-4'>
        <span className='text-xs px-3 py-1 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300'>
          BEST BET OF THE DAY
        </span>
      </div>

      <div className='space-y-3'>
        <div>
          <h2 className='text-4xl font-bold'>
            {best.horse}
          </h2>

          <p className='text-muted-foreground mt-1'>
            {best.offTime} · {best.course}
          </p>
        </div>

        <div>
          <h3 className='text-lg font-semibold'>
            {best.raceName}
          </h3>
        </div>

        <div className='grid grid-cols-3 gap-4 pt-4'>
          <div className='rounded-xl border p-4'>
            <p className='text-sm text-muted-foreground'>Score</p>
            <p className='text-3xl font-bold text-amber-400'>
              {best.score}
            </p>
          </div>

          <div className='rounded-xl border p-4'>
            <p className='text-sm text-muted-foreground'>Odds</p>
            <p className='text-3xl font-bold'>
              {best.odds || '-'}
            </p>
          </div>

          <div className='rounded-xl border p-4'>
            <p className='text-sm text-muted-foreground'>Form</p>
            <p className='text-3xl font-bold'>
              {best.form || '-'}
            </p>
          </div>
        </div>

        {(best.replayTriggers || []).length > 0 && (
          <div className='pt-4'>
            <p className='text-sm text-muted-foreground mb-2'>
              Replay Intelligence
            </p>

            <div className='flex gap-2 flex-wrap'>
              {best.replayTriggers.map((trigger: any) => (
                <span
                  key={trigger.key}
                  className='text-xs px-2 py-1 rounded-lg border border-red-500/20 bg-red-500/10 text-red-300'
                >
                  {trigger.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
