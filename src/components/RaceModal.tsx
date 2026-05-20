import { openAtTheRacesHorseForm } from '../lib/horseLinks'

interface RaceModalProps {
  race: any
  onClose: () => void
}

export default function RaceModal({
  race,
  onClose,
}: RaceModalProps) {
  if (!race) return null

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6'>
      <div className='w-full max-w-5xl rounded-2xl border bg-zinc-950 p-6 overflow-y-auto max-h-[90vh]'>
        <div className='flex items-start justify-between mb-6'>
          <div>
            <h2 className='text-3xl font-black'>
              {race.race_name}
            </h2>

            <p className='text-zinc-400 mt-2'>
              {race.course} -{' '}
              {race.off_time}
            </p>
          </div>

          <button
            type='button'
            onClick={onClose}
            className='px-4 py-2 rounded-lg border hover:bg-zinc-800'
          >
            Close
          </button>
        </div>

        <div className='grid gap-4'>
          {(race.runners || []).map(
            (
              runner: any,
              index: number
            ) => (
              <div
                key={index}
                className='rounded-xl border p-4 flex items-center justify-between bg-zinc-900'
              >
                <div>
                  <button
                    type='button'
                    onClick={() =>
                      openAtTheRacesHorseForm(runner, race)
                    }
                    className='relative z-50 pointer-events-auto font-bold text-xl text-left hover:text-amber-400 transition-colors cursor-pointer'
                  >
                    {runner.horse}
                  </button>

                  <p className='text-zinc-400 text-sm mt-1'>
                    {runner.jockey} -{' '}
                    {runner.trainer}
                  </p>

                  <div className='flex gap-2 mt-3 flex-wrap'>
                    <span className='text-xs px-2 py-1 rounded-lg border border-zinc-700'>
                      OR:{' '}
                      {runner.or || '-'}
                    </span>

                    <span className='text-xs px-2 py-1 rounded-lg border border-zinc-700'>
                      RPR:{' '}
                      {runner.rpr || '-'}
                    </span>

                    <span className='text-xs px-2 py-1 rounded-lg border border-zinc-700'>
                      Odds:{' '}
                      {runner.odds || '-'}
                    </span>

                    <span className='text-xs px-2 py-1 rounded-lg border border-zinc-700'>
                      Draw:{' '}
                      {runner.draw || '-'}
                    </span>
                  </div>
                </div>

                <div className='text-right'>
                  <p className='text-4xl font-black text-amber-400'>
                    {runner.score || 0}
                  </p>

                  <p className='text-sm text-zinc-400'>
                    APEX Score
                  </p>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
