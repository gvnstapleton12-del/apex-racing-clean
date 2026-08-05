import { useEffect, useRef, useState, Fragment } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import type { Race, Runner } from '../lib/types'
import { fetchLiveState } from '../lib/racingApi'
import type { LiveState } from '../lib/racingApi'
import { useSocketLiveUpdate } from '../lib/useSocket'
import { formatOffTime } from '../lib/formatTime'
import { getAtTheRacesHorseUrl } from '../lib/horseLinks'
import { filterGBIRE, filterToday, filterUnfinished, sortByOffTime, sortByScore, getScore, scoreRunners, countRunners } from '../lib/engine'
import RacePage from './RacePage'
import RacePressureGraph from '../components/RacePressureGraph'
import ScoreRing from '../components/ScoreRing'
import MetricCard from '../components/MetricCard'

export default function Racecards({ selectHorse }: { selectHorse?: { horse: string; course: string; offTime: string } | null }) {
  const [selectedRace, setSelectedRace] = useState<Race | null>(null)
  const [search, setSearch] = useState('')
  const scrollTarget = useRef<HTMLDivElement>(null)

  const { data: liveState, isLoading } = useQuery<LiveState>({
    queryKey: ['racecards'],
    queryFn: fetchLiveState,
    refetchInterval: 60000,
    placeholderData: keepPreviousData,
    retry: 3,
    retryDelay: 5000,
  })
  useSocketLiveUpdate(['racecards', 'home-racecards'])
  const races = liveState?.racecards || []
  const processingComplete = liveState?.processingComplete ?? false

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      const { course, offTime } = detail
      if (!course) return
      const allRaces = sortByOffTime(filterGBIRE(races))
      const match = allRaces.find(r => r.course === course && r.off_time === offTime)
      if (match) {
        setSelectedRace(match)
      }
    }
    window.addEventListener('select-horse', handler)
    return () => window.removeEventListener('select-horse', handler)
  }, [races])

  useEffect(() => {
    if (selectedRace) {
      window.scrollTo(0, 0)
    }
  }, [selectedRace])

  useEffect(() => {
    if (selectHorse && races.length > 0) {
      const allRaces = sortByOffTime(filterGBIRE(races))
      const match = allRaces.find(r => r.course === selectHorse.course && r.off_time === selectHorse.offTime)
      if (match) {
        setSelectedRace(match)
      }
    }
  }, [selectHorse, races])

  if (isLoading || (!processingComplete && races.length === 0)) {
    return (
      <div className='dashboard-page max-w-7xl mx-auto'>
        <div className='loading-card bg-white/[0.02] rounded-2xl border border-white/5 p-12 flex items-center gap-4'>
          <div className='pulse-dot' />
          <span className='text-zinc-400'>Loading live racecards...</span>
        </div>
      </div>
    )
  }

  if (!processingComplete) {
    return (
      <div className='dashboard-page max-w-7xl mx-auto'>
        <div className='loading-card bg-white/[0.02] rounded-2xl border border-amber-500/10 p-12 flex items-center gap-4'>
          <div className='pulse-dot' />
          <span className='text-zinc-400'>Processing {races.length} races... racecards will appear shortly</span>
        </div>
      </div>
    )
  }

  const ukIreRaces = sortByOffTime(filterGBIRE(races))
  const todayRaces = filterToday(ukIreRaces)
  const totalRunners = countRunners(todayRaces)
  const ukNow = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
  const nextRace = todayRaces.find(r => r.off_time && r.off_time >= ukNow) || todayRaces[0]
  const filtered = search
    ? todayRaces.filter((r) =>
        `${r.course} ${r.race_name}`.toLowerCase().includes(search.toLowerCase())
      )
    : todayRaces

  if (selectedRace) {
    return (
      <div className='p-6'>
        <RacePage race={selectedRace} onBack={() => { setSelectedRace(null); window.scrollTo(0, 0) }} />
      </div>
    )
  }

  // Find top opportunity across all races
  const allRunners = todayRaces.flatMap(race => 
    (race.runners || []).map(runner => ({ ...runner, race }))
  )
  const topOpportunity = allRunners.length > 0 
    ? allRunners.reduce((best, runner) => {
        const score = getScore(runner)
        return score > getScore(best) ? runner : best
      })
    : null

  return (
    <div className='dashboard-page max-w-7xl mx-auto'>

      {/* Top Opportunity Hero */}
      {topOpportunity && (
        <section className='apex-card top-pick-hero p-5 mb-6'>
          <div className='flex items-center justify-between relative z-10'>
            <div>
              <div className='text-[10px] text-zinc-500 uppercase tracking-[0.3em] mb-1'>Today's Best Opportunity</div>
              <h2 className='text-2xl xl:text-3xl font-black text-white leading-tight max-w-5xl'>{topOpportunity.horse}</h2>
              <div className='text-sm text-zinc-300 font-medium mt-1'>
                {topOpportunity.race.course} · {formatOffTime(topOpportunity.race)} · {topOpportunity.race.race_name}
              </div>
            </div>
            <div className='flex items-center gap-6 flex-shrink-0'>
              <div className='text-center'>
                <div className='text-4xl font-black text-amber-400'>{getScore(topOpportunity) > 0 ? getScore(topOpportunity) : '—'}</div>
                <div className='text-[10px] text-zinc-400 uppercase tracking-wider mt-1 whitespace-nowrap'>APEX</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {!todayRaces.length && (
        <div className='empty-state bg-white/[0.02] rounded-2xl border border-white/5 p-12'>
          <h2 className='text-2xl font-bold'>No more races today</h2>
          <p className='text-zinc-400 mt-2'>All of today's races have finished. Check the Results tab for completed races.</p>
        </div>
      )}

      <section className='space-y-6'>
        <div className='flex items-center gap-3'>
          <input
            type='text'
            placeholder='Search course or race name...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/40 transition'
          />
          {search && (
            <button
              type='button'
              onClick={() => setSearch('')}
              className='px-3 py-3 text-zinc-400 hover:text-white transition'
            >
              ✕
            </button>
          )}
        </div>

        {search && filtered.length > 0 && (
          <p className='text-zinc-500 text-sm'>{filtered.length} of {todayRaces.length} races</p>
        )}

        {!filtered.length && (
          <div className='empty-state bg-white/[0.02] rounded-2xl border border-white/5 p-8 text-center'>
            <p className='text-zinc-400'>{search ? `No races match "${search}"` : 'No races today'}</p>
          </div>
        )}

        {/* Race Cards Grid */}
        <div className='grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6'>
          {filtered.map((race, index) => {
            const runners = scoreRunners(race.runners || [])
            const topRated = sortByScore(runners)[0]

            return (
              <Fragment key={race.race_id || index}>
              <article
                id={`race-${race.course ? race.course.replace(/\s+/g, '-') : ''}-${(race.off_time || '').replace(':', '')}`}
                className='race-card-2'
              >
                <div className='race-card-2-header'>
                  <div>
                    <div className='race-card-2-time'>{formatOffTime(race)}</div>
                    <div className='race-card-2-course'>{race.course}</div>
                    <h2 className='race-card-2-name'>{race.race_name}</h2>
                  </div>
                  <button
                    type='button'
                    onClick={() => setSelectedRace(race)}
                    className='race-card-2-action'
                    style={{ width: 'auto', padding: '10px 20px' }}
                  >
                    Open Race
                  </button>
                </div>

                {topRated && (
                  <div className='race-card-2-top-pick'>
                    <div className='race-card-2-top-label'>Top Pick</div>
                    <a
                      href={getAtTheRacesHorseUrl(topRated, race)}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='race-card-2-top-name hover:text-amber-400 transition'
                    >
                      {topRated.horse}
                    </a>
                    <div className='flex items-center gap-6'>
                      <div className='text-4xl font-black text-amber-400'>{getScore(topRated) > 0 ? getScore(topRated) : '—'}</div>
                      <div className='flex-1 space-y-2'>
                        <div className='flex justify-between items-center'>
                          <span className='text-xs text-zinc-400 uppercase tracking-wider'>Confidence</span>
                          <span className='text-sm font-bold text-white'>{topRated.winProb ? `${topRated.winProb.toFixed(0)}%` : '—'}</span>
                        </div>
                        <div className='flex justify-between items-center'>
                          <span className='text-xs text-zinc-400 uppercase tracking-wider'>Value</span>
                          <span className={`text-sm font-bold ${topRated.valueEdge > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {topRated.valueEdge ? `${topRated.valueEdge > 0 ? '+' : ''}${(topRated.valueEdge * 100).toFixed(0)}%` : '—'}
                          </span>
                        </div>
                        <div className='flex justify-between items-center'>
                          <span className='text-xs text-zinc-400 uppercase tracking-wider'>Pace Edge</span>
                          <span className={`text-sm font-bold ${topRated.paceScore > 5 ? 'text-green-400' : topRated.paceScore > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                            {topRated.paceScore ? (topRated.paceScore > 5 ? 'Strong' : topRated.paceScore > 0 ? 'Moderate' : 'Neutral') : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className='race-card-2-stats'>
                  <div className='race-card-2-stat'>
                    <span className='race-card-2-stat-label'>Runners</span>
                    <span className='race-card-2-stat-value'>{race.field_size}</span>
                  </div>
                  {race.paceMap && (
                    <div className='race-card-2-stat'>
                      <span className='race-card-2-stat-label'>Pace</span>
                      <span className={`race-card-2-stat-value ${race.paceMap.projectedTempo === 'FAST' ? 'text-red-400' : race.paceMap.projectedTempo === 'SLOW' ? 'text-blue-400' : 'text-amber-400'}`}>
                        {race.paceMap.projectedTempo}
                      </span>
                    </div>
                  )}
                  {race.going && (
                    <div className='race-card-2-stat'>
                      <span className='race-card-2-stat-label'>Going</span>
                      <span className='race-card-2-stat-value text-green-400'>{race.going}</span>
                    </div>
                  )}
                </div>
              </article>
              {(race.raceShape || race.paceMap) && (
                <RacePressureGraph race={race} />
              )}
              </Fragment>
            )
          })}
        </div>
      </section>
    </div>
  )
}
