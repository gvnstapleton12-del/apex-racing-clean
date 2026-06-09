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
  'Intelligence',
  'Proof',
  'Calibration',
  'OR/PR Gap',
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
  const isNR = result === 'nr'
  const label = resultLabel(result, position)
  return (
    <article className={`${isNap ? 'lg:col-span-2' : ''} ${isNap ? 'nap-card' : 'bg-[#0f1720]'} border ${isNap ? 'border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.15)]' : 'border-green-500/10'} rounded-2xl ${isNap ? 'p-8' : 'p-6'} ${isNap ? 'hover:border-amber-400/50' : 'hover:border-green-400/30'} transition-all duration-300 relative overflow-hidden${label ? ' has-result' : ''}${isNR ? ' opacity-40' : ''}`}>
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
            {(selection as any).betType && (
              <span className={`px-2 py-1 rounded-md text-xs font-bold ${(selection as any).betType === 'PLACE' ? 'bg-blue-500/15 text-blue-300' : 'bg-green-500/15 text-green-300'}`}>{(selection as any).betType}</span>
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
          <div className='flex gap-3 mt-1 flex-wrap'>
            <span className={`px-2.5 py-1 rounded-md text-sm font-bold border ${selection.or != null && selection.or > 0 ? 'bg-zinc-800 text-zinc-100 border-zinc-600' : 'bg-zinc-900/50 text-zinc-600 border-zinc-800'}`}>OR {selection.or != null && selection.or > 0 ? selection.or : '—'}</span>
            <span className={`px-2.5 py-1 rounded-md text-sm font-bold border ${selection.rpr != null && selection.rpr > 0 ? 'bg-violet-900/40 text-violet-200 border-violet-500/40' : 'bg-zinc-900/50 text-zinc-600 border-zinc-800'}`}>RPR {selection.rpr != null && selection.rpr > 0 ? selection.rpr : '—'}</span>
            <span className={`px-2.5 py-1 rounded-md text-sm font-bold border ${selection.performanceRating?.pr != null && selection.performanceRating.pr > 0 ? 'bg-cyan-900/40 text-cyan-200 border-cyan-500/40' : 'bg-zinc-900/50 text-zinc-600 border-zinc-800'}`}>PR {selection.performanceRating?.pr != null && selection.performanceRating.pr > 0 ? Math.round(selection.performanceRating.pr) : '—'}</span>
            {!isNR && selection.awTransfer?.isAWSpecialist && (
              <span className='px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-xs font-bold'>AW specialist</span>
            )}
            {!isNR && selection.awTransfer?.surfaceSwitch && !selection.awTransfer?.isAWSpecialist && (
              <span className='px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded text-xs font-bold'>AW to turf</span>
            )}
            {!isNR && selection.awTransfer?.provenBothSurfaces && (
              <span className='px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-xs font-bold'>Proven both surfaces</span>
            )}
            {!isNR && selection.codeMatch?.matchedRuns === 0 && (
              <span className='px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-xs font-bold'>Code switch</span>
            )}
            {!isNR && selection.codeMatch?.matchedRuns > 0 && selection.codeMatch?.matchedRuns < 3 && (
              <span className='px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded text-xs font-bold'>Limited code form</span>
            )}
            {isNR && (
              <span className='px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-xs font-bold'>NR</span>
            )}
          </div>
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
  const [valuePicksStats, setValuePicksStats] = useState<{ count: number; wr: number; roi: number; kellyRoi: number } | null>(null)
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

  // Fetch value picks ROI from calibration
  useEffect(() => {
    fetch('/api/calibration')
      .then((r) => r.json())
      .then((data) => {
        const records = data.records || []
        function passesValueGate(prob: number, odds: number, apexScore: number, previousRuns: number) {
          if (!odds || odds <= 1 || !prob) return false
          const requiredApexFloor = previousRuns < 5 ? 50 : 40
          if (apexScore > 0 && apexScore < requiredApexFloor) return false
          const implied = (1 / odds) * 100
          const marginPct = implied > 0 ? ((prob - implied) / implied) * 100 : 0
          return prob >= 10 && marginPct > 25
        }
        const vp = records.filter((r: any) => passesValueGate(Number(r.predictedWinProb), Number(r.predictedOdds), Number(r.predictedScore || 0), Number(r.previousRuns || 0)))
        if (vp.length === 0) return
        const vpWins = vp.filter((r: any) => r.actualWon).length
        const vpPL = vp.reduce((s: number, r: any) => s + (r.actualWon ? (Number(r.actualOdds) || 0) - 1 : -1), 0)
        const vpROI = (vpPL / vp.length) * 100
        // Simulate eighth-Kelly
        let kellyBankroll = 1000
        vp.forEach((r: any) => {
          const p = Number(r.predictedWinProb) / 100
          const odds = Number(r.actualOdds) || Number(r.predictedOdds) || 2
          const implied = 1 / odds
          const margin = (p - implied) / implied
          if (p >= 0.10 && margin > 0.25) {
            const b = odds - 1
            const edge = p * b - (1 - p)
            if (edge > 0) {
              const kelly = (edge / b) * 0.125
              const stake = kellyBankroll * Math.min(kelly, 0.05)
              kellyBankroll += r.actualWon ? stake * (odds - 1) : -stake
            }
          }
        })
        const kellyRoi = ((kellyBankroll - 1000) / 1000) * 100
        setValuePicksStats({ count: vp.length, wr: (vpWins / vp.length) * 100, roi: vpROI, kellyRoi })
      })
      .catch(() => {})
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const ukNow = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
  const ukIreRaces = filterMinRunners(filterGBIRE(races))
  const allSelections = getHomeSelections(ukIreRaces)
  const bettable = allSelections
    .filter((s) => {
      if (s.noBet) return false
      if ((s.valueEdge || 0) <= 0.03) return false
      if (parseOddsToNum(s.odds) < 2.0) return false
      if ((s.winProb || 0) < 0.08) return false
      const apexScore = s.score || 0
      const previousRuns = ((s as any).previous_results || []).length
      const requiredApexFloor = previousRuns < 5 ? 50 : 40
      return apexScore >= requiredApexFloor
    })
  const upcoming = bettable
    .filter((s) => {
      if (!s.offTime) return true
      const raceTime = s.offTime.replace(':', '')
      const nowTime = ukNow.replace(':', '')
      return raceTime > nowTime
    })
  const core = bettable
    .filter((s) => parseOddsToNum(s.odds) < 10)
    .sort((a, b) => {
      const aVal = (a.winProb || 0) * 0.75 + (a.valueEdge || 0) * 0.25
      const bVal = (b.winProb || 0) * 0.75 + (b.valueEdge || 0) * 0.25
      const diff = bVal - aVal
      if (Math.abs(diff) > 0.001) return diff
      return (b.score || 0) - (a.score || 0)
    })
  const bombs = bettable.filter((s) => parseOddsToNum(s.odds) >= 10).sort((a, b) => (b.valueEdge || 0) - (a.valueEdge || 0))
  const bestBet = [...core, ...bombs].sort((a, b) => ((b.winProb || 0) * 0.75 + (b.valueEdge || 0) * 0.25) - ((a.winProb || 0) * 0.75 + (a.valueEdge || 0) * 0.25))[0]
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
  const allPicks = bestBet ? [bestBet, ...onePerRace] : onePerRace

  // Upcoming picks for live display only
  const upcomingCore = upcoming
    .filter((s) => parseOddsToNum(s.odds) < 10)
    .sort((a, b) => {
      const aVal = (a.winProb || 0) * 0.75 + (a.valueEdge || 0) * 0.25
      const bVal = (b.winProb || 0) * 0.75 + (b.valueEdge || 0) * 0.25
      const diff = bVal - aVal
      if (Math.abs(diff) > 0.001) return diff
      return (b.score || 0) - (a.score || 0)
    })
  const upcomingBombs = upcoming.filter((s) => parseOddsToNum(s.odds) >= 10).sort((a, b) => (b.valueEdge || 0) - (a.valueEdge || 0))
  const upcomingBest = [...upcomingCore, ...upcomingBombs].sort((a, b) => ((b.winProb || 0) * 0.75 + (b.valueEdge || 0) * 0.25) - ((a.winProb || 0) * 0.75 + (a.valueEdge || 0) * 0.25))[0]
  const upcomingSorted = [...upcomingCore, ...upcomingBombs].sort((a, b) => {
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
  const picks = upcomingBest ? [upcomingBest, ...upcomingOnePerRace] : upcomingOnePerRace
  const picksKey = allPicks.map((p) => p.horse + p.course).join('|')
  const topScore = allPicks[0]?.score || bettable[0]?.score || allSelections[0]?.score || 0
  const totalRunners = countRunners(ukIreRaces)

  const noBetReason = allPicks.length === 0 && ukIreRaces.length > 0
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
    if (allPicks.length === 0) return
    if (todaySaved && todaySaved.picks.some((p) => p.result !== null)) return

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
          valueEdge: p.valueEdge,
          kellyStake: p.kellyStake,
          or: p.or,
          rpr: p.rpr,
          performanceRating: p.performanceRating,
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
                valueEdge: p.valueEdge,
                kellyStake: p.kellyStake,
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
            <strong className='text-2xl font-bold text-amber-400'>{allPicks.length}</strong>
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

        {valuePicksStats && (
          <div className='mt-8 pt-8 border-t border-white/5'>
            <div className='flex items-center justify-between mb-6'>
              <div>
                <h3 className='text-lg font-semibold text-white'>Value Picks Performance</h3>
                <p className='text-xs text-zinc-500 mt-1'>Gate: P ≥ 10% + 25% margin + APEX ≥ 40</p>
              </div>
            </div>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
              <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
                <span className='text-zinc-400 text-sm block'>Bets</span>
                <strong className='text-2xl font-bold text-white'>{valuePicksStats.count}</strong>
              </div>
              <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
                <span className='text-zinc-400 text-sm block'>Win Rate</span>
                <strong className={`text-2xl font-bold ${valuePicksStats.wr >= 10 ? 'text-green-400' : valuePicksStats.wr >= 7 ? 'text-amber-400' : 'text-red-400'}`}>{valuePicksStats.wr.toFixed(1)}%</strong>
              </div>
              <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
                <span className='text-zinc-400 text-sm block'>Level ROI</span>
                <strong className={`text-2xl font-bold ${valuePicksStats.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{valuePicksStats.roi >= 0 ? '+' : ''}{valuePicksStats.roi.toFixed(1)}%</strong>
              </div>
              <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
                <span className='text-zinc-400 text-sm block'>Eighth-Kelly ROI</span>
                <strong className={`text-2xl font-bold ${valuePicksStats.kellyRoi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{valuePicksStats.kellyRoi >= 0 ? '+' : ''}{valuePicksStats.kellyRoi.toFixed(1)}%</strong>
              </div>
            </div>
          </div>
        )}
      </section>

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
          {todayResults.length > 0 && (
            <div className='bg-[#0f1720]/80 border border-white/5 rounded-2xl p-4'>
              <div className='flex items-center justify-between mb-3'>
                <h3 className='text-sm font-bold text-zinc-400 uppercase tracking-wider'>Today&apos;s Full Card</h3>
                {todayStats && (todayStats.won + todayStats.placed + todayStats.lost) > 0 && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${todayStats.won > 0 ? 'bg-green-500/10 text-green-400' : 'bg-zinc-500/10 text-zinc-400'}`}>
                    {todayStats.won}W {todayStats.placed}P {todayStats.lost}L
                  </span>
                )}
              </div>
              <div className='space-y-1'>
                {todayResults.sort((a, b) => (a.offTime || '').localeCompare(b.offTime || '')).map((p, i) => {
                  const resultColor = p.result === 'won' ? 'text-green-400' : p.result === 'placed' ? 'text-amber-400' : p.result === 'lost' ? 'text-red-400' : 'text-zinc-500'
                  const resultBadge = p.result === 'won' ? 'W' : p.result === 'placed' ? 'P' : p.result === 'lost' ? 'L' : p.result === 'nr' ? 'NR' : '-'
                  const badgeBg = p.result === 'won' ? 'bg-green-500/20 text-green-400' : p.result === 'placed' ? 'bg-amber-500/20 text-amber-400' : p.result === 'lost' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-500/10 text-zinc-500'
                  return (
                    <div key={i} className='flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.02]'>
                      <div className='flex items-center gap-3'>
                        <span className='text-zinc-500 text-xs w-10'>{p.offTime}</span>
                        <span className='text-zinc-600 text-xs w-20 truncate'>{p.course}</span>
                        <span className='text-white text-sm font-medium'>{p.horse}</span>
                        {(p as any).or != null && (p as any).or > 0 && (
                          <span className='px-2 py-0.5 bg-zinc-800 text-zinc-100 rounded text-xs font-bold border border-zinc-600'>OR {(p as any).or}</span>
                        )}
                        {(p as any).rpr != null && (p as any).rpr > 0 && (
                          <span className='px-2 py-0.5 bg-violet-900/40 text-violet-200 rounded text-xs font-bold border border-violet-500/40'>RPR {(p as any).rpr}</span>
                        )}
                        {(p as any).performanceRating?.pr != null && (p as any).performanceRating.pr > 0 && (
                          <span className='px-2 py-0.5 bg-cyan-900/40 text-cyan-200 rounded text-xs font-bold border border-cyan-500/40'>PR {Math.round((p as any).performanceRating.pr)}</span>
                        )}
                        <span className='text-zinc-600 text-xs'>{p.odds}</span>
                      </div>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${badgeBg}`}>{resultBadge}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
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

    if (activeTab === 'OR/PR Gap') {
      return <OrPrGapAnalysis />
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
          <strong className='text-zinc-400 text-sm'>v1.1.0</strong>
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
