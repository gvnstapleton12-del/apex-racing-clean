import { calculateFieldStrength, normalizePosition } from './fieldStrength.js'
import { analyzeForm } from './formEngine.js'

const LEADER_KEYWORDS = ['led', 'made all', 'front', 'early lead', 'set the pace', 'controlled', 'prominent', 'close up', 'tracked leader', 'chased leaders']
const CLOSER_KEYWORDS = ['held up', 'rear', 'last', 'well behind', 'towards rear', 'held up in rear', 'in rear', 'midfield', 'mid-division']

function countKeywords(text, keywords) {
  const lower = text.toLowerCase()
  return keywords.filter(kw => lower.includes(kw)).length
}

function parseFormPositions(form = '') {
  const positions = []
  const segments = form.split(/[\/\-]/)
  segments.forEach((seg) => {
    const cleaned = seg.replace(/[^0-9]/g, '')
    if (!cleaned) return
    const lastChar = seg.trim().slice(-1).toUpperCase()
    const isNonFinisher = /[FUPRDLCB]/.test(lastChar)
    if (isNonFinisher) return
    for (const ch of cleaned) {
      const n = parseInt(ch, 10)
      if (n > 0) positions.push(n)
    }
  })
  return positions.filter((p) => p > 0)
}

export function computeEarlyPaceScore(runner, race) {
  const form = String(runner.form || '')
  const comments = String(runner.comments || '')
  const draw = Number(runner.draw || 0)
  const odds = Number(runner.odds || 0)
  const fieldSize = (race?.runners || []).length || 8
  const distanceF = parseFloat(String(race?.distance_f || '').replace(/[^0-9.]/g, '')) || 0

  let score = 50

  const positions = parseFormPositions(form)
  if (positions.length >= 2) {
    const recent = positions.slice(0, 5)
    const recencyWeights = [1.0, 0.85, 0.70, 0.55, 0.40]
    let weightedSum = 0
    let weightTotal = 0
    recent.forEach((pos, i) => {
      const w = recencyWeights[i] || 0.25
      const fieldNorm = fieldSize > 0 ? pos / fieldSize : pos / 8
      const posScore = Math.max(0, 100 - fieldNorm * 100)
      weightedSum += posScore * w
      weightTotal += w
    })
    const formPace = weightTotal > 0 ? weightedSum / weightTotal : 50
    score = formPace * 0.55 + score * 0.45

    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
    if (avgPos <= 2) score += 12
    else if (avgPos <= 3.5) score += 6
    else if (avgPos >= 7) score -= 8
    else if (avgPos >= 5) score -= 4

    if (positions.length >= 3) {
      const last3 = positions.slice(0, 3)
      const wins = last3.filter(p => p <= 1.5).length
      const top3 = last3.filter(p => p <= 3.5).length
      if (wins >= 2) score += 8
      else if (wins >= 1) score += 4
      if (top3 >= 2) score += 3
    }
  }

  const leaderHits = countKeywords(comments, LEADER_KEYWORDS)
  const closerHits = countKeywords(comments, CLOSER_KEYWORDS)
  score += leaderHits * 5
  score -= closerHits * 5

  if (draw > 0 && fieldSize > 0) {
    const drawRatio = draw / fieldSize
    if (distanceF <= 7) {
      if (drawRatio <= 0.3) score += 3
      else if (drawRatio >= 0.75) score -= 2
    } else {
      if (drawRatio >= 0.6) score += 2
    }
  }

  if (odds > 0 && fieldSize > 0) {
    const allOdds = (race?.runners || []).map(r => Number(r.odds || 0)).filter(o => o > 0).sort((a, b) => a - b)
    const oddsRank = allOdds.indexOf(odds)
    if (oddsRank >= 0) {
      const shortPct = oddsRank / Math.max(1, allOdds.length - 1)
      score += (1 - shortPct) * 8
    }
  }

  if (distanceF > 0) {
    if (distanceF <= 6) score += 4
    else if (distanceF <= 8) score += 2
    else if (distanceF >= 12) score -= 4
    else if (distanceF >= 10) score -= 2
  }

  return Math.max(5, Math.min(95, Math.round(score)))
}

export function classifyRunningStyle(runner, race = null) {
  const earlyScore = computeEarlyPaceScore(runner, race)

  const comments = String(runner.comments || '')
  const lowerComments = comments.toLowerCase()

  const leaderHits = countKeywords(lowerComments, LEADER_KEYWORDS)
  const closerHits = countKeywords(lowerComments, CLOSER_KEYWORDS)
  if (leaderHits >= 2 && leaderHits > closerHits) return 'Front Runner'
  if (closerHits >= 2 && closerHits > leaderHits) return 'Hold Up'

  if (earlyScore >= 72) return 'Front Runner'
  if (earlyScore >= 56) return 'Prominent'
  if (earlyScore <= 35) return 'Hold Up'
  return 'Midfield'
}

