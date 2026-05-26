import { calculateFieldStrength, normalizePosition } from './fieldStrength.js'
import { analyzeForm } from './formEngine.js'

const STYLE_KEYWORDS = {
  leader: ['led', 'made all', 'front', 'early lead', 'set the pace', 'controlled'],
  prominent: ['prominent', 'close up', 'tracked leader', 'chased leaders', 'pressed', 'in touch'],
  midfield: ['midfield', 'mid-division', 'mid-division', 'in rear', 'held up', 'towards rear'],
  holdUp: ['held up', 'rear', 'last', 'well behind', 'towards rear', 'held up in rear'],
}

function detectStyleFromComments(comments) {
  const lower = comments.toLowerCase()
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return style === 'leader' ? 'Front Runner' :
             style === 'prominent' ? 'Prominent' :
             style === 'midfield' ? 'Midfield' : 'Hold Up'
    }
  }
  return null
}

export function classifyRunningStyle(runner, race = null) {
  const form = runner.form || ''
  const comments = runner.comments || ''
  const formAnalysis = analyzeForm(runner, race)
  const rawPositions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)

  // First try to detect style from comments
  const commentStyle = detectStyleFromComments(comments)
  if (commentStyle) return commentStyle

  // Fallback to form-based classification
  if (rawPositions.length < 2) return 'Midfield'

  let positions = rawPositions
  if (race && race.runners) {
    const fieldSize = race.runners.length
    const fieldStrength = calculateFieldStrength(race.runners, race)
    positions = rawPositions.map((p) => normalizePosition(p, fieldStrength.strength, fieldSize))
  }

  const recent = positions.slice(0, 3)
  const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
  const winRate = positions.filter((p) => p <= 1.5).length / positions.length
  const top3Rate = positions.filter((p) => p <= 3.5).length / positions.length
  const improved = recent[recent.length - 1] < recent[0]

  if (winRate >= 0.3) return 'Front Runner'
  if (avgPos <= 2.5) return 'Prominent'
  if (improved && avgPos <= 4) return 'Midfield'
  if (avgPos >= 6) return 'Hold Up'
  if (top3Rate >= 0.4) return 'Prominent'
  if (improved) return 'Midfield'

  return 'Midfield'
}

export function generatePaceMap(runners = []) {
  const pace = {
    frontRunners: 0,
    prominent: 0,
    midfield: 0,
    holdUp: 0,
    projectedTempo: 'EVEN',
    collapseRisk: 'LOW',
    pacePressure: 'MEDIUM',
  }

  runners.forEach((runner) => {
    const style = classifyRunningStyle(runner)
    if (style === 'Front Runner') pace.frontRunners++
    else if (style === 'Prominent') pace.prominent++
    else if (style === 'Hold Up') pace.holdUp++
    else pace.midfield++
  })

  // Compute pace pressure
  const totalRunners = runners.length
  const pacePressureRatio = (pace.frontRunners + pace.prominent) / Math.max(1, totalRunners)

  if (pace.frontRunners >= 4 || (pace.frontRunners >= 3 && pace.prominent >= 3)) {
    pace.projectedTempo = 'FAST'
    pace.collapseRisk = 'HIGH'
    pace.pacePressure = 'HIGH'
  } else if (pace.frontRunners <= 1 && pace.holdUp + pace.midfield >= 4) {
    pace.projectedTempo = 'SLOW'
    pace.collapseRisk = 'LOW'
    pace.pacePressure = 'LOW'
  } else if (pace.frontRunners >= 2) {
    pace.projectedTempo = 'FAIR'
    pace.collapseRisk = 'MEDIUM'
    pace.pacePressure = 'MEDIUM'
  }

  // High pace pressure favors hold-up horses
  if (pace.pacePressure === 'HIGH' && pace.holdUp >= 2) {
    pace.collapseRisk = 'VERY HIGH'
  }

  return pace
}

export function computePacePressure(paceMap) {
  const fr = paceMap.frontRunners || 0
  const prom = paceMap.prominent || 0
  const total = fr + prom + paceMap.midfield + paceMap.holdUp
  const pressureRatio = (fr + prom) / Math.max(1, total)

  let pressure = 50
  if (pressureRatio >= 0.7) pressure = 85
  else if (pressureRatio >= 0.5) pressure = 70
  else if (pressureRatio >= 0.3) pressure = 50
  else pressure = 30

  // Adjust for collapse risk
  if (paceMap.collapseRisk === 'HIGH' || paceMap.collapseRisk === 'VERY HIGH') {
    pressure += 10
  }

  return Math.max(0, Math.min(100, pressure))
}

export function paceMatrixScore(runningStyle, paceMap, draw, fieldSize) {
  let score = 0
  const fr = paceMap.frontRunners || 0
  const tempo = paceMap.projectedTempo || 'EVEN'
  const collapseRisk = paceMap.collapseRisk || 'LOW'
  const pacePressure = paceMap.pacePressure || 'MEDIUM'

  if (runningStyle === 'Front Runner') {
    if (fr === 1) {
      score = 10
      if (tempo === 'SLOW') score += 5
      if (fieldSize <= 6) score += 2
    } else if (fr === 2) {
      score = 4
      if (fieldSize >= 10) score -= 2
    } else {
      score = -3
      if (fr >= 4) score = -7
    }
    if (tempo === 'FAST' && fr >= 2) score -= 4
  }

  if (runningStyle === 'Prominent') {
    if (tempo === 'SLOW') score = 5
    else if (tempo === 'FAIR') score = 2
    else if (tempo === 'FAST') score = -1
    if (fr <= 1 && tempo === 'SLOW') score += 3
  }

  if (runningStyle === 'Midfield') {
    if (tempo === 'FAST') score = 4
    else if (tempo === 'FAIR') score = 1
    else if (tempo === 'SLOW') score = -4
  }

  if (runningStyle === 'Hold Up') {
    if (tempo === 'FAST' && collapseRisk === 'HIGH') score = 8
    else if (tempo === 'FAST') score = 5
    else if (tempo === 'FAIR') score = 1
    else score = -6

    // High pace pressure strongly favors hold-up horses
    if (pacePressure === 'HIGH' && collapseRisk === 'HIGH') score += 5
    if (pacePressure === 'HIGH') score += 3
  }

  if (draw > 0 && fieldSize > 0) {
    const wideCutoff = Math.ceil(fieldSize * 0.75)
    if (draw >= wideCutoff && (runningStyle === 'Front Runner' || runningStyle === 'Prominent')) {
      score -= 3
    }
    if (draw <= 2 && runningStyle === 'Hold Up' && fieldSize >= 10) {
      score -= 2
    }
  }

  return Math.max(-15, Math.min(15, score))
}

export function getPaceAdjustment(runningStyle, paceMap) {
  return paceMatrixScore(runningStyle, paceMap, 0, 0) / 3
}
