function computeConsistency(runner) {
  const form = runner.form || ''
  if (!form || form === '-') return 0

  const positions = []
  const parts = form.split(/[\s/-]+/)

  parts.forEach((p) => {
    const num = parseInt(p, 10)
    if (!isNaN(num) && num >= 1 && num <= 20) {
      positions.push(num)
    }
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

  return Math.max(0, Math.min(100, score))
}

function computeReliability(runner) {
  let score = 50

  const runs = runner.form ? runner.form.split(/[\s/-]+/).filter((p) => /^\d+$/.test(p)).length : 0
  if (runs >= 6) score += 15
  else if (runs >= 4) score += 10
  else if (runs >= 2) score += 5
  else score -= 10

  const lastRun = runner.last_run || 999
  if (lastRun <= 21) score += 10
  else if (lastRun <= 42) score += 5
  else if (lastRun > 90) score -= 10

  const or = runner.or || runner.ofr || 0
  if (or > 0) score += 10

  const rpr = runner.rpr || 0
  if (rpr > 0) score += 5

  if (runner.trainer_rtf && runner.trainer_rtf > 15) score += 10
  else if (runner.trainer_rtf && runner.trainer_rtf > 10) score += 5

  return Math.max(0, Math.min(100, score))
}

function computeHonesty(runner) {
  let score = 50

  const form = runner.form || ''
  const positions = []
  form.split(/[\s/-]+/).forEach((p) => {
    const num = parseInt(p, 10)
    if (!isNaN(num) && num >= 1 && num <= 20) positions.push(num)
  })

  if (positions.length < 2) return 50

  const beatenDistances = runner.lbs || 0
  const avgBeaten = positions.length > 1 ? beatenDistances / (positions.length - 1) : 0

  if (avgBeaten <= 5) score += 15
  else if (avgBeaten <= 10) score += 8
  else if (avgBeaten > 30) score -= 10

  const heavyDefeats = positions.filter((p) => p >= 8).length
  if (heavyDefeats === 0) score += 10
  else if (heavyDefeats <= 1) score += 5
  else score -= 10

  const consistency = computeConsistency(runner)
  if (consistency >= 70) score += 10
  else if (consistency >= 50) score += 5

  return Math.max(0, Math.min(100, score))
}

function computeFinishingKick(runner) {
  let score = 50

  const form = runner.form || ''
  const positions = []
  form.split(/[\s/-]+/).forEach((p) => {
    const num = parseInt(p, 10)
    if (!isNaN(num) && num >= 1 && num <= 20) positions.push(num)
  })

  if (positions.length < 2) return 50

  const recent = positions.slice(0, 3)
  const older = positions.slice(3)

  const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 5
  const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 5

  if (recentAvg < olderAvg - 1) score += 20
  else if (recentAvg < olderAvg) score += 10
  else if (recentAvg > olderAvg + 2) score -= 15

  const wins = positions.filter((p) => p === 1).length
  const winRate = wins / positions.length
  score += winRate * 20

  const top3 = positions.filter((p) => p <= 3).length
  const top3Rate = top3 / positions.length
  score += top3Rate * 10

  return Math.max(0, Math.min(100, score))
}

function computeExplosiveAbility(runner) {
  let score = 50

  const or = runner.or || runner.ofr || 0
  const rpr = runner.rpr || 0

  if (or > 140) score += 20
  else if (or > 120) score += 15
  else if (or > 100) score += 10
  else if (or > 80) score += 5
  else if (or === 0) score -= 10

  if (rpr > 140) score += 15
  else if (rpr > 120) score += 10
  else if (rpr > 100) score += 5

  const form = runner.form || ''
  const wins = form.split(/[\s/-]+/).filter((p) => p === '1').length
  if (wins >= 2) score += 15
  else if (wins === 1) score += 8

  return Math.max(0, Math.min(100, score))
}

function computeMarketConfidence(runner) {
  const odds = Number(runner.odds || runner.price || 0)
  if (odds <= 0) return 50

  const impliedProb = 1 / odds

  if (impliedProb >= 0.4) return 90
  if (impliedProb >= 0.25) return 80
  if (impliedProb >= 0.15) return 70
  if (impliedProb >= 0.1) return 60
  if (impliedProb >= 0.06) return 50

  return 40
}

export function placeTraits(runner) {
  return {
    consistency: computeConsistency(runner),
    reliability: computeReliability(runner),
    honesty: computeHonesty(runner),
    finishingKick: computeFinishingKick(runner),
    explosiveAbility: computeExplosiveAbility(runner),
    marketConfidence: computeMarketConfidence(runner),
  }
}

export function bayesianPlaceProbabilities(runners) {
  const priors = runners.map((r) => {
    const odds = Number(r.odds || r.price || 0)
    if (odds > 1) {
      const implied = 1 / odds
      return Math.min(implied * 2.5, 0.6)
    }
    return 0.15
  })

  const totalPrior = priors.reduce((a, b) => a + b, 0)
  const normalizedPriors = priors.map((p) => p / totalPrior)

  const posteriors = runners.map((r, i) => {
    const prior = normalizedPriors[i]
    const traits = placeTraits(r)

    const consistencyLR = Math.exp((traits.consistency - 50) * 0.04)
    const reliabilityLR = Math.exp((traits.reliability - 50) * 0.03)
    const honestyLR = Math.exp((traits.honesty - 50) * 0.03)
    const kickLR = Math.exp((traits.finishingKick - 50) * 0.02)
    const explosiveLR = Math.exp((traits.explosiveAbility - 50) * 0.015)
    const marketLR = Math.exp((traits.marketConfidence - 50) * 0.025)

    const consistencyWeight = 0.30
    const reliabilityWeight = 0.20
    const honestyWeight = 0.15
    const kickWeight = 0.10
    const explosiveWeight = 0.05
    const marketWeight = 0.20

    const combinedLR =
      Math.pow(consistencyLR, consistencyWeight) *
      Math.pow(reliabilityLR, reliabilityWeight) *
      Math.pow(honestyLR, honestyWeight) *
      Math.pow(kickLR, kickWeight) *
      Math.pow(explosiveLR, explosiveWeight) *
      Math.pow(marketLR, marketWeight)

    return prior * combinedLR
  })

  const total = posteriors.reduce((a, b) => a + b, 0)
  return posteriors.map((p) => (total > 0 ? (p / total) * 100 : 0))
}

export function bayesianWinProbabilities(runners) {
  const priors = runners.map((r) => {
    const odds = Number(r.odds || r.price || 0)
    if (odds > 1) return 1 / odds
    return 1 / runners.length
  })

  const totalPrior = priors.reduce((a, b) => a + b, 0)
  const normalizedPriors = priors.map((p) => p / totalPrior)

  const posteriors = runners.map((r, i) => {
    const prior = normalizedPriors[i]
    const traits = placeTraits(r)

    const consistencyLR = Math.exp((traits.consistency - 50) * 0.02)
    const reliabilityLR = Math.exp((traits.reliability - 50) * 0.015)
    const honestyLR = Math.exp((traits.honesty - 50) * 0.01)
    const kickLR = Math.exp((traits.finishingKick - 50) * 0.04)
    const explosiveLR = Math.exp((traits.explosiveAbility - 50) * 0.04)
    const marketLR = Math.exp((traits.marketConfidence - 50) * 0.04)

    const consistencyWeight = 0.10
    const reliabilityWeight = 0.05
    const honestyWeight = 0.05
    const kickWeight = 0.25
    const explosiveWeight = 0.30
    const marketWeight = 0.25

    const combinedLR =
      Math.pow(consistencyLR, consistencyWeight) *
      Math.pow(reliabilityLR, reliabilityWeight) *
      Math.pow(honestyLR, honestyWeight) *
      Math.pow(kickLR, kickWeight) *
      Math.pow(explosiveLR, explosiveWeight) *
      Math.pow(marketLR, marketWeight)

    return prior * combinedLR
  })

  const total = posteriors.reduce((a, b) => a + b, 0)
  return posteriors.map((p) => (total > 0 ? (p / total) * 100 : 0))
}
