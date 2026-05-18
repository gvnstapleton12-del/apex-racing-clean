interface TopRatedBoardProps {
  races: any[]
}

export default function TopRatedBoard({ races }: TopRatedBoardProps) {
  const topSelections = races
    .flatMap((race: any) => {
      const top = race.runners?.[0]

      if (!top) return []

      return [
        {
          race: race.race_name,
          course: race.course,
          time: race.off_time,
          horse: top.horse,
          score: top.score,
          odds: top.odds,
        },
      ]
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5)

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Top Rated Board</h2>
        <p className='text-muted-foreground'>Highest rated APEX selections today</p>
      </div>

      <div className='space-y-3'>
        {topSelections.map((selection, index) => (
          <div
            key={index}
            className='rounded-xl border p-4 flex items-center justify-between'
          >
            <div>
              <div className='flex items-center gap-2'>
                <span className='text-xs px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20'>
                  #{index + 1}
                </span>

                <p className='text-sm text-muted-foreground'>
                  {selection.time} · {selection.course}
                </p>
              </div>

              <h3 className='font-bold text-lg mt-2'>
                {selection.horse}
              </h3>

              <p className='text-muted-foreground text-sm'>
                {selection.race}
              </p>
            </div>

            <div className='text-right'>
              <p className='text-2xl font-bold text-amber-400'>
                {selection.score}
              </p>

              <p className='text-sm text-muted-foreground'>
                {selection.odds}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
