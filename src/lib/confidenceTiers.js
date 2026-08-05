// APEX v4 — Confidence Tiers
// Prevents overbetting mediocre edges

export function computeConfidenceTier(runner, race, paceMap, simulation, valueEngine, bankrollEngine, betFilter) {
  const modelProb = runner.modelProb || runner.winProb || 0
  const odds = Number(runner.odds || runner.price || 0)
  const edge = valueEngine?.edge || 0
  const horseQuality = runner.horseQuality?.finalScore || 50
  const simWinRate = simulation?.winRate || 0
  const uncertainty = runner.uncertainty?.uncertainty || 0
  const betLabel = bankrollEngine?.label || 'NO BET'
  const filterVerdict = betFilter?.verdict || 'BETTABLE'
  const flagCount = runner.scenarioFlags?.flagCount || 0
  const highFlags = runner.scenarioFlags?.hasHighSeverity || false

  let score = 50

  // Model probability (0-20 points)
  if (modelProb >= 30) score += 20
  else if (modelProb >= 20) score += 16
  else if (modelProb >= 12) score += 10
  else if (modelProb >= 6) score += 5

  // Edge strength (0-20 points)
  if (edge >= 15) score += 20
  else if (edge >= 10) score += 16
  else if (edge >= 5) score += 10
  else if (edge >= 2) score += 5

  // Horse quality (0-15 points)
  if (horseQuality >= 80) score += 15
  else if (horseQuality >= 65) score += 12
  else if (horseQuality >= 50) score += 8
  else if (horseQuality >= 35) score += 4

  // Simulation confidence (0-10 points)
  if (simWinRate >= 25) score += 10
  else if (simWinRate >= 15) score += 7
  else if (simWinRate >= 8) score += 4

  // Uncertainty penalty (0-15 points)
  if (uncertainty <= 8) score += 15
  else if (uncertainty <= 12) score += 10
  else if (uncertainty <= 18) score += 5
  else if (uncertainty >= 25) score -= 10

  // Bet filter penalty
  if (filterVerdict === 'AUTO SKIP') score -= 20
  else if (filterVerdict === 'HIGH RISK') score -= 10
  else if (filterVerdict === 'CAUTION') score -= 5

  // Scenario flags penalty
  if (highFlags) score -= 15
  else if (flagCount >= 2) score -= 8

  // Bankroll signal
  if (betLabel === 'STRONG BET') score += 10
  else if (betLabel === 'BET') score += 5
  else if (betLabel === 'AVOID' || betLabel === 'NO BET') score -= 10

  // Determine tier
  let tier = 'D'
  let label = 'Watch Only'
  let maxStake = 0.01
  let description = 'Low confidence — observe only'

  if (score >= 85) {
    tier = 'S'
    label = 'Elite Setup'
    maxStake = 0.05
    description = 'Rare elite setup — all signals aligned'
  } else if (score >= 70) {
    tier = 'A'
    label = 'Strong Edge'
    maxStake = 0.04
    description = 'Strong edge with good confidence'
  } else if (score >= 55) {
    tier = 'B'
    label = 'Playable'
    maxStake = 0.03
    description = 'Playable edge — moderate confidence'
  } else if (score >= 40) {
    tier = 'C'
    label = 'Thin Edge'
    maxStake = 0.02
    description = 'Thin edge — bet small if at all'
  }

  return {
    tier,
    label,
    score: Math.max(0, Math.min(100, score)),
    maxStake,
    description,
    factors: {
      modelProb: Math.round(modelProb * 10) / 10,
      edge: Math.round(edge * 10) / 10,
      horseQuality: Math.round(horseQuality * 10) / 10,
      simWinRate: Math.round(simWinRate * 10) / 10,
      uncertainty,
      filterVerdict,
      flagCount,
      betLabel,
    },
  }
}
