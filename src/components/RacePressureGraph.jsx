import React, { useState } from 'react'

function ScoreBar({ score }) {
  const clamped = Math.max(5, Math.min(95, score))
  let color = 'bg-amber-500'
  if (score >= 72) color = 'bg-red-500'
  else if (score >= 56) color = 'bg-orange-400'
  else if (score <= 35) color = 'bg-green-500'
  else if (score <= 45) color = 'bg-emerald-400'

  return (
    <div className='pace-score-track'>
      <div className={`pace-score-fill ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

function RunnerRow({ runner, rank }) {
  const score = runner.earlyPaceScore || 50
  const style = runner.runningStyle || 'Midfield'

  return (
    <div className='pace-runner-row'>
      <span className='pace-runner-rank'>#{rank + 1}</span>
      <span className='pace-runner-name'>{runner.horse}</span>
      <div className='pace-runner-bar'>
        <ScoreBar score={score} />
      </div>
      <span className='pace-runner-score'>{score}</span>
    </div>
  )
}

function BenefitList({ items, type }) {
  if (!items || items.length === 0) return null
  const label = type === 'benefit' ? 'Beneficiaries' : 'Disadvantaged'
  const cls = type === 'benefit' ? 'pace-benefit' : 'pace-disadvantage'

  return (
    <div className={cls}>
      <span className='pace-benefit-label'>{label}</span>
      {items.map((item, i) => (
        <div key={item.horse_id || item.horse || i} className='pace-benefit-item'>
          <span className='pace-benefit-horse'>{item.horse}</span>
          <span className='pace-benefit-reason'>{item.reason}</span>
        </div>
      ))}
    </div>
  )
}

export default function RacePressureGraph({ race }) {
  const [expanded, setExpanded] = useState(false)

  if (!race || !race.runners) return null

  const runners = race.runners || []
  const raceShape = race.raceShape || null
  const paceMap = race.paceMap || {}
  const volatility = race.volatility || {}

  const sorted = [...runners].sort((a, b) => (b.earlyPaceScore || 50) - (a.earlyPaceScore || 50))

  const shape = raceShape?.shape || paceMap.projectedTempo || 'UNKNOWN'
  const tempo = raceShape?.tempo || paceMap.projectedTempo || 'EVEN'
  const leaders = raceShape?.leaders ?? paceMap.frontRunners ?? 0
  const pressureLabel = raceShape?.pressureLabel || paceMap.pacePressure || 'MEDIUM'
  const collapseProb = raceShape?.collapseProb ?? 0
  const collapseRisk = collapseProb >= 55 ? 'HIGH' : collapseProb >= 30 ? 'MEDIUM' : 'LOW'

  const beneficiaries = raceShape?.beneficiaries || []
  const disadvantaged = raceShape?.disadvantaged || []

  const collapsePct = collapseProb

  return (
    <div className='race-pressure-graph'>
      <button type='button' className='pressure-toggle' onClick={() => setExpanded(!expanded)}>
        <span className='pressure-toggle-icon'>📊</span>
        <span className='pressure-toggle-text'>
          Pace Map: {shape}
          {collapseRisk === 'HIGH' && ` — ${collapsePct}% collapse risk`}
        </span>
        <span className={`pressure-toggle-arrow ${expanded ? 'open' : ''}`}>▼</span>
      </button>

      {expanded && (
        <div className='pressure-content'>
          <div className='pace-shape-header'>
            <div className='pace-shape-stat'>
              <span className='pace-shape-label'>Tempo</span>
              <span className={`pace-shape-value tempo-${tempo.toLowerCase()}`}>{tempo}</span>
            </div>
            <div className='pace-shape-stat'>
              <span className='pace-shape-label'>Leaders</span>
              <span className='pace-shape-value'>{leaders}</span>
            </div>
            <div className='pace-shape-stat'>
              <span className='pace-shape-label'>Pressure</span>
              <span className={`pace-shape-value pressure-${pressureLabel.toLowerCase().replace(' ', '-')}`}>{pressureLabel}</span>
            </div>
            <div className='pace-shape-stat'>
              <span className='pace-shape-label'>Collapse Risk</span>
              <span className={`pace-shape-value collapse-${collapseRisk.toLowerCase()}`}>{collapsePct}%</span>
            </div>
          </div>

          <div className='pace-runners-list'>
            {sorted.map((r, i) => (
              <RunnerRow key={r.horse_id || r.horse || i} runner={r} rank={i} />
            ))}
          </div>

          <BenefitList items={beneficiaries} type='benefit' />
          <BenefitList items={disadvantaged} type='disadvantage' />
        </div>
      )}
    </div>
  )
}
