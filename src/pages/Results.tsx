import React, { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchRacecards } from '../lib/racingApi'
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
    queryFn: () => fetch('/api/results').then((r) => r.json()),
    refetchInterval: 60000,
  })

  const { data: liveRaces = [] } = useQuery<any[]>({
    queryKey: ['results-racecards'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const allStored = [...storedRaces, ...results].filter(
    (r, i, arr) => arr.findIndex((x) => x.race_id === r.race_id || (x.course === r.course && x.off_time === r.off_time)) === i
  )

  const liveCompleted = liveRaces.filter((race: any) => {
    if (race.region !== 'GB' && race.region !== 'IRE' && race.region !== 'gb' && race.region !== 'ire') return false
    const raceDate = race.date || (race.off_dt ? race.off_dt.slice(0, 10) : null)
    if (raceDate !== todayStr) return false
    if (race.off_dt && new Date(race.off_dt) > now) return false
    const hasResults = (race.runners || []).some((r: any) => r.position || r.pos)
    return hasResults
  })

  const todayStored = allStored.filter((race: any) => {
    if (race.region !== 'GB' && race.region !== 'IRE' && race.region !== 'gb' && race.region !== 'ire') return false
    const raceDate = race.date || (race.off_dt ? race.off_dt.slice(0, 10) : null)
    if (raceDate !== todayStr) return false
    const hasResults = (race.runners || []).some((r: any) => r.position || r.pos)
    return hasResults
  })

  const todayIds = new Set([
    ...liveCompleted.map((r: any) => r.race_id),
    ...todayStored.map((r: any) => r.race_id),
  ])

  const todayRaces = [...liveCompleted, ...todayStored].filter(
    (r, i, arr) => i === arr.findIndex((x) => x.race_id === r.race_id)
  ).sort((a: any, b: any) => {
    const aDt = a.off_dt || ''
    const bDt = b.off_dt || ''
    return aDt.localeCompare(bDt)
  })

  const previousRaces = allStored.filter(
    (r: any) => !todayIds.has(r.race_id)
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
  const sorted = [...runners].sort((a: any, b: any) => {
    const aPos = Number(a.position || a.pos || 999)
    const bPos = Number(b.position || b.pos || 999)
    return aPos - bPos
  })

  return (
    <article className='race-card'>
      <div className='race-card-header'>
        <div>
          <div className='race-meta-row'>
            <span className='live-badge'>RESULT</span>
            <span>{runners.length}/{race.runners?.length || 0} runners</span>
            <span className='text-muted-foreground ml-2 text-xs'>{race.region || ''}</span>
          </div>
          <h2>{race.race_name}</h2>
          <p>{race.course} &middot; {formatOffTime(race)}</p>
        </div>
      </div>
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
    </article>
  )
}

export default function UploadResults(props: UploadResultsProps) {
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
      const races = json.results || json.racecards || json.races || json.data || []
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
