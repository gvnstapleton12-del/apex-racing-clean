import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiUrl } from '../lib/api'

function StatBox({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
      <span className='text-zinc-500 text-xs block mb-1'>{label}</span>
      <span className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</span>
    </div>
  )
}

export default function Backtest() {
  const [csvText, setCsvText] = useState('')
  const [backtestResult, setBacktestResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)

  const { data: learningStats } = useQuery({
    queryKey: ['learning-stats'],
    queryFn: () => fetch(apiUrl('/api/learning-stats')).then(r => r.json()),
  })

  function parseCsvToRaces(csv: string) {
    const lines = csv.trim().split('\n')
    if (lines.length < 2) return []

    const firstLine = lines[0].toLowerCase()
    const isRacingPost = firstLine.includes('race_id') || firstLine.includes('raceno') || /^\d{8},/.test(firstLine)

    const races: Record<string, any> = {}

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))

      let course, offTime, date, horse, odds, position, jockey, trainer, going, distance, form

      if (isRacingPost) {
        course = values[1] || ''
        date = values[2] || ''
        offTime = values[3] || ''
        const posVal = Number(values[17] || values[18] || 0)
        horse = values[19] || values[20] || ''
        position = posVal
        trainer = values[30] || values[31] || ''
        jockey = values[31] || values[32] || ''
        going = values[12] || values[13] || ''
        distance = values[10] || values[11] || ''
        const oddsStr = values[38] || values[39] || ''
        if (oddsStr.includes('/')) {
          const [num, den] = oddsStr.split('/')
          odds = Number(num) / Number(den) + 1
        } else {
          odds = Number(oddsStr) || 0
        }
        const formParts = []
        for (let f = 21; f <= 27; f++) {
          if (values[f] && /^\d+$/.test(values[f])) formParts.push(values[f])
        }
        form = formParts.join('-')
      } else {
        const row: Record<string, string> = {}
        const header = lines[0].toLowerCase().split(',').map(h => h.trim())
        header.forEach((h, idx) => { row[h] = values[idx] || '' })
        course = row.course || row.venue || ''
        offTime = row.off_time || row.time || ''
        date = row.date || ''
        horse = row.horse || row.horse_name || row.runner || ''
        odds = Number(row.odds || row.price || row.sp || 0)
        position = Number(row.position || row.pos || row['finishing_position'] || 0)
        jockey = row.jockey || ''
        trainer = row.trainer || ''
        going = row.going || ''
        distance = row.distance || row.dist || ''
        form = row.form || ''
        i++
      }

      if (!course || !horse) continue

      const normalizedDate = normalizeDate(date)
      const raceKey = `${course}-${offTime}-${normalizedDate}`
      if (!races[raceKey]) {
        races[raceKey] = {
          course,
          off_time: offTime,
          date: normalizedDate,
          region: 'GB',
          going,
          distance_f: distance,
          runners: [],
        }
      }

      races[raceKey].runners.push({
        horse,
        odds: odds || 0,
        position: position || 0,
        jockey,
        trainer,
        draw: 0,
        form,
      })
    }

    return Object.values(races).filter((r: any) => r.runners.length >= 5)
  }

  function normalizeDate(dateStr: string): string {
    if (!dateStr) return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
    const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
    const match = dateStr.match(/(\d{1,2})-([a-zA-Z]{3})-(\d{2,4})/)
    if (match) {
      const day = match[1].padStart(2, '0')
      const month = months[match[2].toLowerCase()] || '01'
      let year = match[3]
      if (year.length === 2) year = '20' + year
      return `${year}-${month}-${day}`
    }
    return dateStr
  }

  async function handleImport() {
    const races = parseCsvToRaces(csvText)
    if (races.length === 0) return

    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/import-historical'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ races }),
      })
      const data = await res.json()
      setImportResult(data)
    } catch (e) {
      setImportResult({ error: 'Import failed' })
    } finally {
      setLoading(false)
    }
  }

  async function handleBacktest() {
    const races = parseCsvToRaces(csvText)
    if (races.length === 0) return

    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/backtest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          races,
          options: { minScore: 50, minEdge: 0, maxPicksPerRace: 3 },
        }),
      })
      const data = await res.json()
      setBacktestResult(data)
    } catch (e) {
      setBacktestResult({ error: 'Backtest failed' })
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string)
    }
    reader.readAsText(file)
  }

  const s = backtestResult?.summary

  return (
    <div className='dashboard-page max-w-7xl mx-auto'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow text-zinc-500 text-sm font-medium uppercase tracking-wider'>Backtesting</span>
          <h1 className='text-5xl font-black tracking-tight'>Would this model make money?</h1>
          <p className='text-zinc-400 text-lg mt-3'>
            Import historical UK race data (CSV) and run the APEX engine against it.
          </p>
        </div>
      </section>

      {learningStats && (
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8'>
          <StatBox label='Historical Records' value={learningStats.totalBets || 0} />
          <StatBox label='Winners' value={learningStats.winners || 0} />
          <StatBox label='System Strike Rate' value={`${learningStats.totalBets > 0 ? ((learningStats.winners / learningStats.totalBets) * 100).toFixed(1) : 0}%`} />
          <StatBox label='Historical SR' value={`${learningStats.analytics?.strikeRate || 0}%`} />
        </div>
      )}

      <div className='bg-white/[0.03] border border-white/5 rounded-2xl p-6 mb-8'>
        <h2 className='text-xl font-bold mb-4'>Import Historical Race Data</h2>
        <p className='text-zinc-400 text-sm mb-4'>
          Upload a CSV with columns: <code className='bg-white/5 px-1 rounded'>date, course, off_time, horse, odds, position, jockey, trainer, going, distance, draw, form</code>
        </p>
        <p className='text-zinc-500 text-xs mb-4'>
          Position = finishing position (1 = winner). Only UK/IRE races with 5+ runners will be backtested.
        </p>

        <div className='flex gap-4 mb-4'>
          <label className='px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium cursor-pointer hover:bg-white/10 transition'>
            Choose CSV File
            <input type='file' accept='.csv' onChange={handleFileUpload} className='hidden' />
          </label>
          <span className='text-zinc-500 text-sm self-center'>
            {csvText ? `${csvText.split('\n').length - 1} rows loaded` : 'No file selected'}
          </span>
        </div>

        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder='Or paste CSV data here...'
          className='w-full h-40 bg-black/20 border border-white/10 rounded-xl p-4 text-sm text-zinc-300 font-mono resize-none focus:outline-none focus:border-amber-500/50'
        />

        <div className='flex gap-3 mt-4'>
          <button
            onClick={handleImport}
            disabled={loading || !csvText}
            className='px-6 py-2.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-xl font-bold text-sm hover:bg-blue-500/20 transition disabled:opacity-50'
          >
            {loading ? 'Processing...' : 'Import to Database'}
          </button>
          <button
            onClick={handleBacktest}
            disabled={loading || !csvText}
            className='px-6 py-2.5 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl font-bold text-sm hover:bg-green-500/20 transition disabled:opacity-50'
          >
            {loading ? 'Running...' : 'Run Backtest'}
          </button>
        </div>

        {importResult && (
          <div className={`mt-4 p-4 rounded-xl ${importResult.error ? 'bg-red-500/10 border border-red-500/20' : 'bg-green-500/10 border border-green-500/20'}`}>
            {importResult.error ? (
              <span className='text-red-400'>{importResult.error}</span>
            ) : (
              <span className='text-green-400'>Imported {importResult.imported} races ({importResult.totalRecords} total records)</span>
            )}
          </div>
        )}
      </div>

      {s && (
        <div className='space-y-8'>
          <div className='bg-[#0f1720] border border-green-500/10 rounded-2xl p-6'>
            <h2 className='text-2xl font-bold mb-2'>
              {s.profit >= 0 ? 'Profitable' : 'Unprofitable'} System
              <span className={`ml-3 text-lg ${s.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {s.profit >= 0 ? '+' : ''}{s.profit} units
              </span>
            </h2>
            <p className='text-zinc-400'>
              {s.totalBets} bets across {s.totalRaces} races from {s.startBankroll} starting bankroll
            </p>
          </div>

          <div className='grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4'>
            <StatBox label='Total Bets' value={s.totalBets} />
            <StatBox label='Wins' value={s.totalWins} color='text-green-400' />
            <StatBox label='Places' value={s.totalPlaces} color='text-blue-400' />
            <StatBox label='Win Rate' value={`${s.winRate}%`} color={s.winRate >= 20 ? 'text-green-400' : 'text-amber-400'} />
            <StatBox label='Place Rate' value={`${s.placeRate}%`} color='text-blue-400' />
            <StatBox label='ROI' value={`${s.roi}%`} color={s.roi >= 0 ? 'text-green-400' : 'text-red-400'} />
            <StatBox label='Avg Odds' value={s.avgOdds} />
            <StatBox label='Avg Stake' value={s.avgStake} />
            <StatBox label='Max Losing Streak' value={s.losingStreak} color='text-red-400' />
            <StatBox label='Max Winning Streak' value={s.winningStreak} color='text-green-400' />
            <StatBox label='Bets/Race' value={s.betsPerRace} />
            <StatBox label='End Bankroll' value={s.endBankroll} color={s.endBankroll >= s.startBankroll ? 'text-green-400' : 'text-red-400'} />
          </div>

          {backtestResult?.byMonth && Object.keys(backtestResult.byMonth).length > 0 && (
            <div className='bg-white/[0.03] border border-white/5 rounded-2xl p-6'>
              <h3 className='text-lg font-bold mb-4'>Monthly Breakdown</h3>
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='border-b border-white/10'>
                      <th className='text-left text-zinc-500 py-2'>Month</th>
                      <th className='text-right text-zinc-500 py-2'>Bets</th>
                      <th className='text-right text-zinc-500 py-2'>Wins</th>
                      <th className='text-right text-zinc-500 py-2'>Win%</th>
                      <th className='text-right text-zinc-500 py-2'>Staked</th>
                      <th className='text-right text-zinc-500 py-2'>Returned</th>
                      <th className='text-right text-zinc-500 py-2'>P&L</th>
                      <th className='text-right text-zinc-500 py-2'>ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(backtestResult.byMonth).sort(([a], [b]) => b.localeCompare(a)).map(([month, data]: [string, any]) => (
                      <tr key={month} className='border-b border-white/5 hover:bg-white/[0.02]'>
                        <td className='py-2 font-medium'>{month}</td>
                        <td className='text-right py-2'>{data.bets}</td>
                        <td className='text-right py-2 text-green-400'>{data.wins}</td>
                        <td className='text-right py-2'>{data.winRate}%</td>
                        <td className='text-right py-2'>{data.staked}</td>
                        <td className='text-right py-2'>{data.returned}</td>
                        <td className={`text-right py-2 font-bold ${data.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{data.pnl >= 0 ? '+' : ''}{data.pnl}</td>
                        <td className={`text-right py-2 font-bold ${data.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{data.roi}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {backtestResult?.topPicks && backtestResult.topPicks.length > 0 && (
            <div className='bg-white/[0.03] border border-white/5 rounded-2xl p-6'>
              <h3 className='text-lg font-bold mb-4'>Top Winning Picks</h3>
              <div className='space-y-2'>
                {backtestResult.topPicks.map((pick: any, i: number) => (
                  <div key={i} className='flex items-center justify-between p-3 bg-green-500/5 border border-green-500/10 rounded-xl'>
                    <div>
                      <span className='font-bold'>{pick.horse}</span>
                      <span className='text-zinc-500 text-sm ml-2'>{pick.course} · {pick.date}</span>
                    </div>
                    <div className='flex items-center gap-4'>
                      <span className='text-zinc-500 text-sm'>Score: {pick.score}</span>
                      <span className='text-zinc-500 text-sm'>Odds: {pick.odds}</span>
                      <span className='text-green-400 font-bold'>+{pick.pnl}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!csvText && !backtestResult && (
        <div className='bg-white/[0.02] border border-white/5 rounded-2xl p-12 text-center'>
          <h2 className='text-2xl font-bold mb-4'>How to backtest</h2>
          <div className='max-w-2xl mx-auto text-left space-y-4 text-zinc-400'>
            <p><strong className='text-white'>1. Get historical data</strong> — Export UK racecards from the Racing API, or use a CSV from Racing Post / Timeform. You need: date, course, off_time, horse, odds, position (finishing position), jockey, trainer.</p>
            <p><strong className='text-white'>2. Import or paste</strong> — Upload the CSV file or paste the data directly. Only UK/IRE races with 5+ runners are used.</p>
            <p><strong className='text-white'>3. Run backtest</strong> — The engine runs APEX scoring on every historical race as if it were today, then compares predictions to actual results.</p>
            <p><strong className='text-white'>4. See the truth</strong> — Win rate, ROI, monthly P&L, losing streaks, best/worst picks. This tells you if the model actually works.</p>
          </div>
        </div>
      )}
    </div>
  )
}
