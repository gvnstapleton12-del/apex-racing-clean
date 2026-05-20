import { getDrawAdjustment } from './drawBias.js'

export function generateConfidence(runner, race = {}, options = {}) {
  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
  const rpr = Number(runner.rpr || 0)
  const draw = Number(runner.draw || 0)
  const age = Number(runner.age || 0)
  const odds = Number(runner.odds || runner.price || 0)
  const lastRun = Number(runner.last_run || 0)
  const trainerRtf = Number(runner.trainer_rtf || 0)
  const recentNR = Number(options.recentNR || 0)
  const jockey = String(runner.jockey || '').toLowerCase()
  const trainer = String(runner.trainer || '').toLowerCase()
  const course = String(race.course || runner.course || '').toLowerCase()
  const fieldSize = (race.runners && race.runners.length) || Number(runner.number_of_runners || 0)
  const formString = String(runner.form || '')
  const weight = Number(runner.lbs || runner.weight_lbs || runner.weight || 0)

  const formPositions = formString
    .replace(/[^0-9/-]/g, '')
    .split(/[\/-]/)
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0)

  const runners = race.runners || []
  const ors = runners
    .map((r) => Number(r.ofr || r.official_rating || r.or || 0))
    .filter(Boolean)
  const avgOr = ors.length ? ors.reduce((a, b) => a + b, 0) / ors.length : 0
  const maxOr = ors.length ? Math.max(...ors) : 0
  const minOr = ors.length ? Math.min(...ors) : 0

  const weights = runners
    .map((r) => Number(r.lbs || r.weight_lbs || r.weight || 0))
    .filter((w) => w > 0)
  const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0
  const weightVsAvg = weight > 0 && avgWeight > 0 ? weight - avgWeight : 0

  const bestRating = Math.max(or, rpr)

  let completeness = 0
  if (or > 0) completeness += 15
  if (rpr > 0) completeness += 10
  if (odds > 0) completeness += 15
  if (formPositions.length >= 2) completeness += 20
  if (trainerRtf > 0) completeness += 10
  if (draw > 0) completeness += 10
  if (lastRun > 0) completeness += 10
  if (weight > 0) completeness += 5
  if (jockey) completeness += 5
  if (trainer) completeness += 5

  let classLockScore = 0

  if (bestRating > 0 && avgOr > 0) {
    const orRange = Math.max(maxOr - minOr, 1)
    classLockScore = ((bestRating - minOr) / orRange) * 30 + 5

    const orGap = bestRating - avgOr
    if (orGap <= -12) {
      classLockScore = 1
    } else if (orGap <= -8) {
      classLockScore *= 0.15
    } else if (orGap <= -5) {
      classLockScore *= 0.35
    } else if (orGap >= 8) {
      classLockScore *= 1.25
    } else if (orGap >= 5) {
      classLockScore *= 1.1
    }
  } else if (bestRating > 0) {
    classLockScore = Math.min(30, bestRating / 4)
  } else {
    classLockScore = 10
  }

  classLockScore = Math.max(0, Math.min(40, Math.round(classLockScore)))

  if (weightVsAvg <= -5) classLockScore = Math.min(40, classLockScore + 3)
  else if (weightVsAvg <= -3) classLockScore = Math.min(40, classLockScore + 1)
  else if (weightVsAvg >= 5) classLockScore = Math.max(1, classLockScore - 2)

  let strideScore = 0

  if (formPositions.length >= 2) {
    const recent = formPositions.slice(0, 3)
    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length

    if (avgPos <= 2) strideScore += 10
    else if (avgPos <= 3) strideScore += 8
    else if (avgPos <= 4) strideScore += 6
    else if (avgPos <= 5) strideScore += 4
    else if (avgPos <= 7) strideScore += 2
    else strideScore += 1

    if (formPositions.length >= 3) {
      const oldest = formPositions[0]
      const newest = formPositions[formPositions.length - 1]
      if (newest < oldest) strideScore += 5
      else if (newest === oldest) strideScore += 2
      else strideScore -= 2
    }

    if (recent.includes(1)) strideScore += 4
    if (recent.filter((p) => p <= 3).length >= 2) strideScore += 3
  } else if (formPositions.length === 1) {
    strideScore += formPositions[0] <= 3 ? 6 : 2
  } else {
    strideScore += 2
  }

  if (lastRun > 0) {
    if (lastRun <= 7) strideScore += 4
    else if (lastRun <= 14) strideScore += 3
    else if (lastRun <= 30) strideScore += 2
    else if (lastRun <= 60) strideScore += 1
    else if (lastRun <= 90) strideScore += 0
    else if (lastRun <= 180) strideScore -= 2
    else if (lastRun <= 365) strideScore -= 4
    else strideScore -= 6
  }

  if (weight > 0 && weight <= 154) strideScore += 1
  if (age >= 5 && age <= 8) strideScore += 2
  else if (age >= 9) strideScore -= 1
  else if (age <= 3) strideScore -= 2
  if (recentNR >= 2) strideScore -= 4
  else if (recentNR >= 1) strideScore -= 2

  strideScore = Math.max(0, Math.min(25, Math.round(strideScore)))

  let trainerScore = 0

  if (trainerRtf > 0) {
    trainerScore += (trainerRtf / 100) * 8
  }

  const topJockeys = [
    'de boinville', 'coleman', 'townend', 'blackmore',
    'skelton', 'cobden', 'bowen', 'brennan', 'doyle',
    'moore', 'johnson', 'noble',
  ]
  if (topJockeys.some((j) => jockey.includes(j))) {
    trainerScore += 4
  }

  const topTrainers = [
    'skelton', 'henderson', 'nicholls', 'pipe', 'elliott',
    'mullins', 'hobbs', 'williams', 'obrien',
  ]
  if (topTrainers.some((t) => trainer.includes(t))) {
    trainerScore += 3
  }

  trainerScore = Math.max(0, Math.min(15, Math.round(trainerScore)))

  let trafficScore = 5

  if (draw > 0 && fieldSize > 3) {
    const middle = (fieldSize + 1) / 2
    const drawDiff = Math.abs(draw - middle)
    const maxDiff = Math.max(fieldSize - middle, middle - 1)

    if (maxDiff > 0) {
      trafficScore = 5 + ((maxDiff - drawDiff) / maxDiff) * 5
    }

    if (draw >= fieldSize - 1 && fieldSize >= 12) trafficScore -= 2
    if (draw <= 1 && fieldSize >= 12) trafficScore -= 1
    if (draw >= fieldSize - 2 && fieldSize >= 14) trafficScore -= 1
  }

  const drawBiasAdj = getDrawAdjustment(course, draw, fieldSize)
  trafficScore += drawBiasAdj
  trafficScore = Math.max(0, Math.min(10, Math.round(trafficScore)))

  let clvScore = 3

  if (odds > 0) {
    if (odds <= 1.5) clvScore = 10
    else if (odds <= 2.0) clvScore = 9
    else if (odds <= 3.0) clvScore = 8
    else if (odds <= 4.0) clvScore = 7
    else if (odds <= 5.0) clvScore = 6
    else if (odds <= 7.0) clvScore = 5
    else if (odds <= 10.0) clvScore = 4
    else if (odds <= 15.0) clvScore = 3
    else if (odds <= 20.0) clvScore = 2
    else if (odds <= 33.0) clvScore = 1
  }

  let confidence =
    classLockScore + strideScore + trainerScore + trafficScore + clvScore

  if (options.multiplier) {
    const m = options.multiplier
    if (m.class) confidence += classLockScore * (m.class - 1)
    if (m.stride) confidence += strideScore * (m.stride - 1)
    if (m.trainer) confidence += trainerScore * (m.trainer - 1)
    if (m.traffic) confidence += trafficScore * (m.traffic - 1)
    if (m.clv) confidence += clvScore * (m.clv - 1)
  }

  confidence = Math.round(confidence * (0.75 + completeness / 300))

  const replayAdj = Number(options.replayAdjustment) || 0
  confidence += Math.max(-10, Math.min(10, replayAdj))

  let impliedProbability = 0
  let aiProbability = 0
  let valueEdge = 0

  if (odds > 1) {
    impliedProbability = 1 / odds
  }

  aiProbability = confidence / 100

  valueEdge = Number(((aiProbability - impliedProbability) * 100).toFixed(2))

  confidence = Math.round(Math.max(1, Math.min(99, confidence)))

  let grade = 'C'

  if (confidence >= 90) {
    grade = 'A+'
  } else if (confidence >= 80) {
    grade = 'A'
  } else if (confidence >= 70) {
    grade = 'B'
  } else if (confidence >= 60) {
    grade = 'C+'
  }

  return {
    confidence,
    grade,
    estimatedWinProbability: Number((aiProbability * 100).toFixed(1)),
    impliedProbability: Number((impliedProbability * 100).toFixed(1)),
    valueEdge,
    completeness,
    breakdown: {
      classLockScore,
      strideScore,
      trainerScore,
      trafficScore,
      clvScore,
      replayAdjustment: replayAdj,
      or: bestRating,
      rpr,
      odds,
      draw,
      course,
      drawBiasAdj,
      trainerRtf,
      lastRun,
      age,
      weight,
    },
  }
}
