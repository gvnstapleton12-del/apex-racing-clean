import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Race, Runner } from '../lib/types'
import { fetchRacecards } from '../lib/racingApi'
import { formatOffTime } from '../lib/formatTime'
import { getAtTheRacesHorseUrl } from '../lib/horseLinks'
import { filterGBIRE, filterToday, filterUnfinished, sortByOffTime, sortByScore, getScore, scoreRunners, countRunners } from '../lib/engine'
import RacePage from './RacePage'
import RacePressureGraph from '../components/RacePressureGraph'
import ScoreRing from '../components/ScoreRing'
import MetricCard from '../components/MetricCard'

export default function Racecards() {
  const [selectedRace, setSelectedRace] = useState<Race | null>(null)
  const [search, setSearch] = useState('')
  const scrollTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      const { course, offTime } = detail
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

  const { data: races = [], isLoading } = useQuery<Race[]>({
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

  const ukIreRaces = sortByOffTime(filterGBIRE(races))
  const unfinishedRaces = filterUnfinished(ukIreRaces)
  const todayRaces = filterToday(unfinishedRaces)
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
        <RacePage race={selectedRace} onBack={() => setSelectedRace(null)} />
      </div>
    )
  }

  return (
    <div className='dashboard-page max-w-7xl mx-auto'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className={`text-sm font-medium uppercase tracking-wider px-3 py-1 rounded-full border ${todayRaces.length ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-white/5 border-white/10 text-zinc-500'}`}>
            {todayRaces.length ? 'UK & Ireland live feed' : 'UK & Ireland archive'}
          </span>
          <h1 className='text-6xl font-black tracking-tight mt-4'>Racecards command centre</h1>
          <p className='text-zinc-400 text-lg mt-4 max-w-2xl'>
            Live runners, confidence scores, market positions and race-level signals in one focused workspace.
          </p>
        </div>

        <div className='hero-metrics grid grid-cols-3 gap-4'>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-5 border border-white/5'>
            <span className='text-zinc-400 text-sm block mb-2'>Races</span>
            <strong className='text-4xl font-bold text-amber-400'>{races.length}</strong>
          </div>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-5 border border-white/5'>
            <span className='text-zinc-400 text-sm block mb-2'>Runners</span>
            <strong className='text-4xl font-bold text-amber-400'>{totalRunners}</strong>
          </div>
          <div className='bg-white/[0.03] backdrop-blur-xl rounded-xl p-5 border border-white/5'>
            <span className='text-zinc-400 text-sm block mb-2'>Next off</span>
            <strong className='text-2xl font-bold text-amber-400'>{nextRace ? formatOffTime(nextRace) : 'No more races'}</strong>
          </div>
        </div>
      </section>

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
            className='flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-green-500/40 transition'
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

        {filtered.map((race, index) => {
          const runners = scoreRunners(race.runners || [])
          const topRated = sortByScore(runners)[0]

          return (
            <article
              key={race.race_id || index}
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
                    <ScoreRing score={getScore(topRated)} size={70} strokeWidth={5} />
                    <div className='race-card-2-metrics' style={{ flex: 1, marginBottom: 0 }}>
                      <MetricCard label='OR' value={topRated.or} color='amber' />
                      <MetricCard label='RPR' value={topRated.rpr} color='violet' />
                      <MetricCard label='PR' value={topRated.performanceRating?.pr ? Math.round(topRated.performanceRating.pr) : null} color='cyan' />
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
          )
        })}
      </section>
    </div>
  )
}
