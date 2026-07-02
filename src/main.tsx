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
import { fetchLiveState } from './lib/racingApi'
import type { LiveState } from './lib/racingApi'
import { formatOffTime } from './lib/formatTime'
import { filterGBIRE, filterMinRunners, countRunners, getGrade, gradeClass, resultLabel, getHomeSelections, getNoBetReason, calculateStrikeRate } from './lib/engine'
import type { Race, Runner } from './lib/types'
import { getAtTheRacesHorseUrl } from './lib/horseLinks'
import TrackDirectory from './pages/TrackDirectory'
import About from './pages/About'
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

  // 30-min lock badge — computed once
  let lockBadge = null
  if (!label && selection.offTime) {
    const ukNowStr = new Date().toLocaleString('en-US', { timeZone: 'Europe/London' })
    const ukNow = new Date(ukNowStr)
    const raceDate = selection.race?.date || new Date().toISOString().split('T')[0]
    const [year, month, day] = raceDate.split('-')
    const [hour, minute] = selection.offTime.split(':')
    if (year && hour) {
      const raceUKStr = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0)
        .toLocaleString('en-US', { timeZone: 'Europe/London' })
      const offDateTime = new Date(raceUKStr)
      const minsUntilOff = (offDateTime.getTime() - ukNow.getTime()) / 60000
      if (minsUntilOff <= 30 && minsUntilOff > -60) {
        lockBadge = <span className='px-2 py-0.5 rounded text-[11px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700'>🔒 LOCKED</span>
      } else if (minsUntilOff > 30) {
        lockBadge = <span className='px-2 py-0.5 rounded text-[11px] font-bold bg-green-950 text-green-400 border border-green-900/50'>⏳ OPEN ({Math.round(minsUntilOff)}m)</span>
      }
    }
  }

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
          {/* ── 1. META BAR ── */}
          <div className='flex items-center justify-between text-xs text-zinc-400 border-b border-white/[0.04] pb-2 mb-3'>
            <div className='flex items-center gap-2'>
              <span className='text-zinc-500 text-sm font-bold'>#{rank}</span>
              {selection.probConfidence != null && selection.probConfidence > 0.6 ? (
                <span className='px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-400'>HIGH</span>
              ) : selection.probConfidence != null && selection.probConfidence > 0.3 ? (
                <span className='px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400'>MED</span>
              ) : (
                <span className='px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400'>LOW</span>
              )}
              <span className='font-semibold text-zinc-200'>{selection.offTime}</span>
              <span className='text-zinc-600'>·</span>
              <span className='text-zinc-400 font-medium'>{selection.course}</span>
            </div>
            {lockBadge}
          </div>

          {/* ── 2. HERO PA BAND ── */}
          {selection.personalAffinity?.adjustment != null && (
            <div className='mb-2'>
              {/* PA BAND PERFORMANCE BADGES
                  Source: /api/pa-gate-monitor All-Time Backtest Pipeline
                  Last Verified: June 2026. Audit quarterly for model drift. */}
              {selection.personalAffinity.adjustment >= 5 && (
                <span className='px-2 py-0.5 rounded text-[11px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse outline-none'>
                  🔥 PA ELITE (+302% ROI • 50% WR)
                </span>
              )}
              {selection.personalAffinity.adjustment >= 2 && selection.personalAffinity.adjustment < 5 && (
                <span className='px-2 py-0.5 rounded text-[11px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 outline-none'>
                  🎯 PA TARGET (+198% ROI • 28% WR)
                </span>
              )}
              {selection.personalAffinity.adjustment > 0 && selection.personalAffinity.adjustment < 2 && (
                <span className='px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 outline-none'>
                  📊 PA VALUE (+63% ROI • 15% WR)
                </span>
              )}
              {selection.personalAffinity.adjustment <= 0 && (
                <span className='px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/10 opacity-60 outline-none'>
                  ✕ PA NEGATIVE (Damped)
                </span>
              )}
            </div>
          )}

          {/* ── 3. HORSE IDENTITY ── */}
          <a
            href={getAtTheRacesHorseUrl(selection, selection.race)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${isNap ? 'text-3xl' : 'text-xl'} font-black hover:text-amber-300 transition truncate block w-full`}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse: selection.horse, course: selection.course, offTime: selection.race?.off_time } }))
            }}
          >
            {selection.horse && selection.horse !== '—' ? selection.horse : 'Unknown Runner'}
          </a>
          <p className='text-zinc-500 text-xs mt-1'>{selection.raceName}</p>

          {/* ── 4. STRATEGY FLAGS ── */}
          <div className='flex items-center gap-1.5 mt-3 mb-4'>
            {isNap && (
              <span className='text-[10px] px-2 py-0.5 rounded-lg border-2 border-amber-500/40 bg-amber-500/20 text-amber-200 font-black tracking-wider'>NAP</span>
            )}
            {!label && betType === 'WIN' && (
              <span className='text-[10px] px-2 py-0.5 rounded-lg border border-green-500/30 bg-green-500/15 text-green-400 font-bold'>WIN</span>
            )}
            {!label && betType === 'PLACE' && (
              <span className='text-[10px] px-2 py-0.5 rounded-lg border border-amber-500/30 bg-amber-500/15 text-amber-400 font-bold'>E/W</span>
            )}
            {!label && betType === 'SPEC' && (
              <span className='text-[10px] px-2 py-0.5 rounded-lg border border-zinc-500/30 bg-zinc-500/15 text-zinc-400 font-bold'>SPEC</span>
            )}
            {isBomb && (
              <span className='text-[10px] px-2 py-0.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-300 font-bold'>BOMB</span>
            )}
          </div>
          
          {/* Essential metrics only */}
          <div className='flex gap-3 mt-4 flex-wrap items-center'>
            {selection.valueEdge != null && selection.valueEdge > 0 && (selection.odds ?? 0) >= 2.0 ? (
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${isNap ? 'bg-green-500/15 text-green-300' : 'bg-green-500/10 text-green-400'}`}>+{(selection.valueEdge * 100).toFixed(1)}% underbet</span>
            ) : selection.valueEdge != null && selection.valueEdge < 0 && (selection.odds ?? 0) >= 2.0 ? (
              <span className='px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-sm font-bold'>{(selection.valueEdge * 100).toFixed(1)}% overbet</span>
            ) : null}
            {selection.odds != null && (
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${isNap ? 'bg-amber-500/15 text-amber-200' : 'bg-white/[0.06] text-white'}`}>
                {selection.odds}
                {selection.movement != null && Math.abs(selection.movement) > 15 && (
                  <span className={`ml-1.5 text-[10px] ${selection.movement < 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {selection.movement < 0 ? '▼' : '▲'} {Math.abs(selection.movement).toFixed(0)}%
                  </span>
                )}
              </span>
            )}
            <span className='ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20'>
              <strong className='text-lg font-black text-amber-400 leading-none'>{selection.score}</strong>
              <span className='text-[10px] text-amber-400/70 uppercase tracking-wider'>APEX</span>
            </span>
          </div>

          {/* Model diagnostics */}
          <div className='flex gap-2 mt-2 flex-wrap items-center'>
            {selection.winProb != null && selection.winProb > 0 && (
              <span className='text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20'>Model {selection.winProb > 1 ? selection.winProb.toFixed(1) : (selection.winProb * 100).toFixed(1)}%</span>
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

          {/* Frozen odds indicator for odds movers */}
          {selection.frozenOdds != null && selection.currentOdds != null && (
            <div className='flex items-center gap-2 mt-1.5 text-[10px]'>
              <span className='text-zinc-500'>Frozen: {selection.frozenOdds}</span>
              <span className='text-zinc-600'>→</span>
              <span className='text-zinc-400'>Now: {selection.currentOdds}</span>
            </div>
          )}

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
                <div className='flex items-center gap-4 text-[11px]'>
                  <span className='text-zinc-400'>Leaders: <span className='text-zinc-200 font-bold'>{leaders}</span></span>
                  <span className='text-zinc-400'>Tempo: <span className={`font-bold ${tempoColor}`}>{tempo}</span></span>
                  {shape && <span className='text-zinc-500'>· {shape}</span>}
                </div>
                {(advantaged.length > 0 || disadvantaged.length > 0) && (
                  <div className='flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10px]'>
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
  personalAffinity?: { adjustment: number } | null
  betQuality?: string | null
  marketMovement?: { horse: string; lastOdds: number; movement: string; updatedAt: string } | null
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
  const [pickView, setPickView] = useState<'live' | 'yesterday'>('live')
  const [fullCardFilter, setFullCardFilter] = useState<'all' | 'bets'>('all')
  const [abandoned, setAbandoned] = useState<any[]>([])
  const [livePicksStats, setLivePicksStats] = useState<{ stats: { won: number; placed: number; lost: number; nr: number; pending: number }; roi: number; mainBets: { won: number; placed: number; lost: number; nr: number; total: number; roi: number } } | null>(null)
  const [homeWidgets, setHomeWidgets] = useState<any>(null)
  const {
    data: liveState,
    isLoading,
    refetch: refetchRacecards,
  } = useQuery<LiveState>({
    queryKey: ['home-racecards'],
    queryFn: fetchLiveState,
    refetchInterval: 60000,
  })
  const races = liveState?.racecards || []
  const processingComplete = liveState != null && !liveState.loading

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
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const yesterdaySaved = dailyPicksDb[yesterday]
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
      const pa = (s as any).personalAffinity?.adjustment ?? 0
      if (pa <= 0) return false
      if ((s.valueEdge || 0) <= 0.03) return false
      if (parseOddsToNum(s.odds) < 2.0) return false
      if ((s.winProb || 0) < 0.10) return false
      const apexScore = s.score || 0
      if (apexScore === 0) return false
      if (apexScore >= 50) return true
      if (apexScore < 35) return false
      const edge = s.valueEdge || 0
      const wp = s.winProb || 0
      return pa > 1.0 || edge > 0.10 || (wp > 0.20 && pa > 0.5)
    })
    console.table('[TOP 20 PASS]', passing.slice(0, 20).map((s: any) => ({
      horse: s.horse,
      score: s.score,
      valueEdge: (s.valueEdge || 0).toFixed(3),
      winProb: (s.winProb > 1 ? s.winProb : (s.winProb || 0) * 100).toFixed(1) + '%',
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
      winProb: (s.winProb > 1 ? s.winProb : (s.winProb || 0) * 100).toFixed(1) + '%',
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
      const pa = (s as any).personalAffinity?.adjustment ?? 0
      if (pa <= 0) return false
      if ((s.valueEdge || 0) < 0) return false
      if ((s.winProb || 0) < 0.12) return false
      if (parseOddsToNum(s.odds) < 2.0) return false
      const apexScore = s.score || 0
      if (apexScore === 0) return false
      if (apexScore >= 50) return true
      if (apexScore < 35) return false
      const edge = s.valueEdge || 0
      const wp = s.winProb || 0
      return pa > 1.0 || edge > 0.10 || (wp > 0.20 && pa > 0.5)
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
  if (bestBet) seenRaces.add(bestBet.race_id || `${bestBet.course}-${bestBet.offTime}`)
  const onePerRace = sortedByTime.filter((s) => {
    if (s === bestBet) return false
    const raceKey = s.race_id || `${s.course}-${s.offTime}`
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
  if (upcomingBest) seenUpcoming.add(upcomingBest.race_id || `${upcomingBest.course}-${upcomingBest.offTime}`)
  const upcomingOnePerRace = upcomingSorted.filter((s) => {
    if (s === upcomingBest) return false
    const raceKey = s.race_id || `${s.course}-${s.offTime}`
    if (seenUpcoming.has(raceKey)) return false
    seenUpcoming.add(raceKey)
    return true
  })
  const picksLive = upcomingBest ? [upcomingBest, ...upcomingOnePerRace].slice(0, 15) : upcomingOnePerRace.slice(0, 15)

  // Odds Movers: frozen picks where current odds differ significantly from saved odds
  const oddsMovers = useMemo(() => {
    if (!todaySaved?.picks?.length) return []
    return todaySaved.picks
      .map((saved: any) => {
        const live = allSelections.find((s: any) => s.horse === saved.horse && s.course === saved.course)
        if (!live) return null
        const frozenOdds = parseOddsToNum(saved.odds)
        const currentOdds = parseOddsToNum(live.odds)
        if (frozenOdds <= 0 || currentOdds <= 0) return null
        const movement = ((currentOdds - frozenOdds) / frozenOdds) * 100
        return { ...live, frozenOdds, currentOdds, movement, savedResult: saved.result }
      })
      .filter((p: any) => p && Math.abs(p.movement) > 15)
      .sort((a: any, b: any) => Math.abs(b.movement) - Math.abs(a.movement))
  }, [todaySaved, allSelections])

  // Log ALL live picks to server for honest performance tracking (not just upcoming)
  const allLivePicksKey = allPicks.map(p => p.race_id || p.horse + p.course).join('|')
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
          winProb: p.winProb ?? null,
          personalAffinity: p.personalAffinity?.adjustment ?? p.personalAffinity ?? null,
          apexScore: p.score ?? null,
          betQuality: p.betQuality ?? null,
          betType: p.betType ?? null,
          raceId: p.race_id || null,
        })),
      }),
    }).catch(() => {})
  }, [allLivePicksKey])
  console.log('[FINAL PICKS]', picksLive.length, picksLive.map((p: any) => `${p.horse} (${p.course} ${p.offTime}) score=${p.score} ev=${((p.winProb || 0) * (parseOddsToNum(p.odds) || 0) - 1).toFixed(2)}`))
  const picksKey = allPicks.map((p) => p.race_id || p.horse + p.course).join('|')
  const topScore = allPicks[0]?.score || bettable[0]?.score || allSelections[0]?.score || 0
  const totalRunners = countRunners(ukIreRaces)

  // View toggle: system vs yesterday
  const hasYesterdayPicks = (yesterdaySaved?.picks?.length || 0) > 0

  // Wrap yesterday DailyPick objects into Selection-compatible shape for PickCard
  const yesterdaySelections = useMemo(() => {
    if (!yesterdaySaved?.picks) return []
    return yesterdaySaved.picks.map((p: DailyPick) => ({
      ...p,
      horse: p.horse,
      course: p.course,
      offTime: p.offTime,
      raceName: p.raceName,
      score: p.score,
      winProb: p.winProb,
      fairOdds: p.fairOdds,
      probConfidence: p.probConfidence,
      valueEdge: p.valueEdge,
      kellyStake: p.kellyStake,
      betType: p.betType,
      odds: (p as any).odds,
      personalAffinity: p.personalAffinity || null,
      betQuality: p.betQuality || null,
      movement: p.marketMovement?.movement === 'STRONG_STEAMER' ? -15
        : p.marketMovement?.movement === 'STRONG_DRIFTER' ? 15
        : p.marketMovement?.movement?.includes('STEAMER') ? -10
        : p.marketMovement?.movement?.includes('DRIFTER') ? 10
        : null,
      race: { off_time: p.offTime, raceShape: null, paceMap: null },
      frozenOdds: null,
      currentOdds: null,
    }))
  }, [yesterdaySaved])

  const displayPicks = pickView === 'yesterday' ? yesterdaySelections : picksLive
  const liveBestBet = picksLive[0] || null
  const displayBestBet = pickView === 'yesterday' ? (yesterdaySelections[0] || null) : liveBestBet

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
      ? 'No underbet horses found today — probability estimates too low or market too efficient'
      : getNoBetReason(ukIreRaces)
    : null

  const todayResults = displayPicks
  const todayStats = displayPicks.length > 0 ? {
    won: displayPicks.filter((p: any) => p.result === 'won').length,
    placed: displayPicks.filter((p: any) => p.result === 'placed').length,
    lost: displayPicks.filter((p: any) => p.result === 'lost').length,
    nr: displayPicks.filter((p: any) => p.result === 'nr').length,
    pending: displayPicks.filter((p: any) => !p.result).length,
  } : null

  // Top horse per race from ALL selections (regardless of bettable filter)
  // Used as fallback in full card so every race shows a pick
  const topPerRace = useMemo(() => {
    const map = new Map<string, any>()
    for (const s of allSelections) {
      const key = s.race_id || `${s.course}|${s.offTime}`
      if (!map.has(key)) map.set(key, s)
    }
    return map
  }, [allSelections])

  // All races card — every race, system picks highlighted
  const allRacesCard = useMemo(() => {
    const pickSource = todaySaved?.picks?.length ? todaySaved.picks : allPicks
    const pickByRace = new Map<string, any>()
    for (const p of pickSource) {
      const key = p.race_id || `${p.course}|${p.offTime}`
      if (!pickByRace.has(key)) pickByRace.set(key, p)
    }
    return (races || [])
      .filter(r => (r.runners || []).length >= 2)
      .map(r => {
        const offTime = formatOffTime(r)
        const pickKey = r.race_id || `${r.course}|${offTime}`
        const pick = pickByRace.get(pickKey) || (!todaySaved?.picks?.length ? topPerRace.get(pickKey) : null)
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
          winProb: pick?.winProb || 0,
          odds: pick?.odds || winner?.odds || 0,
          going: r.going || '',
          isPick: !!pick,
          isWinner: !!winner,
          result,
          position: pos,
          movement,
          betQuality: pick?.betQuality || null,
          betType: pick?.betType || null,
        }
      })
      .sort((a, b) => (a.offTime || '').localeCompare(b.offTime || ''))
  }, [races, allPicks, todaySaved])

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
          race_id: p.race_id || null,
          score: p.score,
          grade: p.selectionQuality?.grade || '',
          winProb: p.winProb,
          finalScore: (p as any).finalScore ?? null,
          plattProb: (p as any).plattProb ?? null,
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
          personalAffinity: p.personalAffinity || null,
          betQuality: (p as any).betQuality || null,
        })),
      }),
    })
      .then((r) => r.json())
      .then((result) => {
        if (result.saved) {
          fetch('/api/daily-picks')
            .then((r) => r.json())
            .then((data) => setDailyPicksDb(data))
            .catch(() => {})
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
              <div className='text-3xl font-bold text-amber-400'>{todaySaved?.picks?.length || allPicks.length}</div>
              <div className='text-xs text-zinc-400 uppercase tracking-wider'>Picks</div>
            </div>
            <button
              type='button'
              onClick={() => {
                const t = new Date().toISOString().split('T')[0]
                fetch(`/api/daily-picks/${t}`, { method: 'DELETE' })
                  .then(() => {
                    setDailyPicksDb(prev => ({ ...prev, [t]: undefined }))
                    refetchRacecards()
                  })
                  .catch(() => {})
              }}
              className='px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition'
            >
              🔄 Repick
            </button>
            {nextRace && (
              <div className='text-center pl-6 border-l border-white/10'>
                <div className='text-3xl font-bold text-amber-400'>{nextRace.offTime}</div>
                <div className='text-xs text-zinc-400 uppercase tracking-wider'>Next Off</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Top Pick Hero — suppressed during processing */}
      {!processingComplete && !isLoading ? (
        <section className='relative overflow-hidden bg-gradient-to-r from-[#1a1f2e] to-[#0f1720] border border-amber-500/10 rounded-2xl p-8 mb-6'>
          <div className='flex items-center gap-4 relative z-10'>
            <div className='pulse-dot' />
            <div>
              <span className='text-amber-400 text-xs font-bold uppercase tracking-[0.3em]'>Processing</span>
              <h2 className='text-2xl font-black text-zinc-300 mt-1'>Scoring {races.length} races...</h2>
              <p className='text-sm text-zinc-500 mt-1'>NAP will appear once all races are scored</p>
            </div>
          </div>
        </section>
      ) : displayBestBet && (() => {
        const napResult = todayResults.find((r: any) => r.horse === displayBestBet.horse && r.course === displayBestBet.course)
        const napHasRaced = napResult && (napResult.result === 'won' || napResult.result === 'placed' || napResult.result === 'lost')
        return (
        <section className='relative overflow-hidden bg-gradient-to-r from-[#1a1f2e] to-[#0f1720] border border-amber-500/20 rounded-2xl p-8 mb-6'>
          <div className='absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2' />
          <div className='flex items-center justify-between relative z-10'>
            <div className='flex-1'>
              <div className='flex items-center gap-3 mb-3'>
                {!napHasRaced && <span className='text-lg font-black uppercase tracking-wider px-3 py-1 rounded-lg' style={{ backgroundColor: '#d97706', color: '#fff' }}>NAP</span>}
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
        )
      })()}

      {isLoading ? (
        <div className='loading-card bg-white/[0.02] rounded-2xl border border-white/5 p-12 flex items-center gap-4'>
          <div className='pulse-dot' />
          <span className='text-zinc-400'>Finding the strongest system picks...</span>
        </div>
      ) : picksLive.length === 0 && todayResults.length === 0 && allPicks.length === 0 ? (
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
          {hasYesterdayPicks && (
            <div className='flex gap-2 items-center mb-2'>
              <button type='button' onClick={() => setPickView('live')}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${pickView === 'live' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/[0.03] text-zinc-500 border border-white/5 hover:text-zinc-300'}`}>
                System Picks
              </button>
              <button type='button' onClick={() => setPickView('yesterday')}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${pickView === 'yesterday' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-white/[0.03] text-zinc-500 border border-white/5 hover:text-zinc-300'}`}>
                Yesterday
              </button>
            </div>
          )}
          {(() => {
            const activeStats = pickView === 'yesterday' ? yesterdaySaved?.stats : (todaySaved?.stats || todayStats)
            const statsLabel = pickView === 'yesterday' ? 'Yesterday' : 'System'
            return activeStats ? (
              <div className='flex items-center gap-6 mb-4 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5'>
                <div className='flex items-center gap-2'>
                  <span className='text-[10px] text-zinc-500 uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20'>{statsLabel}</span>
                  <span className='text-sm font-bold text-green-400'>{activeStats.won}W</span>
                  <span className='text-zinc-600'>/</span>
                  <span className='text-sm font-bold text-amber-400'>{activeStats.placed}P</span>
                  <span className='text-zinc-600'>/</span>
                  <span className='text-sm font-bold text-red-400'>{activeStats.lost}L</span>
                  {activeStats.pending > 0 && (
                    <>
                      <span className='text-zinc-600'>/</span>
                      <span className='text-sm font-bold text-zinc-400'>{activeStats.pending} pending</span>
                    </>
                  )}
                </div>
                {pickView !== 'yesterday' && livePicksStats?.mainBets && (
                  <div className='flex items-center gap-3 pl-4 border-l border-white/5'>
                    <div className='flex items-center gap-1.5'>
                      <span className='text-[10px] text-zinc-500 uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20'>Bets</span>
                      <span className='text-sm font-bold text-green-400'>{livePicksStats.mainBets.won}W</span>
                      <span className='text-zinc-600'>/</span>
                      <span className='text-sm font-bold text-amber-400'>{livePicksStats.mainBets.placed}P</span>
                      <span className='text-zinc-600'>/</span>
                      <span className='text-sm font-bold text-red-400'>{livePicksStats.mainBets.lost}L</span>
                      {livePicksStats.mainBets.total > 0 && (
                        <span className={`text-xs font-bold ${livePicksStats.mainBets.roi > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {livePicksStats.mainBets.roi > 0 ? '+' : ''}{livePicksStats.mainBets.roi}%
                        </span>
                      )}
                    </div>
                    <div className='flex items-center gap-1.5'>
                      <span className='text-[10px] text-zinc-600 uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'>All</span>
                      <span className='text-xs font-bold text-green-400/70'>{livePicksStats.stats.won}W</span>
                      <span className='text-zinc-700'>/</span>
                      <span className='text-xs font-bold text-amber-400/70'>{livePicksStats.stats.placed}P</span>
                      <span className='text-zinc-700'>/</span>
                      <span className='text-xs font-bold text-red-400/70'>{livePicksStats.stats.lost}L</span>
                      {livePicksStats.roi !== 0 && (
                        <span className={`text-[10px] font-bold ${livePicksStats.roi > 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                          {livePicksStats.roi > 0 ? '+' : ''}{livePicksStats.roi}%
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null
          })()}
          <p className='text-center text-[10px] text-zinc-600 italic mb-2'>
            Selections dynamically stabilize on morning weights and automatically freeze 30 minutes prior to official race off-time.
          </p>
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
              const isYesterdayPick = pickView === 'yesterday'
              const saved = isYesterdayPick ? null : todayResults.find(
                (r: any) => r.horse === s.horse && r.course === s.course
              )
              const pickResult = isYesterdayPick ? (s as any).result : saved?.result || null
              const pickPosition = isYesterdayPick ? (s as any).position : saved?.position || null
              const alreadyRaced = displayPicks.some((p: any) => {
                const r = todayResults.find((res: any) => res.horse === p.horse && res.course === p.course)
                return r && (r.result === 'won' || r.result === 'placed' || r.result === 'lost')
              })
              const isNapPick = i === 0 && !alreadyRaced && s.betType !== 'SPEC'
              const isBombPick = s.odds && parseOddsToNum(s.odds) >= 10
              if (isNapPick) {
                return <PickCard key={`${s.course}-${s.offTime}-${s.horse}`} selection={s} rank={i + 1} result={pickResult} position={pickPosition} isNap isBomb={false} />
              }
              return (
                <PickCard
                  key={`${s.course}-${s.offTime}-${s.horse}`}
                  selection={s}
                  rank={i + 1}
                  result={pickResult}
                  position={pickPosition}
                  isBomb={isBombPick}
                />
              )
            })}
          </div>
          {allRacesCard.length > 0 && (() => {
            const mainPickKeys = new Set(allPicks.map((p: any) => `${p.horse}|${p.course}`))
            return (
            <div className='w-full rounded-xl border border-slate-800 bg-[#0f1720]/80 p-4 overflow-x-auto'>
              <div className='mb-3 border-b border-slate-800 pb-3 flex items-center justify-between'>
                <h3 className='text-sm font-bold text-slate-400 uppercase tracking-wider'>Today&apos;s Full Card</h3>
                <div className='flex gap-1'>
                  <button type='button' onClick={() => setFullCardFilter('all')}
                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${fullCardFilter === 'all' ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30' : 'text-slate-500 border border-white/5 hover:text-slate-300'}`}>
                    All Picks
                  </button>
                  <button type='button' onClick={() => setFullCardFilter('bets')}
                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${fullCardFilter === 'bets' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-500 border border-white/5 hover:text-slate-300'}`}>
                    Bets Only
                  </button>
                </div>
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
                  {allRacesCard
                    .filter(r => fullCardFilter === 'all' || (r.betType === 'WIN' || r.betType === 'PLACE'))
                    .map((r, i) => {
                    const resultBadge = r.result === 'won' ? 'W' : r.result === 'placed' ? 'P' : r.result === 'lost' ? 'L' : r.result === 'nr' ? 'NR' : '-'
                    const badgeBg = r.result === 'won' ? 'bg-green-500/20 text-green-400' : r.result === 'placed' ? 'bg-amber-500/20 text-amber-400' : r.result === 'lost' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-500/10 text-zinc-500'
                    const isMainPick = mainPickKeys.has(`${r.horse}|${r.course}`)
                    const isSpecMainPick = isMainPick && r.betType === 'SPEC'
                    const hasSelection = !!r.horse && r.horse !== '—' && r.horse !== ''
                    return (
                      <tr key={i} className={`border-b border-slate-800/30 ${
                        isSpecMainPick ? 'bg-slate-500/5' : isMainPick ? 'bg-amber-500/5' : r.isWinner ? 'bg-green-500/5' : 'opacity-50'
                      }`}>
                        <td className='py-2 px-3 font-mono text-xs text-slate-300'>{r.offTime}</td>
                        <td className='py-2 px-3 font-semibold text-xs text-slate-200 truncate'>{r.course}</td>
                        <td className='py-2 px-3'>
                          {isSpecMainPick ? (
                            <span className='font-semibold text-slate-400 text-xs tracking-wide'>{r.horse}</span>
                          ) : isMainPick ? (
                            <span className='font-bold text-amber-400 text-xs tracking-wide'>{r.horse}</span>
                          ) : r.horse && r.horse !== '—' ? (
                            <span className='font-semibold text-slate-200 text-xs tracking-wide'>{r.horse}</span>
                          ) : (
                            <span className='text-slate-600'>—</span>
                          )}
                        </td>
                        <td className='py-2 px-3 text-xs text-slate-400 truncate'>{r.going || '—'}</td>
                        <td className='py-2 px-3 text-center font-mono text-xs font-bold text-slate-300'>
                          {hasSelection && r.score ? r.score : <span className='text-slate-700'>—</span>}
                        </td>
                        <td className='py-2 px-3 text-center font-mono text-[10px] text-slate-400'>
                          {hasSelection && r.winProb > 0 ? `${r.winProb > 1 ? r.winProb.toFixed(1) : (r.winProb * 100).toFixed(1)}%` : <span className='text-slate-700'>—</span>}
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
            )
          })()}
          {/* ── System Legend ── */}
          <div className='w-full rounded-xl border border-slate-800 bg-[#0f1720]/80 p-4 mt-6'>
            <h3 className='text-xs font-bold text-slate-400 uppercase tracking-wider mb-3'>System Guide</h3>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px]'>
              <div>
                <div className='text-zinc-500 font-bold uppercase mb-1'>PA Strength</div>
                <div className='space-y-1'>
                  <div className='flex items-center gap-2'>
                    <span className='px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-black'>🔥 ELITE</span>
                    <span className='text-zinc-400'>PA 5+ • 50% WR • +302% ROI</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 font-bold'>🎯 TARGET</span>
                    <span className='text-zinc-400'>PA 2–5 • 28% WR • +198% ROI</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold'>📊 VALUE</span>
                    <span className='text-zinc-400'>PA 0–2 • 15% WR • +63% ROI</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 opacity-60'>✕ NEGATIVE</span>
                    <span className='text-zinc-500'>Filtered out by model</span>
                  </div>
                </div>
              </div>
              <div>
                <div className='text-zinc-500 font-bold uppercase mb-1'>Pick Lock Status</div>
                <div className='space-y-1'>
                  <div className='flex items-center gap-2'>
                    <span className='px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-bold'>🔒 LOCKED</span>
                    <span className='text-zinc-400'>≤30 min to off — frozen</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='px-1.5 py-0.5 rounded bg-green-950 text-green-400 font-bold'>⏳ OPEN</span>
                    <span className='text-zinc-400'>&gt;30 min — can change</span>
                  </div>
                </div>
              </div>
              <div>
                <div className='text-zinc-500 font-bold uppercase mb-1'>Bet Types</div>
                <div className='space-y-1'>
                  <div className='flex items-center gap-2'>
                    <span className='px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-bold'>WIN</span>
                    <span className='text-zinc-400'>Direct win bet</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold'>E/W</span>
                    <span className='text-zinc-400'>Each-way (odds ≥ 5.0)</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-400 font-bold'>SPEC</span>
                    <span className='text-zinc-500'>Speculative — below value threshold</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 font-black'>NAP</span>
                    <span className='text-zinc-400'>Top pick of the day</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 font-bold'>BOMB</span>
                    <span className='text-zinc-500'>Odds ≥ 10.0 longshot</span>
                  </div>
                </div>
              </div>
            </div>
            <div className='mt-3 pt-2 border-t border-slate-800/50 text-[9px] text-zinc-600 italic'>
              PA stats from all-time backtest (June 2026). Picks freeze 30 min before off time. ROI = level-stakes return on 1-unit bets.
            </div>
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

    if (activeTab === 'About') {
      return <About />
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
              {['Calibration', 'About'].map((tab) => (
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
