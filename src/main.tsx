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
import { filterGBIRE, filterMinRunners, countRunners, getGrade, gradeClass, resultLabel, getHomeSelections, getNoBetReason, calculateStrikeRate } from './lib/engine'
import type { Race, Runner } from './lib/types'
import { getAtTheRacesHorseUrl } from './lib/horseLinks'
import IntelligenceDashboard from './pages/IntelligenceDashboard'
import Replays from './pages/Replays'
import Analytics from './pages/Analytics'
import Proof from './pages/Proof'
import CalibrationDashboard from './components/CalibrationDashboard'

function parseOddsToNum(odds: unknown): number {
  if (odds == null) return 0
  if (typeof odds === 'number') return odds
  const str = String(odds)
  const parts = str.split('/')
  if (parts.length === 2) {
    const n = parseFloat(parts[0])
    const d = parseFloat(parts[1])
    if (!isNaN(n) && !isNaN(d) && d !== 0) return n / d
  }
  const val = parseFloat(str)
  return isNaN(val) ? 0 : val
}

const queryClient = new QueryClient()

const tabs = [
  'Home',
  'Racecards',
  'Results',
  'Intelligence',
  'Proof',
  'Calibration',
  'Upload',
  'Replays',
  'Analytics',
]

interface Selection extends Runner {
  race: Race
  raceName: string
  course: string
  offTime: string
  score: number
  probBand: string
  probRange: string
  winProb: number | null
  placeProb: number | null
  fairOdds: number | null
  probConfidence: number | null
  valueEdge: number
  kellyStake: number | null
  noBet: boolean
  noBetReason: string | null
  confidenceTier: string
  betFilterVerdict: string
  odds?: string | number
}

interface PickCardProps {
  selection: Selection
  rank: number
  result: string | null
  position: number | null
  isNap?: boolean
  isBomb?: boolean
}

