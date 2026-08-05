import { formatOffTime } from '../lib/formatTime'
import { getScore, getGrade, getScoreColor, sortByScore } from '../lib/engine'
import type { Race, Runner } from '../lib/types'

function selectHorse(horse: string, race: { course?: string; off_time?: string }) {
  window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse, course: race.course, offTime: race.off_time } }))
}

interface TopRatedBoardProps {
  races: Race[]
}

export default function TopRatedBoard({
  races,
}: TopRatedBoardProps) {
  const allRunners = races.flatMap((race: Race) =>
    (race.runners || []).map((runner) => ({
      race: race.race_name,
      course: race.course,
      time: formatOffTime(race),
      off_time: race.off_time,
      horse: runner.horse,
      score: getScore(runner),
      odds: runner.odds,
    }))
  )

  const topSelections = sortByScore(allRunners as unknown as Runner[])
    .slice(0, 5) as unknown as typeof allRunners

  return (
    <div className='relative z-10 rounded-2xl border bg-card p-6 pointer-events-auto'>
      <div className='mb-5 flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold'>
            Top Rated Board
          </h2>

          <p className='text-muted-foreground'>
            Highest rated APEX
            selections today
          </p>
        </div>

        <button
          type='button'
          onClick={() => {
            window.alert(
              'APEX Live Engine Active'
            )
          }}
          className='relative z-20 pointer-events-auto px-4 py-2 rounded-xl bg-amber-500 text-black font-bold hover:opacity-90'
        >
          LIVE ENGINE
        </button>
      </div>

      <div className='space-y-3'>
        {topSelections.map(
          (selection, index) => (
            <div
              key={index}
              className='relative z-10 rounded-xl border p-4 flex items-center justify-between'
            >
              <div>
                <div className='flex items-center gap-2'>
                  <span className='text-xs px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20'>
                    #{index + 1}
                  </span>

                  <p className='text-sm text-muted-foreground'>
                    {selection.time} ·{' '}
                    {selection.course}
                  </p>
                </div>

                <h3 className='font-bold text-lg mt-2'>
                  <button type='button' className='hover:text-amber-300 transition text-left' onClick={() => selectHorse(selection.horse!, selection)}>
                    {selection.horse}
                  </button>
                </h3>

                <p className='text-muted-foreground text-sm'>
                  {selection.race}
                </p>
              </div>

              <div className='text-right space-y-2'>
                <p
                  className={`text-3xl font-black ${getScoreColor(
                    selection.score || 0
                  )}`}
                >
                  {selection.score}
                </p>

                <p className='text-sm text-muted-foreground'>
                  Grade:{' '}
                  {getGrade(
                    selection.score || 0
                  )}
                </p>

                <p className='text-sm text-muted-foreground'>
                  Odds:{' '}
                  {selection.odds}
                </p>

                <div className='flex gap-2 justify-end'>
                  <button
                    type='button'
                    onClick={() => {
                      window.alert(
                        `Viewing race:\n\n${selection.race}\n${selection.course}\n${selection.time}`
                      )
                    }}
                    className='relative z-20 pointer-events-auto px-4 py-2 rounded-lg bg-zinc-800 border hover:bg-zinc-700'
                  >
                    View Race
                  </button>

                  <button
                    type='button'
                    onClick={() => {
                      window.alert(
                        `Tracking ${selection.horse}`
                      )
                    }}
                    className='relative z-20 pointer-events-auto px-4 py-2 rounded-lg bg-amber-500 text-black font-bold hover:opacity-90'
                  >
                    Track Runner
                  </button>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
