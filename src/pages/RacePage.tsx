import { openAtTheRacesHorseForm } from '../lib/horseLinks'
import { formatOffTime } from '../lib/formatTime'

interface RacePageProps {
  race: any
  onBack: () => void
}

export default function RacePage({ race, onBack }: RacePageProps) {
  if (!race) return null

  return (
    <div className='max-w-7xl mx-auto'>
      <div className='mb-6'>
        <button
          type='button'
          onClick={onBack}
          className='flex items-center gap-2 text-zinc-400 hover:text-white transition'
        >
          <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M19 12H5' />
            <polyline points='12 19 5 12 12 5' />
          </svg>
          Back to Racecards
        </button>
      </div>

      <div className='bg-[#0f1720] border border-green-500/10 rounded-2xl p-8'>
        <div className='mb-8'>
          <span className='px-3 py-1 rounded-lg text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/20'>Race view</span>
          <h1 className='text-4xl font-black tracking-tight mt-3'>{race.race_name}</h1>
          <p className='text-zinc-400 text-lg mt-2'>
            {race.course} · {formatOffTime(race)}
            {race.distance_f && <span> · {race.distance_f}</span>}
            {race.going && <span> · {race.going}</span>}
            {race.surface && <span> · {race.surface}</span>}
          </p>
        </div>

        <div className='space-y-6'>
          {(race.runners || []).map((runner: any, index: number) => (
            <div key={index} className='bg-white/[0.02] border border-white/5 rounded-xl p-6'>
              <div className='flex items-start justify-between mb-4'>
                <div>
                  <button
                    type='button'
                    onClick={() => openAtTheRacesHorseForm(runner, race)}
                    className='text-xl font-bold hover:text-amber-300 transition'
                  >
                    {runner.horse}
                  </button>
                  <p className='text-zinc-400 text-sm mt-1'>{runner.jockey} - {runner.trainer}</p>
                  <div className='flex gap-3 mt-3 flex-wrap'>
                    <span className='px-2 py-1 bg-white/5 text-zinc-400 rounded-md text-xs font-medium'>OR: {runner.or || runner.ofr || '-'}</span>
                    <span className='px-2 py-1 bg-white/5 text-zinc-400 rounded-md text-xs font-medium'>RPR: {runner.rpr || '-'}</span>
                    <span className='px-2 py-1 bg-white/5 text-zinc-400 rounded-md text-xs font-medium'>Odds: {runner.odds || '-'}</span>
                    <span className='px-2 py-1 bg-white/5 text-zinc-400 rounded-md text-xs font-medium'>Draw: {runner.draw || '-'}</span>
                  </div>
                </div>

                <div className='text-right'>
                  <div className='w-20 h-20 rounded-2xl bg-green-500/10 border border-green-500/20 flex flex-col items-center justify-center'>
                    <span className='text-zinc-500 text-xs font-medium uppercase tracking-wider'>APEX</span>
                    <strong className='text-3xl font-black text-green-400'>{runner.score || runner.aiProfile?.confidence || 0}</strong>
                  </div>
                </div>
              </div>

              {runner.horseQuality && (
                <div className='mt-6'>
                  <div className='flex items-center gap-3 mb-4'>
                    <h3 className='text-sm font-bold text-zinc-300'>Engine 1: Horse Quality</h3>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${runner.horseQuality.label === 'Elite' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-zinc-400'}`}>
                      {runner.horseQuality.label}
                    </span>
                  </div>
                  <div className='grid grid-cols-5 gap-3'>
                    {[
                      { label: 'Power', value: runner.horseQuality.power },
                      { label: 'Suitability', value: runner.horseQuality.suitability },
                      { label: 'Consistency', value: runner.horseQuality.consistency },
                      { label: 'Pace Fit', value: runner.horseQuality.paceCompat },
                      { label: 'Volatility', value: runner.horseQuality.volatility },
                    ].map((item) => (
                      <div key={item.label} className='bg-white/[0.03] rounded-lg p-3 text-center'>
                        <span className='text-zinc-500 text-xs block'>{item.label}</span>
                        <span className={`text-lg font-bold ${item.value >= 65 ? 'text-green-400' : item.value >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {runner.components && (
                <div className='mt-6'>
                  <div className='flex items-center gap-3 mb-4'>
                    <h3 className='text-sm font-bold text-zinc-300'>Component Scores</h3>
                    <span className='text-lg font-black text-amber-400'>{runner.components.finalScore}</span>
                  </div>
                  <div className='grid grid-cols-6 gap-3'>
                    {[
                      { label: 'Ability', value: runner.components.ability },
                      { label: 'Form', value: runner.components.form },
                      { label: 'Suitability', value: runner.components.suitability },
                      { label: 'Pace', value: runner.components.pace },
                      { label: 'Replay', value: runner.components.replay },
                      { label: 'T/J', value: runner.components.trainerJockey },
                    ].map((item) => (
                      <div key={item.label} className='text-center'>
                        <div className='h-2 bg-white/5 rounded-full mb-2 overflow-hidden'>
                          <div
                            className='h-full rounded-full'
                            style={{
                              width: `${item.value}%`,
                              backgroundColor: item.value >= 65 ? '#10b981' : item.value >= 50 ? '#f59e0b' : '#ef4444'
                            }}
                          />
                        </div>
                        <span className='text-zinc-500 text-xs'>{item.label}</span>
                        <span className='block text-sm font-bold'>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {runner.selectionQuality && (
                <div className='mt-6 bg-white/[0.02] rounded-xl p-4 border border-white/5'>
                  <div className='flex items-center gap-3 mb-3'>
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${runner.selectionQuality.grade === 'A+' || runner.selectionQuality.grade === 'A' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-zinc-400'}`}>
                      {runner.selectionQuality.grade}
                    </span>
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${runner.selectionQuality.recommendation === 'BET' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-zinc-400'}`}>
                      {runner.selectionQuality.recommendation}
                    </span>
                  </div>
                  <div className='grid grid-cols-6 gap-3'>
                    <div><span className='text-zinc-500 text-xs block'>Win%</span><span className='font-bold'>{runner.winProb}%</span></div>
                    <div><span className='text-zinc-500 text-xs block'>Place%</span><span className='font-bold'>{runner.placeProb || '-'}%</span></div>
                    <div><span className='text-zinc-500 text-xs block'>Fair Odds</span><span className='font-bold'>{runner.selectionQuality.fairOdds}</span></div>
                    <div><span className='text-zinc-500 text-xs block'>Market</span><span className='font-bold'>{runner.selectionQuality.marketOdds}</span></div>
                    <div><span className='text-zinc-500 text-xs block'>Edge</span><span className={`font-bold ${runner.selectionQuality.edge > 0 ? 'text-green-400' : 'text-red-400'}`}>{(runner.selectionQuality.edge * 100).toFixed(1)}%</span></div>
                    <div><span className='text-zinc-500 text-xs block'>Value</span><span className={`font-bold ${runner.selectionQuality.value > 0 ? 'text-green-400' : 'text-red-400'}`}>{runner.selectionQuality.value > 0 ? '+' : ''}{runner.selectionQuality.value}%</span></div>
                  </div>
                </div>
              )}

              {runner.simulation && runner.simulation.winRate > 0 && (
                <div className='mt-6'>
                  <div className='flex items-center gap-3 mb-4'>
                    <h3 className='text-sm font-bold text-zinc-300'>Engine 2: Race Simulation</h3>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${runner.simulation.raceShape === 'HONEST' ? 'bg-green-500/10 text-green-400' : runner.simulation.raceShape === 'SLOW' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'}`}>
                      {runner.simulation.raceShape}
                    </span>
                  </div>
                  <div className='grid grid-cols-4 gap-3'>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>Sim Win%</span><span className='font-bold'>{runner.simulation.winRate}%</span></div>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>Sim Place%</span><span className='font-bold'>{runner.simulation.placeRate}%</span></div>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>Avg Pos</span><span className='font-bold'>{runner.simulation.avgPosition}</span></div>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>Collapse%</span><span className={`font-bold ${runner.simulation.collapseRate > 15 ? 'text-red-400' : ''}`}>{runner.simulation.collapseRate}%</span></div>
                  </div>
                </div>
              )}

              {runner.valueEngine && runner.valueEngine.edgeLabel && (
                <div className='mt-6'>
                  <div className='flex items-center gap-3 mb-4'>
                    <h3 className='text-sm font-bold text-zinc-300'>Engine 4: Value</h3>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${runner.valueEngine.valueGrade === 'A+' || runner.valueEngine.valueGrade === 'A' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-zinc-400'}`}>
                      {runner.valueEngine.valueGrade}
                    </span>
                  </div>
                  <div className='grid grid-cols-4 gap-3'>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>Edge</span><span className={`font-bold ${runner.valueEngine.edge >= 0 ? 'text-green-400' : 'text-red-400'}`}>{runner.valueEngine.edge >= 0 ? '+' : ''}{runner.valueEngine.edge}%</span></div>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>EV</span><span className={`font-bold ${runner.valueEngine.expectedValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>{runner.valueEngine.expectedValue >= 0 ? '+' : ''}{runner.valueEngine.expectedValue}</span></div>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>ROI</span><span className={`font-bold ${runner.valueEngine.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{runner.valueEngine.roi >= 0 ? '+' : ''}{runner.valueEngine.roi}%</span></div>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>Bettable</span><span className={`font-bold ${runner.valueEngine.bettable ? 'text-green-400' : 'text-red-400'}`}>{runner.valueEngine.bettable ? 'YES' : 'NO'}</span></div>
                  </div>
                </div>
              )}

              {runner.bankrollEngine && runner.bankrollEngine.label && (
                <div className='mt-6'>
                  <div className='flex items-center gap-3 mb-4'>
                    <h3 className='text-sm font-bold text-zinc-300'>Engine 5: Bankroll</h3>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${runner.bankrollEngine.label === 'STRONG BET' || runner.bankrollEngine.label === 'BET' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-zinc-400'}`}>
                      {runner.bankrollEngine.label}
                    </span>
                  </div>
                  <div className='grid grid-cols-4 gap-3'>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>Stake</span><span className='font-bold'>{runner.bankrollEngine.stake || 0}</span></div>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>Units</span><span className='font-bold'>{runner.bankrollEngine.units || 0}</span></div>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>Kelly</span><span className='font-bold'>{runner.bankrollEngine.adjustedKelly || 0}%</span></div>
                    <div className='bg-white/[0.03] rounded-lg p-3 text-center'><span className='text-zinc-500 text-xs block'>Reason</span><span className='font-bold text-sm'>{runner.bankrollEngine.reason || '-'}</span></div>
                  </div>
                </div>
              )}

              {runner.confidenceTier && (
                <div className='mt-6 flex items-center gap-4'>
                  <h3 className='text-sm font-bold text-zinc-300'>Confidence Tier</h3>
                  <span className={`px-3 py-1 rounded-lg text-sm font-bold ${runner.confidenceTier.tier === 'S' || runner.confidenceTier.tier === 'A' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>
                    Tier {runner.confidenceTier.tier}
                  </span>
                  <span className='text-zinc-400 text-sm'>{runner.confidenceTier.label}</span>
                  <span className='text-zinc-500 text-xs ml-auto'>Max Stake: {Math.round(runner.confidenceTier.maxStake * 100)}%</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
