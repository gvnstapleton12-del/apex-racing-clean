import { useState, useEffect } from 'react'
import { apiUrl } from '../lib/api'
import { calculateStrikeRate, calculateWinPercentage } from '../lib/engine'
import CalibrationDashboard from '../components/CalibrationDashboard'

function StatCard({ label, value, subtitle, color }: { label: string; value: string; subtitle?: string; color?: string }) {
  return (
    <div className='bg-[#0f1720]/80 border border-green-500/10 rounded-2xl p-6 text-center'>
      <span className='text-zinc-500 text-sm block mb-1'>{label}</span>
      <span className={`text-4xl font-black ${color || 'text-green-400'}`}>{value}</span>
      {subtitle && <span className='text-zinc-500 text-xs block mt-1'>{subtitle}</span>}
    </div>
  )
}

function HistoryTab() {
  const [data, setData] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [courseFilter, setCourseFilter] = useState('')
  const [maxRecords, setMaxRecords] = useState(200)

  useEffect(() => {
    fetch(apiUrl(`/api/historical?limit=${maxRecords}&offset=0`)).then(r => r.json()).then(setData).catch(() => {})
    fetch(apiUrl('/api/historical/stats')).then(r => r.json()).then(setStats).catch(() => {})
  }, [maxRecords])

  const records = data?.records || []
  const filtered = courseFilter
    ? records.filter((r: any) => String(r.course || '').toLowerCase().includes(courseFilter.toLowerCase()))
    : records

  if (!stats) return <div className='text-zinc-500'>Loading historical data...</div>

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-2 lg:grid-cols-6 gap-3'>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Total Runners</span>
          <span className='text-2xl font-black text-white'>{stats.total?.toLocaleString() || 0}</span>
        </div>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Resulted</span>
          <span className='text-2xl font-black text-green-400'>{stats.resulted?.toLocaleString() || 0}</span>
        </div>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Winners</span>
          <span className='text-2xl font-black text-green-400'>{stats.winners?.toLocaleString() || 0}</span>
        </div>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Win Rate</span>
          <span className='text-2xl font-black text-white'>{(stats.winRate * 100).toFixed(1)}%</span>
        </div>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Place Rate</span>
          <span className='text-2xl font-black text-white'>{(stats.placeRate * 100).toFixed(1)}%</span>
        </div>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>ROI</span>
          <span className={`text-2xl font-black ${stats.roi > 0 ? 'text-green-400' : stats.roi < 0 ? 'text-red-400' : 'text-white'}`}>
            {stats.roi > 0 ? '+' : ''}{stats.roi?.toFixed(1)}%
          </span>
        </div>
      </div>

      {stats.invalidPositions > 0 && (
        <div className='bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-2 text-sm text-amber-300'>
          ⚠ {stats.invalidPositions} records had non-numeric positions (PU/F/UR/NR) — quarantined from analytics
        </div>
      )}

      {stats.engines?.bCalibration && stats.engines.bCalibration.length > 0 && (
        <div className='bg-[#0f1720]/80 border border-amber-500/20 rounded-2xl p-6'>
          <div className='flex items-center gap-3 mb-4'>
            <h2 className='text-lg font-bold text-amber-400'>B/B+ Calibration — 4/1–12/1 Sweet Spot</h2>
            <span className='px-2 py-0.5 text-xs font-bold bg-green-500/10 text-green-400 rounded'>PRIMARY METRIC</span>
          </div>
          <div className='grid grid-cols-2 lg:grid-cols-3 gap-3'>
            {[...stats.engines.bCalibration]
              .sort((a: any, b: any) => {
                const aMin = parseFloat(a.band) || 0
                const bMin = parseFloat(b.band) || 0
                return aMin - bMin
              })
              .map((b: any) => (
              <div key={b.band} className='bg-white/[0.02] rounded-xl p-3 border border-white/5 text-center'>
                <span className='text-zinc-500 text-xs block mb-1'>{b.band}</span>
                <span className='text-lg font-black text-amber-400'>{b.winRate}%</span>
                <div className='flex justify-center gap-3 mt-1.5 text-xs text-zinc-500'>
                  <span>{b.total} bets</span>
                  <span className='text-green-400'>{b.wins} wins</span>
                </div>
                <div className='flex justify-center gap-3 mt-1 text-xs'>
                  <span>
                    Pred <span className='text-zinc-400'>{b.avgPredictedProb}%</span>
                  </span>
                  <span className={`font-bold ${Math.abs(b.calibrationError) < 5 ? 'text-green-400' : Math.abs(b.calibrationError) < 10 ? 'text-amber-400' : 'text-red-400'}`}>
                    {b.calibrationError > 0 ? '+' : ''}{b.calibrationError}%
                  </span>
                  <span className={`font-bold ${b.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {b.roi > 0 ? '+' : ''}{b.roi.toFixed(0)}% ROI
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className='text-zinc-600 text-xs text-center mt-3'>
            {stats.engines.bCalibration.reduce((s: number, b: any) => s + b.total, 0)} total bets — error = actual win% minus predicted probability
          </p>
        </div>
      )}

      {stats.clv && (
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-3'>
          <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-3 text-center'>
            <span className='text-zinc-500 text-xs block'>CLV Mean</span>
            <span className={`text-lg font-black ${Number(stats.clv.meanPct) > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.clv.meanPct}%
            </span>
          </div>
          <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-3 text-center'>
            <span className='text-zinc-500 text-xs block'>CLV Median</span>
            <span className={`text-lg font-black ${Number(stats.clv.medianPct) > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.clv.medianPct}%
            </span>
          </div>
          <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-3 text-center'>
            <span className='text-zinc-500 text-xs block'>CLV +ve Rate</span>
            <span className='text-lg font-black text-white'>{stats.clv.positiveRate}%</span>
          </div>
          <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-3 text-center'>
            <span className='text-zinc-500 text-xs block'>Avg Win CLV</span>
            <span className={`text-lg font-black ${Number(stats.clv.avgWinClv) > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.clv.avgWinClv || '-'}%
            </span>
          </div>
        </div>
      )}

      {stats.winnerOddsDistribution && (
        <div>
          <h3 className='text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wider'>Winner Odds Distribution</h3>
          <div className='grid grid-cols-5 gap-3'>
            <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
              <span className='text-zinc-500 text-xs block mb-1'>Mean</span>
              <span className='text-xl font-black'>{stats.winnerOddsDistribution.mean}x</span>
            </div>
            <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
              <span className='text-zinc-500 text-xs block mb-1'>Median</span>
              <span className='text-xl font-black text-amber-400'>{stats.winnerOddsDistribution.median}x</span>
            </div>
            <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
              <span className='text-zinc-500 text-xs block mb-1'>90th Pctl</span>
              <span className='text-xl font-black'>{stats.winnerOddsDistribution.p90}x</span>
            </div>
            <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
              <span className='text-zinc-500 text-xs block mb-1'>Min</span>
              <span className='text-xl font-black text-green-400'>{stats.winnerOddsDistribution.min}x</span>
            </div>
            <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
              <span className='text-zinc-500 text-xs block mb-1'>Max</span>
              <span className='text-xl font-black text-red-400'>{stats.winnerOddsDistribution.max}x</span>
            </div>
          </div>
          <p className='text-zinc-600 text-xs mt-3'>
            {stats.winners} winners — median tells true profile, 90th pctl reveals bomb dependence
          </p>
        </div>
      )}

      {stats.engines && (
        <div className='grid grid-cols-2 gap-4'>
          <div className='bg-[#0f1720]/80 border border-blue-500/20 rounded-2xl p-6'>
            <h2 className='text-lg font-bold mb-4 text-blue-400'>APEX CORE</h2>
            <div className='space-y-2 text-sm'>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>Bets</span>
                <span className='font-bold'>{stats.engines.CORE.total}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>Winners</span>
                <span className='text-green-400 font-bold'>{stats.engines.CORE.winners}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>Win Rate</span>
                <span className='font-bold'>{(stats.engines.CORE.winRate * 100).toFixed(1)}%</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>Place Rate</span>
                <span className='font-bold'>{(stats.engines.CORE.placeRate * 100).toFixed(1)}%</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>ROI</span>
                <span className={`font-bold ${stats.engines.CORE.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.engines.CORE.roi > 0 ? '+' : ''}{stats.engines.CORE.roi.toFixed(1)}%
                </span>
              </div>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>Avg Odds</span>
                <span className='font-bold'>{stats.engines.CORE.avgOdds.toFixed(1)}x</span>
              </div>
              {stats.engines.CORE.clvMean && (
                <div className='flex justify-between'>
                  <span className='text-zinc-400'>CLV Mean</span>
                  <span className={`font-bold ${Number(stats.engines.CORE.clvMean) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.engines.CORE.clvMean}%
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className='bg-[#0f1720]/80 border border-purple-500/20 rounded-2xl p-6'>
            <h2 className='text-lg font-bold mb-4 text-purple-400'>APEX CHAOS</h2>
            <div className='space-y-2 text-sm'>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>Bets</span>
                <span className='font-bold'>{stats.engines.CHAOS.total}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>Winners</span>
                <span className='text-green-400 font-bold'>{stats.engines.CHAOS.winners}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>Win Rate</span>
                <span className='font-bold'>{(stats.engines.CHAOS.winRate * 100).toFixed(1)}%</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>Place Rate</span>
                <span className='font-bold'>{(stats.engines.CHAOS.placeRate * 100).toFixed(1)}%</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>ROI</span>
                <span className={`font-bold ${stats.engines.CHAOS.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.engines.CHAOS.roi > 0 ? '+' : ''}{stats.engines.CHAOS.roi.toFixed(1)}%
                </span>
              </div>
              <div className='flex justify-between'>
                <span className='text-zinc-400'>Avg Odds</span>
                <span className='font-bold'>{stats.engines.CHAOS.avgOdds.toFixed(1)}x</span>
              </div>
              {stats.engines.CHAOS.clvMean && (
                <div className='flex justify-between'>
                  <span className='text-zinc-400'>CLV Mean</span>
                  <span className={`font-bold ${Number(stats.engines.CHAOS.clvMean) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.engines.CHAOS.clvMean}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {stats.engines?.calibration && (
        <div className='grid grid-cols-2 gap-4'>
          <div className='bg-[#0f1720]/80 border border-blue-500/20 rounded-2xl p-6'>
            <h2 className='text-lg font-bold mb-4 text-blue-400'>CORE Calibration</h2>
            <div className='space-y-2'>
              {stats.engines.calibration.CORE.filter((b: any) => b.total > 0).map((b: any) => {
                const error = Math.abs(b.calibrationError)
                const errorColor = error < 3 ? 'text-green-400' : error < 8 ? 'text-amber-400' : 'text-red-400'
                return (
                  <div key={b.band} className='flex items-center gap-3 text-sm'>
                    <span className='w-20 text-zinc-400'>{b.band}</span>
                    <div className='flex-1 bg-white/5 rounded-full h-4 overflow-hidden relative'>
                      <div className='h-full bg-blue-500/30 rounded-full' style={{ width: `${Math.min(b.actual, 100)}%` }} />
                      <div className='absolute top-0 left-0 h-full border-r border-blue-400/50' style={{ left: `${b.expected}%` }} />
                    </div>
                    <span className='w-16 text-right text-xs text-zinc-500'>{b.total} bets</span>
                    <span className='w-16 text-right font-bold'>{b.actual}%</span>
                    <span className={`w-16 text-right text-xs font-bold ${errorColor}`}>
                      {b.calibrationError > 0 ? '+' : ''}{b.calibrationError}%
                    </span>
                  </div>
                )
              })}
            </div>
            <p className='text-zinc-600 text-xs mt-3'>Blue line = expected, bar = actual. Green = well-calibrated.</p>
          </div>
          <div className='bg-[#0f1720]/80 border border-purple-500/20 rounded-2xl p-6'>
            <h2 className='text-lg font-bold mb-4 text-purple-400'>CHAOS Calibration</h2>
            <div className='space-y-2'>
              {stats.engines.calibration.CHAOS.filter((b: any) => b.total > 0).map((b: any) => {
                const error = Math.abs(b.calibrationError)
                const errorColor = error < 3 ? 'text-green-400' : error < 8 ? 'text-amber-400' : 'text-red-400'
                return (
                  <div key={b.band} className='flex items-center gap-3 text-sm'>
                    <span className='w-20 text-zinc-400'>{b.band}</span>
                    <div className='flex-1 bg-white/5 rounded-full h-4 overflow-hidden relative'>
                      <div className='h-full bg-purple-500/30 rounded-full' style={{ width: `${Math.min(b.actual, 100)}%` }} />
                      <div className='absolute top-0 left-0 h-full border-r border-purple-400/50' style={{ left: `${b.expected}%` }} />
                    </div>
                    <span className='w-16 text-right text-xs text-zinc-500'>{b.total} bets</span>
                    <span className='w-16 text-right font-bold'>{b.actual}%</span>
                    <span className={`w-16 text-right text-xs font-bold ${errorColor}`}>
                      {b.calibrationError > 0 ? '+' : ''}{b.calibrationError}%
                    </span>
                  </div>
                )
              })}
            </div>
            <p className='text-zinc-600 text-xs mt-3'>Purple line = expected, bar = actual. Green = well-calibrated.</p>
          </div>
        </div>
      )}

      {stats.noBetAnalysis && stats.noBetAnalysis.rejected.total > 0 && (
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
          <h2 className='text-lg font-bold mb-4'>NO BET Analysis — Suppression Check</h2>
          <div className='grid grid-cols-2 gap-4 mb-4'>
            <div className='bg-white/[0.02] rounded-xl p-4'>
              <h3 className='text-sm font-bold text-zinc-400 mb-2'>Rejected (NO BET)</h3>
              <div className='space-y-1 text-sm'>
                <div className='flex justify-between'>
                  <span className='text-zinc-500'>Bets</span>
                  <span className='font-bold'>{stats.noBetAnalysis.rejected.total}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-zinc-500'>Winners</span>
                  <span className='text-green-400 font-bold'>{stats.noBetAnalysis.rejected.winners}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-zinc-500'>Win Rate</span>
                  <span className='font-bold'>{(stats.noBetAnalysis.rejected.winRate * 100).toFixed(1)}%</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-zinc-500'>ROI</span>
                  <span className={`font-bold ${stats.noBetAnalysis.rejected.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.noBetAnalysis.rejected.roi > 0 ? '+' : ''}{stats.noBetAnalysis.rejected.roi.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
            <div className='bg-white/[0.02] rounded-xl p-4'>
              <h3 className='text-sm font-bold text-zinc-400 mb-2'>Accepted (BETTABLE)</h3>
              <div className='space-y-1 text-sm'>
                <div className='flex justify-between'>
                  <span className='text-zinc-500'>Bets</span>
                  <span className='font-bold'>{stats.noBetAnalysis.accepted.total}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-zinc-500'>Winners</span>
                  <span className='text-green-400 font-bold'>{stats.noBetAnalysis.accepted.winners}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-zinc-500'>Win Rate</span>
                  <span className='font-bold'>{(stats.noBetAnalysis.accepted.winRate * 100).toFixed(1)}%</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-zinc-500'>ROI</span>
                  <span className={`font-bold ${stats.noBetAnalysis.accepted.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.noBetAnalysis.accepted.roi > 0 ? '+' : ''}{stats.noBetAnalysis.accepted.roi.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
          {stats.noBetAnalysis.byVerdict.length > 0 && (
            <div className='space-y-2'>
              <h3 className='text-sm font-bold text-zinc-400'>By Verdict</h3>
              {stats.noBetAnalysis.byVerdict.map((v: any) => (
                <div key={v.verdict} className='flex items-center justify-between bg-white/[0.02] rounded-lg px-3 py-2 text-sm'>
                  <span className='font-medium'>{v.verdict}</span>
                  <div className='flex gap-4'>
                    <span className='text-zinc-400'>{v.total} bets</span>
                    <span className='text-green-400'>{v.wins} wins</span>
                    <span className='font-bold'>{(v.winRate * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {stats.clvByOddsBand && stats.clvByOddsBand.some((b: any) => b.withClv > 0) && (
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
          <h2 className='text-lg font-bold mb-4'>CLV by Odds Band</h2>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-zinc-500 text-xs uppercase border-b border-white/5'>
                  <th className='text-left py-2 pr-4'>Odds</th>
                  <th className='text-right py-2 pr-4'>Bets</th>
                  <th className='text-right py-2 pr-4'>With CLV</th>
                  <th className='text-right py-2 pr-4'>Mean CLV</th>
                  <th className='text-right py-2 pr-4'>Median CLV</th>
                  <th className='text-right py-2 pr-4'>+ve Rate</th>
                  <th className='text-right py-2 pr-4'>Avg Win CLV</th>
                </tr>
              </thead>
              <tbody>
                {stats.clvByOddsBand.filter((b: any) => b.withClv > 0).map((b: any) => (
                  <tr key={b.band} className='border-b border-white/[0.02]'>
                    <td className='py-2 pr-4 font-medium'>{b.band}</td>
                    <td className='py-2 pr-4 text-right text-zinc-400'>{b.total}</td>
                    <td className='py-2 pr-4 text-right text-zinc-400'>{b.withClv}</td>
                    <td className={`py-2 pr-4 text-right font-bold ${Number(b.meanClv) > 0 ? 'text-green-400' : Number(b.meanClv) < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                      {b.meanClv !== null ? `${Number(b.meanClv) > 0 ? '+' : ''}${b.meanClv}%` : '-'}
                    </td>
                    <td className={`py-2 pr-4 text-right font-bold ${Number(b.medianClv) > 0 ? 'text-green-400' : Number(b.medianClv) < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                      {b.medianClv !== null ? `${Number(b.medianClv) > 0 ? '+' : ''}${b.medianClv}%` : '-'}
                    </td>
                    <td className='py-2 pr-4 text-right text-zinc-400'>
                      {b.positiveRate !== null ? `${b.positiveRate}%` : '-'}
                    </td>
                    <td className={`py-2 pr-4 text-right font-bold ${Number(b.avgWinClv) > 0 ? 'text-green-400' : Number(b.avgWinClv) < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                      {b.avgWinClv !== null ? `${Number(b.avgWinClv) > 0 ? '+' : ''}${b.avgWinClv}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className='text-zinc-600 text-xs mt-3'>CLV = (takenOdds - closingOdds) / closingOdds. Positive CLV = beating the market.</p>
        </div>
      )}

      {stats.byWinProb && stats.byWinProb.length > 0 && (
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
          <h2 className='text-lg font-bold mb-4'>Actual Win Rate by Predicted Probability</h2>
          <div className='space-y-2'>
            {stats.byWinProb.filter((b: any) => b.total > 0).map((b: any) => {
              const pct = b.winRate * 100
              const expected = parseFloat(b.band.split('-')[1] || b.band.split('-')[0]) || 50
              return (
                  <div key={b.band} className='flex items-center gap-3'>
                    <span className='w-20 text-sm font-medium'>{b.band}</span>
                    <div className='flex-1 bg-white/5 rounded-full h-5 overflow-hidden relative'>
                      <div className='h-full bg-green-500/30 rounded-full transition-all' style={{ width: `${pct}%` }} />
                      <div className='absolute top-0 left-0 h-full border-r border-white/20' style={{ left: `${expected}%` }} />
                    </div>
                    <span className='w-16 text-right text-xs text-zinc-400'>{b.total} runs</span>
                    <span className='w-14 text-right text-sm font-bold'>{pct.toFixed(1)}%</span>
                    <span className={`w-14 text-right text-xs font-bold ${b.roi > 0 ? 'text-green-400' : b.roi < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                      {b.roi > 0 ? '+' : ''}{b.roi.toFixed(0)}%
                    </span>
                  </div>
              )
            })}
          </div>
        </div>
      )}

      {stats.byGrade && stats.byGrade.length > 0 && (
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
          <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
            <h2 className='text-lg font-bold mb-4'>Win Rate by Grade</h2>
            <div className='space-y-2'>
              {stats.byGrade.map((g: any) => (
                  <div key={g.grade} className='flex items-center justify-between bg-white/[0.02] rounded-xl px-4 py-3'>
                    <span className='font-bold text-sm'>{g.grade}</span>
                    <div className='flex gap-4 text-sm items-center'>
                      <span className='text-zinc-400'>{g.total} runs</span>
                      <span className='text-green-400'>{g.wins} wins</span>
                      <span className='font-bold'>{(g.winRate * 100).toFixed(1)}%</span>
                      <span className={`text-xs font-bold ${g.roi > 0 ? 'text-green-400' : g.roi < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                        {g.roi > 0 ? '+' : ''}{g.roi.toFixed(0)}%
                      </span>
                    </div>
                  </div>
              ))}
            </div>
          </div>
          <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
            <h2 className='text-lg font-bold mb-4'>Win Rate by Bet Quality</h2>
            <div className='space-y-2'>
              {stats.byBetQuality.map((b: any) => (
                  <div key={b.betQuality} className='flex items-center justify-between bg-white/[0.02] rounded-xl px-4 py-3'>
                    <span className='font-bold text-sm'>{b.betQuality}</span>
                    <div className='flex gap-4 text-sm items-center'>
                      <span className='text-zinc-400'>{b.total} runs</span>
                      <span className='text-green-400'>{b.wins} wins</span>
                      <span className='font-bold'>{(b.winRate * 100).toFixed(1)}%</span>
                      <span className={`text-xs font-bold ${b.roi > 0 ? 'text-green-400' : b.roi < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                        {b.roi > 0 ? '+' : ''}{b.roi.toFixed(0)}%
                      </span>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {stats.byOddsBand && stats.byOddsBand.some((b: any) => b.total > 0) && (
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
          <h2 className='text-lg font-bold mb-4'>Win Rate by Odds Band</h2>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-zinc-500 text-xs uppercase border-b border-white/5'>
                  <th className='text-left py-2 pr-4'>Odds</th>
                  <th className='text-right py-2 pr-4'>Bets</th>
                  <th className='text-right py-2 pr-4'>Wins</th>
                  <th className='text-right py-2 pr-4'>Win%</th>
                  <th className='text-right py-2 pr-4'>Avg Odds</th>
                  <th className='text-right py-2 pr-4'>ROI</th>
                </tr>
              </thead>
              <tbody>
                {stats.byOddsBand.filter((b: any) => b.total > 0).map((b: any) => (
                  <tr key={b.band} className='border-b border-white/[0.02]'>
                    <td className='py-2 pr-4 font-medium'>{b.band}</td>
                    <td className='py-2 pr-4 text-right text-zinc-400'>{b.total}</td>
                    <td className='py-2 pr-4 text-right text-green-400'>{b.wins}</td>
                    <td className='py-2 pr-4 text-right font-bold'>{(b.winRate * 100).toFixed(1)}%</td>
                    <td className='py-2 pr-4 text-right text-zinc-400'>{b.avgOdds.toFixed(1)}</td>
                    <td className={`py-2 pr-4 text-right font-bold ${b.roi > 0 ? 'text-green-400' : b.roi < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                      {b.roi > 0 ? '+' : ''}{b.roi.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats.gradeOddsMatrix && stats.gradeOddsMatrix.some((g: any) => g.bands.some((b: any) => b.total > 0)) && (
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
          <h2 className='text-lg font-bold mb-4'>Grade × Odds Matrix — ROI</h2>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-zinc-500 text-xs uppercase border-b border-white/5'>
                  <th className='text-left py-2 pr-4'>Grade</th>
                  {stats.gradeOddsMatrix[0].bands.map((b: any) => (
                    <th key={b.band} className='text-right py-2 pr-4'>{b.band}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.gradeOddsMatrix.map((g: any) => (
                  <tr key={g.grade} className='border-b border-white/[0.02]'>
                    <td className='py-2 pr-4 font-bold'>{g.grade}</td>
                    {g.bands.map((b: any) => (
                      <td key={b.band} className={`py-2 pr-4 text-right font-bold ${b.roi === null ? 'text-zinc-600' : b.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {b.roi === null ? '-' : `${b.roi > 0 ? '+' : ''}${b.roi.toFixed(0)}%`}
                        <span className='block text-xs text-zinc-500'>{b.total} bets</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-lg font-bold'>Recent Runners</h2>
          <div className='flex gap-3 items-center'>
            <input
              type='text'
              placeholder='Filter by course...'
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className='bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 w-44'
            />
            <select value={maxRecords} onChange={(e) => setMaxRecords(Number(e.target.value))} className='bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white'>
              <option value={50}>50</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='text-zinc-500 text-xs uppercase border-b border-white/5'>
                <th className='text-left py-2 pr-3'>Horse</th>
                <th className='text-left py-2 pr-3'>Course</th>
                <th className='text-left py-2 pr-3'>Date</th>
                <th className='text-right py-2 pr-3'>Score</th>
                <th className='text-right py-2 pr-3'>Win%</th>
                <th className='text-right py-2 pr-3'>Odds</th>
                <th className='text-center py-2 pr-3'>Grade</th>
                <th className='text-center py-2 pr-3'>Quality</th>
                <th className='text-center py-2 pr-3'>Result</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((r: any) => (
                <tr key={r.id} className='border-b border-white/[0.02] hover:bg-white/[0.02]'>
                  <td className='py-2 pr-3 font-medium'>{r.horse}</td>
                  <td className='py-2 pr-3 text-zinc-400'>{r.course}</td>
                  <td className='py-2 pr-3 text-zinc-400 text-xs'>{r.date}</td>
                  <td className='py-2 pr-3 text-right'>{(r.finalScore || 0).toFixed(0)}</td>
                  <td className='py-2 pr-3 text-right'>{(r.winProb * 100 || 0).toFixed(0)}%</td>
                  <td className='py-2 pr-3 text-right text-zinc-400'>{r.odds ? `${r.odds}` : '-'}</td>
                  <td className='py-2 pr-3 text-center'><span className={`px-2 py-0.5 rounded text-xs font-bold ${r.grade === 'S' ? 'text-purple-400 bg-purple-500/10' : r.grade === 'A' ? 'text-green-400 bg-green-500/10' : r.grade === 'B' ? 'text-blue-400 bg-blue-500/10' : r.grade === 'C' ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-400 bg-white/5'}`}>{r.grade || '-'}</span></td>
                  <td className='py-2 pr-3 text-center'><span className={`px-2 py-0.5 rounded text-xs font-bold ${r.betQuality === 'ELITE' ? 'text-purple-400 bg-purple-500/10' : r.betQuality === 'STRONG' ? 'text-green-400 bg-green-500/10' : r.betQuality === 'DECENT' ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-400 bg-white/5'}`}>{r.betQuality || '-'}</span></td>
                  <td className='py-2 pr-3 text-center'>
                    {r.resulted ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.actual_won ? 'text-green-400 bg-green-500/20' : 'text-zinc-400 bg-zinc-500/20'}`}>
                        {r.actual_won ? 'WON' : `${r.actual_position}th`}
                      </span>
                    ) : (
                      <span className='text-zinc-600 text-xs'>Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function Proof() {
  const [stats, setStats] = useState<any>(null)
  const [preds, setPreds] = useState<any>(null)
  const [tab, setTab] = useState<'overview' | 'samples' | 'calibration' | 'history'>('overview')

  useEffect(() => {
    fetch(apiUrl('/api/learning-stats')).then(r => r.json()).then(setStats).catch(() => {})
    fetch(apiUrl('/api/predictions')).then(r => r.json()).then(setPreds).catch(() => {})
  }, [])

  const recentPreds = preds ? Object.entries(preds).slice(-20).flatMap(([, v]: any) => v).slice(0, 50) : []
  const strikeRate = stats?.totalBets ? calculateStrikeRate(stats.winners, stats.totalBets) : null

  return (
    <div className='p-6 max-w-6xl mx-auto space-y-6'>
      <div>
        <h1 className='text-4xl font-black tracking-tight'>Evidence</h1>
        <p className='text-zinc-400 mt-2'>Real prediction data, accuracy metrics, and explainable race analysis.</p>
      </div>

      <div className='flex gap-2 flex-wrap'>
        {(['overview', 'samples', 'calibration', 'history'] as const).map(t => (
          <button
            key={t}
            type='button'
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === t ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'text-zinc-400 hover:text-white border border-transparent'}`}
          >
            {t === 'overview' ? 'Overview' : t === 'samples' ? 'Sample Races' : t === 'calibration' ? 'Calibration' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'overview' && stats && (
        <>
          <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
            <StatCard label='Total Predictions' value={stats.totalBets?.toLocaleString() || '0'} subtitle='Across all race types' />
            <StatCard label='Winners' value={stats.winners?.toLocaleString() || '0'} subtitle={strikeRate ? `${strikeRate}% strike rate` : ''} color='#34d399' />
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
                        <div className='h-full bg-green-500/30 rounded-full transition-all' style={{ width: `${calculateWinPercentage(band.wins, band.runs)}%` }} />
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

      {tab === 'calibration' && <CalibrationDashboard />}
      {tab === 'history' && <HistoryTab />}
    </div>
  )
}
