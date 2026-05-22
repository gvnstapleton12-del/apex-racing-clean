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
      <div className='grid grid-cols-5 gap-4'>
        {[
          { label: 'Power', value: hq.power },
          { label: 'Suit', value: hq.suitability },
          { label: 'Consist', value: hq.consistency },
          { label: 'Pace', value: hq.paceCompat },
          { label: 'Vol', value: hq.volatility },
        ].map((item) => (
          <div key={item.label} className='bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center'>
            <div className='h-1.5 bg-white/5 rounded-full mb-2 overflow-hidden'>
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
  return (
    <Section>
      <SectionHeader title='Place Traits' />
      <div className='grid grid-cols-3 sm:grid-cols-6 gap-3'>
        <StatCard label='Consist' value={traits.consistency} color={getScoreColor(traits.consistency)} />
        <StatCard label='Reliab' value={traits.reliability} color={getScoreColor(traits.reliability)} />
        <StatCard label='Honest' value={traits.honesty} color={getScoreColor(traits.honesty)} />
        <StatCard label='Kick' value={traits.finishingKick} color={getScoreColor(traits.finishingKick)} />
        <StatCard label='Explode' value={traits.explosiveAbility} color={getScoreColor(traits.explosiveAbility)} />
        <StatCard label='Market' value={traits.marketConfidence} color={getScoreColor(traits.marketConfidence)} />
      </div>
    </Section>
  )
}

function ComponentsSection({ components }: { components: NonNullable<Runner['components']> }) {
  return (
    <Section>
      <SectionHeader title='Component Scores' badge={`${components.finalScore}`} badgeClass='bg-amber-500/10 text-amber-400' />
      <div className='grid grid-cols-6 gap-3'>
        {[
          { label: 'Ability', value: components.ability },
          { label: 'Form', value: components.form },
          { label: 'Suit', value: components.suitability },
          { label: 'Pace', value: components.pace },
          { label: 'Replay', value: components.replay },
          { label: 'T/J', value: components.trainerJockey },
        ].map((item) => (
          <div key={item.label} className='text-center'>
            <div className='h-1.5 bg-white/5 rounded-full mb-2 overflow-hidden'>
              <div className='h-full rounded-full' style={{ width: `${item.value}%`, background: item.value >= 65 ? '#10b981' : item.value >= 50 ? '#f59e0b' : '#ef4444' }} />
            </div>
            <span className='text-zinc-500 text-xs'>{item.label}</span>
            <span className='block text-sm font-bold mt-0.5'>{item.value}</span>
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
      <div className='grid grid-cols-3 sm:grid-cols-6 gap-3'>
        <StatCard label='Win%' value={`${winProb}%`} />
        <StatCard label='Place%' value={`${placeProb || '-'}%`} />
        <StatCard label='Fair Odds' value={sq.fairOdds} />
        <StatCard label='Market' value={sq.marketOdds} />
        <StatCard label='Edge' value={`${sq.edge > 0 ? '+' : ''}${(sq.edge * 100).toFixed(1)}%`} color={sq.edge > 0 ? 'text-green-400' : 'text-red-400'} />
        <StatCard label='Value' value={`${sq.value > 0 ? '+' : ''}${sq.value}%`} color={sq.value > 0 ? 'text-green-400' : 'text-red-400'} />
      </div>
    </Section>
  )
}

function SimulationSection({ sim }: { sim: NonNullable<Runner['simulation']> }) {
  return (
    <Section>
      <SectionHeader title='Race Simulation' badge={sim.raceShape} badgeClass={sim.raceShape === 'HONEST' ? 'bg-green-500/10 text-green-400' : sim.raceShape === 'SLOW' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'} />
      <div className='grid grid-cols-4 gap-3'>
        <StatCard label='Sim Win%' value={`${sim.winRate}%`} />
        <StatCard label='Sim Place%' value={`${sim.placeRate}%`} />
        <StatCard label='Avg Pos' value={sim.avgPosition} />
        <StatCard label='Collapse%' value={`${sim.collapseRate}%`} color={sim.collapseRate > 15 ? 'text-red-400' : undefined} />
      </div>
    </Section>
  )
}

function ValueEngineSection({ ve }: { ve: NonNullable<Runner['valueEngine']> }) {
  return (
    <Section>
      <SectionHeader title='Value Engine' badge={ve.valueGrade} badgeClass={ve.valueGrade === 'A+' || ve.valueGrade === 'A' ? 'bg-green-500/10 text-green-400' : ''} />
      <div className='grid grid-cols-4 gap-3'>
        <StatCard label='Edge' value={`${ve.edge >= 0 ? '+' : ''}${ve.edge}%`} color={ve.edge >= 0 ? 'text-green-400' : 'text-red-400'} />
        <StatCard label='EV' value={`${ve.expectedValue >= 0 ? '+' : ''}${ve.expectedValue}`} color={ve.expectedValue >= 0 ? 'text-green-400' : 'text-red-400'} />
        <StatCard label='ROI' value={`${ve.roi >= 0 ? '+' : ''}${ve.roi}%`} color={ve.roi >= 0 ? 'text-green-400' : 'text-red-400'} />
        <StatCard label='Bettable' value={ve.bettable ? 'YES' : 'NO'} color={ve.bettable ? 'text-green-400' : 'text-red-400'} />
      </div>
    </Section>
  )
}

function BankrollEngineSection({ be }: { be: NonNullable<Runner['bankrollEngine']> }) {
  return (
    <Section>
      <SectionHeader title='Bankroll Engine' badge={be.label} badgeClass={be.label === 'STRONG BET' || be.label === 'BET' ? 'bg-green-500/10 text-green-400' : ''} />
      <div className='grid grid-cols-4 gap-3'>
        <StatCard label='Stake' value={be.stake || 0} />
        <StatCard label='Units' value={be.units || 0} />
        <StatCard label='Kelly' value={`${be.adjustedKelly || 0}%`} />
        <StatCard label='Reason' value={be.reason || '-'} />
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
