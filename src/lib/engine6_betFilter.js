// APEX v4 — Engine 6: Bet Filter
// Aggressively identifies unbettable races
// Professional bettors pass constantly

import { analyzeForm } from './formEngine.js'

function countDebutants(runners) {
  return runners.filter((r) => {
    const formAnalysis = analyzeForm(r)
    return formAnalysis.summary.finishedRuns === 0
  }).length
}

function computeFieldChaos(runners, race) {
  const fieldSize = runners.length
  const going = (race.going || '').toLowerCase()
  const raceName = (race.race_name || '').toLowerCase()

  let chaos = 0
  if (fieldSize >= 16) chaos += 30
  else if (fieldSize >= 12) chaos += 15

  if (/maiden|novice/i.test(raceName)) chaos += 20

  if (going.includes('heavy')) chaos += 15
  else if (going.includes('soft')) chaos += 8

  const unrated = runners.filter((r) => !(r.or || r.ofr)).length
  if (unrated > fieldSize * 0.5) chaos += 20

  return Math.min(100, chaos)
}

function computePaceConflict(paceMap) {
  const frontRunners = paceMap?.frontRunners || 0
  const tempo = paceMap?.projectedTempo || 'EVEN'
  const collapseRisk = paceMap?.collapseRisk || 'LOW'

  if (frontRunners >= 4) return 35
  if (frontRunners >= 3 && tempo === 'FAST') return 30
  if (frontRunners >= 3) return 20
  if (frontRunners === 0) return 15
  if (collapseRisk === 'HIGH') return 25

  return 5
}

function computeConfidenceSpread(runners) {
  if (!runners || runners.length < 2) return 0

  const scores = runners.map((r) => r.finalScore || 50).sort((a, b) => b - a)
  const spread = scores[0] - scores[1]

  if (spread < 3) return 30
  if (spread < 5) return 20
  if (spread < 8) return 10

  return 0
}

function computeDataSufficiency(runners) {
  const rated = runners.filter((r) => r.or || r.ofr).length
  const withForm = runners.filter((r) => {
    const formAnalysis = analyzeForm(r)
    return formAnalysis.summary.finishedRuns >= 2
  }).length

  const fieldSize = runners.length
  const coverage = (rated + withForm) / (fieldSize * 2)

  if (coverage < 0.3) return 35
  if (coverage < 0.5) return 20
  if (coverage < 0.7) return 10

  return 0
}

function computeEdgeStrength(runners) {
  const edges = runners.map((r) => {
    const odds = Number(r.odds || r.price || 0)
    const modelProb = r.modelProb || r.winProb || 0
    if (odds <= 1 || !modelProb) return 0
    return modelProb - (1 / odds) * 100
  })

  const maxEdge = Math.max(...edges)
  if (maxEdge < 2) return 35
  if (maxEdge < 5) return 20
  if (maxEdge < 8) return 10

  return 0
}

export function computeBetFilter(runners, race, paceMap) {
  const debCount = countDebutants(runners)
  const fieldChaos = computeFieldChaos(runners, race)
  const paceConflict = computePaceConflict(paceMap)
  const confSpread = computeConfidenceSpread(runners)
  const dataSuff = computeDataSufficiency(runners)
  const edgeStrength = computeEdgeStrength(runners)

  const flags = []
  let skipScore = 0

  if (debCount >= 4) {
    flags.push({ type: 'debutants', label: 'Debutants Everywhere', severity: 'high' })
    skipScore += 25
  } else if (debCount >= 2) {
    flags.push({ type: 'debutants', label: 'Multiple Debutants', severity: 'medium' })
    skipScore += 10
  }

  if (fieldChaos >= 40) {
    flags.push({ type: 'chaos', label: 'High Field Chaos', severity: 'high' })
    skipScore += 25
  } else if (fieldChaos >= 25) {
    flags.push({ type: 'chaos', label: 'Moderate Chaos', severity: 'medium' })
    skipScore += 10
  }

  if (paceConflict >= 30) {
    flags.push({ type: 'pace', label: 'Conflicting Pace Setup', severity: 'high' })
    skipScore += 20
  } else if (paceConflict >= 15) {
    flags.push({ type: 'pace', label: 'Pace Uncertainty', severity: 'medium' })
    skipScore += 8
  }

  if (dataSuff >= 25) {
    flags.push({ type: 'data', label: 'Insufficient Data', severity: 'high' })
    skipScore += 20
  } else if (dataSuff >= 10) {
    flags.push({ type: 'data', label: 'Limited Data', severity: 'medium' })
    skipScore += 8
  }

  if (confSpread >= 25) {
    flags.push({ type: 'confidence', label: 'Weak Confidence Spread', severity: 'high' })
    skipScore += 15
  } else if (confSpread >= 15) {
    flags.push({ type: 'confidence', label: 'Tight Spread', severity: 'medium' })
    skipScore += 5
  }

  if (edgeStrength >= 25) {
    flags.push({ type: 'edge', label: 'No Strong Edge', severity: 'high' })
    skipScore += 15
  } else if (edgeStrength >= 10) {
    flags.push({ type: 'edge', label: 'Weak Edge', severity: 'medium' })
    skipScore += 5
  }

  const going = (race.going || '').toLowerCase()
  if (going.includes('heavy')) {
    flags.push({ type: 'going', label: 'Volatile Ground', severity: 'medium' })
    skipScore += 10
  }

  const fieldSize = runners.length
  if (fieldSize >= 16) {
    flags.push({ type: 'field', label: 'Massive Field', severity: 'medium' })
    skipScore += 10
  }

  let verdict = 'BETTABLE'
  if (skipScore >= 50) verdict = 'AUTO SKIP'
  else if (skipScore >= 30) verdict = 'HIGH RISK'
  else if (skipScore >= 15) verdict = 'CAUTION'

  const positiveSignals = []
  const rated = runners.filter((r) => r.or || r.ofr).length
  if (rated >= runners.length * 0.7) positiveSignals.push('Most runners rated')

  const withForm = runners.filter((r) => {
    const formAnalysis = analyzeForm(r)
    return formAnalysis.summary.finishedRuns >= 3
  }).length
  if (withForm >= runners.length * 0.5) positiveSignals.push('Proven runners')

  if (paceMap?.frontRunners >= 1 && paceMap?.frontRunners <= 2) positiveSignals.push('Clear pace structure')

  const maxEdge = Math.max(...runners.map((r) => {
    const odds = Number(r.odds || r.price || 0)
    const modelProb = r.modelProb || r.winProb || 0
    if (odds <= 1 || !modelProb) return 0
    return modelProb - (1 / odds) * 100
  }), 0)
  if (maxEdge >= 8) positiveSignals.push('Strong edge available')

  return {
    verdict,
    skipScore: Math.min(100, skipScore),
    flags,
    positiveSignals,
    metrics: {
      debCount,
      fieldChaos,
      paceConflict,
      confSpread,
      dataSufficiency: dataSuff,
      edgeStrength,
      maxEdge: Math.round(maxEdge * 10) / 10,
    },
  }
}
