import { useEffect, useState } from 'react'
import { parseOdds } from '../lib/parseOdds'
import type { Race } from '../lib/types'

interface BetRecord {
  horse: string
  odds: string
  stake: number
  result: 'WIN' | 'LOSE'
}

export default function ROITracker() {
  const [bets, setBets] = useState<BetRecord[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('apex-bets')

    if (saved) {
      setBets(JSON.parse(saved))
    }
  }, [])

  const totalStake = bets.reduce(
    (acc, bet) => acc + bet.stake,
    0
  )

  const totalReturn = bets.reduce((acc, bet) => {
    if (bet.result === 'WIN') {
      return acc + bet.stake * parseOdds(bet.odds)
    }

    return acc
  }, 0)

  const profit = totalReturn - totalStake

  const roi = totalStake
    ? ((profit / totalStake) * 100).toFixed(1)
    : '0'

  const wins = bets.filter((b) => b.result === 'WIN').length

  const strikeRate = bets.length
    ? ((wins / bets.length) * 100).toFixed(1)
    : '0'

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>ROI Tracker</h2>

        <p className='text-muted-foreground'>
          Betting performance analytics
        </p>
      </div>

      <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
        <div className='rounded-xl border p-5'>
          <p className='text-sm text-muted-foreground'>Stake</p>

          <h3 className='text-3xl font-bold mt-2'>
            £{totalStake.toFixed(2)}
          </h3>
        </div>

        <div className='rounded-xl border p-5'>
          <p className='text-sm text-muted-foreground'>Return</p>

          <h3 className='text-3xl font-bold mt-2 text-green-400'>
            £{totalReturn.toFixed(2)}
          </h3>
        </div>

        <div className='rounded-xl border p-5'>
          <p className='text-sm text-muted-foreground'>ROI</p>

          <h3 className='text-3xl font-bold mt-2 text-amber-400'>
            {roi}%
          </h3>
        </div>

        <div className='rounded-xl border p-5'>
          <p className='text-sm text-muted-foreground'>Strike Rate</p>

          <h3 className='text-3xl font-bold mt-2'>
            {strikeRate}%
          </h3>
        </div>
      </div>
    </div>
  )
}
