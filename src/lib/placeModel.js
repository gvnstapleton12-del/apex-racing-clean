import { analyzeForm } from './formEngine.js'

function computeConsistency(runner) {
  const formAnalysis = analyzeForm(runner)
  if (formAnalysis.summary.finishedRuns < 2) return 50

  const positions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)
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

  const formAnalysis = analyzeForm(runner)
  const runs = formAnalysis.summary.finishedRuns
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

  const formAnalysis = analyzeForm(runner)
  const positions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)

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

  const formAnalysis = analyzeForm(runner)
  const positions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)

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

  const formAnalysis = analyzeForm(runner)
  const wins = formAnalysis.runs.filter(r => r.position === 1).length
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

function fieldSizeWinFactor(fieldSize) {
  if (fieldSize <= 4) return 1.4
  if (fieldSize <= 7) return 1.15
  if (fieldSize <= 12) return 1.0
  return 0.85
}

function archetypeWinFactor(race) {
  const name = (race.race_name || race.pattern || '').toLowerCase()
  const type = (race.type || race.race_type || '').toLowerCase()

  if (name.includes('handicap') || type.includes('handicap')) return 0.9
  if (name.includes('maiden') || type.includes('maiden')) return 0.75
  if (name.includes('novice') || type.includes('novice')) return 0.8
  if (name.includes('listed') || type.includes('listed')) return 1.1
  if (name.includes('group') || type.includes('group')) return 1.15
  if (type.includes('chase')) return 0.85
  if (type.includes('hurdle')) return 0.95
  return 1.0
}

export function bayesianWinProbabilities(runners, race) {
  const fieldSize = runners.length
  const fsFactor = fieldSizeWinFactor(fieldSize)
  const archFactor = race ? archetypeWinFactor(race) : 1.0

  const modelScores = runners.map((r) => {
    const score = r.finalScore || r.confidenceScore || 50
    const elimination = r.elimination
    if (elimination?.eliminated) return score * 0.3
    return score
  })

  const totalScore = modelScores.reduce((a, b) => a + b, 0)
  const modelPriors = modelScores.map((s) => (totalScore > 0 ? s / totalScore : 1 / runners.length))

  const componentProbs = runners.map((r) => {
    const finalProb = r.finalProbability || 50
    return finalProb / 100
  })
  const totalComponent = componentProbs.reduce((a, b) => a + b, 0)
  const normalizedComponents = componentProbs.map((p) => (totalComponent > 0 ? p / totalComponent : 1 / runners.length))

  const marketOdds = runners.map((r) => Number(r.odds || r.price || 0))
  const marketProbs = marketOdds.map((o) => (o > 1 ? 1 / o : 0))
  const totalMarket = marketProbs.reduce((a, b) => a + b, 0)
  const normalizedMarket = marketProbs.map((p) => (totalMarket > 0 ? p / totalMarket : 1 / runners.length))

  const blendedPriors = modelPriors.map((mp, i) => {
    const componentBlend = normalizedComponents[i]
    const marketBlend = normalizedMarket[i]
    return mp * 0.40 + componentBlend * 0.25 + marketBlend * 0.35
  })

  const totalBlended = blendedPriors.reduce((a, b) => a + b, 0)
  let priors = blendedPriors.map((p) => p / totalBlended)

  // Chaos widening: flatten probability distribution for high-volatility races
  // This gives outsiders more realistic chances
  const avgChaosWidening = runners.reduce((s, r) => s + (r.chaosWidening || 1.0), 0) / runners.length
  if (avgChaosWidening > 1.0) {
    const flattenPower = 1.0 / avgChaosWidening
    priors = priors.map((p) => Math.pow(p, flattenPower))
    const totalFlattened = priors.reduce((a, b) => a + b, 0)
    priors = priors.map((p) => p / totalFlattened)
  }

  const posteriors = runners.map((r, i) => {
    const prior = priors[i]
    const traits = placeTraits(r)

    const consistencyLR = Math.exp((traits.consistency - 50) * 0.025)
    const reliabilityLR = Math.exp((traits.reliability - 50) * 0.02)
    const honestyLR = Math.exp((traits.honesty - 50) * 0.015)
    const kickLR = Math.exp((traits.finishingKick - 50) * 0.05)
    const explosiveLR = Math.exp((traits.explosiveAbility - 50) * 0.05)
    const marketLR = Math.exp((traits.marketConfidence - 50) * 0.03)

    const hiddenPosWeight = r.elimination?.hiddenPositives?.totalWeight || 0
    const hiddenLR = Math.exp(hiddenPosWeight * 0.03)

    // Race shape suitability likelihood ratio
    const raceShapeSuit = r.raceShapeSuitability || 50
    const raceShapeLR = Math.exp((raceShapeSuit - 50) * 0.04)

    const consistencyWeight = 0.06
    const reliabilityWeight = 0.04
    const honestyWeight = 0.04
    const kickWeight = 0.15
    const explosiveWeight = 0.20
    const marketWeight = 0.12
    const hiddenWeight = 0.15
    const raceShapeWeight = 0.24

    const combinedLR =
      Math.pow(consistencyLR, consistencyWeight) *
      Math.pow(reliabilityLR, reliabilityWeight) *
      Math.pow(honestyLR, honestyWeight) *
      Math.pow(kickLR, kickWeight) *
      Math.pow(explosiveLR, explosiveWeight) *
      Math.pow(marketLR, marketWeight) *
      Math.pow(hiddenLR, hiddenWeight) *
      Math.pow(raceShapeLR, raceShapeWeight)

    return prior * combinedLR * fsFactor * archFactor
  })

  const total = posteriors.reduce((a, b) => a + b, 0)
  return posteriors.map((p) => (total > 0 ? (p / total) * 100 : 0))
}
