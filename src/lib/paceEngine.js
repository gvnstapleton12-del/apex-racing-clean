import { calculateFieldStrength, normalizePosition } from './fieldStrength.js'

function parseFormPositions(form = '') {
  const positions = []
  const segments = form.split(/[\/-]/)
  segments.forEach((seg) => {
    for (const ch of seg) {
      const n = parseInt(ch, 10)
      if (!isNaN(n)) positions.push(n)
    }
  })
  return positions.filter((p) => p > 0)
}

export function classifyRunningStyle(runner, race = null) {
  const form = runner.form || ''
  const rawPositions = parseFormPositions(form)
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
  }

  runners.forEach((runner) => {
    const style = classifyRunningStyle(runner)
    if (style === 'Front Runner') pace.frontRunners++
    else if (style === 'Prominent') pace.prominent++
    else if (style === 'Hold Up') pace.holdUp++
    else pace.midfield++
  })

  if (pace.frontRunners >= 4 || (pace.frontRunners >= 3 && pace.prominent >= 3)) {
    pace.projectedTempo = 'FAST'
    pace.collapseRisk = 'HIGH'
  } else if (pace.frontRunners <= 1 && pace.holdUp + pace.midfield >= 4) {
    pace.projectedTempo = 'SLOW'
    pace.collapseRisk = 'LOW'
  } else if (pace.frontRunners >= 2) {
    pace.projectedTempo = 'FAIR'
    pace.collapseRisk = 'MEDIUM'
  }

  return pace
}

export function paceMatrixScore(runningStyle, paceMap, draw, fieldSize) {
  let score = 0
  const fr = paceMap.frontRunners || 0
  const tempo = paceMap.projectedTempo || 'EVEN'
  const collapseRisk = paceMap.collapseRisk || 'LOW'

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

export { parseFormPositions }
