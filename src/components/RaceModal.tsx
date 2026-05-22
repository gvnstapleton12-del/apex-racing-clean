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
    <div className='race-modal-backdrop'>
      <div className='race-modal'>
        <div className='race-modal-header'>
          <div>
            <span className='eyebrow'>Race view</span>
            <h2>{race.race_name}</h2>
            <p>{race.course} - {formatOffTime(race)}</p>
          </div>
          <button type='button' onClick={onClose} className='modal-close-button'>Close</button>
        </div>

        <div className='modal-runner-list'>
          {runners.map((runner, index) => (
            <RunnerDetailCard key={index} runner={runner} race={race} rank={index + 1} compact />
          ))}
        </div>
      </div>
    </div>
  )
}
