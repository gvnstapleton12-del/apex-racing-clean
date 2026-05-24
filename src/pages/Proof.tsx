import { useState, useEffect } from 'react'
import { apiUrl } from '../lib/api'

function StatCard({ label, value, subtitle, color }: { label: string; value: string; subtitle?: string; color?: string }) {
  return (
    <div className='bg-[#0f1720]/80 border border-green-500/10 rounded-2xl p-6 text-center'>
      <span className='text-zinc-500 text-sm block mb-1'>{label}</span>
      <span className={`text-4xl font-black ${color || 'text-green-400'}`}>{value}</span>
      {subtitle && <span className='text-zinc-500 text-xs block mt-1'>{subtitle}</span>}
    </div>
  )
}

export default function Proof() {
  const [stats, setStats] = useState<any>(null)
  const [preds, setPreds] = useState<any>(null)
  const [tab, setTab] = useState<'overview' | 'samples' | 'calibration'>('overview')

  useEffect(() => {
    fetch(apiUrl('/api/learning-stats')).then(r => r.json()).then(setStats).catch(() => {})
    fetch(apiUrl('/api/predictions')).then(r => r.json()).then(setPreds).catch(() => {})
  }, [])

  const recentPreds = preds ? Object.entries(preds).slice(-20).flatMap(([, v]: any) => v).slice(0, 50) : []

  return (
    <div className='p-6 max-w-6xl mx-auto space-y-6'>
      <div>
        <h1 className='text-4xl font-black tracking-tight'>Evidence</h1>
        <p className='text-zinc-400 mt-2'>Real prediction data, accuracy metrics, and explainable race analysis.</p>
      </div>

      <div className='flex gap-2'>
        {(['overview', 'samples', 'calibration'] as const).map(t => (
          <button
            key={t}
            type='button'
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === t ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'text-zinc-400 hover:text-white border border-transparent'}`}
          >
            {t === 'overview' ? 'Overview' : t === 'samples' ? 'Sample Races' : 'Calibration'}
          </button>
        ))}
      </div>

      {tab === 'overview' && stats && (
        <>
          <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
            <StatCard label='Total Predictions' value={stats.totalBets?.toLocaleString() || '0'} subtitle='Across all race types' />
            <StatCard label='Winners' value={stats.winners?.toLocaleString() || '0'} subtitle={stats.totalBets ? `${((stats.winners / stats.totalBets) * 100).toFixed(1)}% strike rate` : ''} color='#34d399' />
            <StatCard label='Lifetime ROI' value={`${stats.roi?.toFixed(1) || '0'}%`} color={stats.roi > 0 ? '#34d399' : '#f87171'} />
            <StatCard label='Avg Confidence' value={`${stats.averageConfidence || 0}`} subtitle='Out of 100' />
          </div>

          {stats.confidenceBands && (
            <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
              <h2 className='text-lg font-bold mb-4'>Performance by Confidence Band</h2>
              <div className='space-y-3'>
                {stats.confidenceBands
                  .filter((b: any) => b.runs > 0)
                  .sort((a: any, b: any) => b.runs - a.runs)
                  .map((band: any) => (
                    <div key={band.band} className='flex items-center gap-4'>
                      <span className='w-20 text-sm font-medium capitalize'>{band.band}</span>
                      <div className='flex-1 bg-white/5 rounded-full h-6 overflow-hidden'>
                        <div className='h-full bg-green-500/30 rounded-full transition-all' style={{ width: `${(band.wins / Math.max(band.runs, 1)) * 100}%` }} />
                      </div>
                      <span className='w-20 text-right text-sm text-zinc-400'>{band.runs} runs</span>
                      <span className='w-20 text-right text-sm font-bold'>{band.strikeRate.toFixed(1)}%</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {stats.profitableSignals && stats.profitableSignals.length > 0 && (
            <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
              <h2 className='text-lg font-bold mb-4'>Performance by Signal Source</h2>
              <div className='grid grid-cols-1 gap-3'>
                {stats.profitableSignals.map((s: any) => (
                  <div key={s.signal} className='flex items-center justify-between bg-white/[0.02] rounded-xl p-4'>
                    <span className='font-medium'>{s.signal}</span>
                    <div className='flex gap-6'>
                      <span className='text-zinc-400'>{s.runs} runs</span>
                      <span className='text-green-400 font-bold'>{s.wins} wins</span>
                      <span className='font-bold'>{s.strikeRate.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className='bg-[#0f1720]/80 border border-amber-500/10 rounded-2xl p-6'>
            <h2 className='text-lg font-bold mb-2'>How It Works</h2>
            <div className='space-y-3 text-zinc-400 text-sm'>
              <p>
                <strong className='text-white'>Six independent engines</strong> score each runner: Horse Quality, Race Simulation,
                Market Model, Value Engine, Bankroll Engine, and Bet Filter. Each produces a sub-score.
              </p>
              <p>
                A weighted ensemble blends these into a <strong className='text-white'>final APEX score</strong> (0-100).
                Runners above 40 appear as system picks on the home page.
              </p>
              <p>
                Confidence tiers (S/A/B/C/D) map to score thresholds and control
                <strong className='text-white'> stake sizing</strong> via Kelly criterion.
              </p>
              <p>
                The system <strong className='text-white'>learns from results</strong> — weight multipliers are
                adjusted using Bayesian updating with anti-overfit protection.
                17,048 historical records are tracked in the learning database.
              </p>
            </div>
          </div>

          {stats.lastLearningRun && (
            <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
              <h2 className='text-lg font-bold mb-2'>Latest Learning Run</h2>
              <pre className='text-xs text-zinc-400 font-mono'>{JSON.stringify(stats.lastLearningRun, null, 2)}</pre>
            </div>
          )}
        </>
      )}

      {tab === 'samples' && recentPreds.length > 0 && (
        <div className='space-y-3'>
          {recentPreds.slice(0, 20).map((pred: any, i: number) => (
            <div key={i} className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <span className='text-lg font-bold'>{pred.horse}</span>
                  <span className='text-zinc-500 text-sm ml-3'>{pred.course}</span>
                </div>
                <div className='flex gap-4'>
                  <span className='text-sm text-zinc-400'>Conf: {pred.confidence}</span>
                  <span className='text-sm font-bold'>{pred.grade}</span>
                  <span className='text-sm'>{pred.odds}x</span>
                </div>
              </div>
              {(pred.breakdown || pred.predictedWinProb) && (
                <div className='flex gap-4 mt-2 text-xs text-zinc-500'>
                  {pred.predictedWinProb && <span>Win%: {pred.predictedWinProb}%</span>}
                  {pred.valueEdge && <span>Edge: {(pred.valueEdge * 100).toFixed(1)}%</span>}
                  {pred.breakdown?.powerScore && <span>Power: {pred.breakdown.powerScore}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'calibration' && (
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
          <h2 className='text-lg font-bold mb-4'>Calibration Data</h2>
          <p className='text-zinc-500 text-sm'>
            Calibration records how often predictions at each confidence level actually won.
            This data accumulates as results are processed. Currently building the dataset —
            results are scraped from ATR and matched against predictions automatically.
          </p>
          <div className='mt-6 p-4 bg-white/[0.02] rounded-xl'>
            <p className='text-zinc-400 text-sm'>Available data points:</p>
            <ul className='mt-2 space-y-1 text-sm text-zinc-500'>
              <li>• 17,048 prediction records in database</li>
              <li>• Confidence-tier breakdowns</li>
              <li>• Learning weight adjustments tracked per run</li>
              <li>• Anti-overfit protection active on all weight updates</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
