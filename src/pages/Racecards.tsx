import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchRacecards } from '../lib/racingApi'
import { openAtTheRacesHorseForm } from '../lib/horseLinks'
import { formatOffTime } from '../lib/formatTime'

import RaceModal from '../components/RaceModal'

export default function Racecards() {
  const [selectedRace, setSelectedRace] = useState(null)

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

  const now = new Date()

  const sortedRaces = [...races].sort((a: any, b: any) => {
    const aTime = a.off_dt || a.off_time || ''
    const bTime = b.off_dt || b.off_time || ''
    return aTime < bTime ? -1 : aTime > bTime ? 1 : 0
  })

  const upcomingRaces = sortedRaces.filter((race: any) => {
    if (race.off_dt) {
      return new Date(race.off_dt) > now
    }
    return true
  })

  const totalRunners = sortedRaces.reduce(
    (total: number, race: any) =>
      total + (race.runners?.length || 0),
    0
  )

  const nextRace = upcomingRaces[0]

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

      <section className='race-grid'>
        {sortedRaces.map((race: any, index: number) => {
          const scoredRunners = (race.runners || []).map(
            (runner: any) => ({
              ...runner,
              score:
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
              className='race-card'
            >
              <div className='race-card-header'>
                <div>
                  <div className='race-meta-row'>
                    <span className='live-badge'>LIVE</span>
                    <span>{race.field_size} runners</span>
                  </div>

                  <h2>{race.race_name}</h2>

                  <p>
                    {race.course} - {formatOffTime(race)}
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
                      </div>

                      <div className='runner-score'>
                        <strong>{runner.score}</strong>
                        <span>{runner.odds || '-'}</span>
                      </div>
                    </div>
                  ))}
              </div>
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
