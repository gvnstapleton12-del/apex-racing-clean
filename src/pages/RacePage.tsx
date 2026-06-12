import type { Race } from '../lib/types'
import { sortByScore } from '../lib/engine'
import { formatOffTime } from '../lib/formatTime'
import RunnerDetailCard from '../components/RunnerDetailCard'

interface RacePageProps {
  race: Race
  onBack: () => void
}

export default function RacePage({ race, onBack }: RacePageProps) {
  if (!race) return null

  const runners = sortByScore(race.runners || [])

  return (
    <div className='max-w-7xl mx-auto'>
      <button
        type='button'
        onClick={onBack}
        className='flex items-center gap-2 text-zinc-400 hover:text-white transition mb-6 group'
      >
        <svg className='w-5 h-5 group-hover:-translate-x-1 transition-transform' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M19 12H5' />
          <polyline points='12 19 5 12 12 5' />
        </svg>
        <span className='font-medium'>Back to Racecards</span>
      </button>

      <div className='apex-card overflow-hidden'>
        <div className='relative p-6 pb-5 border-b border-white/5 overflow-hidden'>
          <img src='/images/racecourse-grandstand.jpg' alt='' className='absolute inset-0 w-full h-full object-cover opacity-15' />
          <div className='absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/70' />
          <div className='relative z-10'>
            <div className='flex items-center gap-2 mb-3'>
              <span className='px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-green-500 text-black'>LIVE</span>
              <span className='text-zinc-300 text-sm font-medium'>{race.field_size || runners.length} runners</span>
              {race.going && <span className='text-zinc-300 text-sm'>· {race.going}</span>}
              {race.surface && <span className='text-zinc-300 text-sm'>· {race.surface}</span>}
            </div>
            <h1 className='text-2xl xl:text-3xl font-black tracking-tight leading-tight max-w-5xl'>{race.race_name}</h1>
            <p className='text-zinc-200 text-base mt-1.5 font-medium'>
              {race.course} · {formatOffTime(race)}
              {race.distance_f && <span> · {race.distance_f}</span>}
            </p>
          </div>
        </div>

        <div className='p-5 pt-4'>
          <div className='grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4'>
            {runners.map((runner, index) => (
              <RunnerDetailCard key={index} runner={runner} race={race} rank={index + 1} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
