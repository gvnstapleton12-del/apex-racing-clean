interface TrainerFormBoardProps {
  races: any[]
}

function calculateTrainerScores(races: any[]) {
  const trainers: Record<string, {
    trainer: string
    runners: number
    totalScore: number
    avgScore: number
  }> = {}

  races.forEach((race: any) => {
    ;(race.runners || []).forEach((runner: any) => {
      const trainer = runner.trainer || 'Unknown'

      if (!trainers[trainer]) {
        trainers[trainer] = {
          trainer,
          runners: 0,
          totalScore: 0,
          avgScore: 0,
        }
      }

      trainers[trainer].runners += 1
      trainers[trainer].totalScore += runner.score || 0
      trainers[trainer].avgScore = Math.round(
        trainers[trainer].totalScore / trainers[trainer].runners
      )
    })
  })

  return Object.values(trainers)
    .filter((trainer) => trainer.runners >= 2)
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 10)
}

export default function TrainerFormBoard({ races }: TrainerFormBoardProps) {
  const trainers = calculateTrainerScores(races)

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
