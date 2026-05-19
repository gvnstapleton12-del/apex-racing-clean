import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchRacecards } from '../lib/racingApi'

import RaceModal from '../components/RaceModal'

export default function Racecards() {
  const [selectedRace, setSelectedRace] =
    useState(null)

  const {
    data: races = [],
    isLoading,
  } = useQuery<any[]>({
    queryKey: ['racecards'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

  if (isLoading) {
    return (
      <div className='p-6'>
        <div className='border rounded-xl p-6 bg-card'>
          Loading live racecards...
        </div>
      </div>
    )
  }

  return (
    <div className='p-6 space-y-4'>
      <div>
        <h1 className='text-3xl font-bold'>
          Live Racecards
        </h1>

        <p className='text-muted-foreground'>
          UK & Ireland meetings only
        </p>
      </div>

      {races.map(
        (race: any, index: number) => {
          const scoredRunners =
            (
              race.runners || []
            ).map((runner: any) => ({
              ...runner,

              score:
                runner.aiProfile
                  ?.confidence ||
                runner.score ||
                0,

              replayTriggers: [],
            }))

          const topRated =
            scoredRunners?.sort(
              (a: any, b: any) =>
                (b.score || 0) -
                (a.score || 0)
            )[0]

          return (
            <div
              key={
                race.race_id || index
              }
              className='relative z-10 border rounded-2xl bg-card p-6 space-y-4'
            >
              <div className='flex items-center justify-between'>
                <div>
                  <h2 className='text-2xl font-semibold'>
                    {race.race_name}
                  </h2>

                  <p className='text-muted-foreground'>
                    {race.course} ·{' '}
                    {race.off_time}
                  </p>
                </div>

                <div className='text-right space-y-2'>
                  <p>
                    {race.field_size}{' '}
                    runners
                  </p>

                  <p className='text-amber-400'>
                    LIVE
                  </p>

                  <button
                    type='button'
                    onClick={() =>
                      setSelectedRace(
                        race
                      )
                    }
                    className='relative z-50 pointer-events-auto px-4 py-2 rounded-xl bg-amber-500 text-black font-bold hover:opacity-90 cursor-pointer'
                  >
                    View Race
                  </button>
                </div>
              </div>

              {topRated && (
                <div className='rounded-xl border border-amber-500/30 bg-amber-500/10 p-4'>
                  <p className='text-sm text-amber-300 mb-1'>
                    Top Rated
                  </p>

                  <div className='flex items-center justify-between'>
                    <h3 className='text-xl font-bold'>
                      {
                        topRated.horse
                      }
                    </h3>

                    <p className='text-amber-400 font-semibold'>
                      {
                        topRated.score
                      }
                    </p>
                  </div>
                </div>
              )}

              <div className='grid gap-3'>
                {scoredRunners
                  .slice(0, 5)
                  .map(
                    (
                      runner: any,
                      runnerIndex: number
                    ) => (
                      <div
                        key={
                          runnerIndex
                        }
                        className='border rounded-xl p-4 flex items-center justify-between'
                      >
                        <div>
                          <button
                            type='button'
                            onClick={() => {
                              window.open(
                                `https://www.google.com/search?q=${encodeURIComponent(
                                  runner.horse +
                                    ' At The Races'
                                )}`,
                                '_blank'
                              )
                            }}
                            className='font-semibold hover:text-amber-400 transition-colors text-left'
                          >
                            {
                              runner.horse
                            }
                          </button>

                          <p className='text-sm text-muted-foreground'>
                            {
                              runner.jockey
                            }{' '}
                            ·{' '}
                            {
                              runner.trainer
                            }
                          </p>
                        </div>

                        <div className='text-right'>
                          <p className='font-bold text-lg'>
                            {
                              runner.score
                            }
                          </p>

                          <p className='text-amber-400'>
                            {
                              runner.odds
                            }
                          </p>
                        </div>
                      </div>
                    )
                  )}
              </div>
            </div>
          )
        }
      )}

      {selectedRace && (
        <RaceModal
          race={selectedRace}
          onClose={() =>
            setSelectedRace(null)
          }
        />
      )}
    </div>
  )
}