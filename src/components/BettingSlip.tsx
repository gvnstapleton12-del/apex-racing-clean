import { useState } from 'react'

interface BettingSlipProps {
  selections?: any[]
}

export default function BettingSlip({
  selections = [],
}: BettingSlipProps) {
  const [stake, setStake] = useState(10)

  function parseOdds(odds?: string) {
    if (!odds) return 1

    if (odds.includes('/')) {
      const [a, b] = odds.split('/').map(Number)
      return a / b + 1
    }

    const n = parseFloat(odds)
    return isNaN(n) ? 1 : n
  }

  const totalOdds = selections.reduce((acc: number, selection: any) => {
    return acc * parseOdds(selection.odds)
  }, 1)

  const potentialReturn = (stake * totalOdds).toFixed(2)

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Betting Slip</h2>

        <p className='text-muted-foreground'>
          Build accumulators from APEX selections
        </p>
      </div>

      <div className='space-y-3'>
        {selections.length === 0 ? (
          <div className='rounded-xl border p-5 text-muted-foreground'>
            No selections added.
          </div>
        ) : (
          selections.map((selection: any, index: number) => (
            <div
              key={index}
              className='rounded-xl border p-4 flex items-center justify-between'
            >
              <div>
                <h3 className='font-bold'>
                  {selection.horse}
                </h3>

                <p className='text-sm text-muted-foreground'>
                  {selection.race}
                </p>
              </div>

              <div className='text-right'>
                <p className='text-xl font-bold text-amber-400'>
                  {selection.odds}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className='mt-6 space-y-4'>
        <div>
          <label className='text-sm text-muted-foreground'>
            Stake
          </label>

          <input
            type='number'
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className='w-full mt-2 rounded-xl border bg-background px-4 py-3'
          />
        </div>

        <div className='rounded-xl border p-5 bg-amber-500/10 border-amber-500/20'>
          <div className='flex items-center justify-between'>
            <p className='text-muted-foreground'>Potential Return</p>

            <h3 className='text-3xl font-bold text-amber-400'>
              £{potentialReturn}
            </h3>
          </div>
        </div>

        <button className='w-full rounded-xl bg-amber-500 text-black font-bold py-4 hover:opacity-90 transition'>
          Place Bet
        </button>
      </div>
    </div>
  )
}
