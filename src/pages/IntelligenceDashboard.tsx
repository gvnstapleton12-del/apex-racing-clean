import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Race } from '../lib/types'
import { fetchRacecards } from '../lib/racingApi'
import { filterGBIRE } from '../lib/engine'

import LiveStatsBar from '@/components/LiveStatsBar'
import BestBetCard from '@/components/BestBetCard'
import TopRatedBoard from '@/components/TopRatedBoard'
import ReplayWatchlist from '@/components/ReplayWatchlist'
import VolatilityGauge from '@/components/VolatilityGauge'
import ConfidenceHeatmap from '@/components/ConfidenceHeatmap'
import SmartMoneyTracker from '@/components/SmartMoneyTracker'
import HiddenValueBoard from '@/components/HiddenValueBoard'
import AIInsightFeed from '@/components/AIInsightFeed'
import LiveAlertsFeed from '@/components/LiveAlertsFeed'
import ValueIndex from '@/components/ValueIndex'
import PredictionConsensus from '@/components/PredictionConsensus'
import TrainerFormBoard from '@/components/TrainerFormBoard'
import JockeyTracker from '@/components/JockeyTracker'
import StableAlerts from '@/components/StableAlerts'
import ROITracker from '@/components/ROITracker'

export default function IntelligenceDashboard() {
  const [selectedRace, setSelectedRace] = useState<string | 'all'>('all')

  const { data: allRaces = [], isLoading } = useQuery<Race[]>({
    queryKey: ['apex-dashboard'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

  const gbIreRaces = filterGBIRE(allRaces)

  const filteredRaces: Race[] = selectedRace === 'all'
    ? gbIreRaces
    : gbIreRaces.filter((r) => r.race_id === selectedRace)

  if (isLoading) {
    return (
      <div className='p-6'>
        <div className='rounded-2xl border bg-card p-6'>
          Loading APEX Intelligence Dashboard...
        </div>
      </div>
    )
  }

  return (
    <div className='p-6 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-5xl font-black tracking-tight'>
            APEX Intelligence
          </h1>
          <p className='text-muted-foreground mt-2'>
            Live race intelligence operating system
          </p>
        </div>

        <div className='flex items-center gap-3'>
          <label htmlFor='race-select' className='text-sm text-zinc-400'>Race:</label>
          <select
            id='race-select'
            value={selectedRace}
            onChange={(e) => setSelectedRace(e.target.value)}
            className='bg-[#0f1720] border border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium text-white focus:border-green-500/30 focus:outline-none cursor-pointer'
          >
            <option value='all'>All Races</option>
            {gbIreRaces.map((race) => (
              <option key={race.race_id} value={race.race_id}>
                {race.course} - {race.off_time?.slice(0, 5)} ({race.race_name?.slice(0, 25)})
              </option>
            ))}
          </select>
        </div>
      </div>

      <LiveStatsBar races={filteredRaces} />
      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <BestBetCard races={filteredRaces} />
        <LiveAlertsFeed races={filteredRaces} />
      </div>
      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <TopRatedBoard races={filteredRaces} />
        <PredictionConsensus races={filteredRaces} />
      </div>
      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <ReplayWatchlist races={filteredRaces} />
        <HiddenValueBoard races={filteredRaces} />
      </div>
      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <SmartMoneyTracker races={filteredRaces} />
        <VolatilityGauge races={filteredRaces} />
      </div>
      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <ConfidenceHeatmap races={filteredRaces} />
        <ValueIndex races={filteredRaces} />
      </div>
      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <TrainerFormBoard races={filteredRaces} />
        <JockeyTracker races={filteredRaces} />
      </div>
      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <StableAlerts races={filteredRaces} />
        <AIInsightFeed races={filteredRaces} />
      </div>
      <ROITracker />
    </div>
  )
}
