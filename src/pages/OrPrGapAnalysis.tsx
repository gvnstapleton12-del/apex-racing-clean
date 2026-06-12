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

function getBandDot(gap: number): string {
  if (gap >= 10) return 'bg-green-400'
  if (gap >= 5) return 'bg-emerald-400'
  if (gap >= 1) return 'bg-amber-400'
  if (gap >= -4) return 'bg-zinc-400'
  if (gap >= -9) return 'bg-orange-400'
  return 'bg-red-400'
}

function getStatusLabel(gap: number): string {
  if (gap >= 10) return 'Dominant'
  if (gap >= 5) return 'Strong'
  if (gap >= 1) return 'Ahead'
  if (gap >= -4) return 'Even'
  if (gap >= -9) return 'Behind'
  return 'Weak'
}

function getResultBadge(pos: number): { text: string; cls: string } {
  if (pos === 1) return { text: 'Won', cls: 'bg-green-500/20 text-green-400 border border-green-500/30' }
  if (pos <= 3) return { text: 'Placed', cls: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' }
  return { text: 'Lost', cls: 'bg-red-500/10 text-red-400 border border-red-500/20' }
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
          <span className='text-zinc-400'>Loading gap analysis...</span>
        </div>
      </div>
    )
  }

  const totalSamples = data?.total || 0
  const bands = data?.bands || []

  const bestBand = bands.reduce((best, b) => {
    const bWR = b.winRate ? parseFloat(b.winRate) : 0
    const bestWR = best.winRate ? parseFloat(best.winRate) : 0
    return bWR > bestWR && b.total >= 10 ? b : best
  }, bands[0])

  const avgGap = bands.length > 0
    ? bands.reduce((sum, b) => {
        const mid = b.max === Infinity ? b.min + 5 : b.min === -Infinity ? b.max - 5 : (b.min + b.max) / 2
        return sum + mid * b.total
      }, 0) / (totalSamples || 1)
    : 0

  const outperforming = bands.filter(b => b.min >= 5).reduce((s, b) => s + b.total, 0)
  const maxWinRate = Math.max(...bands.map(b => b.winRate ? parseFloat(b.winRate) : 0), 1)

  const insightBand = bestBand
  const insightWR = insightBand?.winRate || '0'
  const insightLabel = insightBand?.label || '—'

  return (
    <div className='dashboard-page max-w-7xl mx-auto'>
      {/* Subtitle */}
      <div className='mb-6'>
        <p className='text-zinc-400 text-sm'>Performance versus official rating</p>
        {outperforming > 0 && (
          <p className='text-amber-400 text-sm mt-1'>{outperforming} runners outperforming their official mark by 5+ lbs</p>
        )}
      </div>

      {/* KPI Cards — Bloomberg style */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6'>
        <div className='apex-card p-5'>
          <div className='text-[10px] text-zinc-500 uppercase tracking-wider mb-2'>Best Band</div>
          <div className='text-4xl font-black text-amber-400 leading-none'>{insightLabel}</div>
          <div className='text-sm font-bold text-green-400 mt-2'>{insightWR}% win rate</div>
        </div>
        <div className='apex-card p-5'>
          <div className='text-[10px] text-zinc-500 uppercase tracking-wider mb-2'>Outperformers</div>
          <div className='text-4xl font-black text-white leading-none'>{outperforming}</div>
          <div className='text-xs text-zinc-500 mt-2'>runners at 5+ lbs</div>
        </div>
        <div className='apex-card p-5'>
          <div className='text-[10px] text-zinc-500 uppercase tracking-wider mb-2'>Avg Gap</div>
          <div className={`text-4xl font-black leading-none ${avgGap >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {avgGap >= 0 ? '+' : ''}{avgGap.toFixed(1)}
          </div>
          <div className='text-xs text-zinc-500 mt-2'>PR − OR</div>
        </div>
        <div className='apex-card p-5'>
          <div className='text-[10px] text-zinc-500 uppercase tracking-wider mb-2'>Runners</div>
          <div className='text-4xl font-black text-white leading-none'>{totalSamples}</div>
          <div className='text-xs text-zinc-500 mt-2'>total sample</div>
        </div>
      </div>

      {/* Key Insight */}
      {insightBand && (
        <div className='apex-card p-6 mb-6 border-l-4 border-amber-500/50'>
          <div className='text-[10px] text-amber-400 uppercase tracking-[0.2em] font-bold mb-2'>Key Insight</div>
          <p className='text-lg text-white leading-relaxed'>
            Horses rated <span className='font-black text-amber-400'>{insightLabel}</span> lbs above their official mark
            win at <span className='font-black text-green-400'>{insightWR}%</span>
          </p>
          <p className='text-sm text-zinc-500 mt-2'>{insightBand.total} sample size</p>
        </div>
      )}

      {totalSamples < 500 && (
        <div className='mb-6 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center justify-between'>
          <span className='text-amber-400 text-sm'>
            {totalSamples} samples — need 500+ for reliable patterns
          </span>
          <button
            type='button'
            onClick={handleRefresh}
            disabled={refreshing}
            className='px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg text-sm font-bold hover:bg-amber-500/20 transition disabled:opacity-50'
          >
            {refreshing ? 'Refreshing...' : 'Backfill'}
          </button>
        </div>
      )}

      {/* Performance Bands */}
      <div className='mb-6'>
        <h2 className='text-lg font-bold mb-4'>Performance Bands</h2>
        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {bands.filter(b => b.total > 0).sort((a, b) => a.min - b.min).map((band) => {
            const gapMid = band.max === Infinity ? band.min + 5 : band.min === -Infinity ? band.max - 5 : (band.min + band.max) / 2
            const wr = band.winRate ? parseFloat(band.winRate) : 0
            const width = maxWinRate > 0 ? (wr / maxWinRate) * 100 : 0
            const status = getStatusLabel(gapMid)
            const dot = getBandDot(gapMid)
            const isBest = bestBand && band.label === bestBand.label
            return (
              <div key={band.label} className={`apex-card p-5 ${isBest ? 'border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.08)]' : ''}`}>
                <div className='flex items-center justify-between mb-3'>
                  <div className='flex items-center gap-2'>
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className='text-xs font-bold text-zinc-400 uppercase tracking-wider'>{status}</span>
                  </div>
                  {isBest && <span className='text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded'>BEST</span>}
                </div>
                <div className='text-sm font-bold text-zinc-300 mb-3'>{band.label}</div>
                {/* Bar */}
                <div className='h-2 bg-white/[0.04] rounded-full overflow-hidden mb-3'>
                  <div
                    className='h-full rounded-full transition-all duration-500'
                    style={{
                      width: `${width}%`,
                      background: gapMid >= 5 ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : gapMid >= 0 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                        : 'linear-gradient(90deg, #ef4444, #f87171)'
                    }}
                  />
                </div>
                <div className='flex items-baseline gap-2'>
                  <span className='text-2xl font-black text-white'>{band.winRate || '—'}%</span>
                  <span className='text-xs text-zinc-500'>win rate</span>
                </div>
                <div className='flex items-center gap-3 mt-2 text-xs text-zinc-500'>
                  <span>{band.total} runners</span>
                  <span>{band.places} places</span>
                  {band.avgOdds && <span>Avg {band.avgOdds}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Win Rate Chart */}
      <div className='apex-card p-6 mb-6'>
        <h2 className='text-lg font-bold mb-5'>Win Rate by Gap</h2>
        <div className='space-y-3'>
          {bands.filter(b => b.total > 0).sort((a, b) => a.min - b.min).map((band) => {
            const wr = band.winRate ? parseFloat(band.winRate) : 0
            const width = maxWinRate > 0 ? (wr / maxWinRate) * 100 : 0
            const gapMid = band.max === Infinity ? band.min + 5 : band.min === -Infinity ? band.max - 5 : (band.min + band.max) / 2
            return (
              <div key={band.label} className='flex items-center gap-4'>
                <div className='w-20 text-right'>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getBandColor(gapMid)}`}>
                    {band.label}
                  </span>
                </div>
                <div className='flex-1 h-8 bg-white/[0.03] rounded-lg overflow-hidden relative'>
                  <div
                    className='h-full rounded-lg transition-all duration-500'
                    style={{
                      width: `${width}%`,
                      background: gapMid >= 5 ? 'linear-gradient(90deg, rgba(16,185,129,0.3), rgba(16,185,129,0.6))'
                        : gapMid >= 0 ? 'linear-gradient(90deg, rgba(245,158,11,0.3), rgba(245,158,11,0.6))'
                        : 'linear-gradient(90deg, rgba(239,68,68,0.2), rgba(239,68,68,0.4))'
                    }}
                  />
                  <div className='absolute inset-0 flex items-center px-3'>
                    <span className='text-xs font-bold text-white'>{band.winRate || '—'}%</span>
                    <span className='text-xs text-zinc-500 ml-2'>({band.total})</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Live Examples */}
      {data.samples.length > 0 && (
        <div>
          <h2 className='text-lg font-bold mb-4'>Live Examples</h2>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {data.samples.slice(0, 12).map((s, i) => {
              const badge = getResultBadge(s.position)
              return (
                <div key={i} className='apex-card p-4'>
                  <div className='flex items-center justify-between mb-2'>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
                    <span className='text-xs text-zinc-500'>{s.course}</span>
                  </div>
                  <div className='text-sm font-bold text-white mb-3'>{s.horse}</div>
                  <div className='flex items-center gap-3 text-xs'>
                    <div>
                      <span className='text-zinc-500'>OR </span>
                      <span className='text-zinc-300 font-bold'>{s.or}</span>
                    </div>
                    <div>
                      <span className='text-zinc-500'>PR </span>
                      <span className='text-cyan-400 font-bold'>{s.pr}</span>
                    </div>
                    <div>
                      <span className='text-zinc-500'>Gap </span>
                      <span className={`font-bold ${s.gap >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {s.gap > 0 ? '+' : ''}{s.gap}
                      </span>
                    </div>
                    <div className='ml-auto'>
                      <span className='text-zinc-500'>Odds </span>
                      <span className='text-zinc-300 font-bold'>{s.odds?.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
