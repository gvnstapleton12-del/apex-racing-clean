// APEX v4 — Explainability Engine
// Every pick explains itself
// WHY and RISKS sections

function computeWhySignals(runner, race, paceMap, simulation, valueEngine) {
  const signals = []

  const or = runner.or || runner.ofr || 0
  if (or > 120) signals.push({ type: 'why', label: 'Top class rating', icon: '✓' })
  else if (or > 100) signals.push({ type: 'why', label: 'Strong class rating', icon: '✓' })

  if (paceMap?.frontRunners >= 1 && paceMap?.frontRunners <= 2) {
    const style = runner.runningStyle || ''
    if (style === 'Front Runner' && paceMap.frontRunners === 1) {
      signals.push({ type: 'why', label: 'Lone front-runner', icon: '✓' })
    } else if (style === 'Hold Up' && paceMap.frontRunners >= 2) {
      signals.push({ type: 'why', label: 'Strong pace setup for closers', icon: '✓' })
    }
  }

  const replayNote = runner.human?.tags || []
  if (replayNote.length > 0) {
    signals.push({ type: 'why', label: `Positive replay: ${replayNote.join(', ')}`, icon: '✓' })
  }

  const raceDist = parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0
  if (raceDist > 0) {
    const form = runner.form || ''
    const runs = form.split(/[\s/-]+/).filter((p) => /^\d+$/.test(p)).length
    if (runs >= 3) {
      signals.push({ type: 'why', label: 'Proven at distance', icon: '✓' })
    }
  }

  const trainerRtf = runner.trainer_rtf || 0
  if (trainerRtf > 20) signals.push({ type: 'why', label: 'Trainer in form', icon: '✓' })
  else if (trainerRtf > 15) signals.push({ type: 'why', label: 'Stable in form', icon: '✓' })

  if (simulation?.winRate > 25) signals.push({ type: 'why', label: 'Strong simulation result', icon: '✓' })
  else if (simulation?.winRate > 15) signals.push({ type: 'why', label: 'Positive simulation', icon: '✓' })

  if (valueEngine?.edge > 5) signals.push({ type: 'why', label: `Value edge +${valueEngine.edge}%`, icon: '✓' })
  else if (valueEngine?.edge > 2) signals.push({ type: 'why', label: `Marginal value +${valueEngine.edge}%`, icon: '✓' })

  if (runner.horseQuality?.label === 'Elite') signals.push({ type: 'why', label: 'Elite horse quality', icon: '✓' })
  else if (runner.horseQuality?.label === 'Strong') signals.push({ type: 'why', label: 'Strong horse quality', icon: '✓' })

  const lastRun = runner.last_run || 999
  if (lastRun <= 14) signals.push({ type: 'why', label: 'Very fresh', icon: '✓' })

  return signals
}

function computeRiskSignals(runner, race, paceMap, simulation, uncertainty) {
  const risks = []

  const draw = Number(runner.draw) || 0
  const fieldSize = race.field_size || race.fieldSize || 8
  if (draw > 0 && fieldSize > 0) {
    const drawRatio = draw / fieldSize
    if (drawRatio > 0.8) risks.push({ type: 'risk', label: 'Wide draw', icon: '–' })
  }

  if (paceMap?.collapseRisk === 'HIGH') risks.push({ type: 'risk', label: 'High race volatility', icon: '–' })
  else if (paceMap?.collapseRisk === 'MEDIUM') risks.push({ type: 'risk', label: 'Moderate volatility', icon: '–' })

  if (simulation?.collapseRate > 20) risks.push({ type: 'risk', label: 'High collapse risk', icon: '–' })
  else if (simulation?.collapseRate > 10) risks.push({ type: 'risk', label: 'Moderate collapse risk', icon: '–' })

  const lastRun = runner.last_run || 999
  if (lastRun > 90) risks.push({ type: 'risk', label: `Long layoff (${lastRun}d)`, icon: '–' })
  else if (lastRun > 60) risks.push({ type: 'risk', label: `Freshness concern (${lastRun}d)`, icon: '–' })

  const form = runner.form || ''
  const positions = []
  form.split(/[\s/-]+/).forEach((p) => {
    const num = parseInt(p, 10)
    if (!isNaN(num) && num >= 1 && num <= 20) positions.push(num)
  })
  if (positions.length > 0) {
    const spread = Math.max(...positions) - Math.min(...positions)
    if (spread > 10) risks.push({ type: 'risk', label: 'Inconsistent form', icon: '–' })
  }

  if (uncertainty?.uncertainty >= 25) risks.push({ type: 'risk', label: 'Chaos machine', icon: '–' })
  else if (uncertainty?.uncertainty >= 18) risks.push({ type: 'risk', label: 'High uncertainty', icon: '–' })
  else if (uncertainty?.uncertainty >= 12) risks.push({ type: 'risk', label: 'Moderate uncertainty', icon: '–' })

  const going = (race.going || '').toLowerCase()
  if (going.includes('heavy')) risks.push({ type: 'risk', label: 'Heavy ground', icon: '–' })

  if (fieldSize >= 16) risks.push({ type: 'risk', label: 'Massive field', icon: '–' })

  const odds = Number(runner.odds || runner.price || 0)
  if (odds > 0 && odds < 2) risks.push({ type: 'risk', label: 'Short price — little value', icon: '–' })

  return risks
}

export function generateExplanation(runner, race, paceMap, simulation, valueEngine, uncertainty) {
  const whySignals = computeWhySignals(runner, race, paceMap, simulation, valueEngine)
  const riskSignals = computeRiskSignals(runner, race, paceMap, simulation, uncertainty)

  return {
    why: whySignals,
    risks: riskSignals,
    whyCount: whySignals.length,
    riskCount: riskSignals.length,
    confidence: whySignals.length - riskSignals.length,
  }
}
