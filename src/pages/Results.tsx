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
    if (race.off_dt && new Date(race.off_dt) > now) return false
    return true
  })

  const todayStored = allStored.filter((race: any) => {
    if (race.region !== 'GB' && race.region !== 'IRE' && race.region !== 'gb' && race.region !== 'ire') return false
    const raceDate = race.date || (race.off_dt ? race.off_dt.slice(0, 10) : todayStr)
    if (raceDate !== todayStr) return false
    const hasResults = (race.runners || []).some((r: any) => r.position || r.pos)
    return hasResults
  })

  const todayIds = new Set([
    ...liveCompleted.map((r: any) => r.race_id || `${r.course}-${r.off_time}`),
    ...todayStored.map((r: any) => r.race_id || `${r.course}-${r.off_time}`),
  ])

  const liveWithoutResults = liveCompleted.filter((r: any) =>
    !(r.runners || []).some((rn: any) => rn.position || rn.pos)
  )

  const storedIds = new Set(todayStored.map((r: any) => r.race_id || `${r.course}-${r.off_time}`))

  const liveNotInStored = liveWithoutResults.filter((r: any) =>
    !storedIds.has(r.race_id || `${r.course}-${r.off_time}`)
  )

  const todayRaces = [...liveNotInStored, ...todayStored].sort((a: any, b: any) => {
    const aDt = a.off_dt || ''
    const bDt = b.off_dt || ''
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

  return (
    <div className='dashboard-page'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow'>Results</span>
          <h1>Race results</h1>
          <p>
            Completed UK &amp; Ireland races with positions from ATR and API.
          </p>
        </div>
        <div className='hero-metrics'>
          <div><span>Today</span><strong>{todayRaces.length}</strong></div>
          <div><span>Previous days</span><strong>{previousRaces.length}</strong></div>
        </div>
      </section>

      <div className='flex gap-2 mb-6'>
        <button
          type='button'
          className={`text-sm px-4 py-2 rounded-lg border transition ${
            tab === 'today'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'border-white/10 text-muted-foreground hover:text-white'
          }`}
          onClick={() => setTab('today')}
        >
          Today
        </button>
        <button
          type='button'
          className={`text-sm px-4 py-2 rounded-lg border transition ${
            tab === 'previous'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'border-white/10 text-muted-foreground hover:text-white'
          }`}
          onClick={() => setTab('previous')}
        >
          Previous days
        </button>
      </div>

      {tab === 'today' && (
        todayRaces.length === 0 ? (
          <section className='empty-state'>
            <h2>No results yet today</h2>
            <p>Completed UK/IRE races will appear here as results are scraped from ATR.</p>
          </section>
        ) : (
          <section className='race-grid'>
            {todayRaces.map((race: any, raceIndex: number) => (
              <RaceResultCard key={race.race_id || `today-${raceIndex}`} race={race} />
            ))}
          </section>
        )
      )}

      {tab === 'previous' && (
        previousRaces.length === 0 ? (
          <section className='empty-state'>
            <h2>No previous results</h2>
            <p>Uploaded results from previous days will appear here.</p>
          </section>
        ) : (
          <section className='race-grid'>
            {previousRaces.map((race: any, raceIndex: number) => (
              <RaceResultCard key={race.race_id || `prev-${raceIndex}`} race={race} />
            ))}
          </section>
        )
      )}
    </div>
  )
}

function RaceResultCard({ race }: { race: any }) {
  const runners = (race.runners || []).filter((r: any) => r.position || r.pos)
  const hasResults = runners.length > 0
  const sorted = hasResults ? [...runners].sort((a: any, b: any) => {
    const aPos = Number(a.position || a.pos || 999)
    const bPos = Number(b.position || b.pos || 999)
    return aPos - bPos
  }) : (race.runners || [])

  return (
    <article className='race-card'>
      <div className='race-card-header'>
        <div>
          <div className='race-meta-row'>
            <span className={`live-badge ${hasResults ? '' : 'bg-muted-foreground/20'}`}>{hasResults ? 'RESULT' : 'PENDING'}</span>
            <span>{hasResults ? `${runners.length}/${race.runners?.length || 0} runners` : `${race.runners?.length || 0} runners`}</span>
            <span className='text-muted-foreground ml-2 text-xs'>{race.region || ''}</span>
          </div>
          <h2>{race.race_name}</h2>
          <p>{race.course} &middot; {formatOffTime(race)}</p>
        </div>
      </div>
      {hasResults ? (
        <div className='runner-list'>
          {sorted.map((runner: any, runnerIndex: number) => {
            const pos = runner.position || runner.pos
            return (
              <div key={runner.horse_id || runnerIndex} className='runner-row'>
                <div>
                  <strong className={`result-position ${pos === 1 ? 'text-amber-400' : ''}`}>{pos}</strong>
                  <span className='result-horse-name'>
                    <button type='button' className='hover:text-amber-300 transition text-left' onClick={() => selectHorse(runner.horse || runner.name, race)}>
                      {runner.horse || runner.name || '-'}
                    </button>
                  </span>
                  <p>{runner.jockey || '-'}</p>
                </div>
                <div className='runner-score'>
                  <strong>{runner.spOdds || runner.sp || runner.odds || '-'}</strong>
                  <span>SP</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className='runner-list'>
          {(race.runners || []).map((runner: any, runnerIndex: number) => (
            <div key={runner.horse_id || runnerIndex} className='runner-row opacity-50'>
              <div>
                <span className='result-horse-name'>
                  <button type='button' className='hover:text-amber-300 transition text-left' onClick={() => selectHorse(runner.horse || runner.name, race)}>
                    {runner.horse || runner.name || '-'}
                  </button>
                </span>
                <p>{runner.jockey || '-'}</p>
              </div>
              <div className='runner-score'>
                <strong>{runner.odds || '-'}</strong>
                <span>Odds</span>
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
    <div className='dashboard-page'>
      <section className='empty-state upload-panel'>
        <span>Upload</span>
        <h2>Upload official results</h2>
        <p>Choose your Racing API results JSON file.</p>
        <button
          type='button'
          disabled={loading}
          onClick={() => fileInputRef.current?.click()}
          className='primary-button upload-button'
        >
          {loading ? 'Processing...' : 'Choose Results JSON'}
        </button>
        <input ref={fileInputRef} type='file' accept='.json,application/json' style={{ display: 'none' }} onChange={handleUpload} />
        {message && <div className='upload-message'>{message}</div>}
      </section>
    </div>
  )
}
