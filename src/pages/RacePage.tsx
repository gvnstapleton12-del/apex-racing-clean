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
    <div className='max-w-4xl mx-auto'>
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

      <div className='bg-[#0f1720]/[0.5] backdrop-blur-xl border border-green-500/10 rounded-2xl overflow-hidden'>
        <div className='p-8 pb-6 border-b border-white/5'>
          <div className='flex items-center gap-3 mb-4'>
            <span className='px-3 py-1 rounded-lg text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/20'>LIVE</span>
            <span className='text-zinc-500 text-sm'>{race.field_size || runners.length} runners</span>
            {race.going && <span className='text-zinc-500 text-sm'>· {race.going}</span>}
            {race.surface && <span className='text-zinc-500 text-sm'>· {race.surface}</span>}
          </div>
          <h1 className='text-3xl font-black tracking-tight'>{race.race_name}</h1>
          <p className='text-zinc-400 text-lg mt-2'>
            {race.course} · {formatOffTime(race)}
            {race.distance_f && <span> · {race.distance_f}</span>}
          </p>
        </div>

        <div className='p-8 pt-6 space-y-4'>
          {runners.map((runner, index) => (
            <RunnerDetailCard key={index} runner={runner} race={race} rank={index + 1} />
          ))}
        </div>
      </div>
    </div>
  )
}
