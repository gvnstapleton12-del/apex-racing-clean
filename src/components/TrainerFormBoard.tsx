import { aggregateTrainerScores } from '../lib/engine'
import type { Race } from '../lib/types'

interface TrainerFormBoardProps {
  races: Race[]
}

export default function TrainerFormBoard({ races }: TrainerFormBoardProps) {
  const trainers = aggregateTrainerScores(races)

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Trainer Form Board</h2>

        <p className='text-muted-foreground'>
          Highest-rated trainer profiles today
        </p>
      </div>

      <div className='space-y-3'>
        {trainers.map((trainer, index) => (
          <div
            key={trainer.trainer}
            className='rounded-xl border p-4 flex items-center justify-between'
          >
            <div>
              <div className='flex items-center gap-2 mb-2'>
                <span className='text-xs px-2 py-1 rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-300'>
                  #{index + 1}
                </span>

                <p className='text-sm text-muted-foreground'>
                  {trainer.runners} runners today
                </p>
              </div>

              <h3 className='font-bold text-lg'>
                {trainer.trainer}
              </h3>
            </div>

            <div className='text-right'>
              <p className='text-3xl font-bold text-cyan-300'>
                {trainer.avgScore}
              </p>

              <p className='text-sm text-muted-foreground'>
                Avg APEX Score
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
