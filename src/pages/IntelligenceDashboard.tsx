import { useQuery } from '@tanstack/react-query'

import { fetchRacecards } from '@/lib/racingApi'

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
  const { data: races = [], isLoading } = useQuery({
    queryKey: ['apex-dashboard'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

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
      <div>
        <h1 className='text-5xl font-black tracking-tight'>
          APEX Intelligence
        </h1>

        <p className='text-muted-foreground mt-2'>
          Live race intelligence operating system
        </p>
      </div>

      <LiveStatsBar races={races} />

      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <BestBetCard races={races} />
        <LiveAlertsFeed races={races} />
      </div>

      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <TopRatedBoard races={races} />
        <PredictionConsensus races={races} />
      </div>

      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <ReplayWatchlist races={races} />
        <HiddenValueBoard races={races} />
      </div>

      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <SmartMoneyTracker races={races} />
        <VolatilityGauge races={races} />
      </div>

      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <ConfidenceHeatmap races={races} />
        <ValueIndex races={races} />
      </div>

      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <TrainerFormBoard races={races} />
        <JockeyTracker races={races} />
      </div>

      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <StableAlerts races={races} />
        <AIInsightFeed races={races} />
      </div>

      <ROITracker />
    </div>
  )
}
