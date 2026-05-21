import { openAtTheRacesHorseForm } from '../lib/horseLinks'
import { formatOffTime } from '../lib/formatTime'

interface RaceModalProps {
  race: any
  onClose: () => void
}

export default function RaceModal({
  race,
  onClose,
}: RaceModalProps) {
  if (!race) return null

  return (
    <div className='race-modal-backdrop'>
      <div className='race-modal'>
        <div className='race-modal-header'>
          <div>
            <span className='eyebrow'>Race view</span>

            <h2>
              {race.race_name}
            </h2>

            <p>
              {race.course} -{' '}
              {formatOffTime(race)}
            </p>
          </div>

          <button
            type='button'
            onClick={onClose}
            className='modal-close-button'
          >
            Close
          </button>
        </div>

        <div className='modal-runner-list'>
          {(race.runners || []).map(
            (
              runner: any,
              index: number
            ) => (
              <div
                key={index}
                className='modal-runner-card'
              >
                <div className='modal-runner-main'>
                  <button
                    type='button'
                    onClick={() =>
                      openAtTheRacesHorseForm(runner, race)
                    }
                    className='modal-runner-name'
                  >
                    {runner.horse}
                  </button>

                  <p>
                    {runner.jockey} -{' '}
                    {runner.trainer}
                  </p>

                  <div className='modal-runner-tags'>
                    <span>
                      OR:{' '}
                      {runner.or || runner.ofr || '-'}
                    </span>

                    <span>
                      RPR:{' '}
                      {runner.rpr || '-'}
                    </span>

                    <span>
                      Odds:{' '}
                      {runner.odds || '-'}
                    </span>

                    <span>
                      Draw:{' '}
                      {runner.draw || '-'}
                    </span>
                  </div>
                </div>

                <div className='modal-score-block'>
                  <strong>
                    {runner.score ||
                      runner.aiProfile?.confidence ||
                      0}
                  </strong>

                  <span>
                    APEX Score
                  </span>
                </div>

                {runner.selectionQuality && (
                  <div className='modal-sel-quality'>
                    <div className='modal-sel-header'>
                      <span className={`modal-sel-grade grade-${runner.selectionQuality.grade.replace('+', 'p')}`}>
                        {runner.selectionQuality.grade}
                      </span>
                      <span className={`modal-sel-rec rec-${runner.selectionQuality.recommendation.toLowerCase().replace(/[^a-z]/g, '')}`}>
                        {runner.selectionQuality.recommendation}
                      </span>
                    </div>
                    <div className='modal-sel-stats'>
                      <div className='modal-sel-stat'>
                        <span className='modal-sel-stat-label'>Win%</span>
                        <span className='modal-sel-stat-value'>{runner.winProb}%</span>
                      </div>
                      <div className='modal-sel-stat'>
                        <span className='modal-sel-stat-label'>Fair</span>
                        <span className='modal-sel-stat-value'>{runner.selectionQuality.fairOdds}</span>
                      </div>
                      <div className='modal-sel-stat'>
                        <span className='modal-sel-stat-label'>Market</span>
                        <span className='modal-sel-stat-value'>{runner.selectionQuality.marketOdds}</span>
                      </div>
                      <div className='modal-sel-stat'>
                        <span className='modal-sel-stat-label'>Edge</span>
                        <span className={`modal-sel-stat-value ${runner.selectionQuality.edge > 0 ? 'positive' : 'negative'}`}>
                          {(runner.selectionQuality.edge * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className='modal-sel-stat'>
                        <span className='modal-sel-stat-label'>Value</span>
                        <span className={`modal-sel-stat-value ${runner.selectionQuality.value > 0 ? 'positive' : 'negative'}`}>
                          {runner.selectionQuality.value > 0 ? '+' : ''}{runner.selectionQuality.value}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
