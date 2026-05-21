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
      <div className='dashboard-page'>
        <div className='loading-card'>
          <div className='pulse-dot' />
          <span>Loading live racecards...</span>
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
    <div className='dashboard-page'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow'>UK & Ireland live feed</span>

          <h1>Racecards command centre</h1>

          <p>
            Live runners, confidence scores, market positions and
            race-level signals in one focused workspace.
          </p>
        </div>

        <div className='hero-metrics'>
          <div>
            <span>Races</span>
            <strong>{races.length}</strong>
          </div>

          <div>
            <span>Runners</span>
            <strong>{totalRunners}</strong>
          </div>

          <div>
            <span>Next off</span>
            <strong>{nextRace ? formatOffTime(nextRace) : 'No more races'}</strong>
          </div>
        </div>
      </section>

      {!todayRaces.length && (
        <div className='empty-state'>
          <h2>No more races today</h2>
          <p>All of today's races have finished. Check the Results tab for completed races.</p>
        </div>
      )}

      <section className='race-grid'>
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
              className='race-card'
            >
              <div className='race-card-header'>
                <div>
                  <div className='race-meta-row'>
                    <span className='live-badge'>LIVE</span>
                    <span>{race.field_size} runners</span>
                    {race.paceMap && (
                      <span className={`pace-tempo pace-${race.paceMap.projectedTempo.toLowerCase()}`}>
                        {race.paceMap.projectedTempo}
                        {race.paceMap.collapseRisk === 'HIGH' ? ' ⚡' : ''}
                      </span>
                    )}
                    {race.betFilter && (
                      <span className={`bet-filter-badge bf-${race.betFilter.verdict.toLowerCase().replace(/[^a-z]/g, '')}`}>
                        {race.betFilter.verdict}
                      </span>
                    )}
                  </div>

                  <h2>{race.race_name}</h2>

                  <p>
                    {race.course} - {formatOffTime(race)}
                    {' | '}
                    {race.distance_f || ''}
                    {race.going ? ` | ${race.going}` : ''}
                    {race.surface ? ` | ${race.surface}` : ''}
                  </p>
                </div>

                <button
                  type='button'
                  onClick={() => setSelectedRace(race)}
                  className='primary-button'
                >
                  View Race
                </button>
              </div>

              {topRated && (
                <div className='top-rated-strip'>
                  <p>Top Rated</p>

                  <div>
                    <button
                      type='button'
                      onClick={() =>
                        openAtTheRacesHorseForm(topRated, race)
                      }
                      className='top-rated-name-button'
                    >
                      {topRated.horse}
                    </button>

                    <strong>{topRated.score}</strong>
                  </div>
                </div>
              )}

              <div className='runner-list'>
                {scoredRunners
                  .slice(0, 5)
                  .map((runner: any, runnerIndex: number) => (
                    <div
                      key={runnerIndex}
                      className='runner-row'
                    >
                      <div>
                        <button
                          type='button'
                          onClick={() =>
                            openAtTheRacesHorseForm(runner, race)
                          }
                          className='runner-name-button'
                        >
                          {runner.horse}
                        </button>

                        <p>
                          {runner.jockey} - {runner.trainer}
                        </p>

                        {runner.runningStyle && (
                          <span className={`pace-badge pace-${runner.runningStyle.toLowerCase().replace(' ', '-')}`}>
                            {runner.runningStyle}
                            {runner.paceScore ? ` ${runner.paceScore > 0 ? '+' : ''}${runner.paceScore}` : ''}
                          </span>
                        )}
                        {runner.horseQuality && (
                          <span className={`hq-badge hq-${runner.horseQuality.label.toLowerCase()}`}>
                            {runner.horseQuality.label}
                          </span>
                        )}
                        {runner.probBand && (
                          <span className={`conf-badge conf-${runner.probBand.toLowerCase().replace(/[^a-z]/g, '')}`}>
                            {runner.probBand}
                          </span>
                        )}
                      </div>

                      <div className='runner-score'>
                        <strong>{runner.score}</strong>
                        <span className='text-win'>
                          {runner.winProb ? `W:${runner.winProb}%` : ''}
                          {runner.placeProb ? ` P:${runner.placeProb}%` : ''}
                        </span>
                        <span className='text-odds'>
                          {runner.odds ? `${runner.odds}` : '-'}
                        </span>
                        {runner.betQuality && runner.betQuality !== 'NO BET' && (
                          <span className='bet-quality'>{runner.betQuality}</span>
                        )}
                        {runner.selectionQuality && runner.selectionQuality.grade && (
                          <span className={`sel-grade grade-${runner.selectionQuality.grade.replace('+', 'p')}`}>
                            {runner.selectionQuality.grade}
                          </span>
                        )}
                        {runner.confidenceTier && (
                          <span className={`tier-badge tier-${runner.confidenceTier.tier.toLowerCase()}`}>
                            T{runner.confidenceTier.tier}
                          </span>
                        )}
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
