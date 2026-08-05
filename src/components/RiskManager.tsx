import { useMemo } from 'react'
import { calculateAvgScore, calculateAvgOdds, calculateRiskProfile } from '../lib/engine'

interface RiskManagerProps {
  selections?: any[]
  bankroll?: number
}

export default function RiskManager({
  selections = [],
  bankroll = 1000,
}: RiskManagerProps) {
  const analysis = useMemo(() => {
    const avgScore = calculateAvgScore(selections)
    const avgOdds = calculateAvgOdds(selections)
    const { risk, stake, style } = calculateRiskProfile(avgScore, avgOdds, bankroll)

    return {
      avgScore: Math.round(avgScore),
      avgOdds: avgOdds.toFixed(2),
      risk,
      suggestedStake: stake.toFixed(2),
      style,
    }
  }, [selections, bankroll])

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Risk Manager</h2>

        <p className='text-muted-foreground'>
          Bankroll governance and staking intelligence
        </p>
      </div>

      <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
        <div className='rounded-xl border p-5'>
          <p className='text-sm text-muted-foreground'>Avg Score</p>

          <h3 className='text-3xl font-bold mt-2'>
            {analysis.avgScore}
          </h3>
        </div>

        <div className='rounded-xl border p-5'>
          <p className='text-sm text-muted-foreground'>Avg Odds</p>

          <h3 className='text-3xl font-bold mt-2'>
            {analysis.avgOdds}
          </h3>
        </div>

        <div className='rounded-xl border p-5'>
          <p className='text-sm text-muted-foreground'>Risk Profile</p>

          <div className={`inline-flex mt-2 text-sm px-3 py-1 rounded-lg border ${analysis.style}`}>
            {analysis.risk}
          </div>
        </div>

        <div className='rounded-xl border p-5'>
          <p className='text-sm text-muted-foreground'>Suggested Stake</p>

          <h3 className='text-3xl font-bold mt-2 text-cyan-300'>
            £{analysis.suggestedStake}
          </h3>
        </div>
      </div>
    </div>
  )
}
