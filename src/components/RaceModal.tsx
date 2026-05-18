interface RaceModalProps {
  open: boolean
  onClose: () => void
  race: any
}

export default function RaceModal({
  open,
  onClose,
  race,
}: RaceModalProps) {
  if (!open || !race) return null

  return (
    <div
      className='fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6'
      onClick={onClose}
    >
      <div
        className='w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-background p-6'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-center justify-between mb-6'>
          <div>
            <h2 className='text-3xl font-bold'>
              {race.race_name}
            </h2>

            <p className='text-muted-foreground'>
              {race.course} · {race.off_time}
            </p>
          </div>

          <button
            onClick={onClose}
            className='px-4 py-2 rounded-lg border'
          >
            Close
          </button>
        </div>

        <div className='grid gap-4'>
          {(race.runners || []).map((runner: any, index: number) => (
            <div
              key={index}
              className='rounded-xl border p-4 flex items-center justify-between'
            >
              <div>
                <h3 className='font-semibold text-lg'>
                  {runner.horse}
                </h3>

                <p className='text-muted-foreground text-sm'>
                  {runner.jockey} · {runner.trainer}
                </p>

                <div className='flex gap-2 mt-2'>
                  <span className='text-xs px-2 py-1 rounded-lg border'>
                    Form: {runner.form || '-'}
                  </span>

                  <span className='text-xs px-2 py-1 rounded-lg border'>
                    Draw: {runner.draw || '-'}
                  </span>
                </div>
              </div>

              <div className='text-right'>
                <p className='text-2xl font-bold'>
                  {runner.number}
                </p>

                <p className='text-amber-400'>
                  {runner.odds || '-'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
