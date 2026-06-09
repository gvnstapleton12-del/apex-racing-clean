import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Race } from '../lib/types'
import { fetchRacecards } from '../lib/racingApi'
import { filterGBIRE } from '../lib/engine'

import ErrorBoundary from '../components/ErrorBoundary'
import WidgetSkeleton from '../components/WidgetSkeleton'
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

  return (
    <div className='p-6 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-7xl font-black tracking-tight'>
            APEX
          </h1>
          <p className='uppercase tracking-[0.35em] text-amber-400 text-sm mt-2'>
            Racing Intelligence System
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

      {isLoading ? (
        <WidgetSkeleton variant='stats' cols={4} />
      ) : (
        <ErrorBoundary name='LiveStatsBar'><LiveStatsBar races={filteredRaces} /></ErrorBoundary>
      )}

      {/* Command Center Section */}
      <div className='mb-8'>
        <h2 className='text-sm uppercase tracking-[0.3em] text-zinc-500 mb-4'>
          Command Center
        </h2>
        <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
          {isLoading ? (
            <>
              <WidgetSkeleton variant='card' lines={3} />
              <WidgetSkeleton variant='list' lines={3} />
            </>
          ) : (
            <>
              <ErrorBoundary name='BestBetCard'><BestBetCard races={filteredRaces} /></ErrorBoundary>
              <ErrorBoundary name='LiveAlertsFeed'><LiveAlertsFeed races={filteredRaces} /></ErrorBoundary>
            </>
          )}
        </div>
      </div>

      {/* Race Intelligence Section */}
      <div className='mb-8'>
        <div className='border-t border-white/10 pt-8'>
          <h2 className='text-sm uppercase tracking-[0.3em] text-zinc-500 mb-4'>
            Race Intelligence
          </h2>
          <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
            {isLoading ? (
              <>
                <WidgetSkeleton variant='list' lines={3} />
                <WidgetSkeleton variant='list' lines={3} />
              </>
            ) : (
              <>
                <ErrorBoundary name='TopRatedBoard'><TopRatedBoard races={filteredRaces} /></ErrorBoundary>
                <ErrorBoundary name='PredictionConsensus'><PredictionConsensus races={filteredRaces} /></ErrorBoundary>
              </>
            )}
          </div>

          <div className='grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6'>
            {isLoading ? (
              <>
                <WidgetSkeleton variant='list' lines={3} />
                <WidgetSkeleton variant='list' lines={3} />
              </>
            ) : (
              <>
                <ErrorBoundary name='ReplayWatchlist'><ReplayWatchlist races={filteredRaces} /></ErrorBoundary>
                <ErrorBoundary name='HiddenValueBoard'><HiddenValueBoard races={filteredRaces} /></ErrorBoundary>
              </>
            )}
          </div>

          <div className='grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6'>
            {isLoading ? (
              <>
                <WidgetSkeleton variant='list' lines={3} />
                <WidgetSkeleton variant='card' lines={3} />
              </>
            ) : (
              <>
                <ErrorBoundary name='SmartMoneyTracker'><SmartMoneyTracker races={filteredRaces} /></ErrorBoundary>
                <ErrorBoundary name='VolatilityGauge'><VolatilityGauge races={filteredRaces} /></ErrorBoundary>
              </>
            )}
          </div>

          <div className='grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6'>
            {isLoading ? (
              <>
                <WidgetSkeleton variant='list' lines={3} />
                <WidgetSkeleton variant='list' lines={3} />
              </>
            ) : (
              <>
                <ErrorBoundary name='ConfidenceHeatmap'><ConfidenceHeatmap races={filteredRaces} /></ErrorBoundary>
                <ErrorBoundary name='ValueIndex'><ValueIndex races={filteredRaces} /></ErrorBoundary>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Trainer/Jockey Section */}
      <div className='mb-8'>
        <div className='border-t border-white/10 pt-8'>
          <h2 className='text-sm uppercase tracking-[0.3em] text-zinc-500 mb-4'>
            Trainer/Jockey
          </h2>
          <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
            {isLoading ? (
              <>
                <WidgetSkeleton variant='list' lines={3} />
                <WidgetSkeleton variant='list' lines={3} />
              </>
            ) : (
              <>
                <ErrorBoundary name='TrainerFormBoard'><TrainerFormBoard races={filteredRaces} /></ErrorBoundary>
                <ErrorBoundary name='JockeyTracker'><JockeyTracker races={filteredRaces} /></ErrorBoundary>
              </>
            )}
          </div>

          <div className='grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6'>
            {isLoading ? (
              <>
                <WidgetSkeleton variant='list' lines={3} />
                <WidgetSkeleton variant='list' lines={3} />
              </>
            ) : (
              <>
                <ErrorBoundary name='StableAlerts'><StableAlerts races={filteredRaces} /></ErrorBoundary>
                <ErrorBoundary name='AIInsightFeed'><AIInsightFeed races={filteredRaces} /></ErrorBoundary>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Research Section */}
      <div className='mb-8'>
        <div className='border-t border-white/10 pt-8'>
          <h2 className='text-sm uppercase tracking-[0.3em] text-zinc-500 mb-4'>
            Research
          </h2>
          {isLoading ? (
            <WidgetSkeleton variant='stats' cols={4} />
          ) : (
            <ErrorBoundary name='ROITracker'><ROITracker /></ErrorBoundary>
          )}
        </div>
      </div>
    </div>
  )
}
