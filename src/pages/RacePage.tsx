import { openAtTheRacesHorseForm } from '../lib/horseLinks'
import { formatOffTime } from '../lib/formatTime'

interface RacePageProps {
  race: any
  onBack: () => void
}

export default function RacePage({ race, onBack }: RacePageProps) {
  if (!race) return null

  const runners = (race.runners || []).sort((a: any, b: any) => {
    const aScore = a.score || a.aiProfile?.confidence || 0
    const bScore = b.score || b.aiProfile?.confidence || 0
    return bScore - aScore
  })

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <button
        type='button'
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}
      >
        ← Back to Racecards
      </button>

      <div style={{ background: '#0f1720', border: '1px solid rgba(52, 211, 153, 0.1)', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '32px 32px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <span style={{ background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}>LIVE</span>
            <span style={{ color: '#6b7280', fontSize: '14px' }}>{race.field_size || runners.length} runners</span>
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#fff', margin: 0 }}>{race.race_name}</h1>
          <p style={{ color: '#9ca3af', fontSize: '16px', marginTop: '8px' }}>
            {race.course} · {formatOffTime(race)}
            {race.distance_f && ` · ${race.distance_f}`}
            {race.going && ` · ${race.going}`}
          </p>
        </div>

        <div style={{ padding: '24px 32px 32px' }}>
          {runners.map((runner: any, index: number) => {
            const score = runner.score || runner.aiProfile?.confidence || 0
            const isFirst = index === 0

            return (
              <div
                key={index}
                style={{
                  background: isFirst ? 'rgba(245, 158, 11, 0.05)' : 'rgba(255,255,255,0.02)',
                  border: isFirst ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ background: isFirst ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.05)', color: isFirst ? '#fbbf24' : '#6b7280', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>
                        #{index + 1}
                      </span>
                      {runner.confidenceTier && (
                        <span style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>
                          T{runner.confidenceTier.tier}
                        </span>
                      )}
                      {runner.runningStyle && (
                        <span style={{ background: runner.runningStyle === 'Front Runner' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(96, 165, 250, 0.1)', color: runner.runningStyle === 'Front Runner' ? '#f87171' : '#60a5fa', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                          {runner.runningStyle}
                        </span>
                      )}
                    </div>
                    <button
                      type='button'
                      onClick={() => openAtTheRacesHorseForm(runner, race)}
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    >
                      {runner.horse}
                    </button>
                    <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '4px' }}>
                      {runner.jockey}{runner.jockey && runner.trainer && ' · '}{runner.trainer}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                      {runner.odds && <span style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>{runner.odds}</span>}
                      {runner.draw && <span style={{ background: 'rgba(255,255,255,0.04)', color: '#9ca3af', padding: '4px 8px', borderRadius: '6px', fontSize: '12px' }}>Draw {runner.draw}</span>}
                      {runner.winProb && <span style={{ background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>W:{runner.winProb}%</span>}
                      {runner.placeProb && <span style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>P:{runner.placeProb}%</span>}
                    </div>
                  </div>

                  <div style={{ background: isFirst ? 'rgba(245, 158, 11, 0.1)' : 'rgba(52, 211, 153, 0.1)', border: isFirst ? '2px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(52, 211, 153, 0.2)', borderRadius: '12px', width: '80px', height: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#6b7280', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>APEX</span>
                    <strong style={{ color: isFirst ? '#fbbf24' : '#34d399', fontSize: '28px', fontWeight: 900, lineHeight: 1 }}>{score}</strong>
                  </div>
                </div>

                {runner.horseQuality && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '16px' }}>
                    <p style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                      Horse Quality
                      <span style={{ marginLeft: '8px', background: runner.horseQuality.label === 'Elite' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.05)', color: runner.horseQuality.label === 'Elite' ? '#fbbf24' : '#6b7280', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                        {runner.horseQuality.label}
                      </span>
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                      {[
                        { label: 'Power', value: runner.horseQuality.power },
                        { label: 'Suit', value: runner.horseQuality.suitability },
                        { label: 'Consist', value: runner.horseQuality.consistency },
                        { label: 'Pace', value: runner.horseQuality.paceCompat },
                        { label: 'Vol', value: runner.horseQuality.volatility },
                      ].map((item) => (
                        <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
                            <div style={{ width: `${item.value}%`, height: '100%', background: item.value >= 65 ? '#10b981' : item.value >= 50 ? '#f59e0b' : '#ef4444', borderRadius: '2px' }} />
                          </div>
                          <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>{item.label}</span>
                          <span style={{ color: item.value >= 65 ? '#10b981' : item.value >= 50 ? '#f59e0b' : '#ef4444', fontSize: '16px', fontWeight: 700 }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {runner.placeTraits && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '16px' }}>
                    <p style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Place Traits</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                      {[
                        { label: 'Consist', value: runner.placeTraits.consistency },
                        { label: 'Reliab', value: runner.placeTraits.reliability },
                        { label: 'Honest', value: runner.placeTraits.honesty },
                        { label: 'Kick', value: runner.placeTraits.finishingKick },
                        { label: 'Explode', value: runner.placeTraits.explosiveAbility },
                        { label: 'Market', value: runner.placeTraits.marketConfidence },
                      ].map((item) => (
                        <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                          <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>{item.label}</span>
                          <span style={{ color: item.value >= 65 ? '#10b981' : item.value >= 50 ? '#f59e0b' : '#ef4444', fontSize: '16px', fontWeight: 700 }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {runner.components && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '16px' }}>
                    <p style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                      Component Scores
                      <span style={{ marginLeft: '8px', color: '#fbbf24', fontWeight: 900, fontSize: '14px' }}>{runner.components.finalScore}</span>
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                      {[
                        { label: 'Ability', value: runner.components.ability },
                        { label: 'Form', value: runner.components.form },
                        { label: 'Suit', value: runner.components.suitability },
                        { label: 'Pace', value: runner.components.pace },
                        { label: 'Replay', value: runner.components.replay },
                        { label: 'T/J', value: runner.components.trainerJockey },
                      ].map((item) => (
                        <div key={item.label} style={{ textAlign: 'center' }}>
                          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
                            <div style={{ width: `${item.value}%`, height: '100%', background: item.value >= 65 ? '#10b981' : item.value >= 50 ? '#f59e0b' : '#ef4444', borderRadius: '2px' }} />
                          </div>
                          <span style={{ color: '#6b7280', fontSize: '11px' }}>{item.label}</span>
                          <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {runner.simulation && runner.simulation.winRate > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '16px' }}>
                    <p style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                      Race Simulation
                      <span style={{ marginLeft: '8px', background: runner.simulation.raceShape === 'HONEST' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: runner.simulation.raceShape === 'HONEST' ? '#34d399' : '#f87171', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                        {runner.simulation.raceShape}
                      </span>
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>Sim Win%</span>
                        <span style={{ fontSize: '16px', fontWeight: 700 }}>{runner.simulation.winRate}%</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>Sim Place%</span>
                        <span style={{ fontSize: '16px', fontWeight: 700 }}>{runner.simulation.placeRate}%</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>Avg Pos</span>
                        <span style={{ fontSize: '16px', fontWeight: 700 }}>{runner.simulation.avgPosition}</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>Collapse%</span>
                        <span style={{ color: runner.simulation.collapseRate > 15 ? '#f87171' : '#fff', fontSize: '16px', fontWeight: 700 }}>{runner.simulation.collapseRate}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {runner.valueEngine && runner.valueEngine.edgeLabel && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '16px' }}>
                    <p style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                      Value Engine
                      <span style={{ marginLeft: '8px', background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                        {runner.valueEngine.valueGrade}
                      </span>
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>Edge</span>
                        <span style={{ color: runner.valueEngine.edge >= 0 ? '#34d399' : '#f87171', fontSize: '16px', fontWeight: 700 }}>{runner.valueEngine.edge >= 0 ? '+' : ''}{runner.valueEngine.edge}%</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>EV</span>
                        <span style={{ color: runner.valueEngine.expectedValue >= 0 ? '#34d399' : '#f87171', fontSize: '16px', fontWeight: 700 }}>{runner.valueEngine.expectedValue >= 0 ? '+' : ''}{runner.valueEngine.expectedValue}</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>ROI</span>
                        <span style={{ color: runner.valueEngine.roi >= 0 ? '#34d399' : '#f87171', fontSize: '16px', fontWeight: 700 }}>{runner.valueEngine.roi >= 0 ? '+' : ''}{runner.valueEngine.roi}%</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>Bettable</span>
                        <span style={{ color: runner.valueEngine.bettable ? '#34d399' : '#f87171', fontSize: '16px', fontWeight: 700 }}>{runner.valueEngine.bettable ? 'YES' : 'NO'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {runner.bankrollEngine && runner.bankrollEngine.label && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '16px' }}>
                    <p style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                      Bankroll Engine
                      <span style={{ marginLeft: '8px', background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                        {runner.bankrollEngine.label}
                      </span>
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>Stake</span>
                        <span style={{ fontSize: '16px', fontWeight: 700 }}>{runner.bankrollEngine.stake || 0}</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>Units</span>
                        <span style={{ fontSize: '16px', fontWeight: 700 }}>{runner.bankrollEngine.units || 0}</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>Kelly</span>
                        <span style={{ fontSize: '16px', fontWeight: 700 }}>{runner.bankrollEngine.adjustedKelly || 0}%</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <span style={{ color: '#6b7280', fontSize: '11px', display: 'block' }}>Reason</span>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>{runner.bankrollEngine.reason || '-'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
