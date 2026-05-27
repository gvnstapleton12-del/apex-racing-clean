import { formatOffTime } from '../lib/formatTime'
import { sortByScore } from '../lib/engine'
import type { Race } from '../lib/types'
import RunnerDetailCard from './RunnerDetailCard'

interface RaceModalProps {
  race: Race
  onClose: () => void
}

export default function RaceModal({ race, onClose }: RaceModalProps) {
  if (!race) return null

  const runners = sortByScore(race.runners || [])

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4' onClick={onClose}>
      <div className='relative w-full max-w-4xl max-h-[85vh] overflow-hidden bg-[#0f1720] border border-white/10 rounded-2xl shadow-2xl' onClick={(e) => e.stopPropagation()}>
        <div className='sticky top-0 z-10 flex items-center justify-between p-6 border-b border-white/5 bg-[#0f1720]/95 backdrop-blur'>
          <div>
            <span className='text-zinc-500 text-sm font-medium uppercase tracking-wider'>Race view</span>
            <h2 className='text-2xl font-bold text-white mt-1'>{race.race_name}</h2>
            <p className='text-zinc-400 text-sm'>{race.course} - {formatOffTime(race)}</p>
          </div>
          <button type='button' onClick={onClose} className='px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 border border-white/10 transition'>
            Close
          </button>
        </div>

        <div className='overflow-y-auto max-h-[calc(85vh-5rem)] p-6 space-y-4'>
          {runners.map((runner, index) => (
            <RunnerDetailCard key={index} runner={runner} race={race} rank={index + 1} compact />
          ))}
        </div>
      </div>
    </div>
  )
}
