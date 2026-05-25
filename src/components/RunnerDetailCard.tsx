import type { Race, Runner } from '../lib/types'
import { getScore, getScoreColor } from '../lib/engine'
import { openAtTheRacesHorseForm } from '../lib/horseLinks'

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${className || 'bg-white/5 text-zinc-400'}`}>{children}</span>
}

function StatCard({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
      <span className='text-zinc-500 text-xs block mb-1'>{label}</span>
      <span className={`text-lg font-bold ${color || 'text-white'}`}>{value}</span>
    </div>
  )
}

function SectionHeader({ title, badge, badgeClass }: { title: string; badge?: string; badgeClass?: string }) {
  return (
    <div className='flex items-center gap-3 mb-4 pb-3 border-b border-white/5'>
      <h3 className='text-sm font-bold text-zinc-200 uppercase tracking-wider'>{title}</h3>
      {badge && <Badge className={badgeClass}>{badge}</Badge>}
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className='mt-5 pt-5 border-t border-white/5'>{children}</div>
}

function HorseQualitySection({ hq }: { hq: NonNullable<Runner['horseQuality']> }) {
  return (
    <Section>
      <SectionHeader title='Horse Quality' badge={hq.label} badgeClass={hq.label === 'Elite' ? 'bg-amber-500/10 text-amber-400' : ''} />
      <div className='grid grid-cols-2 sm:grid-cols-5 gap-3'>
        {[
          { label: 'Power', value: hq.power },
          { label: 'Suitability', value: hq.suitability },
          { label: 'Consistency', value: hq.consistency },
          { label: 'Pace Compat', value: hq.paceCompat },
          { label: 'Volatility', value: hq.volatility },
        ].map((item) => (
          <div key={item.label} className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
            <div className='w-full h-1.5 bg-white/5 rounded-full mb-3 overflow-hidden'>
              <div className='h-full rounded-full' style={{ width: `${item.value}%`, background: item.value >= 65 ? '#10b981' : item.value >= 50 ? '#f59e0b' : '#ef4444' }} />
            </div>
            <span className='text-zinc-500 text-xs block'>{item.label}</span>
            <span className={`text-lg font-bold ${getScoreColor(item.value)}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

