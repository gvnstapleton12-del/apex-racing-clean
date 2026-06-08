import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface GapBand {
  label: string
  min: number
  max: number
  total: number
  wins: number
  places: number
  winRate: string | null
  placeRate: string | null
  avgOdds: string | null
}

interface GapSample {
  horse: string
  course: string
  or: number
  pr: number
  gap: number
  position: number
  odds: number
}

interface GapData {
  total: number
  bands: GapBand[]
  samples: GapSample[]
}

function getBandColor(gap: number): string {
  if (gap >= 10) return 'text-green-400 bg-green-500/10 border-green-500/30'
  if (gap >= 5) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
  if (gap >= 1) return 'text-amber-400 bg-amber-500/10 border-amber-500/30'
  if (gap >= -4) return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20'
  if (gap >= -9) return 'text-orange-400 bg-orange-500/10 border-orange-500/30'
  return 'text-red-400 bg-red-500/10 border-red-500/30'
}

function getResultBadge(pos: number): string {
  if (pos === 1) return 'bg-green-500/20 text-green-400 border-green-500/30'
  if (pos <= 3) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  return 'bg-red-500/10 text-red-400 border-red-500/20'
}

export default function OrPrGapAnalysis() {
  const { data, isLoading } = useQuery<GapData>({
    queryKey: ['or-pr-gap'],
    queryFn: () => fetch('/api/or-pr-gap').then(r => r.json()),
    refetchInterval: 60000,
  })

  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/refresh-racecards', { method: 'POST' })
      const json = await res.json()
      if (json.ok) {
        queryClient.invalidateQueries({ queryKey: ['or-pr-gap'] })
      }
    } catch (e) {
      console.error('Refresh failed:', e)
    } finally {
      setRefreshing(false)
    }
  }

  if (isLoading || !data) {
    return (
      <div className='dashboard-page max-w-7xl mx-auto'>
        <div className='loading-card bg-white/[0.02] rounded-2xl border border-white/5 p-12 flex items-center gap-4'>
          <div className='pulse-dot' />
          <span className='text-zinc-400'>Loading OR/PR gap analysis...</span>
        </div>
      </div>
    )
  }

  const totalSamples = data?.total || 0

  return (
    <div className='dashboard-page max-w-7xl mx-auto'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow text-zinc-500 text-sm font-medium uppercase tracking-wider'>Testing Phase</span>
          <h1 className='text-5xl font-black tracking-tight'>OR/PR Gap Analysis</h1>
          <p className='text-zinc-400 text-lg mt-3'>
            Tracking how horses perform relative to their official rating vs performance rating gap.
            {totalSamples < 500 && (
              <span className='block mt-2 text-amber-400 text-sm'>
                {totalSamples} samples collected — need 500+ for reliable patterns (1000+ preferred).
              </span>
            )}
          </p>
          {totalSamples < 500 && (
            <button
              type='button'
              onClick={handleRefresh}
              disabled={refreshing}
              className='mt-4 px-5 py-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl font-bold hover:bg-amber-500/20 transition-all duration-200 disabled:opacity-50'
            >
              {refreshing ? 'Refreshing racecards...' : 'Refresh Racecards & Backfill'}
            </button>
          )}
        </div>
      </section>

      <section className='space-y-6'>
        <div className='bg-[#0f1720] border border-white/5 rounded-2xl p-6'>
          <h2 className='text-xl font-bold mb-4'>Win Rate by Gap Band</h2>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-zinc-500 border-b border-white/10'>
                  <th className='text-left py-3 px-4'>Gap (PR - OR)</th>
                  <th className='text-center py-3 px-4'>Runners</th>
                  <th className='text-center py-3 px-4'>Wins</th>
                  <th className='text-center py-3 px-4'>Win Rate</th>
                  <th className='text-center py-3 px-4'>Places</th>
                  <th className='text-center py-3 px-4'>Place Rate</th>
                  <th className='text-center py-3 px-4'>Avg Odds</th>
                </tr>
              </thead>
              <tbody>
                {data.bands.map((band) => {
                  const gapMid = band.max === Infinity ? band.min + 5 : band.min === -Infinity ? band.max - 5 : (band.min + band.max) / 2
                  const colorClass = getBandColor(gapMid)
                  return (
                    <tr key={band.label} className='border-b border-white/5 hover:bg-white/[0.02]'>
                      <td className='py-3 px-4'>
                        <span className={`px-2 py-1 rounded text-xs font-bold border ${colorClass}`}>
                          {band.label}
                        </span>
                      </td>
                      <td className='text-center py-3 px-4 text-zinc-300'>{band.total}</td>
                      <td className='text-center py-3 px-4 text-green-400 font-bold'>{band.wins}</td>
                      <td className='text-center py-3 px-4'>
                        {band.winRate ? (
                          <span className={`font-bold ${parseFloat(band.winRate) >= 20 ? 'text-green-400' : parseFloat(band.winRate) >= 10 ? 'text-amber-400' : 'text-zinc-400'}`}>
                            {band.winRate}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className='text-center py-3 px-4 text-amber-400 font-bold'>{band.places}</td>
                      <td className='text-center py-3 px-4'>
                        {band.placeRate ? (
                          <span className={`font-bold ${parseFloat(band.placeRate) >= 40 ? 'text-green-400' : parseFloat(band.placeRate) >= 25 ? 'text-amber-400' : 'text-zinc-400'}`}>
                            {band.placeRate}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className='text-center py-3 px-4 text-zinc-300'>{band.avgOdds || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {data.samples.length > 0 && (
          <div className='bg-[#0f1720] border border-white/5 rounded-2xl p-6'>
            <h2 className='text-xl font-bold mb-4'>Recent Samples</h2>
            <div className='space-y-2'>
              {data.samples.map((s, i) => (
                <div key={i} className='flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.02]'>
                  <div className='flex items-center gap-3'>
                    <span className={`text-xs font-bold px-2 py-1 rounded border ${getResultBadge(s.position)}`}>
                      {s.position === 1 ? 'W' : s.position <= 3 ? 'P' : 'L'}
                    </span>
                    <span className='text-white text-sm font-medium'>{s.horse}</span>
                    <span className='text-zinc-500 text-xs'>{s.course}</span>
                  </div>
                  <div className='flex items-center gap-4'>
                    <span className='text-zinc-400 text-xs'>OR {s.or}</span>
                    <span className='text-cyan-400 text-xs'>PR {s.pr}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getBandColor(s.gap)}`}>
                      {s.gap > 0 ? '+' : ''}{s.gap}
                    </span>
                    <span className='text-zinc-500 text-xs'>{s.odds?.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
