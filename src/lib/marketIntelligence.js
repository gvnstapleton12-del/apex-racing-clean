export function marketIntelligence(runner, powerScore) {
  const odds = Number(runner.odds || runner.price || 0)
  if (odds <= 0) return 0

  const modelProb = powerScore / 100
  const marketProb = 1 / odds

  const ratio = modelProb / marketProb

  let score = 0

  if (ratio >= 2.0) score = 6
  else if (ratio >= 1.5) score = 4
  else if (ratio >= 1.25) score = 2
  else if (ratio >= 1.1) score = 1
  else if (ratio <= 0.4) score = -6
  else if (ratio <= 0.55) score = -4
  else if (ratio <= 0.7) score = -2
  else if (ratio <= 0.85) score = -1

  if (odds <= 2.0 && powerScore < 50) score = Math.min(score, -5)
  if (odds >= 33 && powerScore >= 60) score = Math.max(score, 5)

  return Math.max(-10, Math.min(10, score))
}

export function marketAlignment(runner, powerScore) {
  const score = marketIntelligence(runner, powerScore)
  if (score >= 4) return 'VALUE'
  if (score >= 2) return 'SLIGHT_VALUE'
  if (score <= -4) return 'CAUTION'
  if (score <= -2) return 'SLIGHT_CAUTION'
  return 'NEUTRAL'
}
