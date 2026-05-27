export function selectionQuality(winProb, odds, confidence, volatility, uncertainty, marketAdj) {
  if (!odds || odds <= 1 || !winProb || winProb <= 0) {
    return {
      label: 'NO DATA',
      grade: 'F',
      score: 0,
      edge: 0,
      fairOdds: 0,
      marketOdds: odds,
      value: 0,
      recommendation: 'NO BET',
      reasons: [],
    }
  }

  const p = winProb / 100
  const q = 1 - p
  const b = odds - 1

  const fairOdds = Math.round((1 / p) * 100) / 100
  const edge = p * b - q
  const valuePct = Math.round(((fairOdds / odds - 1) * 100) * 10) / 10

  let score = 0
  const reasons = []

  // Probability edge (0-30 points)
  if (winProb >= 30) { score += 30; reasons.push('Elite probability') }
  else if (winProb >= 20) { score += 24; reasons.push('Strong probability') }
  else if (winProb >= 12) { score += 16; reasons.push('Medium probability') }
  else if (winProb >= 6) { score += 8; reasons.push('Low probability') }
  else { score += 2 }

  // Confidence adjustment (0-20 points)
  if (confidence === 'Elite') { score += 20; reasons.push('High confidence') }
  else if (confidence === 'Strong') { score += 16 }
  else if (confidence === 'Playable') { score += 10 }
  else if (confidence === 'Speculative') { score += 5 }
  else { score += 2 }

  // Volatility penalty (0-20 points)
  if (volatility <= 0.3) { score += 20; reasons.push('Low volatility') }
  else if (volatility <= 0.45) { score += 14 }
  else if (volatility <= 0.6) { score += 8 }
  else { score += 2; reasons.push('High volatility') }

  // Market discrepancy (0-15 points)
  const marketDiscrepancy = Math.abs(marketAdj || 0)
  if (marketAdj > 4) { score += 15; reasons.push('Market undervaluing') }
  else if (marketAdj > 2) { score += 10 }
  else if (marketAdj > -2) { score += 6 }
  else if (marketAdj > -5) { score += 3 }
  else { score += 0; reasons.push('Market overvaluing') }

  // Uncertainty penalty (0-8 points)
  if (uncertainty <= 8) { score += 8; reasons.push('Reliable data') }
  else if (uncertainty <= 12) { score += 5 }
  else if (uncertainty <= 18) { score += 3 }
  else if (uncertainty <= 25) { score += 1 }
  else { score += 0; reasons.push('Chaos machine') }

  // Grade assignment
  let grade = 'F'
  if (score >= 85) grade = 'A+'
  else if (score >= 75) grade = 'A'
  else if (score >= 65) grade = 'B+'
  else if (score >= 55) grade = 'B'
  else if (score >= 45) grade = 'C+'
  else if (score >= 35) grade = 'C'
  else if (score >= 25) grade = 'D'

  // Recommendation
  let recommendation = 'NO BET'
  if (edge > 0.15 && winProb >= 20 && uncertainty <= 18) {
    recommendation = 'STRONG BET'
  } else if (edge > 0.08 && winProb >= 12 && uncertainty <= 25) {
    recommendation = 'BET'
  } else if (edge > 0.03 && winProb >= 8) {
    recommendation = 'CONSIDER'
  } else if (edge <= 0) {
    recommendation = 'AVOID'
  }

  return {
    label: recommendation,
    grade,
    score,
    edge: Math.round(edge * 1000) / 1000,
    fairOdds,
    marketOdds: odds,
    value: valuePct,
    recommendation,
    reasons,
  }
}
