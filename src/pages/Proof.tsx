import { useState, useEffect } from 'react'
import { apiUrl } from '../lib/api'
import { calculateStrikeRate, calculateWinPercentage } from '../lib/engine'
import CalibrationDashboard from '../components/CalibrationDashboard'

function slHorseUrl(name: string, id?: string | null) {
  if (id) return `https://www.sportinglife.com/racing/profiles/horse/${id}`
  return `https://www.sportinglife.com/search?q=${encodeURIComponent(name)}`
}

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
    const fetchData = () => {
      fetch(apiUrl(`/api/historical?limit=${maxRecords}&offset=0`)).then(r => r.json()).then(setData).catch(() => {})
      fetch(apiUrl('/api/historical/stats')).then(r => r.json()).then(setStats).catch(() => {})
    }
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [maxRecords])

  const records = data?.records || []
  const filtered = courseFilter
    ? records.filter((r: any) => String(r.course || '').toLowerCase().includes(courseFilter.toLowerCase()))
    : records

  if (!stats) return <div className='text-zinc-500'>Loading historical data...</div>

  return (
    <div className='space-y-6'>
      <section className='dashboard-hero' style={{ gridTemplateColumns: '1fr' }}>
        <div className='hero-copy'>
          <span className='eyebrow text-zinc-500 text-sm font-medium uppercase tracking-wider'>Evidence</span>
          <h1 className='text-5xl font-black tracking-tight'>Proof of performance</h1>
          <p className='text-zinc-400 text-lg mt-3'>
            Real prediction data, accuracy metrics, and explainable race analysis.
          </p>
        </div>
      </section>

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
          <div className='grid grid-cols-2 sm:grid-cols-5 gap-3'>
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
        <div className='grid grid-cols-2 gap-4 cal-engines-grid'>
          <div className='bg-[#0f1720]/80 border border-blue-500/20 rounded-2xl p-6'>
            <h2 className='text-lg font-bold mb-4 text-blue-400'>CORE Calibration</h2>
            <div className='space-y-2'>
              {stats.engines.calibration.CORE.filter((b: any) => b.total > 0).map((b: any) => {
                const error = Math.abs(b.calibrationError)
                const errorColor = error < 3 ? 'text-green-400' : error < 8 ? 'text-amber-400' : 'text-red-400'
                return (
                  <div key={b.band} className='flex items-center gap-3 text-sm'>
                    <span className='w-20 text-zinc-400'>{b.band}</span>
                    <div className='flex-1 bg-white/10 rounded-full h-5 overflow-hidden relative'>
                      <div className='h-full bg-blue-500/60 rounded-full' style={{ width: `${Math.min(b.actual, 100)}%` }} />
                      <div className='absolute top-0 left-0 h-full border-r-2 border-blue-400' style={{ left: `${b.expected}%` }} />
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
                    <div className='flex-1 bg-white/10 rounded-full h-5 overflow-hidden relative'>
                      <div className='h-full bg-purple-500/60 rounded-full' style={{ width: `${Math.min(b.actual, 100)}%` }} />
                      <div className='absolute top-0 left-0 h-full border-r-2 border-purple-400' style={{ left: `${b.expected}%` }} />
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
          <table className='w-full text-sm history-table'>
            <thead>
              <tr className='text-zinc-500 text-xs uppercase border-b border-white/5'>
                <th className='text-left py-2 pr-3'>Horse</th>
                <th className='text-left py-2 pr-3'>Course</th>
                <th className='text-left py-2 pr-3 col-hide-mobile'>Date</th>
                <th className='text-right py-2 pr-3'>Score</th>
                <th className='text-right py-2 pr-3 col-hide-mobile'>Win%</th>
                <th className='text-right py-2 pr-3'>Odds</th>
                <th className='text-center py-2 pr-3 col-hide-mobile'>Grade</th>
                <th className='text-center py-2 pr-3'>Quality</th>
                <th className='text-center py-2 pr-3 col-hide-mobile'>Result</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((r: any) => (
                <tr key={r.id} className='border-b border-white/[0.02] hover:bg-white/[0.02]'>
                  <td className='py-2 pr-3 font-medium'>{r.horse}</td>
                  <td className='py-2 pr-3 text-zinc-400'>{r.course}</td>
                  <td className='py-2 pr-3 text-zinc-400 text-xs col-hide-mobile'>{r.date}</td>
                  <td className='py-2 pr-3 text-right'>{(r.finalScore || 0).toFixed(0)}</td>
                   <td className='py-2 pr-3 text-right col-hide-mobile'>{(r.winProb || 0).toFixed(1)}%</td>
                   <td className='py-2 pr-3 text-right text-zinc-400'>{r.odds ? `${r.odds}` : '-'}</td>
                   <td className='py-2 pr-3 text-center col-hide-mobile'><span className={`px-2 py-0.5 rounded text-xs font-bold ${r.grade?.startsWith('A') ? 'text-green-400 bg-green-500/10' : r.grade?.startsWith('B') ? 'text-blue-400 bg-blue-500/10' : r.grade?.startsWith('C') ? 'text-amber-400 bg-amber-500/10' : r.grade === 'D' ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-400 bg-white/5'}`}>{r.grade || '-'}</span></td>
                   <td className='py-2 pr-3 text-center'><span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${r.betQuality === 'STRONG BET' || r.betQuality === 'STRONG VALUE' ? 'text-green-400 bg-green-500/10' : r.betQuality === 'BET' || r.betQuality === 'VALUE' || r.betQuality === 'PLAYABLE' ? 'text-blue-400 bg-blue-500/10' : r.betQuality === 'CONSIDER' || r.betQuality === 'SPECULATIVE' ? 'text-amber-400 bg-amber-500/10' : r.betQuality === 'AVOID' ? 'text-red-400/60 bg-red-500/5' : 'text-zinc-400 bg-white/5'}`}>{r.betQuality || '-'}</span></td>
                   <td className='py-2 pr-3 text-center col-hide-mobile'>
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

function SandboxTab() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    const controller = new AbortController()
    const fetchData = () => {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 8000)
      fetch(apiUrl(`/api/shadow-watch?days=${days}`), { signal: ac.signal })
        .then(r => {
          clearTimeout(timer)
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then(d => { setData(d); setError(null) })
        .catch(e => {
          clearTimeout(timer)
          if (e.name !== 'AbortError') setError(e.message || 'Failed to load')
        })
    }
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => { clearInterval(interval); controller.abort() }
  }, [days])

  const summary = data?.summary || {}
  const records = data?.records || []
  const settled = records.filter((r: any) => r.status === 'SETTLED')
  const pending = records.filter((r: any) => r.status === 'PENDING')

  if (error && !data) return <div className='text-zinc-500'>Failed to load sandbox data: {error}</div>
  if (!data) return <div className='text-zinc-500'>Loading sandbox data...</div>

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-xl font-bold text-amber-400'>Shadow Sandbox</h2>
          <p className='text-zinc-500 text-sm'>Close-miss selections tracked with zero cash risk. SPECULATIVE + BORDERLINE only.</p>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className='bg-[#0f1720] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-300'>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
        </select>
      </div>

      <div className='grid grid-cols-2 lg:grid-cols-6 gap-3'>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Total Tracked</span>
          <span className='text-2xl font-black text-white'>{summary.total || 0}</span>
        </div>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Settled</span>
          <span className='text-2xl font-black text-zinc-300'>{summary.settled || 0}</span>
        </div>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Wins</span>
          <span className='text-2xl font-black text-green-400'>{summary.wins || 0}</span>
        </div>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Win Rate</span>
          <span className='text-2xl font-black text-blue-400'>{summary.winRate || '0.0'}%</span>
        </div>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Level P&L</span>
          <span className={`text-2xl font-black ${(summary.totalPnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {(summary.totalPnl || 0) >= 0 ? '+' : ''}{summary.totalPnl || 0}
          </span>
        </div>
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>ROI</span>
          <span className={`text-2xl font-black ${(summary.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {(summary.roi || 0) >= 0 ? '+' : ''}{summary.roi || 0}%
          </span>
        </div>
      </div>

      {(summary.speculative || summary.borderline) && (
        <div className='grid grid-cols-2 gap-3'>
          {summary.speculative && summary.speculative.total > 0 && (
            <div className='bg-[#0f1720]/80 border border-amber-500/10 rounded-xl p-4'>
              <h3 className='text-sm font-bold text-amber-400 mb-2'>SPECULATIVE</h3>
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs'>
                <div><span className='text-zinc-500 block'>N</span><span className='text-white font-bold'>{summary.speculative.total}</span></div>
                <div><span className='text-zinc-500 block'>Wins</span><span className='text-green-400 font-bold'>{summary.speculative.wins}</span></div>
                <div><span className='text-zinc-500 block'>WR</span><span className='text-blue-400 font-bold'>{summary.speculative.winRate}%</span></div>
                <div><span className='text-zinc-500 block'>P&L</span><span className={`font-bold ${summary.speculative.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{summary.speculative.pnl >= 0 ? '+' : ''}{summary.speculative.pnl}</span></div>
              </div>
            </div>
          )}
          {summary.borderline && summary.borderline.total > 0 && (
            <div className='bg-[#0f1720]/80 border border-zinc-500/10 rounded-xl p-4'>
              <h3 className='text-sm font-bold text-zinc-400 mb-2'>BORDERLINE</h3>
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs'>
                <div><span className='text-zinc-500 block'>N</span><span className='text-white font-bold'>{summary.borderline.total}</span></div>
                <div><span className='text-zinc-500 block'>Wins</span><span className='text-green-400 font-bold'>{summary.borderline.wins}</span></div>
                <div><span className='text-zinc-500 block'>WR</span><span className='text-blue-400 font-bold'>{summary.borderline.winRate}%</span></div>
                <div><span className='text-zinc-500 block'>P&L</span><span className={`font-bold ${summary.borderline.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{summary.borderline.pnl >= 0 ? '+' : ''}{summary.borderline.pnl}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <div className='bg-[#0f1720]/80 border border-amber-500/10 rounded-2xl p-4'>
          <h3 className='text-sm font-bold text-amber-400 mb-3'>Pending ({pending.length})</h3>
          <div className='space-y-1'>
            {pending.slice(0, 10).map((r: any) => (
              <div key={r.id} className='flex items-center gap-2 flex-wrap text-xs py-1 border-b border-white/5'>
                <a href={slHorseUrl(r.horse_name, r.horse_id)} target='_blank' rel='noopener noreferrer' className='text-white font-medium hover:text-amber-400 underline underline-offset-2 decoration-white/20 hover:decoration-amber-400/50 transition-colors'>{r.horse_name}</a>
                <span className='text-zinc-400'>{r.course}</span>
                <span className='text-zinc-500 sm-date'>{r.race_date}</span>
                <span className='text-zinc-300'>{r.market_odds}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.bet_quality === 'SPECULATIVE' ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-500/15 text-zinc-400'}`}>{r.bet_quality}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {settled.length > 0 && (
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-4'>
          <h3 className='text-sm font-bold text-zinc-300 mb-3'>Settled ({settled.length})</h3>
          <div className='overflow-x-auto'>
            <table className='w-full text-xs settled-table'>
              <thead>
                <tr className='text-zinc-500 border-b border-white/5'>
                  <th className='text-left py-2 pr-2'>Horse</th>
                  <th className='text-left py-2 pr-2'>Course</th>
                  <th className='text-left py-2 pr-2 col-hide-mobile'>Date</th>
                  <th className='text-right py-2 pr-2'>Odds</th>
                  <th className='text-right py-2 pr-2 col-hide-mobile'>WP%</th>
                  <th className='text-center py-2 pr-2'>Type</th>
                  <th className='text-right py-2 pr-2 col-hide-mobile'>Pos</th>
                  <th className='text-right py-2'>P&L</th>
                </tr>
              </thead>
              <tbody>
                {settled.map((r: any) => (
                  <tr key={r.id} className='border-b border-white/5'>
                    <td className='py-1.5 pr-2'><a href={slHorseUrl(r.horse_name, r.horse_id)} target='_blank' rel='noopener noreferrer' className='text-white font-medium hover:text-amber-400 underline underline-offset-2 decoration-white/20 hover:decoration-amber-400/50 transition-colors'>{r.horse_name}</a></td>
                    <td className='py-1.5 pr-2 text-zinc-400'>{r.course}</td>
                    <td className='py-1.5 pr-2 text-zinc-500 col-hide-mobile'>{r.race_date}</td>
                    <td className='py-1.5 pr-2 text-right text-zinc-300'>{r.market_odds}</td>
                    <td className='py-1.5 pr-2 text-right text-zinc-300 col-hide-mobile'>{r.model_wp ? (r.model_wp).toFixed(1) : '-'}</td>
                    <td className='py-1.5 pr-2 text-center'>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.bet_quality === 'SPECULATIVE' ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-500/15 text-zinc-400'}`}>{r.bet_quality}</span>
                    </td>
                    <td className={`py-1.5 pr-2 text-right font-bold col-hide-mobile ${r.finishing_position === 1 ? 'text-green-400' : r.finishing_position <= 3 ? 'text-blue-400' : 'text-zinc-400'}`}>
                      {r.finishing_position === 1 ? '1st' : r.finishing_position === 2 ? '2nd' : r.finishing_position === 3 ? '3rd' : `${r.finishing_position}th`}
                    </td>
                    <td className={`py-1.5 text-right font-bold ${r.virtual_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {r.virtual_pnl >= 0 ? '+' : ''}{r.virtual_pnl}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function BacktestTab() {
  const [labels, setLabels] = useState<any[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [summary, setSummary] = useState<any>(null)
  const [fromDate, setFromDate] = useState('2026-05-21')
  const [toDate, setToDate] = useState('2026-06-23')
  const [paGate, setPaGate] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')

  const fetchLabels = () => {
    fetch(apiUrl('/api/backtest/labels')).then(r => r.json()).then(setLabels).catch(() => {})
  }

  useEffect(() => { fetchLabels() }, [])

  useEffect(() => {
    if (!selected) { setSummary(null); return }
    fetch(apiUrl(`/api/backtest/summary/${selected}`)).then(r => r.json()).then(setSummary).catch(() => {})
  }, [selected])

  const runBacktest = () => {
    setRunning(true)
    setProgress('Starting backtest...')
    const params = new URLSearchParams({ from: fromDate, to: toDate, 'pa-gate': paGate.toString() })
    const sseBase = (typeof import.meta !== 'undefined' && import.meta.env?.PROD) ? apiUrl('') : 'http://localhost:3000'
    const evtSource = new EventSource(`${sseBase}/api/backtest/stream?${params}`)
    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'progress') {
        setProgress(data.message)
      } else if (data.type === 'done') {
        setProgress(data.code === 0 ? `Complete! ${data.stored || 0} predictions stored for "${data.label}"` : `Failed with exit code ${data.code}`)
        if (data.stored > 0) {
          setSelected(data.label)
          fetchLabels()
        }
        setRunning(false)
        evtSource.close()
      } else if (data.type === 'error') {
        setProgress(`Error: ${data.message}`)
      }
    }
    evtSource.onerror = () => {
      setProgress('Connection lost')
      setRunning(false)
      evtSource.close()
    }
  }

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-xl font-bold text-amber-400'>Point-in-Time Backtest</h2>
        <p className='text-zinc-500 text-sm'>Run engine against historical data with zero lookahead bias. Results stored in SQLite.</p>
      </div>

      {/* Run Form */}
      <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-4'>
        <div className='flex flex-wrap items-end gap-4'>
          <div>
            <label className='text-[10px] text-zinc-500 uppercase tracking-wider block mb-1'>From</label>
            <input type='date' value={fromDate} onChange={e => setFromDate(e.target.value)} className='bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-300' />
          </div>
          <div>
            <label className='text-[10px] text-zinc-500 uppercase tracking-wider block mb-1'>To</label>
            <input type='date' value={toDate} onChange={e => setToDate(e.target.value)} className='bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-300' />
          </div>
          <div className='flex items-center gap-2'>
            <input type='checkbox' checked={paGate} onChange={e => setPaGate(e.target.checked)} className='rounded' />
            <label className='text-xs text-zinc-400'>PA Gate</label>
          </div>
          <button onClick={runBacktest} disabled={running} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${running ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'}`}>
            {running ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
        {progress && <p className='text-xs text-zinc-500 mt-2'>{progress}</p>}
      </div>

      {/* Previous Runs */}
      {labels.length > 0 && (
        <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-4'>
          <h3 className='text-sm font-bold text-zinc-300 mb-3'>Stored Runs ({labels.length})</h3>
          <div className='space-y-1'>
            {labels.map((l: any) => (
              <div key={l.label} onClick={() => setSelected(l.label)} className={`flex items-center justify-between text-xs py-2 px-3 rounded-lg cursor-pointer transition ${selected === l.label ? 'bg-amber-500/10 border border-amber-500/20' : 'hover:bg-white/[0.02] border border-transparent'}`}>
                <div className='flex items-center gap-3'>
                  <span className='text-white font-medium'>{l.label}</span>
                  <span className='text-zinc-500'>{l.fromDate} → {l.toDate}</span>
                </div>
                <div className='flex items-center gap-4 text-zinc-400'>
                  <span>{l.total} bets</span>
                  <span className='text-green-400'>{l.wins}W</span>
                  <span className={Number(l.roi) >= 0 ? 'text-green-400' : 'text-red-400'}>{l.roi}% ROI</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <>
          <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
            <StatCard label='Total Bets' value={summary.overall.total?.toString() || '0'} subtitle={`${summary.overall.wr}% WR`} />
            <StatCard label='Winners' value={summary.overall.wins?.toString() || '0'} subtitle={`${summary.overall.placed} placed`} color='#34d399' />
            <StatCard label='Overall ROI' value={`${summary.overall.roi}%`} color={Number(summary.overall.roi) >= 0 ? '#34d399' : '#f87171'} />
            <StatCard label='Value Picks' value={summary.value.total?.toString() || '0'} subtitle={`${summary.value.wr}% WR • ${summary.value.roi}% ROI`} />
          </div>

          {/* PA Band Breakdown */}
          <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-4'>
            <h3 className='text-sm font-bold text-zinc-300 mb-3'>Performance by PA Band</h3>
            <div className='grid grid-cols-2 lg:grid-cols-4 gap-3'>
              {summary.byPa?.map((b: any) => (
                <div key={b.band} className='bg-white/[0.02] rounded-lg p-3 border border-white/5'>
                  <div className='text-[10px] text-zinc-500 uppercase tracking-wider mb-1'>{b.band}</div>
                  <div className='text-lg font-bold text-white'>{b.total}</div>
                  <div className='text-xs text-zinc-400'>{b.wins}W • {b.wr}% WR</div>
                  <div className={`text-xs font-bold ${Number(b.roi) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{b.roi}% ROI</div>
                </div>
              ))}
            </div>
          </div>

          {/* Odds Band Breakdown */}
          <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-4'>
            <h3 className='text-sm font-bold text-zinc-300 mb-3'>Performance by Odds Band</h3>
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3'>
              {summary.byOdds?.map((b: any) => (
                <div key={b.band} className='bg-white/[0.02] rounded-lg p-3 border border-white/5'>
                  <div className='text-[10px] text-zinc-500 uppercase tracking-wider mb-1'>{b.band}</div>
                  <div className='text-lg font-bold text-white'>{b.total}</div>
                  <div className='text-xs text-zinc-400'>{b.wins}W • {b.wr}% WR</div>
                  <div className={`text-xs font-bold ${Number(b.roi) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{b.roi}% ROI</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function Proof() {
  const [stats, setStats] = useState<any>(null)
  const [paGate, setPaGate] = useState<any>(null)
  const [counterfactual, setCounterfactual] = useState<any>(null)
  const [paByPosition, setPaByPosition] = useState<any>(null)
  const [tab, setTab] = useState<'overview' | 'calibration' | 'history' | 'sandbox' | 'backtest'>('overview')

  useEffect(() => {
    const fetchData = () => {
      fetch(apiUrl('/api/learning-stats')).then(r => r.json()).then(setStats).catch(() => {})
      fetch(apiUrl('/api/pa-gate-monitor')).then(r => r.json()).then(setPaGate).catch(() => {})
      fetch(apiUrl('/api/counterfactual-log')).then(r => r.json()).then(setCounterfactual).catch(() => {})
      fetch(apiUrl('/api/pa-by-position')).then(r => r.json()).then(setPaByPosition).catch(() => {})
    }
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])


  return (
    <div className='p-6 max-w-6xl mx-auto space-y-6'>
      <div>
        <h1 className='text-4xl font-black tracking-tight'>Evidence</h1>
        <p className='text-zinc-400 mt-2'>Real prediction data, accuracy metrics, and explainable race analysis.</p>
      </div>

      <div className='flex gap-2 flex-wrap'>
        {(['overview', 'calibration', 'history', 'sandbox', 'backtest'] as const).map(t => (
          <button
            key={t}
            type='button'
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === t ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'text-zinc-400 hover:text-white border border-transparent'}`}
          >
            {t === 'overview' ? 'Overview' : t === 'calibration' ? 'Calibration' : t === 'sandbox' ? 'Sandbox' : t === 'backtest' ? 'Backtest' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
            <StatCard label='System Selections' value={paGate?.gate?.engineSelected?.count?.toLocaleString() || '0'} subtitle={`PA > 0 • ${paGate?.dataset?.paCoverage || 0}% PA coverage`} />
            <StatCard label='Winners' value={paGate?.gate?.engineSelected?.wins?.toLocaleString() || '0'} subtitle={`${paGate?.gate?.engineSelected?.wr || 0}% strike rate`} color='#34d399' />
            <StatCard label='System ROI' value={`${paGate?.gate?.engineSelected?.roi?.toFixed(1) || '0'}%`} color={paGate?.gate?.engineSelected?.roi > 0 ? '#34d399' : '#f87171'} />
            <StatCard label='PA Killed' value={paGate?.gate?.paKilled?.count?.toLocaleString() || '0'} subtitle={`${paGate?.gate?.paKilled?.wr || 0}% WR (saved capital)`} color='#f87171' />
          </div>

            <div className='bg-[#0f1720]/80 border border-green-500/10 rounded-2xl p-6'>
            <h2 className='text-lg font-bold mb-1'>PA Gate Monitor</h2>
            <p className='text-zinc-500 text-sm mb-4'>Honest evaluation. Every section declares what subset it measures.</p>
            {paGate ? (
              <>
              {/* ── Dataset Summary ── */}
              {paGate.dataset && (
                <div className='mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400'>
                  <div>Results: <span className='text-white font-semibold'>{paGate.dataset.totalWithResults}</span></div>
                  <div className='text-zinc-600'>•</div>
                  <div>With PA data: <span className='text-white font-semibold'>{paGate.dataset.withPA}</span> ({paGate.dataset.paCoverage}% of results)</div>
                  <div className='text-zinc-600'>•</div>
                  <div>PA &gt; 0: <span className='text-green-400 font-semibold'>{paGate.dataset.withPAPositive}</span></div>
                  <div className='text-zinc-600'>•</div>
                  <div>PA null: <span className='text-zinc-400 font-semibold'>{paGate.dataset.withPANull}</span></div>
                  <div className='text-zinc-600'>|</div>
                  <div className='text-zinc-500 font-medium'>{paGate.dataset.dateRange?.[0]} to {paGate.dataset.dateRange?.[1]}</div>
                  <div className='text-zinc-600'>|</div>
                  <div className='text-zinc-500'>Odds: {paGate.dataset.oddsSource}</div>
                </div>
              )}

              {/* ── Gate Classification ── */}
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                <div className='bg-green-500/5 rounded-xl p-4 border border-green-500/10'>
                  <span className='text-green-400 text-xs font-medium uppercase tracking-wider'>Engine Selected</span>
                  <p className='text-zinc-600 text-[10px] mt-0.5'>PA &gt; 0 AND betQuality != NO BET</p>
                  <div className='mt-2 space-y-1'>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>Bets</span><span className='font-bold'>{paGate.gate.engineSelected.count}</span></div>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>Wins</span><span className='font-bold text-green-400'>{paGate.gate.engineSelected.wins}</span></div>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>WR</span><span className='font-bold'>{paGate.gate.engineSelected.wr}%</span></div>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>ROI</span><span className={`font-bold ${paGate.gate.engineSelected.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{paGate.gate.engineSelected.roi >= 0 ? '+' : ''}{paGate.gate.engineSelected.roi}%</span></div>
                  </div>
                </div>
                <div className='bg-red-500/5 rounded-xl p-4 border border-red-500/10'>
                  <span className='text-red-400 text-xs font-medium uppercase tracking-wider'>PA Killed</span>
                  <p className='text-zinc-600 text-[10px] mt-0.5'>PA &le; 0 (regardless of betQuality)</p>
                  <div className='mt-2 space-y-1'>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>Bets</span><span className='font-bold'>{paGate.gate.paKilled.count}</span></div>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>Wins</span><span className='font-bold text-green-400'>{paGate.gate.paKilled.wins}</span></div>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>WR</span><span className='font-bold'>{paGate.gate.paKilled.wr}%</span></div>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>ROI</span><span className={`font-bold ${paGate.gate.paKilled.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{paGate.gate.paKilled.roi >= 0 ? '+' : ''}{paGate.gate.paKilled.roi}%</span></div>
                  </div>
                </div>
                <div className='bg-zinc-500/5 rounded-xl p-4 border border-zinc-500/10'>
                  <span className='text-zinc-400 text-xs font-medium uppercase tracking-wider'>No PA Data</span>
                  <p className='text-zinc-600 text-[10px] mt-0.5'>PA = null (horse unknown to PA system)</p>
                  <div className='mt-2 space-y-1'>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>Bets</span><span className='font-bold'>{paGate.gate.noPAData.count}</span></div>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>Wins</span><span className='font-bold text-green-400'>{paGate.gate.noPAData.wins}</span></div>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>WR</span><span className='font-bold'>{paGate.gate.noPAData.wr}%</span></div>
                    <div className='flex justify-between'><span className='text-zinc-400 text-sm'>ROI</span><span className={`font-bold ${paGate.gate.noPAData.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{paGate.gate.noPAData.roi >= 0 ? '+' : ''}{paGate.gate.noPAData.roi}%</span></div>
                  </div>
                </div>
              </div>
              <div className='mt-3 flex gap-4 text-xs text-zinc-600'>
                <span>3-day: Selected = {paGate.gate.engineSelectedThreeDay.count} ({paGate.gate.engineSelectedThreeDay.wr}% WR)</span>
                <span>Killed = {paGate.gate.paKilledThreeDay.count} ({paGate.gate.paKilledThreeDay.wr}% WR)</span>
                <span>No PA = {paGate.gate.noPADataThreeDay.count} ({paGate.gate.noPADataThreeDay.wr}% WR)</span>
              </div>
              </>
            ) : (
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                {['Engine Selected', 'PA Killed', 'No PA Data'].map(label => (
                  <div key={label} className='bg-white/[0.02] rounded-xl p-4 border border-white/5 animate-pulse'>
                    <span className='text-zinc-600 text-xs font-medium uppercase tracking-wider'>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Contender Monitor ── */}
            {paGate?.contender && (
              <div className='mt-6 border-t border-green-500/10 pt-6'>
                <h3 className='text-md font-bold mb-1'>Contender Monitor</h3>
                <p className='text-zinc-500 text-xs mb-4'>Predictions with PA data only ({paGate.dataset?.paCoverage ?? '?'}% of total). pa=null excluded. Does NOT represent full population.</p>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='bg-green-500/5 rounded-xl p-4 border border-green-500/10'>
                    <span className='text-green-400 text-xs font-medium uppercase tracking-wider'>PA &gt; 0 (n={paGate.contender.paPositive.count})</span>
                    <div className='mt-2 space-y-1'>
                      <div className='flex justify-between'><span className='text-zinc-400 text-sm'>Wins</span><span className='font-bold text-green-400'>{paGate.contender.paPositive.wins}</span></div>
                      <div className='flex justify-between'><span className='text-zinc-400 text-sm'>WR</span><span className='font-bold'>{paGate.contender.paPositive.wr}%</span></div>
                    </div>
                  </div>
                  <div className='bg-red-500/5 rounded-xl p-4 border border-red-500/10'>
                    <span className='text-red-400 text-xs font-medium uppercase tracking-wider'>PA &le; 0 (n={paGate.contender.paNonPositive.count})</span>
                    <div className='mt-2 space-y-1'>
                      <div className='flex justify-between'><span className='text-zinc-400 text-sm'>Wins</span><span className='font-bold text-green-400'>{paGate.contender.paNonPositive.wins}</span></div>
                      <div className='flex justify-between'><span className='text-zinc-400 text-sm'>WR</span><span className='font-bold'>{paGate.contender.paNonPositive.wr}%</span></div>
                    </div>
                  </div>
                </div>
                {paGate?.contenderThreeDay && (
                  <div className='mt-3 flex gap-4 text-xs text-zinc-600'>
                    <span>3-day: PA &gt; 0 = {paGate.contenderThreeDay.paPositive.count} ({paGate.contenderThreeDay.paPositive.wr}%)</span>
                    <span>PA &le; 0 = {paGate.contenderThreeDay.paNonPositive.count} ({paGate.contenderThreeDay.paNonPositive.wr}%)</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Bettable Monitor ── */}
            {paGate?.bettable && (
              <div className='mt-6 border-t border-green-500/10 pt-6'>
                <h3 className='text-md font-bold mb-1'>Bettable Monitor</h3>
                <p className='text-zinc-500 text-xs mb-4'>isBettable() predictions (wp&ge;6%, odds&ge;2, positive edge, not NO BET/WEAK_COMPAT) split by PA sign. Same filter used for PA Band Performance.</p>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='bg-green-500/5 rounded-xl p-4 border border-green-500/10'>
                    <span className='text-green-400 text-xs font-medium uppercase tracking-wider'>Bettable: PA+ (n={paGate.bettable.passed.count})</span>
                    <div className='mt-2 space-y-1'>
                      <div className='flex justify-between'><span className='text-zinc-400 text-sm'>Wins</span><span className='font-bold text-green-400'>{paGate.bettable.passed.wins}</span></div>
                      <div className='flex justify-between'><span className='text-zinc-400 text-sm'>WR</span><span className='font-bold'>{paGate.bettable.passed.wr}%</span></div>
                      <div className='flex justify-between'><span className='text-zinc-400 text-sm'>ROI</span><span className={`font-bold ${paGate.bettable.passed.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{paGate.bettable.passed.roi >= 0 ? '+' : ''}{paGate.bettable.passed.roi}%</span></div>
                    </div>
                  </div>
                  <div className='bg-red-500/5 rounded-xl p-4 border border-red-500/10'>
                    <span className='text-red-400 text-xs font-medium uppercase tracking-wider'>Bettable: PA- (n={paGate.bettable.rejected.count})</span>
                    <div className='mt-2 space-y-1'>
                      <div className='flex justify-between'><span className='text-zinc-400 text-sm'>Wins</span><span className='font-bold text-green-400'>{paGate.bettable.rejected.wins}</span></div>
                      <div className='flex justify-between'><span className='text-zinc-400 text-sm'>WR</span><span className='font-bold'>{paGate.bettable.rejected.wr}%</span></div>
                      <div className='flex justify-between'><span className='text-zinc-400 text-sm'>ROI</span><span className={`font-bold ${paGate.bettable.rejected.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{paGate.bettable.rejected.roi >= 0 ? '+' : ''}{paGate.bettable.rejected.roi}%</span></div>
                    </div>
                  </div>
                </div>
                {paGate?.bettableThreeDay && (
                  <div className='mt-3 flex gap-4 text-xs text-zinc-600'>
                    <span>3-day: PA+ = {paGate.bettableThreeDay.passed.count} ({paGate.bettableThreeDay.passed.wr}% WR, {paGate.bettableThreeDay.passed.roi >= 0 ? '+' : ''}{paGate.bettableThreeDay.passed.roi}% ROI)</span>
                    <span>PA- = {paGate.bettableThreeDay.rejected.count} ({paGate.bettableThreeDay.rejected.wr}% WR, {paGate.bettableThreeDay.rejected.roi >= 0 ? '+' : ''}{paGate.bettableThreeDay.rejected.roi}% ROI)</span>
                  </div>
                )}
              </div>
            )}

            {/* ── PA Band Performance (All-Time) ── */}
            {paGate?.paBandPerformance?.allTime && (
              <div className='mt-6 border-t border-green-500/10 pt-6'>
                <h3 className='text-md font-bold mb-1'>PA Band Performance (All-Time)</h3>
                <p className='text-zinc-500 text-xs mb-4'>isBettable() predictions with PA &gt; 0, grouped by PA strength. ROI = (returns - stakes) / stakes. Odds = pre-race decimal. <span className='text-zinc-600'>{'\u{1F7E2}'} n&ge;100 reliable | {'\u{1F7E1}'} n&ge;30 moderate | {'\u{1F534}'} n&lt;30 insufficient</span></p>
                <div className='overflow-x-auto'>
                  <table className='w-full text-sm pa-band-table'>
                    <thead>
                      <tr className='text-zinc-500 text-xs uppercase tracking-wider border-b border-zinc-700/50'>
                        <th className='text-left py-2 pr-4'>PA Band</th>
                        <th className='text-right py-2 pr-4'>Bets</th>
                        <th className='text-right py-2 pr-4'>Wins</th>
                        <th className='text-right py-2 pr-4'>WR</th>
                        <th className='text-right py-2 pr-4'>ROI</th>
                        <th className='text-right py-2 pr-4 col-hide-mobile'>Avg Odds</th>
                        <th className='text-right py-2 pr-4 col-hide-mobile'>Avg Edge</th>
                        <th className='text-right py-2 pr-2'>Sample</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paGate.paBandPerformance.allTime.map((b: any) => {
                        const sampleIcon = b.sampleConfidence === 'high' ? '\u{1F7E2}' : b.sampleConfidence === 'moderate' ? '\u{1F7E1}' : '\u{1F534}'
                        const rowOpacity = b.reliable ? '' : 'opacity-40'
                        return (
                          <tr key={b.band} className={`border-b border-zinc-800/50 ${rowOpacity}`}>
                            <td className='py-2 pr-4 font-medium'>{b.band}</td>
                            <td className='text-right py-2 pr-4 text-zinc-400'>{b.count}</td>
                            <td className='text-right py-2 pr-4 text-green-400'>{b.wins}</td>
                            <td className='text-right py-2 pr-4 font-bold text-zinc-400'>
                              {b.reliable ? <span className='text-zinc-200'>{b.wr}%</span> : <span title={`\u00B1${b.ci95}pp 95% CI`}>{b.wr}%</span>}
                            </td>
                            <td className='text-right py-2 pr-4 font-mono text-zinc-400'>
                              {b.reliable ? (
                                <span className={b.roi >= 0 ? 'text-green-400' : 'text-red-400'}>{b.roi >= 0 ? '+' : ''}{b.roi}%</span>
                              ) : (
                                <span title="Insufficient sample">{b.roi >= 0 ? '+' : ''}{b.roi}%</span>
                              )}
                            </td>
                            <td className='text-right py-2 pr-4 text-zinc-400 col-hide-mobile'>{b.avgOdds}</td>
                            <td className='text-right py-2 pr-4 text-zinc-400 col-hide-mobile'>{b.avgEdge}%</td>
                            <td className='text-right py-2 pr-2'>{sampleIcon} {b.count}{b.reliable ? '' : ` (\u00B1${b.ci95}pp)`}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── PA Band Performance (Last 3 Days) ── */}
            {paGate?.paBandPerformance?.threeDay && (
              <div className='mt-6 border-t border-green-500/10 pt-6'>
                <h3 className='text-md font-bold mb-1'>Last 3 Days</h3>
                <p className='text-zinc-500 text-xs mb-4'>Short-window drift detector. Do not make model decisions from this table. Same filter as All-Time above. n&lt;30 bands are unreliable.</p>
                {paGate.paBandPerformance.threeDay.every((b: any) => b.count === 0) ? (
                  <p className='text-zinc-500 text-sm py-4'>No completed bettable races in the last 3 days.</p>
                ) : (
                <div className='overflow-x-auto'>
                  <table className='w-full text-sm pa-band-table'>
                    <thead>
                      <tr className='text-zinc-500 text-xs uppercase tracking-wider border-b border-zinc-700/50'>
                        <th className='text-left py-2 pr-4'>PA Band</th>
                        <th className='text-right py-2 pr-4'>Bets</th>
                        <th className='text-right py-2 pr-4'>Wins</th>
                        <th className='text-right py-2 pr-4'>WR</th>
                        <th className='text-right py-2 pr-4'>ROI</th>
                        <th className='text-right py-2 pr-4 col-hide-mobile'>Avg Odds</th>
                        <th className='text-right py-2 pr-4 col-hide-mobile'>Avg Edge</th>
                        <th className='text-right py-2 pr-2'>Sample</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paGate.paBandPerformance.threeDay.map((b: any) => {
                        const sampleIcon = b.sampleConfidence === 'high' ? '\u{1F7E2}' : b.sampleConfidence === 'moderate' ? '\u{1F7E1}' : '\u{1F534}'
                        const rowOpacity = b.reliable ? '' : 'opacity-40'
                        return (
                          <tr key={b.band} className={`border-b border-zinc-800/50 ${rowOpacity}`}>
                            <td className='py-2 pr-4 font-medium'>{b.band}</td>
                            <td className='text-right py-2 pr-4 text-zinc-400'>{b.count}</td>
                            <td className='text-right py-2 pr-4 text-green-400'>{b.wins}</td>
                            <td className='text-right py-2 pr-4 font-bold text-zinc-400'>
                              {b.reliable ? <span className='text-zinc-200'>{b.wr}%</span> : <span title={`\u00B1${b.ci95}pp 95% CI`}>{b.wr}%</span>}
                            </td>
                            <td className='text-right py-2 pr-4 font-mono text-zinc-400'>
                              {b.reliable ? (
                                <span className={b.roi >= 0 ? 'text-green-400' : 'text-red-400'}>{b.roi >= 0 ? '+' : ''}{b.roi}%</span>
                              ) : (
                                <span title="Insufficient sample">{b.roi >= 0 ? '+' : ''}{b.roi}%</span>
                              )}
                            </td>
                            <td className='text-right py-2 pr-4 text-zinc-400 col-hide-mobile'>{b.avgOdds}</td>
                            <td className='text-right py-2 pr-4 text-zinc-400 col-hide-mobile'>{b.avgEdge}%</td>
                            <td className='text-right py-2 pr-2'>{sampleIcon} {b.count}{b.reliable ? '' : ` (\u00B1${b.ci95}pp)`}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            )}

            {/* ── Calibration by PA Band ── */}
            {paGate?.calibration && (
              <div className='mt-6 border-t border-green-500/10 pt-6'>
                <h3 className='text-md font-bold mb-1'>Calibration by PA Band</h3>
                <p className='text-zinc-500 text-xs mb-4'>All predictions with valid PA and wp&gt;0. "Avg Pred" is the model's assigned win probability (normalized per-race). "Actual WR" is what actually happened.</p>
                <div className='mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 text-xs text-amber-400/80'>
                  <b>Why the error is large:</b> PA enters <code>finalScore</code> as one of ~12 additive terms, then gets diluted through 5 normalization layers in the Bayesian model (score → proportion → 45% blend → renormalize ×5). The predicted probability is RELATIVE (within-race), not ABSOLUTE. A large positive error means PA-boosted horses systematically outperform their model-assigned probabilities relative to their race-mates. The model correctly ranks PA+ horses higher, but underestimates their absolute win probability.
                </div>
                <div className='overflow-x-auto'>
                  <table className='w-full text-sm'>
                    <thead>
                      <tr className='text-zinc-500 text-xs uppercase tracking-wider border-b border-zinc-700/50'>
                        <th className='text-left py-2 pr-4'>PA Band</th>
                        <th className='text-right py-2 pr-4'>n</th>
                        <th className='text-right py-2 pr-4'>Avg Pred</th>
                        <th className='text-right py-2 pr-4'>Actual WR</th>
                        <th className='text-right py-2 pr-4'>Error</th>
                        <th className='text-right py-2 pr-2'>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paGate.calibration.map((b: any) => {
                        const errAbs = Math.abs(b.error)
                        const icon = errAbs <= 3 ? '\u{1F7E2}' : errAbs <= 7 ? '\u{1F7E1}' : '\u{1F534}'
                        return (
                          <tr key={b.band} className='border-b border-zinc-800/50'>
                            <td className='py-2 pr-4 font-medium'>{b.band}</td>
                            <td className='text-right py-2 pr-4 text-zinc-400'>{b.count}</td>
                            <td className='text-right py-2 pr-4'>{b.avgPred}%</td>
                            <td className='text-right py-2 pr-4'>{b.actualWR}%</td>
                            <td className={`text-right py-2 pr-4 font-mono ${b.error > 0 ? 'text-green-400' : 'text-red-400'}`}>{b.error > 0 ? '+' : ''}{b.error}pp</td>
                            <td className='text-right py-2 pr-2 text-lg'>{icon}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className='bg-[#0f1720]/80 border border-amber-500/10 rounded-2xl p-6'>
            <h2 className='text-lg font-bold mb-4'>Counterfactual Activation Zone Logger</h2>
            <p className='text-zinc-500 text-sm mb-4'>PA activation zone experiment — tracks horses with PA +0.05 to +0.5 split at +0.3 threshold.</p>
            {counterfactual ? (
              (() => {
                const below = counterfactual.zones?.['below_0.3']
                const above = counterfactual.zones?.['above_0.3']
                const totalObs = (below?.total ?? 0) + (above?.total ?? 0)
                if (totalObs < 100) {
                  return <p className='text-zinc-500 text-sm py-4'>Collecting data... {totalObs}/100 observations. Results are not statistically reliable below 100.</p>
                }
                const bins = counterfactual.paBinBreakdown ?? {}
                return (
              <div className='space-y-4'>
                <div className='grid grid-cols-1 sm:grid-cols-4 gap-4'>
                  <div className='sm:col-span-2 bg-[#0f1720]/80 rounded-xl p-4 border border-amber-500/10'>
                    <span className='text-amber-400 text-xs font-medium uppercase tracking-wider'>Below +0.3 (suspected inert)</span>
                    <div className='mt-2 grid grid-cols-2 gap-y-1 text-sm'>
                      <span className='text-zinc-400'>Total</span><span className='font-bold'>{below?.total ?? 0}</span>
                      <span className='text-zinc-400'>Wins</span><span className='font-bold text-green-400'>{below?.won ?? 0}</span>
                      <span className='text-zinc-400'>Placed</span><span className='font-bold'>{below?.placed ?? 0}</span>
                      <span className='text-zinc-400'>WR</span><span className='font-bold'>{below?.winRate ?? 0}%</span>
                    </div>
                  </div>
                  <div className='col-span-2 bg-[#0f1720]/80 rounded-xl p-4 border border-amber-500/10'>
                    <span className='text-amber-400 text-xs font-medium uppercase tracking-wider'>Above +0.3 (suspected active)</span>
                    <div className='mt-2 grid grid-cols-2 gap-y-1 text-sm'>
                      <span className='text-zinc-400'>Total</span><span className='font-bold'>{above?.total ?? 0}</span>
                      <span className='text-zinc-400'>Wins</span><span className='font-bold text-green-400'>{above?.won ?? 0}</span>
                      <span className='text-zinc-400'>Placed</span><span className='font-bold'>{above?.placed ?? 0}</span>
                      <span className='text-zinc-400'>WR</span><span className='font-bold'>{above?.winRate ?? 0}%</span>
                    </div>
                  </div>
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  {Object.entries(bins).map(([bin, data]: [string, any]) => (
                    <div key={bin} className='bg-white/[0.03] rounded-xl p-3 border border-white/5'>
                      <span className='text-zinc-500 text-xs font-medium uppercase tracking-wider'>{bin}</span>
                      <div className='mt-1 grid grid-cols-2 gap-y-1 text-xs'>
                        <span className='text-zinc-500'>Total</span><span className='font-bold text-right'>{data.total}</span>
                        <span className='text-zinc-500'>Won</span><span className='font-bold text-right text-green-400'>{data.won}</span>
                        <span className='text-zinc-500'>WR</span><span className='font-bold text-right'>{data.winRate}%</span>
                        <span className='text-zinc-500'>Placed</span><span className='font-bold text-right'>{data.placedRate}%</span>
                        {data.avgWinOdds && <><span className='text-zinc-500'>Avg Odds</span><span className='font-bold text-right'>{data.avgWinOdds}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className='text-xs text-zinc-500'>Total observations: {counterfactual.total} | Resolved: {counterfactual.resolved} | Pending: {counterfactual.pending} | Needs ~200+ resolved per cohort for meaningful signal</div>
              </div>
                )
              })()
            ) : (
              <div className='grid grid-cols-1 sm:grid-cols-4 gap-4'>
                {['Below +0.3', 'Above +0.3'].map(label => (
                  <div key={label} className='bg-white/[0.02] rounded-xl p-4 border border-white/5 animate-pulse sm:col-span-2'>
                    <span className='text-zinc-600 text-xs font-medium uppercase tracking-wider'>{label}</span>
                    <div className='mt-2 space-y-2'>
                      <div className='flex justify-between'><span className='text-zinc-700 text-sm'>Total</span><span className='bg-zinc-700/50 rounded h-4 w-8' /></div>
                      <div className='flex justify-between'><span className='text-zinc-700 text-sm'>Wins</span><span className='bg-zinc-700/50 rounded h-4 w-8' /></div>
                      <div className='flex justify-between'><span className='text-zinc-700 text-sm'>WR</span><span className='bg-zinc-700/50 rounded h-4 w-10' /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {paByPosition && (
          <div className='bg-[#0f1720]/80 border border-sky-500/10 rounded-2xl p-6'>
            <h2 className='text-lg font-bold mb-4'>PA by Finish Position</h2>
            <p className='text-zinc-500 text-sm mb-4'>PA distribution among selections that passed the score gate, grouped by finish position. {paByPosition.totalSelections} selections.</p>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6'>
              {['winner','placed','top4','unplaced'].map(key => {
                const b = paByPosition.buckets?.[key]
                if (!b) return null
                const labels = { winner: 'Winner (1st)', placed: 'Placed (2nd-3rd)', top4: 'Top 4', unplaced: 'Unplaced' }
                return (
                  <div key={key} className='bg-white/[0.03] rounded-xl p-4 border border-white/5'>
                    <span className='text-sky-400 text-xs font-medium uppercase tracking-wider'>{labels[key]}</span>
                    <div className='mt-2 space-y-1 text-sm'>
                      <div className='flex justify-between'><span className='text-zinc-400'>Count</span><span className='font-bold'>{b.count}</span></div>
                      <div className='flex justify-between'><span className='text-zinc-400'>Avg PA</span><span className='font-bold'>{b.avgPA}</span></div>
                      <div className='flex justify-between'><span className='text-zinc-400'>Median PA</span><span className='font-bold'>{b.medianPA}</span></div>
                      <div className='flex justify-between'><span className='text-zinc-400'>PA {'>'} 0</span><span className='font-bold text-green-400'>{b.pctPositive}%</span></div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div>
              <span className='text-zinc-400 text-xs font-medium uppercase tracking-wider'>Avg Finish Position by PA Band</span>
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2'>
                {paByPosition.bands?.map((b: any) => (
                  <div key={b.band} className='bg-white/[0.03] rounded-xl p-3 border border-white/5'>
                    <span className='text-zinc-500 text-xs'>{b.band}</span>
                    <div className='mt-1 text-xs space-y-0.5'>
                      <div className='flex justify-between'><span className='text-zinc-500'>n</span><span className='font-bold'>{b.count}</span></div>
                      <div className='flex justify-between'><span className='text-zinc-500'>Avg Fin</span><span className='font-bold'>{b.avgFinishPos}</span></div>
                      <div className='flex justify-between'><span className='text-zinc-500'>WR</span><span className='font-bold text-green-400'>{b.winRate}%</span></div>
                      <div className='flex justify-between'><span className='text-zinc-500'>Place</span><span className='font-bold'>{b.placeRate}%</span></div>
                    </div>
                  </div>
                ))}
              </div>
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

          {stats?.lastLearningRun && (
            <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-6'>
              <h2 className='text-lg font-bold mb-2'>Latest Learning Run</h2>
              <pre className='text-xs text-zinc-400 font-mono'>{JSON.stringify(stats.lastLearningRun, null, 2)}</pre>
            </div>
          )}
        </>
      )}

      {tab === 'calibration' && <CalibrationDashboard />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'sandbox' && <SandboxTab />}
      {tab === 'backtest' && <BacktestTab />}
    </div>
  )
}
