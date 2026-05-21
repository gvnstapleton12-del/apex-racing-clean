import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'

import Racecards from './pages/Racecards'
import UploadResults, {
  ResultsList,
} from './pages/Results'
import { fetchRacecards } from './lib/racingApi'
import { openAtTheRacesHorseForm } from './lib/horseLinks'
import { formatOffTime } from './lib/formatTime'
import IntelligenceDashboard from './pages/IntelligenceDashboard'
import Replays from './pages/Replays'
import CalibrationDashboard from './components/CalibrationDashboard'

const queryClient =
  new QueryClient()

const tabs = [
  'Home',
  'Racecards',
  'Results',
  'Intelligence',
  'Calibration',
  'Alerts',
  'Horses',
  'Upload',
  'Replays',
  'Analytics',
]

function getRunnerScore(runner) {
  return (
    runner.finalScore ||
    runner.aiProfile?.confidence ||
    runner.score ||
    0
  )
}

function getHomeSelections(races) {
  return races
    .flatMap((race) =>
      (race.runners || []).map((runner) => ({
        ...runner,
        race,
        raceName: race.race_name,
        course: race.course,
        offTime: formatOffTime(race),
        score: getRunnerScore(runner),
        probBand: runner.probBand || runner.confidenceLabel || runner.aiProfile?.grade || '',
        probRange: runner.probRange || '',
        winProb: runner.winProb || null,
      }))
    )
    .sort((a, b) => (b.score || 0) - (a.score || 0))
}

function gradeClass(label) {
  const map = {
    'High Probability': 'a-plus',
    'Medium-High': 'a',
    'Medium': 'b',
    'Low': 'c-plus',
    'Very Low': 'c',
    'Elite': 'a-plus',
    'Strong': 'a',
    'Playable': 'b',
    'Speculative': 'c-plus',
    'Avoid': 'c',
    'A+': 'a-plus',
    'A': 'a',
    'B': 'b',
    'C+': 'c-plus',
    'C': 'c',
  }
  return map[label] || 'c'
}

function resultLabel(result, position) {
  if (!result) return null
  if (result === 'won') return { text: 'WON', cls: 'won' }
  if (result === 'placed') return { text: 'P', cls: 'placed' }
  if (result === 'nr') return { text: 'NR', cls: 'nr' }
  if (result === 'lost') return { text: 'LOST', cls: 'lost' }
  return null
}

