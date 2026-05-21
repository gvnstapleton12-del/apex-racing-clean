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

                {runner.horseQuality && (
                  <div className='modal-horse-quality'>
                    <div className='modal-hq-header'>
                      <span className='modal-hq-title'>Engine 1: Horse Quality</span>
                      <span className={`modal-hq-label hq-${runner.horseQuality.label.toLowerCase()}`}>
                        {runner.horseQuality.label}
                      </span>
                    </div>
                    <div className='modal-hq-score'>
                      <span className='modal-hq-value'>{runner.horseQuality.finalScore}</span>
                      <span className='modal-hq-sub'>Quality Score</span>
                    </div>
                    <div className='modal-hq-grid'>
                      <div className='modal-hq-item'>
                        <span className='modal-hq-item-label'>Power</span>
                        <span className={`modal-hq-item-value ${runner.horseQuality.power >= 65 ? 'hot' : runner.horseQuality.power >= 50 ? 'warm' : 'cold'}`}>
                          {runner.horseQuality.power}
                        </span>
                      </div>
                      <div className='modal-hq-item'>
                        <span className='modal-hq-item-label'>Suitability</span>
                        <span className={`modal-hq-item-value ${runner.horseQuality.suitability >= 65 ? 'hot' : runner.horseQuality.suitability >= 50 ? 'warm' : 'cold'}`}>
                          {runner.horseQuality.suitability}
                        </span>
                      </div>
                      <div className='modal-hq-item'>
                        <span className='modal-hq-item-label'>Consistency</span>
                        <span className={`modal-hq-item-value ${runner.horseQuality.consistency >= 65 ? 'hot' : runner.horseQuality.consistency >= 50 ? 'warm' : 'cold'}`}>
                          {runner.horseQuality.consistency}
                        </span>
                      </div>
                      <div className='modal-hq-item'>
                        <span className='modal-hq-item-label'>Pace Fit</span>
                        <span className={`modal-hq-item-value ${runner.horseQuality.paceCompat >= 65 ? 'hot' : runner.horseQuality.paceCompat >= 50 ? 'warm' : 'cold'}`}>
                          {runner.horseQuality.paceCompat}
                        </span>
                      </div>
                      <div className='modal-hq-item'>
                        <span className='modal-hq-item-label'>Volatility</span>
                        <span className={`modal-hq-item-value ${runner.horseQuality.volatility <= 35 ? 'hot' : runner.horseQuality.volatility <= 50 ? 'warm' : 'cold'}`}>
                          {runner.horseQuality.volatility}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

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
                        <span className='modal-sel-stat-label'>Place%</span>
                        <span className='modal-sel-stat-value'>{runner.placeProb || '-'}%</span>
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

                {runner.placeTraits && (
                  <div className='modal-place-traits'>
                    <div className='modal-place-traits-header'>
                      <span className='modal-place-traits-title'>Place Traits</span>
                    </div>
                    <div className='modal-place-traits-grid'>
                      <div className='modal-trait'>
                        <span className='modal-trait-label'>Consistency</span>
                        <span className={`modal-trait-value ${runner.placeTraits.consistency >= 65 ? 'hot' : runner.placeTraits.consistency >= 50 ? 'warm' : 'cold'}`}>
                          {runner.placeTraits.consistency}
                        </span>
                      </div>
                      <div className='modal-trait'>
                        <span className='modal-trait-label'>Reliability</span>
                        <span className={`modal-trait-value ${runner.placeTraits.reliability >= 65 ? 'hot' : runner.placeTraits.reliability >= 50 ? 'warm' : 'cold'}`}>
                          {runner.placeTraits.reliability}
                        </span>
                      </div>
                      <div className='modal-trait'>
                        <span className='modal-trait-label'>Honesty</span>
                        <span className={`modal-trait-value ${runner.placeTraits.honesty >= 65 ? 'hot' : runner.placeTraits.honesty >= 50 ? 'warm' : 'cold'}`}>
                          {runner.placeTraits.honesty}
                        </span>
                      </div>
                      <div className='modal-trait'>
                        <span className='modal-trait-label'>Finishing Kick</span>
                        <span className={`modal-trait-value ${runner.placeTraits.finishingKick >= 65 ? 'hot' : runner.placeTraits.finishingKick >= 50 ? 'warm' : 'cold'}`}>
                          {runner.placeTraits.finishingKick}
                        </span>
                      </div>
                      <div className='modal-trait'>
                        <span className='modal-trait-label'>Explosive</span>
                        <span className={`modal-trait-value ${runner.placeTraits.explosiveAbility >= 65 ? 'hot' : runner.placeTraits.explosiveAbility >= 50 ? 'warm' : 'cold'}`}>
                          {runner.placeTraits.explosiveAbility}
                        </span>
                      </div>
                      <div className='modal-trait'>
                        <span className='modal-trait-label'>Market</span>
                        <span className={`modal-trait-value ${runner.placeTraits.marketConfidence >= 65 ? 'hot' : runner.placeTraits.marketConfidence >= 50 ? 'warm' : 'cold'}`}>
                          {runner.placeTraits.marketConfidence}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {runner.interactions && runner.interactions.interactions && runner.interactions.interactions.length > 0 && (
                  <div className='modal-interactions'>
                    <div className='modal-interactions-header'>
                      <span className='modal-interactions-title'>Feature Interactions</span>
                      <span className={`modal-interactions-total ${runner.interactions.totalAdjustment >= 0 ? 'positive' : 'negative'}`}>
                        {runner.interactions.totalAdjustment >= 0 ? '+' : ''}{runner.interactions.totalAdjustment}
                      </span>
                    </div>
                    <div className='modal-interactions-list'>
                      {runner.interactions.interactions.map((interaction, idx) => (
                        <div key={idx} className={`modal-interaction-row ${interaction.direction}`}>
                          <span className='modal-interaction-label'>{interaction.label}</span>
                          <span className='modal-interaction-adjustment'>
                            {interaction.adjustment >= 0 ? '+' : ''}{interaction.adjustment}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {runner.simulation && runner.simulation.winRate > 0 && (
                  <div className='modal-engine-section'>
                    <div className='modal-engine-header'>
                      <span className='modal-engine-title'>Engine 2: Race Simulation</span>
                      <span className={`modal-engine-badge sim-${runner.simulation.raceShape.toLowerCase().replace(/[^a-z]/g, '')}`}>
                        {runner.simulation.raceShape}
                      </span>
                    </div>
                    <div className='modal-engine-stats'>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>Sim Win%</span>
                        <span className='modal-engine-stat-value'>{runner.simulation.winRate}%</span>
                      </div>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>Sim Place%</span>
                        <span className='modal-engine-stat-value'>{runner.simulation.placeRate}%</span>
                      </div>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>Avg Pos</span>
                        <span className='modal-engine-stat-value'>{runner.simulation.avgPosition}</span>
                      </div>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>Collapse%</span>
                        <span className={`modal-engine-stat-value ${runner.simulation.collapseRate > 15 ? 'negative' : ''}`}>
                          {runner.simulation.collapseRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {runner.valueEngine && runner.valueEngine.edgeLabel && (
                  <div className='modal-engine-section'>
                    <div className='modal-engine-header'>
                      <span className='modal-engine-title'>Engine 4: Value</span>
                      <span className={`modal-engine-badge val-${runner.valueEngine.valueGrade.toLowerCase().replace('+', 'p')}`}>
                        {runner.valueEngine.valueGrade}
                      </span>
                    </div>
                    <div className='modal-engine-stats'>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>Edge</span>
                        <span className={`modal-engine-stat-value ${runner.valueEngine.edge >= 0 ? 'positive' : 'negative'}`}>
                          {runner.valueEngine.edge >= 0 ? '+' : ''}{runner.valueEngine.edge}%
                        </span>
                      </div>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>EV</span>
                        <span className={`modal-engine-stat-value ${runner.valueEngine.expectedValue >= 0 ? 'positive' : 'negative'}`}>
                          {runner.valueEngine.expectedValue >= 0 ? '+' : ''}{runner.valueEngine.expectedValue}
                        </span>
                      </div>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>ROI</span>
                        <span className={`modal-engine-stat-value ${runner.valueEngine.roi >= 0 ? 'positive' : 'negative'}`}>
                          {runner.valueEngine.roi >= 0 ? '+' : ''}{runner.valueEngine.roi}%
                        </span>
                      </div>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>Bettable</span>
                        <span className={`modal-engine-stat-value ${runner.valueEngine.bettable ? 'positive' : 'negative'}`}>
                          {runner.valueEngine.bettable ? 'YES' : 'NO'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {runner.bankrollEngine && runner.bankrollEngine.label && (
                  <div className='modal-engine-section'>
                    <div className='modal-engine-header'>
                      <span className='modal-engine-title'>Engine 5: Bankroll</span>
                      <span className={`modal-engine-badge bank-${runner.bankrollEngine.label.toLowerCase().replace(/[^a-z]/g, '')}`}>
                        {runner.bankrollEngine.label}
                      </span>
                    </div>
                    <div className='modal-engine-stats'>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>Stake</span>
                        <span className='modal-engine-stat-value'>{runner.bankrollEngine.stake || 0}</span>
                      </div>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>Units</span>
                        <span className='modal-engine-stat-value'>{runner.bankrollEngine.units || 0}</span>
                      </div>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>Kelly</span>
                        <span className='modal-engine-stat-value'>{runner.bankrollEngine.adjustedKelly || 0}%</span>
                      </div>
                      <div className='modal-engine-stat'>
                        <span className='modal-engine-stat-label'>Reason</span>
                        <span className='modal-engine-stat-reason'>{runner.bankrollEngine.reason || '-'}</span>
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
