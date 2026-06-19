import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'

import Racecards from './pages/Racecards'
import { ResultsList } from './pages/Results'
import { fetchRacecards } from './lib/racingApi'
import { formatOffTime } from './lib/formatTime'
import { filterGBIRE, filterMinRunners, countRunners, getGrade, gradeClass, resultLabel, getHomeSelections, getNoBetReason, calculateStrikeRate } from './lib/engine'
import type { Race, Runner } from './lib/types'
import { getAtTheRacesHorseUrl } from './lib/horseLinks'
import TrackDirectory from './pages/TrackDirectory'
import Proof from './pages/Proof'
import CalibrationDashboard from './components/CalibrationDashboard'
import OrPrGapAnalysis from './pages/OrPrGapAnalysis'

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
  'Evidence',
  'Calibration',
  'Rating Edge',
  'Tracks',
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
  personalAffinity?: { adjustment: number; factor: number; confidence: number; breakdown?: any } | null
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
  const isNR = result === 'nr'
  const label = resultLabel(result, position)
  const betType = selection.betType || null
  return (
    <article className={`apex-card ${isNap ? 'lg:col-span-2' : ''} ${isNap ? 'border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.15)]' : ''} p-6 ${isNap ? 'hover:border-amber-400/50' : ''} transition-all duration-300 relative overflow-hidden${label ? ' has-result' : ''}${isNR ? ' opacity-40' : ''}`}>
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
            <span className='text-zinc-500 text-sm font-bold'>#{rank}</span>
            {selection.probConfidence != null && selection.probConfidence > 0.6 ? (
              <span className='px-2 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-400'>HIGH</span>
            ) : selection.probConfidence != null && selection.probConfidence > 0.3 ? (
              <span className='px-2 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400'>MED</span>
            ) : (
              <span className='px-2 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-400'>LOW</span>
            )}
            <span className='text-zinc-500 text-xs'>{selection.offTime}</span>
            {selection.personalAffinity?.adjustment != null && (
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                selection.personalAffinity.adjustment > 0
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {selection.personalAffinity.adjustment > 0 ? '\u2713' : '\u2717'} PA {selection.personalAffinity.adjustment >= 5 ? 'Strong' : selection.personalAffinity.adjustment >= 2 ? 'Positive' : selection.personalAffinity.adjustment > 0 ? 'Weak' : 'Negative'}
              </span>
            )}
            <div className='ml-auto flex items-center gap-2'>
              {!label && betType === 'WIN' && (
                <span className='text-xs px-2 py-1 rounded-lg border border-green-500/30 bg-green-500/15 text-green-400 font-bold'>WIN</span>
              )}
              {!label && betType === 'PLACE' && (
                <span className='text-xs px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/15 text-amber-400 font-bold'>E/W</span>
              )}
              {!label && betType === 'SPEC' && (
                <span className='text-xs px-2 py-1 rounded-lg border border-zinc-500/30 bg-zinc-500/15 text-zinc-400 font-bold'>SPEC</span>
              )}
              {isBomb && (
                <span className='text-xs px-2 py-1 rounded-lg border border-red-500/20 bg-red-500/10 text-red-300 font-bold'>BOMB</span>
              )}
              {isNap && (
                <span className='text-sm px-3 py-1.5 rounded-lg border-2 border-amber-500/40 bg-amber-500/20 text-amber-200 font-black tracking-wider'>NAP</span>
              )}
            </div>
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
          
          {/* Essential metrics only */}
          <div className='flex gap-3 mt-4 flex-wrap items-center'>
            {selection.valueEdge != null && selection.valueEdge > 0 ? (
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${isNap ? 'bg-green-500/15 text-green-300' : 'bg-green-500/10 text-green-400'}`}>+{(selection.valueEdge * 100).toFixed(1)}% edge</span>
            ) : selection.valueEdge != null && selection.valueEdge < 0 ? (
              <span className='px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-sm font-bold'>{(selection.valueEdge * 100).toFixed(1)}% edge</span>
            ) : null}
            {selection.odds != null && (
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${isNap ? 'bg-amber-500/15 text-amber-200' : 'bg-white/[0.06] text-white'}`}>{selection.odds}</span>
            )}
            <span className='ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20'>
              <strong className='text-lg font-black text-amber-400 leading-none'>{selection.score}</strong>
              <span className='text-[10px] text-amber-400/70 uppercase tracking-wider'>APEX</span>
            </span>
          </div>

          {/* Model diagnostics */}
          <div className='flex gap-2 mt-2 flex-wrap items-center'>
            {selection.winProb != null && selection.winProb > 0 && (
              <span className='text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20'>Model {selection.winProb.toFixed(1)}%</span>
            )}
            {selection.odds != null && parseOddsToNum(selection.odds) > 0 && (
              <span className='text-[10px] px-2 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-white/5'>Mkt {(100 / parseOddsToNum(selection.odds)).toFixed(1)}%</span>
            )}
            {selection.personalAffinity?.adjustment != null && (
              <span className={`text-[10px] px-2 py-0.5 rounded border ${selection.personalAffinity.adjustment > 0 ? 'bg-green-500/10 text-green-400 border-green-500/20' : selection.personalAffinity.adjustment < -0.5 ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-zinc-500/10 text-zinc-400 border-white/5'}`}>
                PA {selection.personalAffinity.adjustment > 0 ? '+' : ''}{selection.personalAffinity.adjustment.toFixed(1)}
              </span>
            )}
            {(selection as any).betQuality && (
              <span className={`text-[10px] px-2 py-0.5 rounded border ${
                (selection as any).betQuality === 'STRONG VALUE' ? 'bg-green-500/15 text-green-300 border-green-500/30' :
                (selection as any).betQuality === 'VALUE' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                (selection as any).betQuality === 'PLAYABLE' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                (selection as any).betQuality === 'SPECULATIVE' ? 'bg-zinc-500/10 text-zinc-400 border-white/5' :
                (selection as any).betQuality === 'BORDERLINE' ? 'bg-amber-500/10 text-amber-400/70 border-amber-500/10' :
                (selection as any).betQuality === 'WEAK_COMPAT' ? 'bg-zinc-500/10 text-zinc-500 border-white/5' :
                'bg-red-500/10 text-red-400/70 border-red-500/10'
              }`}>{(selection as any).betQuality}</span>
            )}
          </div>

          {/* Pace Shape summary */}
          {(() => {
            const rs = selection.race?.raceShape
            const pm = selection.race?.paceMap
            if (!rs && !pm) return null
            const leaders = rs?.leaders ?? pm?.frontRunners ?? 0
            const tempo = rs?.tempo || pm?.projectedTempo || '—'
            const shape = rs?.shape || ''
            const advantaged = rs?.beneficiaries?.slice(0, 3) || []
            const disadvantaged = rs?.disadvantaged?.slice(0, 3) || []
            if (!shape && leaders === 0) return null
            const tempoColor = tempo === 'FAST' ? 'text-red-400' : tempo === 'SLOW' ? 'text-blue-400' : 'text-amber-400'
            return (
              <div className='mt-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5'>
                <div className='text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1'>Pace Shape</div>
                <div className='flex items-center gap-3 text-[11px]'>
                  <span className='text-zinc-400'>Leaders: <span className='text-zinc-200 font-bold'>{leaders}</span></span>
                  <span className='text-zinc-400'>Tempo: <span className={`font-bold ${tempoColor}`}>{tempo}</span></span>
                  {shape && <span className='text-zinc-500'>· {shape}</span>}
                </div>
                {(advantaged.length > 0 || disadvantaged.length > 0) && (
                  <div className='flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px]'>
                    {advantaged.slice(0, 2).map((b: any, i: number) => (
                      <span key={i} className='text-green-400'>✓ {b.reason?.split(' ')[0] || 'Advantaged'}</span>
                    ))}
                    {disadvantaged.slice(0, 2).map((d: any, i: number) => (
                      <span key={i} className='text-red-400'>✗ {d.reason?.split(' ')[0] || 'Disadvantaged'}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* View Analysis button */}
          <button
            className='mt-4 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition text-zinc-400 hover:text-white'
            onClick={() => {
              window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse: selection.horse, course: selection.course, offTime: selection.race?.off_time } }))
            }}
          >
            View Analysis
          </button>
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
  betType: string | null
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
  const [pickView, setPickView] = useState<'saved' | 'live'>('live')
  const [abandoned, setAbandoned] = useState<any[]>([])
  const [livePicksStats, setLivePicksStats] = useState<{ stats: { won: number; placed: number; lost: number; nr: number; pending: number }; roi: number } | null>(null)
  const [homeWidgets, setHomeWidgets] = useState<any>(null)
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

  useEffect(() => {
    const fetchStats = () => {
      fetch('/api/live-picks/stats')
        .then(r => r.json())
        .then(setLivePicksStats)
        .catch(() => {})
    }
    fetchStats()
    const interval = setInterval(fetchStats, 60000)
    return () => clearInterval(interval)
  }, [])
  useEffect(() => {
    fetch('/api/home-widgets')
      .then(r => r.json())
      .then(setHomeWidgets)
      .catch(() => {})
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const todaySaved = dailyPicksDb[today]
  const ukNow = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
  const ukIreRaces = filterMinRunners(filterGBIRE(races))
  const allSelections = getHomeSelections(ukIreRaces)

  // Comprehensive diagnostics — always log when we have data
  if (allSelections.length > 0) {
    // Score distribution
    const scores = allSelections.map((s: any) => s.score || 0).filter((s: number) => s > 0)
    if (scores.length > 0) {
      console.log('[SCORE DIST]', {
        min: Math.min(...scores),
        max: Math.max(...scores),
        avg: Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length),
        count: scores.length,
        total: allSelections.length,
      })
    }

    // Filter breakdown
    const reasons: Record<string, number> = { PASS: 0 }
    allSelections.forEach((s: any) => {
      let r = 'PASS'
      if (s.noBet) r = '1_noBet'
      else if ((s.valueEdge || 0) <= 0.03) r = `2_valueEdge<=3%`
      else if (parseOddsToNum(s.odds) < 2.0) r = '3_odds<2'
      else if ((s.winProb || 0) < 0.10) r = `4_winProb<10%`
      else {
        const apexScore = s.score || 0
        if (apexScore > 0 && apexScore < 40) r = `5_APEX ${apexScore}<40`
        else if (apexScore >= 40 && apexScore < 60) {
          const pa = (s as any).personalAffinity?.adjustment ?? 0
          const edge = s.valueEdge || 0
          if (pa <= 3 && edge <= 0.20) r = `5_APEX ${apexScore}<60 (no override)`
        }
      }
      reasons[r] = (reasons[r] || 0) + 1
    })
    console.log('[APEX FILTER DIAGNOSTICS]', JSON.stringify(reasons, null, 2))

    // Top 20 that PASS all filters — ranked by WinnerScore
    const passing = allSelections.filter((s: any) => {
      if (s.noBet) return false
      const bq = s.betQuality || ''
      if (bq === 'NO BET') return false
      if (bq === 'WEAK_COMPAT') return false
      if ((s.valueEdge || 0) <= 0.03) return false
      if (parseOddsToNum(s.odds) < 2.0) return false
      if ((s.winProb || 0) < 0.10) return false
      const apexScore = s.score || 0
      if (apexScore === 0) return true
      if (apexScore >= 60) return true
      if (apexScore < 40) return false
      const pa = (s as any).personalAffinity?.adjustment ?? 0
      const edge = s.valueEdge || 0
      const wp = s.winProb || 0
      return pa > 2.5 || edge > 0.20 || (wp > 0.30 && pa > 1)
    })
    console.table('[TOP 20 PASS]', passing.slice(0, 20).map((s: any) => ({
      horse: s.horse,
      score: s.score,
      valueEdge: (s.valueEdge || 0).toFixed(3),
      winProb: ((s.winProb || 0) * 100).toFixed(1) + '%',
      odds: s.odds,
      race: s.course + ' ' + s.offTime,
    })))

    // Top 20 that FAIL — showing which gate killed them
    const failing = allSelections.filter((s: any) => {
      if (s.noBet) return true
      const bq = (s as any).betQuality || ''
      if (bq === 'NO BET') return true
      if (bq === 'WEAK_COMPAT') return true
      if ((s.valueEdge || 0) <= 0.03) return true
      if (parseOddsToNum(s.odds) < 2.0) return true
      if ((s.winProb || 0) < 0.10) return true
      const apexScore = s.score || 0
      if (apexScore > 0) {
        if (apexScore < 40) return true
        if (apexScore >= 40 && apexScore < 60) {
          const pa = (s as any).personalAffinity?.adjustment ?? 0
          const edge = s.valueEdge || 0
          const wp = s.winProb || 0
          if (pa <= 2.5 && edge <= 0.20 && !(wp > 0.30 && pa > 1)) return true
        }
      }
      return false
    }).sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
    console.table('[TOP 20 FAIL]', failing.slice(0, 20).map((s: any) => ({
      horse: s.horse,
      score: s.score,
      valueEdge: (s.valueEdge || 0).toFixed(3),
      winProb: ((s.winProb || 0) * 100).toFixed(1) + '%',
      odds: s.odds,
      failValue: (s.valueEdge || 0) <= 0.03,
      failProb: (s.winProb || 0) < 0.10,
      failScore: (s.score || 0) > 0 && (s.score || 0) < ((s.previous_results || []).length < 5 ? 50 : 40),
      failNoBet: s.noBet,
    })))
  }

  const bettable = allSelections
    .filter((s) => {
      if (s.noBet) return false
      const bq = (s as any).betQuality || ''
      if (bq === 'NO BET') return false
      if (bq === 'WEAK_COMPAT') return false
      if (parseOddsToNum(s.odds) < 1.5) return false
      const apexScore = s.score || 0
      if (apexScore === 0) return true
      if (apexScore >= 60) return true
      if (apexScore < 40) return false
      const pa = (s as any).personalAffinity?.adjustment ?? 0
      const edge = s.valueEdge || 0
      const wp = s.winProb || 0
      return pa > 2.5 || edge > 0.20 || (wp > 0.30 && pa > 1)
    })
  const upcoming = bettable
    .filter((s) => {
      if (!s.offTime) return true
      const raceTime = s.offTime.replace(':', '')
      const nowTime = ukNow.replace(':', '')
      return raceTime > nowTime
    })
  const expectedValue = (s: any) => (s.winProb || 0) * (parseOddsToNum(s.odds) || 0) - 1
  const sortedByScore = [...bettable].sort((a, b) => (b.score || 0) - (a.score || 0))
  const bestBet = sortedByScore[0]
  const sortedByTime = [...sortedByScore].sort((a, b) => {
    const aTime = (a.offTime || '').replace(':', '')
    const bTime = (b.offTime || '').replace(':', '')
    return aTime.localeCompare(bTime)
  })
  // One pick per race — keep the best per course+offTime, max 5 total
  const seenRaces = new Set<string>()
  if (bestBet) seenRaces.add(`${bestBet.course}-${bestBet.offTime}`)
  const onePerRace = sortedByTime.filter((s) => {
    if (s === bestBet) return false
    const raceKey = `${s.course}-${s.offTime}`
    if (seenRaces.has(raceKey)) return false
    seenRaces.add(raceKey)
    return true
  })
  const allPicks = bestBet ? [bestBet, ...onePerRace].slice(0, 15) : onePerRace.slice(0, 15)

  // Upcoming picks for live display only
  const upcomingSortedByScore = [...upcoming].sort((a, b) => (b.score || 0) - (a.score || 0))
  const upcomingBest = upcomingSortedByScore[0]
  const upcomingSorted = [...upcomingSortedByScore].sort((a, b) => {
    const aTime = (a.offTime || '').replace(':', '')
    const bTime = (b.offTime || '').replace(':', '')
    return aTime.localeCompare(bTime)
  })
  const seenUpcoming = new Set<string>()
  if (upcomingBest) seenUpcoming.add(`${upcomingBest.course}-${upcomingBest.offTime}`)
  const upcomingOnePerRace = upcomingSorted.filter((s) => {
    if (s === upcomingBest) return false
    const raceKey = `${s.course}-${s.offTime}`
    if (seenUpcoming.has(raceKey)) return false
    seenUpcoming.add(raceKey)
    return true
  })
  const picksLive = upcomingBest ? [upcomingBest, ...upcomingOnePerRace].slice(0, 15) : upcomingOnePerRace.slice(0, 15)

  // Log ALL live picks to server for honest performance tracking (not just upcoming)
  const allLivePicksKey = allPicks.map(p => p.horse + p.course).join('|')
  useEffect(() => {
    if (allPicks.length === 0) return
    const dateStr = new Date().toISOString().split('T')[0]
    fetch('/api/live-picks/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: dateStr,
        picks: allPicks.map(p => ({
          horse: p.horse,
          course: p.course,
          offTime: p.offTime,
          odds: parseOddsToNum(p.odds),
          score: p.score,
        })),
      }),
    }).catch(() => {})
  }, [allLivePicksKey])
  // Freeze picks from saved DB when available — match to live data for display
  const picks = todaySaved?.picks?.length
    ? todaySaved.picks
        .map((savedPick: any) => {
          const liveMatch = allSelections.find((s: any) => s.horse === savedPick.horse && s.course === savedPick.course)
          return liveMatch || { ...savedPick, race: null }
        })
        .slice(0, 15)
    : picksLive
  console.log('[FINAL PICKS]', picks.length, picks.map((p: any) => `${p.horse} (${p.course} ${p.offTime}) score=${p.score} ev=${((p.winProb || 0) * (parseOddsToNum(p.odds) || 0) - 1).toFixed(2)}`))
  const picksKey = allPicks.map((p) => p.horse + p.course).join('|')
  const topScore = allPicks[0]?.score || bettable[0]?.score || allSelections[0]?.score || 0
  const totalRunners = countRunners(ukIreRaces)

  // View toggle: saved vs live picks
  const hasSavedPicks = (todaySaved?.picks?.length || 0) > 0
  const displayPicks = pickView === 'live' || !hasSavedPicks ? picksLive : picks
  const liveBestBet = picksLive[0] || null
  const displayBestBet = pickView === 'live' || !hasSavedPicks ? liveBestBet : bestBet

  // Next race off
  const nextRace = useMemo(() => {
    const now = new Date()
    const ukOffset = 60 * 60 * 1000
    const ukNow = new Date(now.getTime() + ukOffset + (now.getTimezoneOffset() * 60 * 1000))
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
    const nowTime = hhmm(ukNow)
    const upcoming = (races || [])
      .filter((r: any) => {
        if (!r.off_time) return false
        const t = formatOffTime(r).replace(':', '')
        return t > nowTime
      })
      .sort((a: any, b: any) => formatOffTime(a).localeCompare(formatOffTime(b)))
    if (upcoming.length === 0) return null
    const r = upcoming[0]
    const sorted = [...(r.runners || [])].sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
    return {
      offTime: formatOffTime(r),
      course: r.course,
      raceName: r.race_name || '',
      topHorse: sorted[0]?.horse || '',
    }
  }, [races])

  const noBetReason = allPicks.length === 0 && ukIreRaces.length > 0
    ? bettable.length === 0
      ? 'No bettable edges found today — probability estimates too low or market too efficient'
      : getNoBetReason(ukIreRaces)
    : null

  const todayResults = todaySaved?.picks || []
  const todayStats = todaySaved?.stats || null

  // Top horse per race from ALL selections (regardless of bettable filter)
  // Used as fallback in full card so every race shows a pick
  const topPerRace = useMemo(() => {
    const map = new Map<string, any>()
    for (const s of allSelections) {
      const key = `${s.course}|${s.offTime}`
      if (!map.has(key)) map.set(key, s)
    }
    return map
  }, [allSelections])

  // All races card — every race, picks highlighted
  // Use saved picks when available (frozen), fall back to live
  const allRacesCard = useMemo(() => {
    const pickSource = pickView === 'live' || !todaySaved?.picks?.length ? allPicks : todaySaved.picks
    const pickByRace = new Map<string, any>()
    for (const p of pickSource) {
      const key = `${p.course}|${p.offTime}`
      if (!pickByRace.has(key)) pickByRace.set(key, p)
    }
    return (races || [])
      .filter(r => (r.runners || []).length >= 2)
      .map(r => {
        const offTime = formatOffTime(r)
        const pickKey = `${r.course}|${offTime}`
        const pick = pickByRace.get(pickKey) || topPerRace.get(pickKey)
        const fieldSize = r.runners?.length || 0
        const placed = fieldSize >= 16 ? 4 : fieldSize >= 8 ? 3 : fieldSize >= 5 ? 2 : 1
        const pos = pick?.position || r.runners?.find((run: any) => run.horse === pick?.horse)?.position || null
        const result = pick?.result ?? (pos === 1 ? 'won' : pos > 0 && pos <= placed ? 'placed' : pos > placed ? 'lost' : null)
        const movement = pick?.marketMovement || null
        const winner = !pick ? (r.runners || []).find((run: any) => run.position === 1) : null
        return {
          course: r.course,
          offTime,
          raceName: r.race_name || '',
          horse: pick?.horse || winner?.horse || '—',
          score: pick?.score || winner?.score || 0,
          winProb: (pick?.winProb || 0) * 100,
          odds: pick?.odds || winner?.odds || 0,
          going: r.going || '',
          isPick: !!pick,
          isWinner: !!winner,
          result,
          position: pos,
          movement,
        }
      })
      .sort((a, b) => (a.offTime || '').localeCompare(b.offTime || ''))
  }, [races, allPicks, todaySaved, pickView])

  const liveStats = useMemo(() => {
    let won = 0, placed = 0, lost = 0, pending = 0
    for (const r of allRacesCard) {
      if (r.result === 'won') won++
      else if (r.result === 'placed') placed++
      else if (r.result === 'lost') lost++
      else pending++
    }
    return { won, placed, lost, pending }
  }, [allRacesCard])

  const pastDays = Object.entries(dailyPicksDb)
    .filter(([date]) => date < today)
    .sort(([a], [b]) => b.localeCompare(a))

  const overallWins = pastDays.reduce((s, [, d]) => s + (d.stats?.won || 0), 0)
  const overallPlaced = pastDays.reduce((s, [, d]) => s + (d.stats?.placed || 0), 0)
  const overallLosses = pastDays.reduce((s, [, d]) => s + (d.stats?.lost || 0), 0)
  const overallTotal = overallWins + overallPlaced + overallLosses
  const overallRate = calculateStrikeRate(overallWins, overallTotal)

  useEffect(() => {
    if (allPicks.length === 0) return
    if (todaySaved) return

    fetch('/api/daily-picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: today,
        picks: allPicks.map((p) => ({
          horse: p.horse,
          course: p.course,
          offTime: p.offTime,
          raceName: p.raceName,
          score: p.score,
          grade: p.selectionQuality?.grade || '',
          winProb: p.winProb,
          fairOdds: p.fairOdds,
          probConfidence: p.probConfidence,
          odds: p.odds,
          form: p.form,
          draw: p.draw,
          going: p.going || '',
          fieldSize: p.fieldSize || 0,
          valueEdge: p.valueEdge,
          kellyStake: p.kellyStake,
          betType: p.betType,
          or: p.or,
          rpr: p.rpr,
          performanceRating: p.performanceRating,
          marketMovement: p.marketMovement || null,
        })),
      }),
    })
      .then((r) => r.json())
      .then((result) => {
        if (result.saved) {
          setDailyPicksDb((prev) => ({
            ...prev,
            [today]: {
              picks: allPicks.map((p) => ({
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
                going: p.going || '',
                fieldSize: p.fieldSize || 0,
                valueEdge: p.valueEdge,
                kellyStake: p.kellyStake,
                betType: p.betType,
                or: p.or,
                rpr: p.rpr,
                performanceRating: p.performanceRating,
                result: null,
                position: null,
              })),
              stats: { won: 0, placed: 0, lost: 0, pending: allPicks.length, nr: 0 },
            },
          }))
        }
      })
      .catch(() => {})
  }, [picksKey, today])

  return (
    <div className='dashboard-page max-w-7xl mx-auto'>
      <section className='dashboard-hero' style={{ padding: '24px 32px' }}>
        <div className='flex items-center justify-between gap-8'>
          <div>
            <span className='text-amber-400 text-xs font-bold uppercase tracking-[0.3em]'>APEX Live</span>
            <h1 className='text-4xl font-black tracking-tight mt-2'>Today's Picks</h1>
          </div>
          
          <div className='flex items-center gap-6'>
            <div className='text-center'>
              <div className='text-3xl font-bold text-amber-400'>{ukIreRaces.length}</div>
              <div className='text-xs text-zinc-400 uppercase tracking-wider'>Races</div>
            </div>
            <div className='text-center'>
              <div className='text-3xl font-bold text-amber-400'>{totalRunners}</div>
              <div className='text-xs text-zinc-400 uppercase tracking-wider'>Runners</div>
            </div>
            <div className='text-center'>
              <div className='text-3xl font-bold text-amber-400'>{topScore || '--'}</div>
              <div className='text-xs text-zinc-400 uppercase tracking-wider'>Top Score</div>
            </div>
            <div className='text-center'>
              <div className='text-3xl font-bold text-amber-400'>{allPicks.length}</div>
              <div className='text-xs text-zinc-400 uppercase tracking-wider'>Picks</div>
            </div>
            {nextRace && (
              <div className='text-center pl-6 border-l border-white/10'>
                <div className='text-3xl font-bold text-amber-400'>{nextRace.offTime}</div>
                <div className='text-xs text-zinc-400 uppercase tracking-wider'>Next Off</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Top Pick Hero */}
      {displayBestBet && (
        <section className='relative overflow-hidden bg-gradient-to-r from-[#1a1f2e] to-[#0f1720] border border-amber-500/20 rounded-2xl p-8 mb-6'>
          <div className='absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2' />
          <div className='flex items-center justify-between relative z-10'>
            <div className='flex-1'>
              <div className='flex items-center gap-3 mb-3'>
                <span className='text-lg font-black uppercase tracking-wider px-3 py-1 rounded-lg' style={{ backgroundColor: '#d97706', color: '#fff' }}>NAP</span>
                {hasSavedPicks && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${pickView === 'live' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {pickView === 'live' ? 'Live' : 'Frozen'}
                  </span>
                )}
              </div>
              <h2 className='text-5xl font-black text-amber-400 mb-2 drop-shadow-[0_0_16px_rgba(251,191,36,0.3)]'>{displayBestBet.horse}</h2>
              <div className='flex items-center gap-2 text-sm text-zinc-400 flex-wrap'>
                <span className='text-zinc-300 font-medium'>{displayBestBet.course}</span>
                <span className='text-zinc-600'>·</span>
                <span>{displayBestBet.offTime}</span>
                <span className='text-zinc-600'>·</span>
                <span className='text-zinc-500 truncate max-w-[400px]'>{displayBestBet.raceName}</span>
              </div>
            </div>
            <div className='flex items-center gap-6'>
              <div className='text-center'>
                <div className='relative w-24 h-24 flex items-center justify-center'>
                  <svg className='absolute inset-0 w-full h-full -rotate-90' viewBox='0 0 100 100'>
                    <circle cx='50' cy='50' r='42' fill='none' stroke='rgba(251,191,36,0.1)' strokeWidth='6' />
                    <circle cx='50' cy='50' r='42' fill='none' stroke='#fbbf24' strokeWidth='6'
                      strokeDasharray={`${Math.min(displayBestBet.score || 0, 100) * 2.64} 264`}
                      strokeLinecap='round' />
                  </svg>
                  <div className='text-center'>
                    <div className='text-3xl font-black text-amber-400'>{displayBestBet.score}</div>
                    <div className='text-[10px] text-zinc-500 uppercase tracking-wider'>APEX</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {isLoading ? (
        <div className='loading-card bg-white/[0.02] rounded-2xl border border-white/5 p-12 flex items-center gap-4'>
          <div className='pulse-dot' />
          <span className='text-zinc-400'>Finding the strongest system picks...</span>
        </div>
      ) : picks.length === 0 && todayResults.length === 0 && allPicks.length === 0 ? (
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
          {hasSavedPicks && (
            <div className='flex gap-2 items-center mb-2'>
              <button type='button' onClick={() => setPickView('saved')}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${pickView === 'saved' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/[0.03] text-zinc-500 border border-white/5 hover:text-zinc-300'}`}>
                Frozen Picks
              </button>
              <button type='button' onClick={() => setPickView('live')}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${pickView === 'live' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/[0.03] text-zinc-500 border border-white/5 hover:text-zinc-300'}`}>
                Live Picks
              </button>
              {pickView === 'live' && (
                <span className='text-[10px] text-zinc-500 ml-1'>Best 10-15 min before off</span>
              )}
            </div>
          )}
          {todayStats && (
            <div className='flex items-center gap-6 mb-4 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5'>
              <div className='flex items-center gap-2'>
                <span className='text-[10px] text-zinc-500 uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20'>Frozen</span>
                <span className='text-sm font-bold text-green-400'>{todayStats.won}W</span>
                <span className='text-zinc-600'>/</span>
                <span className='text-sm font-bold text-amber-400'>{todayStats.placed}P</span>
                <span className='text-zinc-600'>/</span>
                <span className='text-sm font-bold text-red-400'>{todayStats.lost}L</span>
                {todayStats.pending > 0 && (
                  <>
                    <span className='text-zinc-600'>/</span>
                    <span className='text-sm font-bold text-zinc-400'>{todayStats.pending} pending</span>
                  </>
                )}
              </div>
              {livePicksStats && (
                <div className='flex items-center gap-2 pl-4 border-l border-white/5'>
                  <span className='text-[10px] text-zinc-500 uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20'>Live</span>
                  <span className='text-sm font-bold text-green-400'>{livePicksStats.stats.won}W</span>
                  <span className='text-zinc-600'>/</span>
                  <span className='text-sm font-bold text-amber-400'>{livePicksStats.stats.placed}P</span>
                  <span className='text-zinc-600'>/</span>
                  <span className='text-sm font-bold text-red-400'>{livePicksStats.stats.lost}L</span>
                  {livePicksStats.roi !== 0 && (
                    <span className={`text-xs font-bold ${livePicksStats.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {livePicksStats.roi > 0 ? '+' : ''}{livePicksStats.roi}%
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {homeWidgets && (
            <div className='grid grid-cols-1 md:grid-cols-3 gap-3 bg-black/40 border border-white/10 rounded-xl p-3 mb-4'>
              {/* PA COVERAGE */}
              <div className='border-r border-white/10 pr-3'>
                <div className='text-[10px] text-zinc-400 uppercase tracking-wider'>PA Coverage</div>
                {homeWidgets.paCoverage.total > 0 ? (
                  <>
                    <div className='mt-1.5 text-2xl font-semibold text-white'>{homeWidgets.paCoverage.coveragePct}%</div>
                    <div className='text-[11px] text-zinc-400 mt-0.5'>{homeWidgets.paCoverage.withPA.toLocaleString()} / {homeWidgets.paCoverage.total.toLocaleString()} results</div>
                    <div className='flex gap-3 mt-1.5 text-[11px]'>
                      <span className='text-emerald-400'>+{homeWidgets.paCoverage.paPositive}</span>
                      <span className='text-red-400'>-{homeWidgets.paCoverage.paNegative}</span>
                    </div>
                  </>
                ) : (
                  <div className='text-xs text-zinc-500 mt-2'>No calibration data</div>
                )}
              </div>
              {/* PA SIGNAL */}
              <div className='border-r border-white/10 px-3'>
                <div className='text-[10px] text-zinc-400 uppercase tracking-wider'>PA Signal</div>
                {homeWidgets.paCoverage.withPA > 0 ? (
                  <div className='mt-1.5 space-y-0.5 text-[11px]'>
                    {homeWidgets.paSignal.map((band: any) => (
                      <div key={band.label} className='flex justify-between'>
                        <span className={
                          band.label.includes('Strong') ? 'text-emerald-400' :
                          band.label.includes('Positive') ? 'text-green-400' :
                          band.label.includes('Weak') ? 'text-yellow-400' : 'text-red-400'
                        }>{band.label.split('(')[0].trim()}</span>
                        <span className='text-zinc-300'>{band.total} | {band.wr}% | {band.roiPct}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className='text-xs text-zinc-500 mt-2'>PA not stored historically</div>
                )}
              </div>
              {/* CALIBRATION */}
              <div className='pl-3'>
                <div className='text-[10px] text-zinc-400 uppercase tracking-wider'>Calibration (90d)</div>
                <div className='mt-1.5 space-y-0.5 text-[11px]'>
                  {homeWidgets.cal90.filter((band: any) => band.n > 0).map((band: any) => {
                    const err = Number(band.error)
                    return (
                      <div key={band.label} className='flex justify-between'>
                        <span className='text-zinc-300'>{band.label}</span>
                        <span className={
                          Math.abs(err) < 3 ? 'text-emerald-400' :
                          Math.abs(err) < 6 ? 'text-yellow-400' : 'text-red-400'
                        }>{band.n} | {band.actualWR}% | {err}pp</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          <div className='home-picks-grid grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {displayPicks.map((s, i) => {
              const saved = todayResults.find(
                (r: any) => r.horse === s.horse && r.course === s.course
              )
              const isNapPick = i === 0
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
          {allRacesCard.length > 0 && (
            <div className='w-full rounded-xl border border-slate-800 bg-[#0f1720]/80 p-4 overflow-x-auto'>
              <div className='mb-3 border-b border-slate-800 pb-3'>
                <h3 className='text-sm font-bold text-slate-400 uppercase tracking-wider'>Today&apos;s Full Card</h3>
              </div>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800/50'>
                    <th className='text-left py-2 px-3 w-[70px]'>Time</th>
                    <th className='text-left py-2 px-3 w-[140px]'>Track</th>
                    <th className='text-left py-2 px-3 w-[200px]'>Selection</th>
                    <th className='text-left py-2 px-3'>Going</th>
                    <th className='text-center py-2 px-3 w-[70px]'>Score</th>
                    <th className='text-center py-2 px-3 w-[50px]'>WP%</th>
                    <th className='text-right py-2 px-3 w-[70px]'>Odds</th>
                    <th className='text-right py-2 px-3 w-[50px]'>Res</th>
                  </tr>
                </thead>
                <tbody>
                  {allRacesCard.map((r, i) => {
                    const resultBadge = r.result === 'won' ? 'W' : r.result === 'placed' ? 'P' : r.result === 'lost' ? 'L' : r.result === 'nr' ? 'NR' : '-'
                    const badgeBg = r.result === 'won' ? 'bg-green-500/20 text-green-400' : r.result === 'placed' ? 'bg-amber-500/20 text-amber-400' : r.result === 'lost' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-500/10 text-zinc-500'
                    const hasSelection = !!r.horse && r.horse !== '—' && r.horse !== ''
                    return (
                      <tr key={i} className={`border-b border-slate-800/30 ${
                        r.isPick ? 'bg-amber-500/5' : r.isWinner ? 'bg-green-500/5' : 'opacity-50'
                      }`}>
                        <td className='py-2 px-3 font-mono text-xs text-slate-300'>{r.offTime}</td>
                        <td className='py-2 px-3 font-semibold text-xs text-slate-200 truncate'>{r.course}</td>
                        <td className='py-2 px-3'>
                          {r.isPick ? (
                            <span className='font-bold text-amber-400 text-xs tracking-wide'>{r.horse}</span>
                          ) : r.isWinner ? (
                            <span className='font-bold text-green-400 text-xs tracking-wide'>{r.horse}</span>
                          ) : (
                            <span className='text-slate-600'>—</span>
                          )}
                        </td>
                        <td className='py-2 px-3 text-xs text-slate-400 truncate'>{r.going || '—'}</td>
                        <td className='py-2 px-3 text-center font-mono text-xs font-bold text-slate-300'>
                          {hasSelection && r.score ? r.score : <span className='text-slate-700'>—</span>}
                        </td>
                        <td className='py-2 px-3 text-center font-mono text-[10px] text-slate-400'>
                          {hasSelection && r.winProb > 0 ? `${r.winProb.toFixed(1)}%` : <span className='text-slate-700'>—</span>}
                        </td>
                        <td className='py-2 px-3 text-right font-mono text-xs font-bold text-slate-300'>
                          {hasSelection && r.odds > 0 ? (
                            <span className='inline-flex items-center gap-1'>
                              {r.odds}
                              {r.movement?.movement?.includes('STEAMER') && (
                                <span className='text-[10px]' style={{ color: '#4ade80' }} title={`Steamed ${Math.abs(r.movement.delta).toFixed(1)}`}>&#9660;</span>
                              )}
                              {r.movement?.movement?.includes('DRIFTER') && (
                                <span className='text-[10px]' style={{ color: '#f87171' }} title={`Drifted ${Math.abs(r.movement.delta).toFixed(1)}`}>&#9650;</span>
                              )}
                            </span>
                          ) : (
                            <span className='text-slate-700'>—</span>
                          )}
                        </td>
                        <td className='py-2 px-3 text-right'>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeBg}`}>{resultBadge}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
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
  const [carouselIndex, setCarouselIndex] = useState(0)

  useEffect(() => {
    const handler = (e: Event) => {
      setSelectedHorse((e as CustomEvent).detail)
      setActiveTab('Racecards')
    }
    window.addEventListener('select-horse', handler)
    return () => window.removeEventListener('select-horse', handler)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setCarouselIndex(i => (i + 1) % 3), 4000)
    return () => clearInterval(timer)
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
      return <Racecards key={selectedHorse?.horse + selectedHorse?.course} selectHorse={selectedHorse} />
    }

    if (activeTab === 'Results') {
      return <ResultsList results={uploadedResults} />
    }

    if (activeTab === 'Home') {
      return <Home />
    }

    if (activeTab === 'Calibration') {
      return <CalibrationDashboard />
    }

    if (activeTab === 'Rating Edge') {
      return <OrPrGapAnalysis />
    }

    if (activeTab === 'Tracks') {
      return <TrackDirectory />
    }

    if (activeTab === 'Evidence') {
      return <Proof />
    }
  }

  return (
    <div className='layout bg-gradient-to-br from-[#071018] to-[#0b1220]'>
      <aside className='sidebar'>
        <div className='brand'>
          <div className='brand-mark'>A</div>

          <div>
            <h1>APEX</h1>
            <p>Racing Intelligence</p>
          </div>
        </div>

        <nav>
          <div className='mb-6'>
            <div className='text-xs text-zinc-500 uppercase tracking-[0.2em] mb-3 px-4'>Main</div>
            <div className='space-y-1'>
              {['Home', 'Racecards', 'Results'].map((tab) => (
                <button
                  key={tab}
                  type='button'
                  className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left ${
                    activeTab === tab
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-zinc-400 hover:bg-white/[0.03] hover:text-white border border-transparent'
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className='mb-6'>
            <div className='text-xs text-zinc-500 uppercase tracking-[0.2em] mb-3 px-4'>Tools</div>
            <div className='space-y-1'>
              {['Evidence', 'Rating Edge', 'Tracks'].map((tab) => (
                <button
                  key={tab}
                  type='button'
                  className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left ${
                    activeTab === tab
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-zinc-400 hover:bg-white/[0.03] hover:text-white border border-transparent'
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className='text-xs text-zinc-500 uppercase tracking-[0.2em] mb-3 px-4'>System</div>
            <div className='space-y-1'>
              {['Calibration'].map((tab) => (
                <button
                  key={tab}
                  type='button'
                  className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left ${
                    activeTab === tab
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-zinc-400 hover:bg-white/[0.03] hover:text-white border border-transparent'
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </nav>

        <div className='sidebar-panel bg-white/[0.02] rounded-xl p-4 border border-white/5 mt-auto'>
          <span className='text-zinc-500 text-xs uppercase tracking-wider'>APEX Racing</span>
          <strong className='text-zinc-400 text-sm'>v1.1.0</strong>
        </div>

        <div className='sidebar-carousel'>
          {[1, 2, 3].map(n => (
            <img
              key={n}
              src={`/images/horse-race-${n}.jpg`}
              alt=''
              className={n === carouselIndex ? 'active' : ''}
            />
          ))}
        </div>
      </aside>

      <main className='main'>
        <section className='dashboard-hero mb-6'>
          <img src='/images/racecourse-grandstand.jpg' alt='' className='dashboard-hero-img' />
          <div className='dashboard-hero-gradient' />
          <div className='dashboard-hero-glow' />
          <div className='dashboard-hero-content'>
            <div>
              <span className='text-amber-400 text-xs font-bold uppercase tracking-[0.3em]'>APEX Live</span>
              <h1 className='text-4xl font-black tracking-tight mt-2'>{activeTab}</h1>
            </div>
          </div>
        </section>
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
