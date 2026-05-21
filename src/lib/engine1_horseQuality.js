// APEX v4 — Engine 1: Horse Quality Model
// Pure racing merit. Ignores odds entirely.
// Answers: "Who should win most often?"

function computePowerRating(runner) {
  const or = runner.or || runner.ofr || 0
  const rpr = runner.rpr || 0
  const lastRun = runner.last_run || 999

  let base = 50

  if (or > 0) {
    base = (or / 150) * 60
  } else if (rpr > 0) {
    base = (rpr / 150) * 50
  }

  if (lastRun <= 21) base += 5
  else if (lastRun <= 42) base += 2
  else if (lastRun > 90) base -= 8
  else if (lastRun > 150) base -= 15

  const form = runner.form || ''
  const positions = []
  form.split(/[\s/-]+/).forEach((p) => {
    const num = parseInt(p, 10)
    if (!isNaN(num) && num >= 1 && num <= 20) positions.push(num)
  })

  if (positions.length > 0) {
    const recent = positions.slice(0, 3)
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
    if (recentAvg <= 2) base += 10
    else if (recentAvg <= 3) base += 7
    else if (recentAvg <= 5) base += 3
    else if (recentAvg > 10) base -= 5

    const wins = positions.filter((p) => p === 1).length
    const winRate = wins / positions.length
    base += winRate * 10
  }

  return Math.max(0, Math.min(100, Math.round(base * 10) / 10))
}

function computeSuitability(runner, race) {
  let score = 50

  const raceDist = parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0
  const going = (race.going || '').toLowerCase()

  if (raceDist > 0) {
    const form = runner.form || ''
    const positions = []
    form.split(/[\s/-]+/).forEach((p) => {
      const num = parseInt(p, 10)
      if (!isNaN(num) && num >= 1 && num <= 20) positions.push(num)
    })

    const runs = positions.length
    if (runs >= 3) {
      const recent = positions.slice(0, 3)
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
      if (recentAvg <= 3) score += 10
      else if (recentAvg <= 5) score += 5
    }

    if (runs <= 2 && raceDist > 10) score -= 8
  }

  if (going.includes('heavy') || going.includes('soft')) {
    const or = runner.or || runner.ofr || 0
    if (or > 120) score += 5
  }

  if (going.includes('firm') || going.includes('fast')) {
    const age = runner.age || 5
    if (age <= 4) score += 5
  }

  return Math.max(0, Math.min(100, Math.round(score * 10) / 10))
}

function computeConsistency(runner) {
  const form = runner.form || ''
  const positions = []
  form.split(/[\s/-]+/).forEach((p) => {
    const num = parseInt(p, 10)
    if (!isNaN(num) && num >= 1 && num <= 20) positions.push(num)
  })

  if (positions.length < 2) return 50

  const avg = positions.reduce((a, b) => a + b, 0) / positions.length
  const spread = Math.max(...positions) - Math.min(...positions)
  const recent = positions.slice(0, 3)
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length

  let score = 50

  if (spread <= 2) score += 25
  else if (spread <= 4) score += 15
  else if (spread <= 6) score += 5
  else if (spread <= 10) score -= 5
  else score -= 15

  if (recentAvg <= 3) score += 15
  else if (recentAvg <= 5) score += 8
  else if (recentAvg > 8) score -= 10

  const inTheMoney = positions.filter((p) => p <= 3).length
  const placeRate = inTheMoney / positions.length
  score += placeRate * 20

  return Math.max(0, Math.min(100, Math.round(score * 10) / 10))
}

function computePaceCompatibility(runner, paceMap) {
  const style = runner.runningStyle || 'Midfield'
  const frontRunners = paceMap?.frontRunners || 0
  const tempo = paceMap?.projectedTempo || 'EVEN'
  const collapseRisk = paceMap?.collapseRisk || 'LOW'

  let score = 50

  if (style === 'Front Runner') {
    if (frontRunners <= 1) score += 20
    else if (frontRunners === 2) score += 5
    else if (frontRunners >= 3) score -= 15
    if (tempo === 'SLOW') score += 10
    else if (tempo === 'FAST') score -= 10
  }

  if (style === 'Prominent') {
    if (frontRunners <= 2) score += 10
    else if (frontRunners >= 4) score -= 10
  }

  if (style === 'Hold Up') {
    if (frontRunners >= 3 && tempo === 'FAST') score += 20
    else if (frontRunners >= 2) score += 10
    else if (frontRunners <= 1 && tempo === 'SLOW') score -= 10
    if (collapseRisk === 'HIGH') score += 15
  }

  if (style === 'Midfield') {
    if (frontRunners >= 2 && frontRunners <= 3) score += 10
    if (collapseRisk === 'HIGH') score += 5
  }

  return Math.max(0, Math.min(100, Math.round(score * 10) / 10))
}

function computeVolatility(runner, race) {
  let score = 50

  const form = runner.form || ''
  const positions = []
  form.split(/[\s/-]+/).forEach((p) => {
    const num = parseInt(p, 10)
    if (!isNaN(num) && num >= 1 && num <= 20) positions.push(num)
  })

  if (positions.length === 0) score += 25
  else if (positions.length <= 2) score += 15
  else if (positions.length >= 6) score -= 5

  const lastRun = runner.last_run || 999
  if (lastRun > 180) score += 15
  else if (lastRun > 90) score += 8
  else if (lastRun <= 7) score -= 5

  const or = runner.or || runner.ofr || 0
  if (or === 0) score += 10

  const fieldSize = race.field_size || race.fieldSize || 8
  if (fieldSize >= 16) score += 10
  else if (fieldSize >= 12) score += 5

  const going = (race.going || '').toLowerCase()
  if (going.includes('heavy')) score += 8
  else if (going.includes('soft')) score += 4

  const raceName = (race.race_name || '').toLowerCase()
  if (/maiden|novice/i.test(raceName)) score += 8

  return Math.max(0, Math.min(100, Math.round(score * 10) / 10))
}

export function computeHorseQuality(runner, race, paceMap) {
  const power = computePowerRating(runner)
  const suitability = computeSuitability(runner, race)
  const consistency = computeConsistency(runner)
  const paceCompat = computePaceCompatibility(runner, paceMap)
  const volatility = computeVolatility(runner, race)

  const weights = {
    power: 0.35,
    suitability: 0.20,
    consistency: 0.20,
    paceCompat: 0.15,
    volatility: 0.10,
  }

  const volPenalty = (volatility - 50) * 0.15
  const qualityScore =
    power * weights.power +
    suitability * weights.suitability +
    consistency * weights.consistency +
    paceCompat * weights.paceCompat +
    (100 - volatility) * weights.volatility -
    volPenalty

  const finalScore = Math.max(1, Math.min(99, Math.round(qualityScore * 10) / 10))

  return {
    power,
    suitability,
    consistency,
    paceCompat,
    volatility,
    finalScore,
    label: finalScore >= 80 ? 'Elite' : finalScore >= 65 ? 'Strong' : finalScore >= 50 ? 'Competitive' : finalScore >= 35 ? 'Marginal' : 'Weak',
  }
}
