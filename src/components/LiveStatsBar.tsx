import { countRunners, countReplayFlags, calculateAvgFieldSize } from '../lib/engine'
import type { Race } from '../lib/types'

interface LiveStatsBarProps {
  races: Race[]
}

export default function LiveStatsBar({ races }: LiveStatsBarProps) {
  const totalRaces = races.length
  const totalRunners = countRunners(races)
  const replayFlags = countReplayFlags(races)
  const avgFieldSize = calculateAvgFieldSize(races)

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