export function detectRaceShape(runners, race) {
  const scored = runners.map(r => ({
    horse: r.horse,
    horse_id: r.horse_id || r.horse,
    earlyPaceScore: r.earlyPaceScore || computeEarlyPaceScore(r, race),
    runningStyle: r.runningStyle || classifyRunningStyle(r, race),
    draw: Number(r.draw || 0),
    odds: Number(r.odds || 0),
  }))

  scored.sort((a, b) => b.earlyPaceScore - a.earlyPaceScore)

  const leaders = scored.filter(r => r.earlyPaceScore >= 72)
  const pressers = scored.filter(r => r.earlyPaceScore >= 56 && r.earlyPaceScore < 72)
  const midfield = scored.filter(r => r.earlyPaceScore >= 36 && r.earlyPaceScore < 56)
  const closers = scored.filter(r => r.earlyPaceScore < 36)

  const leaderCount = leaders.length
  const fieldSize = runners.length

  let shape = 'LONE LEADER'
  let pressureLabel = 'LOW'
  let collapseProb = 10
  let tempo = 'SLOW'

  if (leaderCount === 0) {
    shape = 'NO CLEAR LEADER'
    pressureLabel = 'LOW'
    collapseProb = 5
    tempo = 'SLOW'
  } else if (leaderCount === 1) {
    shape = 'LONE LEADER'
    pressureLabel = 'LOW'
    collapseProb = 15
    tempo = 'SLOW'
  } else if (leaderCount === 2) {
    shape = 'CONTROLLED PACE'
    pressureLabel = 'MODERATE'
    collapseProb = 30
    tempo = 'FAIR'
  } else if (leaderCount <= 4) {
    shape = 'STRONG PACE'
    pressureLabel = 'HIGH'
    collapseProb = 55
    tempo = 'FAST'
  } else {
    shape = 'PACE COLLAPSE'
    pressureLabel = 'VERY HIGH'
    collapseProb = 80
    tempo = 'FAST'
  }

  const presserCount = pressers.length
  if (presserCount >= 3 && leaderCount >= 1) {
    collapseProb = Math.min(95, collapseProb + 15)
    if (pressureLabel === 'MODERATE') pressureLabel = 'HIGH'
    else if (pressureLabel === 'LOW') pressureLabel = 'MODERATE'
  }

  if (fieldSize >= 14 && leaderCount >= 2) {
    collapseProb = Math.min(95, collapseProb + 10)
  }

  const beneficiaries = []
  const disadvantaged = []

  if (collapseProb >= 50) {
    closers.forEach(c => beneficiaries.push({ ...c, reason: 'Closes into pace collapse' }))
    midfield.forEach(m => beneficiaries.push({ ...m, reason: 'Midpack runner benefits from collapsing pace' }))
    leaders.forEach(l => disadvantaged.push({ ...l, reason: 'Front runner in pace battle' }))
    pressers.forEach(p => {
      if (p.earlyPaceScore >= 60) {
        disadvantaged.push({ ...p, reason: 'Pressing role in strong pace' })
      }
    })
  } else if (leaderCount <= 1 && collapseProb <= 20) {
    leaders.forEach(l => beneficiaries.push({ ...l, reason: 'Lone leader controls pace' }))
    pressers.forEach(p => disadvantaged.push({ ...p, reason: 'No pace to chase — leader dictates' }))
    closers.forEach(c => disadvantaged.push({ ...c, reason: 'Slow pace gives closers no chance' }))
  } else {
    closers.forEach(c => beneficiaries.push({ ...c, reason: 'Balanced pace suits closers' }))
    leaders.forEach(l => disadvantaged.push({ ...l, reason: 'Contested pace may blunt speed' }))
  }

  return {
    shape,
    tempo,
    leaders: leaders.length,
    pressers: pressers.length,
    midfield: midfield.length,
    closers: closers.length,
    pressureLabel,
    collapseProb,
    runners: scored,
    beneficiaries: beneficiaries.slice(0, 3),
    disadvantaged: disadvantaged.slice(0, 3),
  }
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
    const style = runner.runningStyle || classifyRunningStyle(runner)
    if (style === 'Front Runner') pace.frontRunners++
    else if (style === 'Prominent') pace.prominent++
    else if (style === 'Hold Up') pace.holdUp++
    else pace.midfield++
  })

  const totalRunners = runners.length

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
