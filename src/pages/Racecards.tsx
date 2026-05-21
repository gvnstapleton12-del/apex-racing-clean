import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchRacecards } from '../lib/racingApi'
import { openAtTheRacesHorseForm } from '../lib/horseLinks'
import { formatOffTime } from '../lib/formatTime'

import RaceModal from '../components/RaceModal'
import RacePressureGraph from '../components/RacePressureGraph'

export default function Racecards() {
  const [selectedRace, setSelectedRace] = useState(null)
  const scrollTarget = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      const { course, offTime } = e.detail || {}
      if (!course) return
      const id = `race-${course.replace(/\s+/g, '-')}-${(offTime || '').replace(':', '')}`
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        el.classList.add('ring-2', 'ring-amber-500/50', 'transition-all', 'duration-1000')
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-amber-500/50')
        }, 3000)
      }
    }
    window.addEventListener('select-horse', handler)
    return () => window.removeEventListener('select-horse', handler)
  }, [])

  const { data: races = [], isLoading } = useQuery<any[]>({
    queryKey: ['racecards'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

  if (isLoading) {
    return (
      <div className='dashboard-page max-w-7xl mx-auto'>
        <div className='loading-card bg-white/[0.02] rounded-2xl border border-white/5 p-12 flex items-center gap-4'>
          <div className='pulse-dot' />
          <span className='text-zinc-400'>Loading live racecards...</span>
        </div>
      </div>
    )
  }

  const ukIre = races.filter(
    (r: any) => r.region === 'GB' || r.region === 'IRE' || r.region === 'gb' || r.region === 'ire'
  )

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const sortedRaces = [...ukIre].sort((a: any, b: any) => {
    const aTime = a.off_dt || a.off_time || ''
    const bTime = b.off_dt || b.off_time || ''
    return aTime < bTime ? -1 : aTime > bTime ? 1 : 0
  })

  const todayRaces = sortedRaces.filter((race: any) => {
    const raceDate = race.date || (race.off_dt ? race.off_dt.slice(0, 10) : null)
    if (raceDate !== todayStr) return false
    if (race.off_dt) return new Date(race.off_dt) > now
    return true
  })

  const totalRunners = todayRaces.reduce(
    (total: number, race: any) =>
      total + (race.runners?.length || 0),
    0
  )

  const nextRace = todayRaces[0]

  return (
    <div className='dashboard-page max-w-7xl mx-auto'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow text-zinc-500 text-sm font-medium uppercase tracking-wider'>UK & Ireland live feed</span>
          <h1 className='text-5xl font-black tracking-tight'>Racecards command centre</h1>
          <p className='text-zinc-400 text-lg mt-3'>
            Live runners, confidence scores, market positions and race-level signals in one focused workspace.
          </p>
        </div>

        <div className='hero-metrics grid grid-cols-3 gap-4'>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
            <span className='text-zinc-400 text-sm block'>Races</span>
            <strong className='text-3xl font-bold text-amber-400'>{races.length}</strong>
          </div>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
            <span className='text-zinc-400 text-sm block'>Runners</span>
            <strong className='text-3xl font-bold text-amber-400'>{totalRunners}</strong>
          </div>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-4 border border-white/5'>
            <span className='text-zinc-400 text-sm block'>Next off</span>
            <strong className='text-xl font-bold text-amber-400'>{nextRace ? formatOffTime(nextRace) : 'No more races'}</strong>
          </div>
        </div>
      </section>

      {!todayRaces.length && (
        <div className='empty-state bg-white/[0.02] rounded-2xl border border-white/5 p-12'>
          <h2 className='text-2xl font-bold'>No more races today</h2>
          <p className='text-zinc-400 mt-2'>All of today's races have finished. Check the Results tab for completed races.</p>
        </div>
      )}

      <section className='race-grid space-y-6'>
        {todayRaces.map((race: any, index: number) => {
          const scoredRunners = (race.runners || []).map(
            (runner: any) => ({
              ...runner,
              score:
                runner.finalScore ||
                runner.aiProfile?.confidence ||
                runner.score ||
                0,
              replayTriggers: [],
            })
          )

          const topRated = [...scoredRunners].sort(
            (a: any, b: any) =>
              (b.score || 0) - (a.score || 0)
          )[0]

          return (
            <article
              key={race.race_id || index}
              id={`race-${race.course ? race.course.replace(/\s+/g, '-') : ''}-${(race.off_time || '').replace(':', '')}`}
              className='race-card bg-[#0f1720] border border-green-500/10 rounded-2xl p-6 hover:border-green-400/30 transition-all duration-300'
            >
              <div className='race-card-header flex justify-between items-start mb-4'>
                <div className='space-y-2'>
                  <div className='race-meta-row flex items-center gap-3 flex-wrap'>
                    <span className='live-badge px-3 py-1 rounded-lg text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/20'>LIVE</span>
                    <span className='text-zinc-400 text-sm'>{race.field_size} runners</span>
                    {race.paceMap && (
                      <span className={`pace-tempo px-2 py-1 rounded-md text-xs font-medium ${race.paceMap.projectedTempo === 'FAST' ? 'bg-red-500/10 text-red-400' : race.paceMap.projectedTempo === 'SLOW' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {race.paceMap.projectedTempo}
                        {race.paceMap.collapseRisk === 'HIGH' ? ' ⚡' : ''}
                      </span>
                    )}
                    {race.betFilter && (
                      <span className={`bet-filter-badge px-2 py-1 rounded-md text-xs font-medium ${race.betFilter.verdict === 'AUTO SKIP' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                        {race.betFilter.verdict}
                      </span>
                    )}
                  </div>

                  <h2 className='text-xl font-bold text-white'>{race.race_name}</h2>

                  <p className='text-zinc-400 text-sm'>
                    {race.course} &middot; {formatOffTime(race)}
                    {race.distance_f && <span> &middot; {race.distance_f}</span>}
                    {race.going && <span> &middot; {race.going}</span>}
                    {race.surface && <span> &middot; {race.surface}</span>}
                  </p>
                </div>

                <button
                  type='button'
                  onClick={() => setSelectedRace(race)}
                  className='primary-button bg-amber-500/10 border border-amber-500/30 text-amber-300 px-5 py-2.5 rounded-xl font-bold hover:bg-amber-500/20 transition-all duration-200 whitespace-nowrap'
                >
                  View Race
                </button>
              </div>

              {topRated && (
                <div className='top-rated-strip flex justify-between items-center bg-white/[0.02] rounded-xl p-4 mb-4 border border-white/5'>
                  <p className='text-zinc-500 text-sm font-medium'>Top Rated</p>
                  <div className='flex items-center gap-4'>
                    <button
                      type='button'
                      onClick={() =>
                        openAtTheRacesHorseForm(topRated, race)
                      }
                      className='top-rated-name-button text-lg font-bold hover:text-amber-300 transition'
                    >
                      {topRated.horse}
                    </button>
                    <strong className='text-2xl font-black text-amber-400'>{topRated.score}</strong>
                  </div>
                </div>
              )}

              <div className='runner-list space-y-3'>
                {scoredRunners
                  .slice(0, 5)
                  .map((runner: any, runnerIndex: number) => (
                    <div
                      key={runnerIndex}
                      className='runner-row flex justify-between items-center p-4 rounded-xl border border-white/5 bg-white/[0.01] hover:border-white/10 transition-all duration-200'
                    >
                      <div className='flex items-center gap-4 flex-1 min-w-0'>
                        <button
                          type='button'
                          onClick={() =>
                            openAtTheRacesHorseForm(runner, race)
                          }
                          className='runner-name-button text-lg font-bold hover:text-amber-300 transition truncate'
                        >
                          {runner.horse}
                        </button>
                        <div className='flex gap-2 flex-shrink-0'>
                          {runner.runningStyle && (
                            <span className={`pace-badge px-2 py-1 rounded-md text-xs font-medium ${runner.runningStyle === 'Front Runner' ? 'bg-red-500/10 text-red-400' : runner.runningStyle === 'Prominent' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                              {runner.runningStyle}
                              {runner.paceScore ? ` ${runner.paceScore > 0 ? '+' : ''}${runner.paceScore}` : ''}
                            </span>
                          )}
                          {runner.horseQuality && (
                            <span className={`hq-badge px-2 py-1 rounded-md text-xs font-medium ${runner.horseQuality.label === 'Elite' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-zinc-400'}`}>
                              {runner.horseQuality.label}
                            </span>
                          )}
                          {runner.probBand && (
                            <span className={`conf-badge px-2 py-1 rounded-md text-xs font-medium ${runner.probBand === 'A+' || runner.probBand === 'A' ? 'bg-green-500/10 text-green-400' : runner.probBand === 'B' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-zinc-400'}`}>
                              {runner.probBand}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className='runner-score flex items-center gap-4 flex-shrink-0'>
                        <div className='text-right'>
                          <strong className='text-xl font-black text-amber-400'>{runner.score}</strong>
                          <div className='flex gap-2 mt-1'>
                            {runner.winProb && (
                              <span className='px-2 py-0.5 bg-green-500/10 text-green-400 rounded-md text-xs font-medium'>W:{runner.winProb}%</span>
                            )}
                            {runner.placeProb && (
                              <span className='px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-md text-xs font-medium'>P:{runner.placeProb}%</span>
                            )}
                          </div>
                        </div>
                        <div className='text-right'>
                          <span className='text-lg font-bold'>{runner.odds ? `${runner.odds}` : '-'}</span>
                          <div className='flex gap-1 mt-1 flex-wrap justify-end'>
                            {runner.betQuality && runner.betQuality !== 'NO BET' && (
                              <span className='bet-quality px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-md text-xs font-medium'>{runner.betQuality}</span>
                            )}
                            {runner.selectionQuality && runner.selectionQuality.grade && (
                              <span className={`sel-grade px-2 py-0.5 rounded-md text-xs font-medium ${runner.selectionQuality.grade === 'A+' || runner.selectionQuality.grade === 'A' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-zinc-400'}`}>
                                {runner.selectionQuality.grade}
                              </span>
                            )}
                            {runner.confidenceTier && (
                              <span className={`tier-badge px-2 py-0.5 rounded-md text-xs font-medium ${runner.confidenceTier.tier === 'S' || runner.confidenceTier.tier === 'A' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-zinc-400'}`}>
                                T{runner.confidenceTier.tier}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              <RacePressureGraph race={race} />
            </article>
          )
        })}
      </section>

      {selectedRace && (
        <RaceModal
          race={selectedRace}
          onClose={() => setSelectedRace(null)}
        />
      )}
    </div>
  )
}
