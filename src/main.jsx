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
import { getScore, sortByScore, filterGBIRE, countRunners, getGrade, gradeClass, resultLabel, getHomeSelections } from './lib/engine'
import IntelligenceDashboard from './pages/IntelligenceDashboard'
import Replays from './pages/Replays'
import Analytics from './pages/Analytics'
import Proof from './pages/Proof'
import CalibrationDashboard from './components/CalibrationDashboard'

const queryClient =
  new QueryClient()

const tabs = [
  'Home',
  'Racecards',
  'Results',
  'Intelligence',
  'Proof',
  'Calibration',
  'Alerts',
  'Horses',
  'Upload',
  'Replays',
  'Analytics',
]

function PickCard({ selection, rank, result, position }) {
  if (!selection) return null
  const label = resultLabel(result, position)
  return (
    <article className={`bg-[#0f1720] border border-green-500/10 rounded-2xl p-6 hover:border-green-400/30 transition-all duration-300 relative overflow-hidden${label ? ' has-result' : ''}`}>
      <div className='pick-card-glow' />
      {label && (
        <div className={`absolute top-4 right-4 px-3 py-1 rounded-lg text-xs font-bold z-10 ${label.cls === 'won' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : label.cls === 'placed' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : label.cls === 'nr' ? 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
          {label.text}
        </div>
      )}
      <div className='flex gap-6 items-start w-full overflow-hidden'>
        <div className='flex-1 min-w-0 overflow-hidden'>
          <div className='flex items-center gap-2 mb-3'>
            <span className='text-zinc-500 text-sm font-bold'>#{rank}</span>
            {selection.confidenceTier && (
              <span className={`px-2 py-1 rounded-md text-xs font-medium ${selection.confidenceTier === 'S' || selection.confidenceTier === 'A' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-zinc-400'}`}>
                T{selection.confidenceTier}
              </span>
            )}
            <span className={`px-2 py-1 rounded-md text-xs font-medium ${gradeClass(selection.probBand) === 'a-plus' || gradeClass(selection.probBand) === 'a' ? 'bg-green-500/10 text-green-400' : gradeClass(selection.probBand) === 'b' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-zinc-400'}`}>{selection.probBand}</span>
            {selection.probRange && <span className='text-zinc-500 text-xs'>{selection.probRange}</span>}
            <span className='text-zinc-500 text-xs'>{selection.offTime}</span>
          </div>
          <button
            type='button'
            className='text-xl font-bold text-left hover:text-amber-300 transition truncate block w-full'
            onClick={() => {
              openAtTheRacesHorseForm(selection, selection.race)
              window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse: selection.horse, course: selection.course, offTime: selection.race?.off_time } }))
            }}
          >
            {selection.horse}
          </button>
          <p className='text-zinc-400 text-sm mt-2'>
            <span className='font-medium'>{selection.course}</span>
            <span className='mx-2'>&middot;</span>
            <span className='truncate'>{selection.raceName}</span>
          </p>
          <div className='flex gap-2 mt-4 flex-wrap'>
            {selection.form && (
              <span className='px-2 py-1 bg-white/5 text-zinc-400 rounded-lg text-xs font-medium'>Form {selection.form}</span>
            )}
            {selection.draw && (
              <span className='px-2 py-1 bg-white/5 text-zinc-400 rounded-lg text-xs font-medium'>Draw {selection.draw}</span>
            )}
            {selection.valueEdge && selection.valueEdge > 0 ? (
              <span className='px-2 py-1 bg-green-500/10 text-green-400 rounded-lg text-xs font-medium'>+{selection.valueEdge}% edge</span>
            ) : selection.valueEdge < 0 ? (
              <span className='px-2 py-1 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium'>{selection.valueEdge}% edge</span>
            ) : null}
            {selection.selectionQuality && (
              <span className={`px-2 py-1 rounded-lg text-xs font-medium ${selection.selectionQuality.grade === 'A+' || selection.selectionQuality.grade === 'A' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-zinc-400'}`}>
                {selection.selectionQuality.grade}
              </span>
            )}
          </div>
        </div>

        <div className='shrink-0 w-28 h-28 rounded-2xl bg-[#0a1a14] border-2 border-green-400 flex flex-col items-center justify-center'>
          <span className='text-zinc-400 text-xs font-medium uppercase tracking-wider'>APEX</span>
          <strong className='text-3xl font-black text-green-400'>{selection.score}</strong>
          <div className='flex gap-2 mt-1'>
            {selection.winProb && (
              <span className='text-green-400 text-xs font-medium'>W:{selection.winProb}%</span>
            )}
            {selection.placeProb && (
              <span className='text-blue-400 text-xs font-medium'>P:{selection.placeProb}%</span>
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
  const picks = allSelections.filter((s) => s.score >= 40).slice(0, 8)
  const topScore = picks[0]?.score || allSelections[0]?.score || 0
  const totalRunners = allSelections.length

  const noBetReason = picks.length === 0 && ukIreRaces.length > 0 ? (() => {
    const highChaos = ukIreRaces.filter(r => r.volatility?.chaos > 0.5).length
    const autoSkipped = ukIreRaces.filter(r => r.betFilter?.verdict === 'AUTO SKIP').length
    const highRisk = ukIreRaces.filter(r => r.betFilter?.verdict === 'HIGH RISK').length
    if (highChaos > ukIreRaces.length * 0.5) return 'Most races are highly volatile — too chaotic for confident picks'
    if (autoSkipped > ukIreRaces.length * 0.5) return 'Most races have weak data or poor conditions — system skipping'
    if (highRisk > ukIreRaces.length * 0.5) return 'Most races flagged as high risk — no value edges detected'
    return 'No runners met the minimum confidence threshold today'
  })() : null

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
          valueEdge: p.valueEdge,
          confidenceTier: p.confidenceTier,
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
                valueEdge: p.valueEdge,
                confidenceTier: p.confidenceTier,
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
    <div className='dashboard-page max-w-7xl mx-auto'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow text-zinc-500 text-sm font-medium uppercase tracking-wider'>UK &amp; Ireland selections</span>
          <h1 className='text-5xl font-black tracking-tight'>Today&apos;s best picks</h1>
          <p className='text-zinc-400 text-lg mt-3'>
            The top-rated runners from today&apos;s UK and Ireland racecards, ranked by APEX confidence score.
          </p>
        </div>

        <div className='hero-metrics grid grid-cols-2 sm:grid-cols-5 gap-4'>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
            <span className='text-zinc-400 text-sm block'>UK/IRE races</span>
            <strong className='text-2xl font-bold text-amber-400'>{ukIreRaces.length}</strong>
          </div>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
            <span className='text-zinc-400 text-sm block'>Total runners</span>
            <strong className='text-2xl font-bold text-amber-400'>{totalRunners}</strong>
          </div>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
            <span className='text-zinc-400 text-sm block'>Top score</span>
            <strong className='text-2xl font-bold text-amber-400'>{topScore || '--'}</strong>
          </div>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
            <span className='text-zinc-400 text-sm block'>System picks</span>
            <strong className='text-2xl font-bold text-amber-400'>{picks.length}</strong>
          </div>
          {overallRate && (
            <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
              <span className='text-zinc-400 text-sm block'>Historical SR</span>
              <strong className={`text-2xl font-bold ${overallRate >= 30 ? 'text-green-400' : overallRate >= 20 ? 'text-amber-400' : 'text-red-400'}`}>
                {overallRate}%
              </strong>
            </div>
          )}
        </div>
      </section>

      {isLoading ? (
        <div className='loading-card bg-white/[0.02] rounded-2xl border border-white/5 p-12 flex items-center gap-4'>
          <div className='pulse-dot' />
          <span className='text-zinc-400'>Finding the strongest system picks...</span>
        </div>
      ) : picks.length === 0 ? (
        <section className='empty-state bg-white/[0.02] rounded-2xl border border-white/5 p-12'>
          {noBetReason ? (
            <>
              <div className='flex items-center gap-3 mb-4'>
                <span className='px-3 py-1 rounded-lg text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30'>NO BET</span>
                <h2 className='text-2xl font-bold'>No picks today</h2>
              </div>
              <p className='text-zinc-400 mt-2'>{noBetReason}</p>
              <p className='text-zinc-500 text-sm mt-4'>Sometimes the smartest prediction is knowing when not to bet. {ukIreRaces.length} UK/IRE races scanned, none met APEX confidence threshold.</p>
            </>
          ) : (
            <>
              <h2 className='text-2xl font-bold'>No top picks yet</h2>
              <p className='text-zinc-400 mt-2'>The model hasn&apos;t found any rated runners yet. Racecards may still be loading.</p>
            </>
          )}
        </section>
      ) : (
        <section className='home-picks-section space-y-6'>
          {todayStats && todayStats.won + todayStats.placed + todayStats.lost + todayStats.nr > 0 && (
            <div className={`home-picks-stats-bar flex items-center gap-4 p-4 rounded-xl border ${todayStats.won > 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-white/[0.02] border-white/5'}`}>
              <span className='text-zinc-400 text-sm'>Today&apos;s results:</span>
              <strong className='stat-won text-green-400 font-bold'>{todayStats.won}W</strong>
              <span className='text-zinc-600'>&middot;</span>
              <strong className='stat-placed text-amber-400 font-bold'>{todayStats.placed}P</strong>
              <span className='text-zinc-600'>&middot;</span>
              <strong className='stat-lost text-red-400 font-bold'>{todayStats.lost}L</strong>
              {todayStats.nr > 0 && (<>
                <span className='text-zinc-600'>&middot;</span>
                <strong className='stat-nr text-zinc-400 font-bold'>{todayStats.nr}NR</strong>
              </>)}
              <span className='text-zinc-600'>&middot;</span>
              <strong className='stat-pend text-zinc-500 font-bold'>{todayStats.pending}PEND</strong>
              {todayStats.won + todayStats.placed + todayStats.lost > 0 && (<>
                <span className='text-zinc-600'>&middot;</span>
                <span className='text-zinc-400 text-sm'>SR</span>
                <strong className='text-amber-400 font-bold'>{(todayStats.won / (todayStats.won + todayStats.placed + todayStats.lost) * 100).toFixed(0)}%</strong>
              </>)}
            </div>
          )}
          <div className='home-picks-grid grid grid-cols-1 lg:grid-cols-2 gap-6'>
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
        <section className='home-track-section space-y-4'>
          <div className='home-picks-header'>
            <span className='eyebrow text-zinc-500 text-sm font-medium uppercase tracking-wider'>History</span>
            <h2 className='text-3xl font-black tracking-tight'>Track record</h2>
          </div>
          <div className='home-track-grid space-y-3'>
            {pastDays.map(([date, day]) => {
              const s = day.stats || { won: 0, placed: 0, lost: 0, nr: 0, pending: 0 }
              const total = s.won + s.placed + s.lost
              const rate = total > 0 ? ((s.won / total) * 100).toFixed(0) : '--'
              return (
                <details key={date} className='home-track-day bg-white/[0.02] rounded-xl border border-white/5'>
                  <summary className='home-track-summary flex justify-between items-center p-4 cursor-pointer hover:bg-white/[0.02] transition'>
                    <span className='home-track-date font-bold text-white'>{date}</span>
                    <span className='home-track-stats flex items-center gap-3'>
                      <span className='home-track-won text-green-400 font-bold text-sm'>{s.won}W</span>
                      <span className='home-track-placed text-amber-400 font-bold text-sm'>{s.placed}P</span>
                      <span className='home-track-lost text-red-400 font-bold text-sm'>{s.lost}L</span>
                      {s.nr > 0 && <span className='home-track-nr text-zinc-400 font-bold text-sm'>{s.nr}NR</span>}
                      {s.pending > 0 && <span className='home-track-pend text-zinc-500 font-bold text-sm'>{s.pending}PEND</span>}
                      <span className='home-track-rate text-amber-400 font-bold text-sm'>{rate !== '--' ? `${rate}%` : '--'}</span>
                    </span>
                  </summary>
                  <div className='home-track-detail p-4 pt-0 space-y-2'>
                    {day.picks.map((p, i) => (
                      <div key={i} className={`home-track-row flex justify-between items-center p-3 rounded-lg ${p.result === 'won' ? 'bg-green-500/5' : p.result === 'placed' ? 'bg-amber-500/5' : p.result === 'lost' ? 'bg-red-500/5' : 'bg-white/[0.01]'}`}>
                        <span className='home-track-row-name font-bold'>{p.horse}</span>
                        <span className='home-track-row-course text-zinc-400 text-sm'>{p.course}</span>
                        <span className='home-track-row-score text-amber-400 font-bold'>{p.score}</span>
                        <span className={`home-track-row-result px-2 py-1 rounded-md text-xs font-bold ${p.result === 'won' ? 'bg-green-500/20 text-green-400' : p.result === 'placed' ? 'bg-amber-500/20 text-amber-400' : p.result === 'nr' ? 'bg-zinc-500/20 text-zinc-400' : p.result === 'lost' ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-zinc-500'}`}>
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
  const [selectedHorse, setSelectedHorse] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      setSelectedHorse(e.detail)
      setActiveTab('Racecards')
    }
    window.addEventListener('select-horse', handler)
    return () => window.removeEventListener('select-horse', handler)
  }, [])

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
      return <Racecards key={selectedHorse?.horse + selectedHorse?.course} />
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

    if (activeTab === 'Analytics') {
      return <Analytics />
    }

    if (activeTab === 'Proof') {
      return <Proof />
    }
  }

  return (
    <div className='layout bg-gradient-to-br from-[#071018] to-[#0b1220]'>
      <aside className='sidebar bg-[#0a1118] border-r border-white/5'>
        <div className='brand'>
          <div className='brand-mark'>A</div>

          <div>
            <h1>APEX</h1>
            <p>Racing Intelligence</p>
          </div>
        </div>

        <nav className='space-y-1'>
          {tabs.map((tab) => (
            <button
              key={tab}
              type='button'
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        <div className='sidebar-panel bg-white/[0.02] rounded-xl p-4 border border-white/5'>
          <span className='text-zinc-500 text-xs uppercase tracking-wider'>Live Mode</span>
          <strong className='text-green-400 text-sm'>Market scan active</strong>
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
