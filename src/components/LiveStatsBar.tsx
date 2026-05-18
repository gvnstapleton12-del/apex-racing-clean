interface LiveStatsBarProps {
  races: any[]
}

export default function LiveStatsBar({ races }: LiveStatsBarProps) {
  const totalRaces = races.length

  const totalRunners = races.reduce(
    (acc: number, race: any) => acc + (race.runners?.length || 0),
    0
  )

  const replayFlags = races.reduce(
    (acc: number, race: any) => {
      return (
        acc +
        (race.runners || []).filter(
          (runner: any) =>
            runner.replayTriggers &&
            runner.replayTriggers.length > 0
        ).length
      )
    },
    0
  )

  const avgFieldSize = totalRaces
    ? Math.round(totalRunners / totalRaces)
    : 0

  return (
    <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
      <div className='rounded-2xl border bg-card p-5'>
        <p className='text-sm text-muted-foreground'>
          Live Races
        </p>

        <h2 className='text-4xl font-bold mt-2'>
          {totalRaces}
        </h2>
      </div>

      <div className='rounded-2xl border bg-card p-5'>
        <p className='text-sm text-muted-foreground'>
          Total Runners
        </p>

        <h2 className='text-4xl font-bold mt-2'>
          {totalRunners}
        </h2>
      </div>

      <div className='rounded-2xl border bg-card p-5'>
        <p className='text-sm text-muted-foreground'>
          Replay Flags
        </p>

        <h2 className='text-4xl font-bold mt-2 text-amber-400'>
          {replayFlags}
        </h2>
      </div>

      <div className='rounded-2xl border bg-card p-5'>
        <p className='text-sm text-muted-foreground'>
          Avg Field Size
        </p>

        <h2 className='text-4xl font-bold mt-2'>
          {avgFieldSize}
        </h2>
      </div>
    </div>
  )
}
