import React, { useState } from 'react'

function getRunnerZone(runner) {
  const style = runner.runningStyle || 'Midfield'
  if (style === 'Front Runner') return 'early'
  if (style === 'Prominent') return 'early-mid'
  if (style === 'Hold Up') return 'hold-up'
  return 'midfield'
}

function getPressureLevel(runner) {
  const energy = runner.energy || {}
  const early = energy.earlyEnergy || 50
  const compat = runner.paceCompat?.compatibility || 50
  const avg = (early + compat) / 2

  if (avg >= 70) return 'high'
  if (avg >= 50) return 'medium'
  return 'low'
}

function PressureBar({ level, width }) {
  const colors = {
    high: 'bg-red-500',
    medium: 'bg-amber-500',
    low: 'bg-green-500',
  }
  return (
    <div className='pressure-bar-track'>
      <div
        className={`pressure-bar-fill ${colors[level]}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

function RunnerRow({ runner, index }) {
  const pressure = getPressureLevel(runner)
  const energy = runner.energy || {}
  const early = energy.earlyEnergy || 50
  const sustain = energy.sustainability || 50
  const compat = runner.paceCompat?.compatibility || 50

  return (
    <div className='pressure-runner-row'>
      <span className='pressure-runner-num'>#{index + 1}</span>
      <span className='pressure-runner-name'>{runner.horse}</span>
      <div className='pressure-runner-bars'>
        <div className='pressure-bar-group'>
          <span className='pressure-bar-label'>Early</span>
          <PressureBar level={early >= 70 ? 'high' : early >= 50 ? 'medium' : 'low'} width={early} />
        </div>
        <div className='pressure-bar-group'>
          <span className='pressure-bar-label'>Sustain</span>
          <PressureBar level={sustain >= 70 ? 'high' : sustain >= 50 ? 'medium' : 'low'} width={sustain} />
        </div>
        <div className='pressure-bar-group'>
          <span className='pressure-bar-label'>Compat</span>
          <PressureBar level={pressure} width={compat} />
        </div>
      </div>
      <span className={`pressure-runner-tag tag-${energy.profile?.toLowerCase().replace(/[^a-z]/g, '') || 'even'}`}>
        {energy.profile || 'EVEN'}
      </span>
    </div>
  )
}

function ZoneSection({ title, runners, icon, color }) {
  if (!runners || runners.length === 0) return null

  return (
    <div className={`pressure-zone zone-${color}`}>
      <div className='pressure-zone-header'>
        <span className='pressure-zone-icon'>{icon}</span>
        <span className='pressure-zone-title'>{title}</span>
        <span className='pressure-zone-count'>{runners.length}</span>
      </div>
      <div className='pressure-zone-runners'>
        {runners.map((r, i) => (
          <RunnerRow key={r.horse_id || r.horse || i} runner={r} index={i} />
        ))}
      </div>
    </div>
  )
}

export default function RacePressureGraph({ race }) {
  const [expanded, setExpanded] = useState(false)

  if (!race || !race.runners) return null

  const runners = race.runners || []
  const paceMap = race.paceMap || {}
  const volatility = race.volatility || {}

  const earlyRunners = runners.filter((r) => getRunnerZone(r) === 'early')
  const earlyMidRunners = runners.filter((r) => getRunnerZone(r) === 'early-mid')
  const midfieldRunners = runners.filter((r) => getRunnerZone(r) === 'midfield')
  const holdUpRunners = runners.filter((r) => getRunnerZone(r) === 'hold-up')

  const tempo = paceMap.projectedTempo || 'EVEN'
  const collapseRisk = paceMap.collapseRisk || 'LOW'
  const frontRunners = paceMap.frontRunners || 0

  let pressureLabel = 'EVEN PACE'
  let pressureColor = 'even'
  if (tempo === 'FAST' || frontRunners >= 3) {
    pressureLabel = 'FAST EARLY PACE'
    pressureColor = 'fast'
  } else if (tempo === 'SLOW') {
    pressureLabel = 'SLOW PACE'
    pressureColor = 'slow'
  } else if (tempo === 'FAIR') {
    pressureLabel = 'FAIR PACE'
    pressureColor = 'fair'
  }

  return (
    <div className='race-pressure-graph'>
      <button
        type='button'
        className='pressure-toggle'
        onClick={() => setExpanded(!expanded)}
      >
        <span className='pressure-toggle-icon'>📊</span>
        <span className='pressure-toggle-text'>
          Pace Map: {pressureLabel}
          {collapseRisk === 'HIGH' && ' ⚡ COLLAPSE RISK'}
        </span>
        <span className={`pressure-toggle-arrow ${expanded ? 'open' : ''}`}>▼</span>
      </button>

      {expanded && (
        <div className='pressure-content'>
          <div className='pressure-summary'>
            <div className='pressure-summary-item'>
              <span className='pressure-summary-label'>Tempo</span>
              <span className={`pressure-summary-value tempo-${tempo.toLowerCase()}`}>{tempo}</span>
            </div>
            <div className='pressure-summary-item'>
              <span className='pressure-summary-label'>Collapse Risk</span>
              <span className={`pressure-summary-value risk-${collapseRisk.toLowerCase()}`}>{collapseRisk}</span>
            </div>
            <div className='pressure-summary-item'>
              <span className='pressure-summary-label'>Front Runners</span>
              <span className='pressure-summary-value'>{frontRunners}</span>
            </div>
            <div className='pressure-summary-item'>
              <span className='pressure-summary-label'>Volatility</span>
              <span className={`pressure-summary-value vol-${volatility.label?.toLowerCase() || 'medium'}`}>
                {volatility.label || 'MEDIUM'}
              </span>
            </div>
          </div>

          <ZoneSection
            title='EARLY PACE'
            runners={earlyRunners}
            icon='⚡'
            color='fast'
          />

          <ZoneSection
            title='EARLY-MID'
            runners={earlyMidRunners}
            icon='🏃'
            color='fair'
          />

          <ZoneSection
            title='MIDFIELD'
            runners={midfieldRunners}
            icon='📍'
            color='even'
          />

          <ZoneSection
            title='HOLD-UP'
            runners={holdUpRunners}
            icon='🐢'
            color='slow'
          />

          {earlyRunners.length + earlyMidRunners.length >= 4 && (
            <div className='pressure-warning'>
              ⚠ High pace pressure — {earlyRunners.length + earlyMidRunners.length} early runners likely to contest the lead
            </div>
          )}

          {holdUpRunners.length >= 3 && tempo === 'FAST' && (
            <div className='pressure-closer-bonus'>
              💨 Fast pace with {holdUpRunners.length} closers — late runners may benefit from pace collapse
            </div>
          )}
        </div>
      )}
    </div>
  )
}