function PickCard({ selection, rank, result, position, isNap = false, isBomb = false }: PickCardProps) {
  if (!selection) return null
  const label = resultLabel(result, position)
  return (
    <article className={`${isNap ? 'lg:col-span-2' : ''} ${isNap ? 'nap-card' : 'bg-[#0f1720]'} border ${isNap ? 'border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.15)]' : 'border-green-500/10'} rounded-2xl ${isNap ? 'p-8' : 'p-6'} ${isNap ? 'hover:border-amber-400/50' : 'hover:border-green-400/30'} transition-all duration-300 relative overflow-hidden${label ? ' has-result' : ''}`}>
      {isNap && <div className='nap-glow' />}
      {!isNap && <div className='pick-card-glow' />}
      {label && (
        <div className={`absolute top-4 right-4 px-3 py-1 rounded-lg text-xs font-bold z-10 ${label.cls === 'won' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : label.cls === 'placed' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : label.cls === 'nr' ? 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
          {label.text}
        </div>
      )}
      <div className='flex gap-6 items-start w-full overflow-hidden'>
        <div className='flex-1 min-w-0 overflow-hidden'>
          <div className='flex items-center gap-3 mb-3'>
            {isNap && (
              <span className='text-sm px-3 py-1.5 rounded-lg border-2 border-amber-500/40 bg-amber-500/20 text-amber-200 font-black tracking-wider'>NAP</span>
            )}
            {isBomb && (
              <span className='text-xs px-2 py-1 rounded-lg border border-red-500/20 bg-red-500/10 text-red-300 font-bold'>BOMB</span>
            )}
            <span className='text-zinc-500 text-sm font-bold'>#{rank}</span>
            {selection.probConfidence != null && selection.probConfidence > 0.6 ? (
              <span className='px-2 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-400'>HIGH</span>
            ) : selection.probConfidence != null && selection.probConfidence > 0.3 ? (
              <span className='px-2 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400'>MED</span>
            ) : (
              <span className='px-2 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-400'>LOW</span>
            )}
            {selection.fairOdds && (
              <span className='px-2 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-300'>{selection.fairOdds.toFixed(1)}</span>
            )}
            {selection.kellyStake != null && selection.kellyStake > 0 && (
              <span className='px-2 py-1 rounded-md text-xs font-medium bg-purple-500/10 text-purple-300'>K{selection.kellyStake.toFixed(2)}</span>
            )}
            <span className='text-zinc-500 text-xs'>{selection.offTime}</span>
          </div>
          <a
            href={getAtTheRacesHorseUrl(selection, selection.race)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${isNap ? 'text-3xl' : 'text-xl'} font-black hover:text-amber-300 transition truncate block w-full`}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse: selection.horse, course: selection.course, offTime: selection.race?.off_time } }))
            }}
          >
            {selection.horse}
          </a>
          <p className='text-zinc-400 text-sm mt-2'>
            <span className='font-medium'>{selection.course}</span>
            <span className='mx-2'>&middot;</span>
            <span className='truncate'>{selection.raceName}</span>
          </p>
          <div className='flex gap-2 mt-4 flex-wrap'>
            {selection.form && (
              <span className='px-2 py-1 bg-white/5 text-zinc-400 rounded-lg text-xs font-medium'>Form {selection.form}</span>
            )}
            {selection.odds != null && (
              <span className={`px-2 py-1 rounded-lg text-xs font-bold ${isNap ? 'bg-amber-500/15 text-amber-200' : 'bg-white/[0.06] text-white'}`}>{selection.odds}</span>
            )}
            {selection.draw && (
              <span className='px-2 py-1 bg-white/5 text-zinc-400 rounded-lg text-xs font-medium'>Draw {selection.draw}</span>
            )}
            {selection.valueEdge != null && selection.valueEdge > 0 ? (
              <span className={`px-2 py-1 rounded-lg text-xs font-medium ${isNap ? 'bg-green-500/15 text-green-300' : 'bg-green-500/10 text-green-400'}`}>+{(selection.valueEdge * 100).toFixed(1)}% edge</span>
            ) : selection.valueEdge != null && selection.valueEdge < 0 ? (
              <span className='px-2 py-1 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium'>{(selection.valueEdge * 100).toFixed(1)}% edge</span>
            ) : null}
            {selection.selectionQuality && (
              <span className={`px-2 py-1 rounded-lg text-xs font-medium ${selection.selectionQuality.grade === 'A+' || selection.selectionQuality.grade === 'A' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-zinc-400'}`}>
                {selection.selectionQuality.grade}
              </span>
            )}
          </div>
        </div>

        <div className='shrink-0 rounded-2xl flex items-center gap-3'>
          <div className={`${isNap ? 'w-32 h-32' : 'w-28 h-28'} rounded-2xl ${isNap ? 'bg-amber-500/10 border-amber-400' : 'bg-[#0a1a14] border-green-400'} border-2 flex flex-col items-center justify-center`}>
            <span className={`${isNap ? 'text-amber-300' : 'text-zinc-400'} text-xs font-medium uppercase tracking-wider`}>APEX</span>
            <strong className={`${isNap ? 'text-4xl text-amber-300' : 'text-3xl text-green-400'} font-black`}>{selection.score}</strong>
            <div className='flex gap-2 mt-1'>
              {selection.winProb != null && (
                <span className={`${isNap ? 'text-amber-300' : 'text-green-400'} text-xs font-medium`}>W:{(selection.winProb * 100).toFixed(1)}%</span>
              )}
              {selection.placeProb != null && (
                <span className={`${isNap ? 'text-amber-400' : 'text-blue-400'} text-xs font-medium`}>P:{(selection.placeProb * 100).toFixed(0)}%</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

interface DailyPick {
  horse: string
  course: string
  offTime: string
  raceName: string
  score: number
  winProb: number | null
  fairOdds: number | null
  probConfidence: number | null
  valueEdge: number
  kellyStake: number | null
  result: string | null
  position: number | null
}

interface DayStats {
  won: number
  placed: number
  lost: number
  nr: number
  pending: number
}

interface DailyPicksEntry {
  picks: DailyPick[]
  stats: DayStats
}

function Home() {
  const [dailyPicksDb, setDailyPicksDb] = useState<Record<string, DailyPicksEntry>>({})
  const [abandoned, setAbandoned] = useState<any[]>([])
  const {
    data: races = [],
    isLoading,
  } = useQuery<Race[]>({
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

  useEffect(() => {
    fetch('/api/live-state')
      .then((r) => r.json())
      .then((data) => setAbandoned(data.abandoned || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/live-state')
        .then((r) => r.json())
        .then((data) => setAbandoned(data.abandoned || []))
        .catch(() => {})
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Refetch daily picks every 60s to pick up matched results
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/daily-picks')
        .then((r) => r.json())
        .then(setDailyPicksDb)
        .catch(() => {})
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const ukNow = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
  const ukIreRaces = filterMinRunners(filterGBIRE(races))
  const allSelections = getHomeSelections(ukIreRaces)
  const bettable = allSelections
    .filter((s) => !s.noBet && (s.valueEdge || 0) > 0.03 && parseOddsToNum(s.odds) >= 2.0)
    .filter((s) => {
      if (!s.offTime) return true
      const raceTime = s.offTime.replace(':', '')
      const nowTime = ukNow.replace(':', '')
      return raceTime > nowTime
    })
  const core = bettable
    .filter((s) => parseOddsToNum(s.odds) < 10)
    .sort((a, b) => {
      const aVal = (a.valueEdge || 0) * (a.winProb || 0)
      const bVal = (b.valueEdge || 0) * (b.winProb || 0)
      const diff = bVal - aVal
      if (Math.abs(diff) > 0.001) return diff
      return (b.score || 0) - (a.score || 0)
    })
  const bombs = bettable.filter((s) => parseOddsToNum(s.odds) >= 10).sort((a, b) => (b.valueEdge || 0) - (a.valueEdge || 0))
  const bestBet = [...core, ...bombs].sort((a, b) => ((b.valueEdge || 0) * (b.winProb || 0)) - ((a.valueEdge || 0) * (a.winProb || 0)))[0]
  const sortedByTime = [...core, ...bombs].sort((a, b) => {
    const aTime = (a.offTime || '').replace(':', '')
    const bTime = (b.offTime || '').replace(':', '')
    return aTime.localeCompare(bTime)
  })
  // One pick per race — keep the best per course+offTime
  const seenRaces = new Set<string>()
  if (bestBet) seenRaces.add(`${bestBet.course}-${bestBet.offTime}`)
  const onePerRace = sortedByTime.filter((s) => {
    if (s === bestBet) return false
    const raceKey = `${s.course}-${s.offTime}`
    if (seenRaces.has(raceKey)) return false
    seenRaces.add(raceKey)
    return true
  })
  const picks = bestBet ? [bestBet, ...onePerRace] : onePerRace
  const picksKey = picks.map((p) => p.horse + p.course).join('|')
  const topScore = picks[0]?.score || bettable[0]?.score || allSelections[0]?.score || 0
  const totalRunners = countRunners(ukIreRaces)

  const noBetReason = picks.length === 0 && ukIreRaces.length > 0
    ? bettable.length === 0
      ? 'No bettable edges found today — probability estimates too low or market too efficient'
      : getNoBetReason(ukIreRaces)
    : null

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
  const overallRate = calculateStrikeRate(overallWins, overallTotal)

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
          winProb: p.winProb,
          fairOdds: p.fairOdds,
          probConfidence: p.probConfidence,
          odds: p.odds,
          form: p.form,
          draw: p.draw,
          valueEdge: p.valueEdge,
          kellyStake: p.kellyStake,
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
                winProb: p.winProb,
                fairOdds: p.fairOdds,
                probConfidence: p.probConfidence,
                odds: p.odds,
                form: p.form,
                draw: p.draw,
                valueEdge: p.valueEdge,
                kellyStake: p.kellyStake,
                result: null,
                position: null,
              })),
              stats: { won: 0, placed: 0, lost: 0, pending: picks.length, nr: 0 },
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
          {abandoned.length > 0 && (
            <div className='abandoned-alert bg-red-500/5 border border-red-500/20 rounded-xl p-4'>
              <div className='flex items-center gap-2 mb-2'>
                <span className='text-red-400 text-sm font-bold'>⚠ ABANDONED MEETINGS</span>
              </div>
              <div className='flex flex-wrap gap-2'>
                {abandoned.map((m) => (
                  <span key={m.slug} className='px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-sm font-medium'>
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}
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
              const isNapPick = bestBet && s.horse === bestBet.horse && s.course === bestBet.course
              const isBombPick = s.odds && parseOddsToNum(s.odds) >= 10
              if (isNapPick) {
                return <PickCard key={`${s.course}-${s.offTime}-${s.horse}`} selection={s} rank={i + 1} result={saved?.result || null} position={saved?.position || null} isNap isBomb={false} />
              }
              return (
                <PickCard
                  key={`${s.course}-${s.offTime}-${s.horse}`}
                  selection={s}
                  rank={i + 1}
                  result={saved?.result || null}
                  position={saved?.position || null}
                  isBomb={isBombPick}
                />
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

interface PlaceholderPageProps {
  title: string
}

function PlaceholderPage({ title }: PlaceholderPageProps) {
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
  const [activeTab, setActiveTab] = useState('Home')
  const [uploadedResults, setUploadedResults] = useState<any[]>([])
  const [selectedHorse, setSelectedHorse] = useState<any>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      setSelectedHorse((e as CustomEvent).detail)
      setActiveTab('Racecards')
    }
    window.addEventListener('select-horse', handler)
    return () => window.removeEventListener('select-horse', handler)
  }, [])

  useEffect(() => {
    async function loadSavedResults() {
      try {
        const response = await fetch('/api/results')
        const data = await response.json()
        if (Array.isArray(data)) {
          setUploadedResults(data)
        }
      } catch (error) {
        console.error('Failed to load saved results', error)
      }
    }

    loadSavedResults()
  }, [])

  const handleResultsLoaded = (results: any[], switchTab = true) => {
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
          <span className='text-zinc-500 text-xs uppercase tracking-wider'>APEX Racing</span>
          <strong className='text-zinc-400 text-sm'>v1.0.0</strong>
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
