import { openAtTheRacesHorseForm } from '../lib/horseLinks'
import { formatOffTime } from '../lib/formatTime'

interface RacePageProps {
  race: any
  onBack: () => void
}

function ScoreGauge({ value, label }: { value: number; label: string }) {
  const color = value >= 65 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className='flex flex-col items-center'>
      <div className='relative w-16 h-16'>
        <svg className='w-16 h-16 -rotate-90' viewBox='0 0 64 64'>
          <circle cx='32' cy='32' r='28' fill='none' stroke='rgba(255,255,255,0.05)' strokeWidth='6' />
          <circle cx='32' cy='32' r='28' fill='none' stroke={color} strokeWidth='6' strokeDasharray={`${(value / 100) * 175.9} 175.9`} strokeLinecap='round' />
        </svg>
        <span className='absolute inset-0 flex items-center justify-center text-sm font-bold' style={{ color }}>{value}</span>
      </div>
      <span className='text-zinc-500 text-xs mt-1'>{label}</span>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
      <span className='text-zinc-500 text-xs block mb-1'>{label}</span>
      <span className={`text-lg font-bold ${color || 'text-white'}`}>{value}</span>
    </div>
  )
}

function SectionHeader({ title, badge, badgeColor }: { title: string; badge?: string; badgeColor?: string }) {
  return (
    <div className='flex items-center gap-3 mb-4 pb-3 border-b border-white/5'>
      <h3 className='text-sm font-bold text-zinc-200 uppercase tracking-wider'>{title}</h3>
      {badge && (
        <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${badgeColor || 'bg-white/5 text-zinc-400'}`}>
          {badge}
        </span>
      )}
    </div>
  )
}

export default function RacePage({ race, onBack }: RacePageProps) {
  if (!race) return null

  const runners = (race.runners || []).sort((a: any, b: any) => {
    const aScore = a.score || a.aiProfile?.confidence || 0
    const bScore = b.score || b.aiProfile?.confidence || 0
    return bScore - aScore
  })

  return (
    <div className='max-w-7xl mx-auto space-y-6'>
      <button
        type='button'
        onClick={onBack}
        className='flex items-center gap-2 text-zinc-400 hover:text-white transition group'
      >
        <svg className='w-5 h-5 group-hover:-translate-x-1 transition-transform' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M19 12H5' />
          <polyline points='12 19 5 12 12 5' />
        </svg>
        <span className='font-medium'>Back to Racecards</span>
      </button>

      <div className='bg-[#0f1720] border border-green-500/10 rounded-2xl overflow-hidden'>
        <div className='relative p-8 pb-6'>
          <div className='absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-transparent pointer-events-none' />
          <div className='relative'>
            <div className='flex items-center gap-3 mb-4'>
              <span className='px-3 py-1 rounded-lg text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/20'>LIVE</span>
              <span className='text-zinc-500 text-sm'>{race.field_size || runners.length} runners</span>
              {race.going && <span className='text-zinc-500 text-sm'>· {race.going}</span>}
              {race.surface && <span className='text-zinc-500 text-sm'>· {race.surface}</span>}
            </div>
            <h1 className='text-4xl font-black tracking-tight'>{race.race_name}</h1>
            <p className='text-zinc-400 text-lg mt-2'>
              {race.course} · {formatOffTime(race)}
              {race.distance_f && <span> · {race.distance_f}</span>}
            </p>
          </div>
        </div>

        <div className='px-8 pb-8 space-y-4'>
          {runners.map((runner: any, index: number) => {
            const score = runner.score || runner.aiProfile?.confidence || 0
            const isFirst = index === 0

            return (
              <div
                key={index}
                className={`rounded-xl border overflow-hidden ${isFirst ? 'border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-transparent' : 'border-white/5 bg-white/[0.02]'}`}
              >
                <div className='p-6'>
                  <div className='flex items-start justify-between gap-6'>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-3 mb-2'>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${isFirst ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-zinc-500'}`}>
                          #{index + 1}
                        </span>
                        {runner.confidenceTier && (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${runner.confidenceTier.tier === 'S' || runner.confidenceTier.tier === 'A' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-zinc-400'}`}>
                            T{runner.confidenceTier.tier}
                          </span>
                        )}
                        {runner.runningStyle && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${runner.runningStyle === 'Front Runner' ? 'bg-red-500/10 text-red-400' : runner.runningStyle === 'Prominent' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                            {runner.runningStyle}
                          </span>
                        )}
                      </div>

                      <button
                        type='button'
                        onClick={() => openAtTheRacesHorseForm(runner, race)}
                        className='text-2xl font-bold hover:text-amber-300 transition text-left'
                      >
                        {runner.horse}
                      </button>

                      <p className='text-zinc-400 text-sm mt-1'>
                        {runner.jockey && <span>{runner.jockey}</span>}
                        {runner.jockey && runner.trainer && <span> · </span>}
                        {runner.trainer && <span>{runner.trainer}</span>}
                      </p>

                      <div className='flex gap-2 mt-3 flex-wrap'>
                        {runner.odds && (
                          <span className='px-2 py-1 bg-white/[0.06] text-white rounded-lg text-xs font-bold'>{runner.odds}</span>
                        )}
                        {runner.draw && (
                          <span className='px-2 py-1 bg-white/[0.04] text-zinc-400 rounded-lg text-xs'>Draw {runner.draw}</span>
                        )}
                        {(runner.or || runner.ofr) && (
                          <span className='px-2 py-1 bg-white/[0.04] text-zinc-400 rounded-lg text-xs'>OR {runner.or || runner.ofr}</span>
                        )}
                        {runner.rpr && (
                          <span className='px-2 py-1 bg-white/[0.04] text-zinc-400 rounded-lg text-xs'>RPR {runner.rpr}</span>
                        )}
                        {runner.winProb && (
                          <span className='px-2 py-1 bg-green-500/10 text-green-400 rounded-lg text-xs font-bold'>W:{runner.winProb}%</span>
                        )}
                        {runner.placeProb && (
                          <span className='px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-bold'>P:{runner.placeProb}%</span>
                        )}
                      </div>
                    </div>

                    <div className='flex-shrink-0'>
                      <div className={`w-24 h-24 rounded-2xl flex flex-col items-center justify-center ${isFirst ? 'bg-amber-500/10 border-2 border-amber-500/30' : 'bg-green-500/10 border border-green-500/20'}`}>
                        <span className='text-zinc-500 text-xs font-medium uppercase tracking-wider'>APEX</span>
                        <strong className={`text-3xl font-black ${isFirst ? 'text-amber-400' : 'text-green-400'}`}>{score}</strong>
                      </div>
                    </div>
                  </div>

                  {runner.selectionQuality && (
                    <div className='mt-5 pt-5 border-t border-white/5'>
                      <SectionHeader title='Selection Quality' badge={runner.selectionQuality.grade} badgeColor={runner.selectionQuality.grade === 'A+' || runner.selectionQuality.grade === 'A' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-zinc-400'} />
                      <div className='grid grid-cols-3 sm:grid-cols-6 gap-3'>
                        <StatCard label='Win%' value={`${runner.winProb}%`} />
                        <StatCard label='Place%' value={`${runner.placeProb || '-'}%`} />
                        <StatCard label='Fair Odds' value={runner.selectionQuality.fairOdds || '-'} />
                        <StatCard label='Market' value={runner.selectionQuality.marketOdds || '-'} />
                        <StatCard label='Edge' value={`${runner.selectionQuality.edge > 0 ? '+' : ''}${(runner.selectionQuality.edge * 100).toFixed(1)}%`} color={runner.selectionQuality.edge > 0 ? 'text-green-400' : 'text-red-400'} />
                        <StatCard label='Value' value={`${runner.selectionQuality.value > 0 ? '+' : ''}${runner.selectionQuality.value}%`} color={runner.selectionQuality.value > 0 ? 'text-green-400' : 'text-red-400'} />
                      </div>
                    </div>
                  )}

                  {runner.horseQuality && (
                    <div className='mt-5 pt-5 border-t border-white/5'>
                      <SectionHeader title='Horse Quality Engine' badge={runner.horseQuality.label} badgeColor={runner.horseQuality.label === 'Elite' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-zinc-400'} />
                      <div className='flex justify-around'>
                        <ScoreGauge value={runner.horseQuality.power} label='Power' />
                        <ScoreGauge value={runner.horseQuality.suitability} label='Suit' />
                        <ScoreGauge value={runner.horseQuality.consistency} label='Consist' />
                        <ScoreGauge value={runner.horseQuality.paceCompat} label='Pace' />
                        <ScoreGauge value={runner.horseQuality.volatility} label='Vol' />
                      </div>
                    </div>
                  )}

                  {runner.components && (
                    <div className='mt-5 pt-5 border-t border-white/5'>
                      <SectionHeader title='Component Scores' badge={`${runner.components.finalScore}`} badgeColor='bg-amber-500/10 text-amber-400' />
                      <div className='grid grid-cols-6 gap-3'>
                        {[
                          { label: 'Ability', value: runner.components.ability },
                          { label: 'Form', value: runner.components.form },
                          { label: 'Suit', value: runner.components.suitability },
                          { label: 'Pace', value: runner.components.pace },
                          { label: 'Replay', value: runner.components.replay },
                          { label: 'T/J', value: runner.components.trainerJockey },
                        ].map((item) => (
                          <div key={item.label} className='text-center'>
                            <div className='h-1.5 bg-white/5 rounded-full mb-2 overflow-hidden'>
                              <div
                                className='h-full rounded-full transition-all duration-500'
                                style={{
                                  width: `${item.value}%`,
                                  backgroundColor: item.value >= 65 ? '#10b981' : item.value >= 50 ? '#f59e0b' : '#ef4444'
                                }}
                              />
                            </div>
                            <span className='text-zinc-500 text-xs'>{item.label}</span>
                            <span className='block text-sm font-bold mt-0.5'>{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {runner.simulation && runner.simulation.winRate > 0 && (
                    <div className='mt-5 pt-5 border-t border-white/5'>
                      <SectionHeader title='Race Simulation' badge={runner.simulation.raceShape} badgeColor={runner.simulation.raceShape === 'HONEST' ? 'bg-green-500/10 text-green-400' : runner.simulation.raceShape === 'SLOW' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'} />
                      <div className='grid grid-cols-4 gap-3'>
                        <StatCard label='Sim Win%' value={`${runner.simulation.winRate}%`} />
                        <StatCard label='Sim Place%' value={`${runner.simulation.placeRate}%`} />
                        <StatCard label='Avg Pos' value={runner.simulation.avgPosition} />
                        <StatCard label='Collapse%' value={`${runner.simulation.collapseRate}%`} color={runner.simulation.collapseRate > 15 ? 'text-red-400' : undefined} />
                      </div>
                    </div>
                  )}

                  {runner.valueEngine && runner.valueEngine.edgeLabel && (
                    <div className='mt-5 pt-5 border-t border-white/5'>
                      <SectionHeader title='Value Engine' badge={runner.valueEngine.valueGrade} badgeColor={runner.valueEngine.valueGrade === 'A+' || runner.valueEngine.valueGrade === 'A' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-zinc-400'} />
                      <div className='grid grid-cols-4 gap-3'>
                        <StatCard label='Edge' value={`${runner.valueEngine.edge >= 0 ? '+' : ''}${runner.valueEngine.edge}%`} color={runner.valueEngine.edge >= 0 ? 'text-green-400' : 'text-red-400'} />
                        <StatCard label='EV' value={`${runner.valueEngine.expectedValue >= 0 ? '+' : ''}${runner.valueEngine.expectedValue}`} color={runner.valueEngine.expectedValue >= 0 ? 'text-green-400' : 'text-red-400'} />
                        <StatCard label='ROI' value={`${runner.valueEngine.roi >= 0 ? '+' : ''}${runner.valueEngine.roi}%`} color={runner.valueEngine.roi >= 0 ? 'text-green-400' : 'text-red-400'} />
                        <StatCard label='Bettable' value={runner.valueEngine.bettable ? 'YES' : 'NO'} color={runner.valueEngine.bettable ? 'text-green-400' : 'text-red-400'} />
                      </div>
                    </div>
                  )}

                  {runner.bankrollEngine && runner.bankrollEngine.label && (
                    <div className='mt-5 pt-5 border-t border-white/5'>
                      <SectionHeader title='Bankroll Engine' badge={runner.bankrollEngine.label} badgeColor={runner.bankrollEngine.label === 'STRONG BET' || runner.bankrollEngine.label === 'BET' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-zinc-400'} />
                      <div className='grid grid-cols-4 gap-3'>
                        <StatCard label='Stake' value={runner.bankrollEngine.stake || 0} />
                        <StatCard label='Units' value={runner.bankrollEngine.units || 0} />
                        <StatCard label='Kelly' value={`${runner.bankrollEngine.adjustedKelly || 0}%`} />
                        <StatCard label='Reason' value={runner.bankrollEngine.reason || '-'} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
