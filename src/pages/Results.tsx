import React, { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchRacecards, fetchResults } from '../lib/racingApi'
import { formatOffTime } from '../lib/formatTime'

function selectHorse(horse, race) {
  window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse, course: race.course, offTime: race.off_time } }))
}

type UploadResultsProps = {
  onResultsLoaded?: (results: any[]) => void
}

type ResultsListProps = {
  results: any[]
}

export function ResultsList({ results }: ResultsListProps) {
  const [tab, setTab] = useState<'today' | 'previous'>('today')

  const { data: storedRaces = [] } = useQuery<any[]>({
    queryKey: ['stored-results'],
    queryFn: fetchResults,
    refetchInterval: 60000,
  })

  const { data: liveRaces = [] } = useQuery<any[]>({
    queryKey: ['results-racecards'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const allStored = [...results, ...storedRaces].filter(
    (r, i, arr) => arr.findIndex((x) => {
      const ridMatch = x.race_id && r.race_id && x.race_id === r.race_id
      const courseMatch = x.course === r.course
      const timeA = x.off_time || x.off || ''
      const timeB = r.off_time || r.off || ''
      const timeMatch = courseMatch && timeA && timeB && timeA === timeB
      return ridMatch || timeMatch
    }) === i
  )

  const liveCompleted = liveRaces.filter((race: any) => {
    if (race.region !== 'GB' && race.region !== 'IRE' && race.region !== 'gb' && race.region !== 'ire') return false
    const raceDate = race.date || (race.off_dt ? race.off_dt.slice(0, 10) : todayStr)
    if (raceDate !== todayStr) return false
    if (race.off_dt && race.date === todayStr && race.off_time) {
      const ukNow = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
      if (race.off_time > ukNow) return false
    }
    return true
  })

  // Live races that have finished AND have results OR are 30+ minutes past off time
  const liveWithResults = liveCompleted.filter((r: any) => {
    const hasPositions = (r.runners || []).some((rn: any) => rn.position || rn.pos)
    if (hasPositions) return true

    // Time-based fallback: show if 30+ minutes past off time
    const offDt = r.off_dt || r.off_time
    if (offDt) {
      const offTime = new Date(offDt)
      const minutesSinceOff = (now.getTime() - offTime.getTime()) / 60000
      return minutesSinceOff > 30
    }
    return false
  })

  const todayStored = allStored.filter((race: any) => {
    if (race.region !== 'GB' && race.region !== 'IRE' && race.region !== 'gb' && race.region !== 'ire') return false
    const raceDate = race.date || (race.off_dt ? race.off_dt.slice(0, 10) : todayStr)
    if (raceDate !== todayStr) return false
    const hasResults = (race.runners || []).some((r: any) => r.position || r.pos)
    return hasResults
  })

  // Merge live results with stored results, deduplicating by race_id
  const todayIds = new Set(todayStored.map((r: any) => r.race_id || `${r.course}-${r.off_time}`))
  const liveNotInStored = liveWithResults.filter((r: any) =>
    !todayIds.has(r.race_id || `${r.course}-${r.off_time}`)
  )

  const todayRaces = [...liveNotInStored, ...todayStored].sort((a: any, b: any) => {
    const aDt = a.off_dt || a.off_time || ''
    const bDt = b.off_dt || b.off_time || ''
    return aDt.localeCompare(bDt)
  })

  const previousRaces = allStored.filter(
    (r: any) => {
      const region = (r.region || '').toLowerCase()
      if (region !== 'gb' && region !== 'ire') return false
      if (todayIds.has(r.race_id)) return false
      const raceDate = r.date || (r.off_dt ? r.off_dt.slice(0, 10) : null)
      if (raceDate === todayStr) return false
      return true
    }
  ).sort((a: any, b: any) => {
    const bDt = b.off_dt || b.date || ''
    const aDt = a.off_dt || a.date || ''
    return bDt.localeCompare(aDt)
  })

  const previousByDate: Record<string, typeof previousRaces> = {}
  previousRaces.forEach((r: any) => {
    const d = r.date || (r.off_dt ? r.off_dt.slice(0, 10) : '')
    if (!d) return
    if (!previousByDate[d]) previousByDate[d] = []
    previousByDate[d].push(r)
  })
  const dateKeys = Object.keys(previousByDate).sort((a, b) => b.localeCompare(a))
  const [selectedDate, setSelectedDate] = useState(dateKeys[0] || '')

  return (
    <div className='dashboard-page max-w-7xl mx-auto'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow'>Results</span>
          <h1 className='text-5xl font-black tracking-tight'>Race results</h1>
          <p className='text-zinc-400 text-lg'>
            Completed UK &amp; Ireland races with positions from ATR and API.
          </p>
        </div>
        <div className='hero-metrics grid grid-cols-2 gap-4'>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
            <span className='text-zinc-400 text-sm'>Today</span>
            <strong className='text-3xl font-bold text-amber-400'>{todayRaces.length}</strong>
          </div>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
            <span className='text-zinc-400 text-sm'>Previous days</span>
            <strong className='text-3xl font-bold text-amber-400'>{previousRaces.length}</strong>
          </div>
        </div>
      </section>

      <div className='flex gap-2 mb-8'>
        <button
          type='button'
          className={`text-sm px-5 py-2.5 rounded-xl border transition-all duration-200 font-medium ${
            tab === 'today'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-lg shadow-amber-500/5'
              : 'border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
          }`}
          onClick={() => setTab('today')}
        >
          Today
        </button>
        <button
          type='button'
          className={`text-sm px-5 py-2.5 rounded-xl border transition-all duration-200 font-medium ${
            tab === 'previous'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-lg shadow-amber-500/5'
              : 'border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
          }`}
          onClick={() => setTab('previous')}
        >
          Previous days
        </button>
      </div>

      {tab === 'today' && (
        todayRaces.length === 0 ? (
          <section className='empty-state bg-white/[0.02] rounded-2xl border border-white/5 p-12'>
            <h2 className='text-2xl font-bold'>No results yet today</h2>
            <p className='text-zinc-400 mt-2'>Completed UK/IRE races will appear here automatically as results are fetched.</p>
          </section>
        ) : (
          <section className='race-grid space-y-6'>
            {todayRaces.map((race: any, raceIndex: number) => (
              <RaceResultCard key={race.race_id || `today-${raceIndex}`} race={race} />
            ))}
          </section>
        )
      )}

      {tab === 'previous' && (
        previousRaces.length === 0 ? (
          <section className='empty-state bg-white/[0.02] rounded-2xl border border-white/5 p-12'>
            <h2 className='text-2xl font-bold'>No previous results</h2>
            <p className='text-zinc-400 mt-2'>Uploaded results from previous days will appear here.</p>
          </section>
        ) : (
          <section className='space-y-6'>
            <select
              value={selectedDate || dateKeys[0] || ''}
              onChange={(e) => setSelectedDate(e.target.value)}
              className='w-full bg-[#0f1720] border border-white/10 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-amber-500/50'
            >
              {dateKeys.map((d) => {
                const dt = new Date(d + 'T00:00:00')
                const label = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                return (
                  <option key={d} value={d}>{label} ({previousByDate[d].length} races)</option>
                )
              })}
            </select>
            <div className='race-grid space-y-6'>
              {(previousByDate[selectedDate || dateKeys[0]] || []).map((race: any, raceIndex: number) => (
                <RaceResultCard key={race.race_id || `prev-${raceIndex}`} race={race} />
              ))}
            </div>
          </section>
        )
      )}
    </div>
  )
}

function RaceResultCard({ race }: { race: any }) {
  const [expanded, setExpanded] = useState(false)
  const todayStr = new Date().toISOString().slice(0, 10)
  const allRunners = race.runners || []
  const sorted = [...allRunners].sort((a: any, b: any) => {
    const aPos = Number(a.position || a.pos || a.finish_position || a.finishing_position || a.result_position || a.place || 999)
    const bPos = Number(b.position || b.pos || b.finish_position || b.finishing_position || b.result_position || b.place || 999)
    return aPos - bPos
  })
  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)
  const hasResults = allRunners.some((r: any) => Number(r.position || r.pos || r.finish_position || r.finishing_position || r.result_position || r.place) > 0) || (race.date && race.date < todayStr)

  return (
    <article className='race-card bg-[#111827] border border-[#2a3441] rounded-2xl p-6 hover:border-[#3a4a5a] transition-all duration-300' style={{ opacity: 1 }}>
      <div className='race-card-header flex justify-between items-start mb-4'>
        <div className='space-y-2'>
          <div className='race-meta-row flex items-center gap-3'>
            <span className={`live-badge px-3 py-1 rounded-lg text-xs font-bold ${hasResults ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'}`}>
              {hasResults ? 'RESULT' : 'PENDING'}
            </span>
            <span className='text-slate-200 text-sm'>{allRunners.length} runners</span>
            <span className='px-2 py-1 bg-[#1e293b] rounded-md text-xs text-slate-200 font-medium'>{race.region || ''}</span>
          </div>
          <h2 className='text-xl font-bold text-white'>{race.race_name}</h2>
          <p className='text-zinc-400 text-sm'>{race.course} &middot; {formatOffTime(race)}</p>
        </div>
      </div>
      {hasResults ? (
        <div className='runner-list space-y-3'>
          {top3.map((runner: any, runnerIndex: number) => {
            const pos = runnerIndex + 1
            const posClass = pos === 1 ? 'bg-amber-500/5 border-amber-500/20' : pos === 2 ? 'bg-zinc-400/5 border-zinc-400/20' : 'bg-orange-500/5 border-orange-500/20'
            return (
              <div key={runner.horse_id || runnerIndex} className={`runner-row flex justify-between items-center p-4 rounded-xl border ${posClass} hover:border-[#3a4a5a] transition-all duration-200`} style={{ opacity: 1 }}>
                <div className='flex items-center gap-4'>
                  <strong className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black" style={{ opacity: 1, backgroundColor: pos === 1 ? '#f59e0b' : pos === 2 ? '#cbd5e1' : '#fb923c', color: '#000000' }}>
                    {pos}
                  </strong>
                  <div>
                    <span className='result-horse-name'>
                      <button type='button' className='hover:text-amber-300 transition text-left font-bold text-lg text-slate-200' onClick={() => selectHorse(runner.horse || runner.name, race)}>
                        {runner.horse || runner.name || '-'}
                      </button>
                    </span>
                    <p className='text-slate-200 text-sm mt-0.5'>{runner.jockey || '-'}</p>
                  </div>
                </div>
                <div className='runner-score text-right'>
                  <strong className='text-lg text-slate-200'>{runner.spOdds || runner.sp || runner.odds || '-'}</strong>
                  <span className='text-slate-200 text-xs block'>SP</span>
                </div>
              </div>
            )
          })}

          {rest.length > 0 && (
            <button
              type='button'
              onClick={() => setExpanded(!expanded)}
              className='w-full px-4 py-2.5 rounded-xl border border-[#2a3441] bg-[#1e293b] text-slate-200 text-sm font-medium hover:bg-[#2a3a4a] hover:text-white transition flex items-center justify-center gap-2'
              style={{ opacity: 1 }}
            >
              <span className={`text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span>
              {expanded ? 'Hide' : `${rest.length} more runner${rest.length > 1 ? 's' : ''}`}
            </button>
          )}

          {expanded && rest.map((runner: any, runnerIndex: number) => {
            const pos = 4 + runnerIndex
            return (
              <div key={runner.horse_id || `rest-${runnerIndex}`} className='runner-row flex justify-between items-center p-4 rounded-xl border border-[#2a3441] bg-[#111827] hover:border-[#3a4a5a] transition-all duration-200' style={{ opacity: 1 }}>
                <div className='flex items-center gap-4'>
                  <strong className='w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold bg-[#1e293b] text-slate-200'>
                    {pos}
                  </strong>
                  <div>
                    <span className='result-horse-name'>
                      <button type='button' className='hover:text-amber-300 transition text-left font-medium text-slate-200' onClick={() => selectHorse(runner.horse || runner.name, race)}>
                        {runner.horse || runner.name || '-'}
                      </button>
                    </span>
                    <p className='text-slate-200 text-sm mt-0.5'>{runner.jockey || '-'}</p>
                  </div>
                </div>
                <div className='runner-score text-right'>
                  <strong className='text-sm text-slate-200'>{runner.spOdds || runner.sp || runner.odds || '-'}</strong>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className='runner-list space-y-3'>
            {(race.runners || []).map((runner: any, runnerIndex: number) => (
            <div key={runner.horse_id || runnerIndex} className='runner-row flex justify-between items-center p-4 rounded-xl border border-[#2a3441] bg-[#111827] opacity-50'>
              <div className='flex items-center gap-4'>
                <div className='w-10 h-10 rounded-xl bg-[#1e293b] border border-[#2a3441]' />
                <div>
                  <span className='result-horse-name'>
                    <button type='button' className='hover:text-amber-300 transition text-left font-bold text-lg text-slate-200' onClick={() => selectHorse(runner.horse || runner.name, race)}>
                      {runner.horse || runner.name || '-'}
                    </button>
                  </span>
                  <p className='text-slate-200 text-sm mt-0.5'>{runner.jockey || '-'}</p>
                </div>
              </div>
              <div className='runner-score text-right'>
                <strong className='text-lg text-slate-200'>{runner.odds || '-'}</strong>
                <span className='text-slate-200 text-xs block'>Odds</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

export default function UploadResults(props: UploadResultsProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setLoading(true)
      setMessage('Processing results...')
      const text = await file.text()
      const json = JSON.parse(text)
      const response = await fetch('/api/upload-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Upload failed')
      const races = Array.isArray(json) ? json : (json.results || json.racecards || json.races || json.data || [])
      queryClient.invalidateQueries({ queryKey: ['stored-results'] })
      props.onResultsLoaded?.(races)
      setMessage(`Successfully processed ${data.processedRaces || races.length || 0} races.`)
    } catch (error: any) {
      setMessage(error.message || 'Invalid JSON file')
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  return (
    <div className='dashboard-page max-w-7xl mx-auto'>
      <section className='empty-state upload-panel bg-[#0f1720] border border-green-500/10 rounded-2xl p-12 text-center'>
        <span className='text-zinc-500 text-sm font-medium uppercase tracking-wider'>Upload</span>
        <h2 className='text-3xl font-black tracking-tight mt-2'>Upload official results</h2>
        <p className='text-zinc-400 mt-3 mb-8'>Choose your Racing API results JSON file.</p>
        <button
          type='button'
          disabled={loading}
          onClick={() => fileInputRef.current?.click()}
          className='primary-button upload-button bg-amber-500/10 border border-amber-500/30 text-amber-300 px-8 py-3 rounded-xl font-bold hover:bg-amber-500/20 transition-all duration-200'
        >
          {loading ? 'Processing...' : 'Choose Results JSON'}
        </button>
        <input ref={fileInputRef} type='file' accept='.json,application/json' style={{ display: 'none' }} onChange={handleUpload} />
        {message && <div className='upload-message mt-6 text-zinc-300 text-sm'>{message}</div>}
      </section>
    </div>
  )
}