function PlaceTraitsSection({ traits }: { traits: NonNullable<Runner['placeTraits']> }) {
  const items = [
    { label: 'Consistency', value: traits.consistency },
    { label: 'Reliability', value: traits.reliability },
    { label: 'Honesty', value: traits.honesty },
    { label: 'Kick', value: traits.finishingKick },
    { label: 'Explosive', value: traits.explosiveAbility },
    { label: 'Market', value: traits.marketConfidence },
  ]
  return (
    <Section>
      <SectionHeader title='Place Traits' />
      <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
        {items.map((item) => (
          <div key={item.label} className='bg-white/[0.03] border border-white/5 rounded-xl p-4 flex items-center gap-3'>
            <div className='w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0'
              style={{ background: item.value >= 65 ? 'rgba(16,185,129,0.15)' : item.value >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: item.value >= 65 ? '#10b981' : item.value >= 50 ? '#f59e0b' : '#ef4444' }}>
              {item.value}
            </div>
            <div>
              <span className='text-zinc-400 text-xs block'>{item.label}</span>
              <div className='w-16 h-1.5 bg-white/5 rounded-full mt-1 overflow-hidden'>
                <div className='h-full rounded-full' style={{ width: `${item.value}%`, background: item.value >= 65 ? '#10b981' : item.value >= 50 ? '#f59e0b' : '#ef4444' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function ComponentsSection({ components }: { components: NonNullable<Runner['components']> }) {
  const items = [
    { label: 'Ability', value: components.ability, icon: '💪' },
    { label: 'Form', value: components.form, icon: '📈' },
    { label: 'Suitability', value: components.suitability, icon: '🎯' },
    { label: 'Pace', value: components.pace, icon: '⚡' },
    { label: 'Replay', value: components.replay, icon: '🎬' },
    { label: 'Trainer/Jockey', value: components.trainerJockey, icon: '👤' },
  ]
  return (
    <Section>
      <SectionHeader title='Component Scores' badge={`${components.finalScore}`} badgeClass='bg-amber-500/10 text-amber-400' />
      <div className='space-y-2'>
        {items.map((item) => (
          <div key={item.label} className='flex items-center gap-3'>
            <span className='text-zinc-500 text-xs w-24 shrink-0'>{item.label}</span>
            <div className='flex-1 h-2 bg-white/5 rounded-full overflow-hidden'>
              <div className='h-full rounded-full transition-all duration-500' style={{ width: `${item.value}%`, background: item.value >= 65 ? 'linear-gradient(90deg, #10b981, #34d399)' : item.value >= 50 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #ef4444, #f87171)' }} />
            </div>
            <span className={`text-sm font-bold w-8 text-right ${item.value >= 65 ? 'text-green-400' : item.value >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

function SelectionQualitySection({ sq, winProb, placeProb }: { sq: NonNullable<Runner['selectionQuality']>; winProb?: number; placeProb?: number }) {
  return (
    <Section>
      <SectionHeader title='Selection Quality' badge={sq.grade} badgeClass={sq.grade === 'A+' || sq.grade === 'A' ? 'bg-green-500/10 text-green-400' : ''} />
      <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
        <div className='bg-green-500/5 border border-green-500/10 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Win Probability</span>
          <strong className='text-2xl font-bold text-green-400'>{winProb}%</strong>
        </div>
        <div className='bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Place Probability</span>
          <strong className='text-2xl font-bold text-blue-400'>{placeProb || '-'}%</strong>
        </div>
        <div className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Fair Odds</span>
          <strong className='text-2xl font-bold text-white'>{sq.fairOdds}</strong>
        </div>
        <div className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Market Odds</span>
          <strong className='text-2xl font-bold text-white'>{sq.marketOdds}</strong>
        </div>
        <div className={`rounded-xl p-4 text-center ${sq.edge > 0 ? 'bg-green-500/5 border border-green-500/10' : 'bg-red-500/5 border border-red-500/10'}`}>
          <span className='text-zinc-500 text-xs block'>Edge</span>
          <strong className={`text-2xl font-bold ${sq.edge > 0 ? 'text-green-400' : 'text-red-400'}`}>{sq.edge > 0 ? '+' : ''}{(sq.edge * 100).toFixed(1)}%</strong>
        </div>
        <div className={`rounded-xl p-4 text-center ${sq.value > 0 ? 'bg-green-500/5 border border-green-500/10' : 'bg-red-500/5 border border-red-500/10'}`}>
          <span className='text-zinc-500 text-xs block'>Value Rating</span>
          <strong className={`text-2xl font-bold ${sq.value > 0 ? 'text-green-400' : 'text-red-400'}`}>{sq.value > 0 ? '+' : ''}{sq.value}%</strong>
        </div>
      </div>
    </Section>
  )
}

function SimulationSection({ sim }: { sim: NonNullable<Runner['simulation']> }) {
  return (
    <Section>
      <SectionHeader title='Race Simulation' badge={sim.raceShape} badgeClass={sim.raceShape === 'HONEST' ? 'bg-green-500/10 text-green-400' : sim.raceShape === 'SLOW' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'} />
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        <div className='bg-green-500/5 border border-green-500/10 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Win Rate</span>
          <strong className='text-2xl font-bold text-green-400'>{sim.winRate}%</strong>
        </div>
        <div className='bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Place Rate</span>
          <strong className='text-2xl font-bold text-blue-400'>{sim.placeRate}%</strong>
        </div>
        <div className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Avg Position</span>
          <strong className='text-2xl font-bold text-white'>{sim.avgPosition}</strong>
        </div>
        <div className={`rounded-xl p-4 text-center ${sim.collapseRate > 20 ? 'bg-red-500/5 border border-red-500/10' : 'bg-white/[0.03] border border-white/5'}`}>
          <span className='text-zinc-500 text-xs block'>Collapse Risk</span>
          <strong className={`text-2xl font-bold ${sim.collapseRate > 20 ? 'text-red-400' : sim.collapseRate > 10 ? 'text-amber-400' : 'text-green-400'}`}>{sim.collapseRate}%</strong>
        </div>
      </div>
    </Section>
  )
}

function ValueEngineSection({ ve }: { ve: NonNullable<Runner['valueEngine']> }) {
  return (
    <Section>
      <SectionHeader title='Value Engine' badge={ve.valueGrade} badgeClass={ve.valueGrade === 'A+' || ve.valueGrade === 'A' ? 'bg-green-500/10 text-green-400' : ''} />
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        <div className={`rounded-xl p-4 text-center ${ve.edge >= 0 ? 'bg-green-500/5 border border-green-500/10' : 'bg-red-500/5 border border-red-500/10'}`}>
          <span className='text-zinc-500 text-xs block'>Edge</span>
          <strong className={`text-2xl font-bold ${ve.edge >= 0 ? 'text-green-400' : 'text-red-400'}`}>{ve.edge >= 0 ? '+' : ''}{ve.edge}%</strong>
        </div>
        <div className={`rounded-xl p-4 text-center ${ve.expectedValue >= 0 ? 'bg-green-500/5 border border-green-500/10' : 'bg-red-500/5 border border-red-500/10'}`}>
          <span className='text-zinc-500 text-xs block'>Expected Value</span>
          <strong className={`text-2xl font-bold ${ve.expectedValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>{ve.expectedValue >= 0 ? '+' : ''}{ve.expectedValue}</strong>
        </div>
        <div className={`rounded-xl p-4 text-center ${ve.roi >= 0 ? 'bg-green-500/5 border border-green-500/10' : 'bg-red-500/5 border border-red-500/10'}`}>
          <span className='text-zinc-500 text-xs block'>ROI</span>
          <strong className={`text-2xl font-bold ${ve.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{ve.roi >= 0 ? '+' : ''}{ve.roi}%</strong>
        </div>
        <div className={`rounded-xl p-4 text-center ${ve.bettable ? 'bg-green-500/5 border border-green-500/10' : 'bg-red-500/5 border border-red-500/10'}`}>
          <span className='text-zinc-500 text-xs block'>Bettable</span>
          <strong className={`text-2xl font-bold ${ve.bettable ? 'text-green-400' : 'text-red-400'}`}>{ve.bettable ? 'YES' : 'NO'}</strong>
        </div>
      </div>
    </Section>
  )
}

function BankrollEngineSection({ be }: { be: NonNullable<Runner['bankrollEngine']> }) {
  return (
    <Section>
      <SectionHeader title='Bankroll Engine' badge={be.label} badgeClass={
        be.label === 'STRONG BET' || be.label === 'BET' ? 'bg-green-500/10 text-green-400' :
        be.label === 'MICRO BET' || be.label === 'CONSIDER' ? 'bg-amber-500/10 text-amber-400' :
        be.label === 'AVOID' ? 'bg-red-500/10 text-red-400' : ''
      } />
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        <div className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Stake</span>
          <strong className='text-2xl font-bold text-white'>{be.stake || 0}</strong>
        </div>
        <div className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Units</span>
          <strong className='text-2xl font-bold text-white'>{be.units || 0}</strong>
        </div>
        <div className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Kelly</span>
          <strong className='text-2xl font-bold text-white'>{be.adjustedKelly || 0}%</strong>
        </div>
        <div className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
          <span className='text-zinc-500 text-xs block'>Reason</span>
          <strong className='text-sm font-bold text-zinc-300'>{be.reason || '-'}</strong>
        </div>
      </div>
    </Section>
  )
}

interface RunnerDetailCardProps {
  runner: Runner
  race: Race
  rank?: number
  compact?: boolean
}

export default function RunnerDetailCard({ runner, race, rank = 1, compact = false }: RunnerDetailCardProps) {
  const score = getScore(runner)
  const isFirst = rank === 1

  return (
    <div className={`rounded-xl border overflow-hidden ${isFirst ? 'border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-transparent' : 'border-white/5 bg-white/[0.03]'}`}>
      <div className='p-6'>
        <div className='flex items-start justify-between gap-6'>
          <div className='flex-1 min-w-0'>
            <div className='flex items-center gap-3 mb-2'>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${isFirst ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-zinc-500'}`}>#{rank}</span>
              {runner.confidenceTier && (
                <Badge className={runner.confidenceTier.tier === 'S' || runner.confidenceTier.tier === 'A' ? 'bg-amber-500/10 text-amber-400' : ''}>
                  T{runner.confidenceTier.tier}
                </Badge>
              )}
              {runner.runningStyle && (
                <Badge className={runner.runningStyle === 'Front Runner' ? 'bg-red-500/10 text-red-400' : runner.runningStyle === 'Prominent' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}>
                  {runner.runningStyle}
                </Badge>
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
              {runner.jockey}{runner.jockey && runner.trainer && ' · '}{runner.trainer}
            </p>

            <div className='flex gap-2 mt-3 flex-wrap'>
              {runner.odds && <span className='px-2 py-1 bg-white/[0.06] text-white rounded-lg text-xs font-bold'>{runner.odds}</span>}
              {runner.draw && <span className='px-2 py-1 bg-white/[0.04] text-zinc-400 rounded-lg text-xs'>Draw {runner.draw}</span>}
              {runner.winProb && <span className='px-2 py-1 bg-green-500/10 text-green-400 rounded-lg text-xs font-bold'>W:{runner.winProb}%</span>}
              {runner.placeProb && <span className='px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-bold'>P:{runner.placeProb}%</span>}
            </div>
          </div>

          <div className={`flex-shrink-0 w-24 h-24 rounded-2xl flex flex-col items-center justify-center ${isFirst ? 'bg-amber-500/10 border-2 border-amber-500/30' : 'bg-green-500/10 border border-green-500/20'}`}>
            <span className='text-zinc-500 text-xs font-medium uppercase tracking-wider'>APEX</span>
            <strong className={`text-3xl font-black ${isFirst ? 'text-amber-400' : 'text-green-400'}`}>{score}</strong>
          </div>
        </div>

        {!compact && (
          <>
            {runner.selectionQuality && <SelectionQualitySection sq={runner.selectionQuality} winProb={runner.winProb} placeProb={runner.placeProb} />}
            {runner.horseQuality && <HorseQualitySection hq={runner.horseQuality} />}
            {runner.placeTraits && <PlaceTraitsSection traits={runner.placeTraits} />}
            {runner.components && <ComponentsSection components={runner.components} />}
            {runner.simulation && runner.simulation.winRate > 0 && <SimulationSection sim={runner.simulation} />}
            {runner.valueEngine && runner.valueEngine.edgeLabel && <ValueEngineSection ve={runner.valueEngine} />}
            {runner.bankrollEngine && runner.bankrollEngine.label && <BankrollEngineSection be={runner.bankrollEngine} />}
          </>
        )}
      </div>
    </div>
  )
}