function PickCard({ selection, rank, result, position }) {
  if (!selection) return null
  const label = resultLabel(result, position)
  return (
    <article className={`pick-card rank-${rank}${label ? ' has-result' : ''}`}>
      <div className='pick-card-glow' />
      {label && (
        <div className={`pick-card-result-badge ${label.cls}`}>
          {label.text}
        </div>
      )}
      <div className='pick-card-body'>
        <div className='pick-card-left'>
          <div className='pick-card-rank-grade'>
            <span className='pick-card-rank'>#{rank}</span>
            <span className={`pick-card-grade grade-${gradeClass(selection.probBand)}`}>{selection.probBand}</span>
            {selection.probRange && <span className='pick-card-prob-range'>{selection.probRange}</span>}
            <span className='pick-card-time'>{selection.offTime}</span>
          </div>
          <button
            type='button'
            className='pick-card-horse'
            onClick={() => openAtTheRacesHorseForm(selection, selection.race)}
          >
            {selection.horse}
          </button>
          <p className='pick-card-meta'>
            <span className='pick-card-course'>{selection.course}</span>
            <span className='pick-card-sep'>&middot;</span>
            <span>{selection.raceName}</span>
          </p>
          <div className='pick-card-tags'>
            <span>Odds {selection.odds || '-'}</span>
            <span>Form {selection.form || '-'}</span>
            <span>Draw {selection.draw || '-'}</span>
            {selection.selectionQuality && (
              <span className={`pick-sel-grade grade-${selection.selectionQuality.grade.replace('+', 'p')}`}>
                {selection.selectionQuality.grade}
              </span>
            )}
          </div>
        </div>
        <div className='pick-card-right'>
          <div className={`pick-card-score-ring rank-${rank}`}>
            <span className='pick-card-score-label'>APEX</span>
            <strong className='pick-card-score'>{selection.score}</strong>
            {selection.winProb && (
              <span className='pick-card-winprob'>{selection.winProb}%</span>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function Home() {
  const [dailyPicksDb, setDailyPicksDb] = useState({})
  const {
    data: races = [],
    isLoading,
  } = useQuery({
    queryKey: ['home-racecards'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

  useEffect(() => {
    fetch('/api/daily-picks')
      .then((r) => r.json())
      .then(setDailyPicksDb)
      .catch(() => {})
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const ukIreRaces = races.filter(
    (r) => r.region === 'GB' || r.region === 'IRE' || r.region === 'gb' || r.region === 'ire'
  )
  const allSelections = getHomeSelections(ukIreRaces)
  const picks = allSelections.filter((s) => s.score >= 50).slice(0, 8)
  const topScore = picks[0]?.score || allSelections[0]?.score || 0
  const totalRunners = allSelections.length

  const todaySaved = dailyPicksDb[today]
  const todayResults = todaySaved?.picks || []
  const todayStats = todaySaved?.stats || null

  const pastDays = Object.entries(dailyPicksDb)
    .filter(([date]) => date < today)
    .sort(([a], [b]) => b.localeCompare(a))

  const overallWins = pastDays.reduce((s, [, d]) => s + (d.stats?.won || 0), 0)
  const overallPlaced = pastDays.reduce((s, [, d]) => s + (d.stats?.placed || 0), 0)
  const overallLosses = pastDays.reduce((s, [, d]) => s + (d.stats?.lost || 0), 0)
  const overallTotal = overallWins + overallPlaced + overallLosses
  const overallRate = overallTotal > 0 ? ((overallWins / overallTotal) * 100).toFixed(0) : null

  const picksKey = picks.map((p) => p.horse + p.course).join('|')

  useEffect(() => {
    if (picks.length === 0) return
    if (todaySaved && todaySaved.picks.some((p) => p.result !== null)) return

    fetch('/api/daily-picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: today,
        picks: picks.map((p) => ({
          horse: p.horse,
          course: p.course,
          offTime: p.offTime,
          raceName: p.raceName,
          score: p.score,
          grade: p.grade,
          odds: p.odds,
          form: p.form,
          draw: p.draw,
        })),
      }),
    })
      .then((r) => r.json())
      .then((result) => {
        if (result.saved) {
          setDailyPicksDb((prev) => ({
            ...prev,
            [today]: {
              picks: picks.map((p) => ({
                horse: p.horse,
                course: p.course,
                offTime: p.offTime,
                raceName: p.raceName,
                score: p.score,
                grade: p.grade,
                odds: p.odds,
                form: p.form,
                draw: p.draw,
                result: null,
              })),
              stats: { won: 0, placed: 0, lost: 0, pending: picks.length },
            },
          }))
        }
      })
      .catch(() => {})
  }, [picksKey, today])

  return (
    <div className='dashboard-page'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow'>UK &amp; Ireland selections</span>
          <h1>Today&apos;s best picks</h1>
          <p>
            The top-rated runners from today&apos;s UK and Ireland
            racecards, ranked by APEX confidence score.
          </p>
        </div>

        <div className='hero-metrics'>
          <div>
            <span>UK/IRE races</span>
            <strong>{ukIreRaces.length}</strong>
          </div>
          <div>
            <span>Total runners</span>
            <strong>{totalRunners}</strong>
          </div>
          <div>
            <span>Top score</span>
            <strong>{topScore || '--'}</strong>
          </div>
          <div>
            <span>System picks</span>
            <strong>{picks.length}</strong>
          </div>
          {overallRate && (
            <div>
              <span>Historical SR</span>
              <strong className={overallRate >= 30 ? 'rate-good' : overallRate >= 20 ? 'rate-ok' : 'rate-bad'}>
                {overallRate}%
              </strong>
            </div>
          )}
        </div>
      </section>

      {isLoading ? (
        <div className='loading-card'>
          <div className='pulse-dot' />
          <span>Finding the strongest system picks...</span>
        </div>
      ) : picks.length === 0 ? (
        <section className='empty-state'>
          <h2>No top picks yet</h2>
          <p>The model hasn&apos;t found any rated runners yet. Racecards may still be loading.</p>
        </section>
      ) : (
        <section className='home-picks-section'>
          {todayStats && todayStats.won + todayStats.placed + todayStats.lost + todayStats.nr > 0 && (
            <div className={`home-picks-stats-bar ${todayStats.won > 0 ? 'has-wins' : 'no-wins'}`}>
              <span>Today's results: <strong className='stat-won'>{todayStats.won}W</strong> &middot; <strong className='stat-placed'>{todayStats.placed}P</strong> &middot; <strong className='stat-lost'>{todayStats.lost}L</strong>{todayStats.nr > 0 && <> &middot; <strong className='stat-nr'>{todayStats.nr}NR</strong></>} &middot; <strong className='stat-pend'>{todayStats.pending}PEND</strong>
                {todayStats.won + todayStats.placed + todayStats.lost > 0 && (
                  <> &middot; SR <strong>{(todayStats.won / (todayStats.won + todayStats.placed + todayStats.lost) * 100).toFixed(0)}%</strong></>
                )}
              </span>
            </div>
          )}
          <div className='home-picks-grid'>
            {picks.map((s, i) => {
              const saved = todayResults.find(
                (r) => r.horse === s.horse && r.course === s.course
              )
              return (
                <PickCard
                  key={`${s.course}-${s.offTime}-${s.horse}`}
                  selection={s}
                  rank={i + 1}
                  result={saved?.result || null}
                  position={saved?.position || null}
                />
              )
            })}
          </div>
        </section>
      )}

      {pastDays.length > 0 && (
        <section className='home-track-section'>
          <div className='home-picks-header'>
            <span className='eyebrow'>History</span>
            <h2>Track record</h2>
          </div>
          <div className='home-track-grid'>
            {pastDays.map(([date, day]) => {
              const s = day.stats || { won: 0, placed: 0, lost: 0, nr: 0, pending: 0 }
              const total = s.won + s.placed + s.lost
              const rate = total > 0 ? ((s.won / total) * 100).toFixed(0) : '--'
              return (
                <details key={date} className='home-track-day'>
                  <summary className='home-track-summary'>
                    <span className='home-track-date'>{date}</span>
                    <span className='home-track-stats'>
                      <span className='home-track-won'>{s.won}W</span>
                      <span className='home-track-placed'>{s.placed}P</span>
                      <span className='home-track-lost'>{s.lost}L</span>
                      {s.nr > 0 && <span className='home-track-nr'>{s.nr}NR</span>}
                      {s.pending > 0 && <span className='home-track-pend'>{s.pending}PEND</span>}
                      <span className='home-track-rate'>{rate !== '--' ? `${rate}%` : '--'}</span>
                    </span>
                  </summary>
                  <div className='home-track-detail'>
                    {day.picks.map((p, i) => (
                      <div key={i} className={`home-track-row ${p.result || ''}`}>
                        <span className='home-track-row-name'>{p.horse}</span>
                        <span className='home-track-row-course'>{p.course}</span>
                        <span className='home-track-row-score'>{p.score}</span>
                        <span className={`home-track-row-result ${p.result || 'pending'}`}>
                          {p.result === 'won' ? 'WON' : p.result === 'placed' ? 'P' : p.result === 'nr' ? 'NR' : p.result === 'lost' ? 'LOST' : 'PEND'}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function PlaceholderPage({ title }) {
  return (
    <div className='dashboard-page'>
      <section className='empty-state'>
        <span>{title}</span>
        <h2>{title} workspace</h2>
        <p>
          This tab is ready for the next layer of APEX tooling.
        </p>
      </section>
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] =
    useState('Home')
  const [uploadedResults, setUploadedResults] =
    useState([])

  useEffect(() => {
    async function loadSavedResults() {
      try {
        const response = await fetch(
          '/api/results'
        )

        const data = await response.json()

        if (Array.isArray(data)) {
          setUploadedResults(data)
        }
      } catch (error) {
        console.error(
          'Failed to load saved results',
          error
        )
      }
    }

    loadSavedResults()
  }, [])

  const handleResultsLoaded = (
  results,
  switchTab = true
) => {
  setUploadedResults(results)

  if (switchTab) {
    setActiveTab('Results')
  }
}

  const renderPage = () => {
    if (activeTab === 'Racecards') {
      return <Racecards />
    }

    if (activeTab === 'Results') {
      return <ResultsList results={uploadedResults} />
    }

    if (activeTab === 'Upload') {
      return (
        <UploadResults
          onResultsLoaded={handleResultsLoaded}
        />
      )
    }

    if (activeTab === 'Home') {
      return <Home />
    }

    if (activeTab === 'Intelligence') {
      return <IntelligenceDashboard />
    }

    if (activeTab === 'Calibration') {
      return <CalibrationDashboard />
    }

    if (activeTab === 'Replays') {
      return <Replays />
    }

    return <PlaceholderPage title={activeTab} />
  }

  return (
    <div className='layout'>
      <aside className='sidebar'>
        <div className='brand'>
          <div className='brand-mark'>A</div>

          <div>
            <h1>APEX</h1>
            <p>Racing Intelligence</p>
          </div>
        </div>

        <nav>
          {tabs.map((tab) => (
            <button
              key={tab}
              type='button'
              className={
                activeTab === tab ? 'active' : ''
              }
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        <div className='sidebar-panel'>
          <span>Live Mode</span>
          <strong>Market scan active</strong>
        </div>
      </aside>

      <main className='main'>
        {renderPage()}
      </main>
    </div>
  )
}

ReactDOM.createRoot(
  document.getElementById('root')
).render(
  <React.StrictMode>
    <QueryClientProvider
      client={queryClient}
    >
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
