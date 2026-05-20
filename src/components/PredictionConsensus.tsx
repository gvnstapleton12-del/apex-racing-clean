import { formatOffTime } from '../lib/formatTime'

interface PredictionConsensusProps {
  races: any[]
}

export default function PredictionConsensus({ races }: PredictionConsensusProps) {
  const consensus = races.flatMap((race: any) => {
    const sorted = [...(race.runners || [])]
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
      .slice(0, 3)

    return sorted.map((runner: any, index: number) => ({
      horse: runner.horse,
      race: race.race_name,
      course: race.course,
      time: formatOffTime(race),
      score: runner.score,
      odds: runner.odds,
      rank: index + 1,
      confidence:
        index === 0
          ? 'Primary'
          : index === 1
          ? 'Secondary'
          : 'Outsider',
    }))
  })

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Prediction Consensus</h2>

        <p className='text-muted-foreground'>
          Ranked APEX predictions across every live race
        </p>
      </div>

      <div className='space-y-3'>
        {consensus.map((pick: any, index: number) => (
          <div
            key={index}
            className='rounded-xl border p-4 flex items-center justify-between'
          >
            <div>
              <div className='flex items-center gap-2 mb-2'>
                <span className='text-xs px-2 py-1 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300'>
                  #{pick.rank}
                </span>

                <span className='text-xs px-2 py-1 rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-300'>
                  {pick.confidence}
                </span>
              </div>

              <p className='text-sm text-muted-foreground'>
                {pick.time} · {pick.course}
              </p>

              <h3 className='font-bold text-lg mt-1'>
                {pick.horse}
              </h3>

              <p className='text-sm text-muted-foreground'>
                {pick.race}
              </p>
            </div>

            <div className='text-right'>
              <p className='text-3xl font-bold text-amber-400'>
                {pick.score}
              </p>

              <p className='text-sm text-muted-foreground'>
                {pick.odds}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
