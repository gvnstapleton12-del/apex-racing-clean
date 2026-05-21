export function kellyStake(winProb, decimalOdds, options = {}) {
  if (!decimalOdds || decimalOdds <= 1 || !winProb || winProb <= 0) return null

  const p = winProb / 100
  const q = 1 - p
  const b = decimalOdds - 1

  const edge = p * b - q
  if (edge <= 0) return { kelly: 0, edge: 0, label: 'NO VALUE', stake: 0 }

  const fullKelly = edge / b
  const fraction = options.fraction || 0.25
  const stake = fullKelly * fraction

  const maxStake = options.maxStake || 0.05
  const cappedStake = Math.min(stake, maxStake)

  let label = 'MINIMAL'
  if (cappedStake >= 0.03) label = 'STRONG'
  else if (cappedStake >= 0.02) label = 'MODERATE'
  else if (cappedStake >= 0.01) label = 'LIGHT'

  return {
    kelly: Math.round(fullKelly * 1000) / 1000,
    fractionKelly: Math.round(cappedStake * 1000) / 1000,
    edge: Math.round(edge * 1000) / 1000,
    expectedValue: Math.round((p * b - q) * 100) / 100,
    label,
    stake: cappedStake,
  }
}

export function syndicateStake(winProb, decimalOdds, confidence, volatility, options = {}) {
  const kelly = kellyStake(winProb, decimalOdds, { fraction: 0.25, maxStake: options.maxStake || 0.05 })
  if (!kelly || kelly.kelly <= 0) return null

  const volAdj = volatility > 0.6 ? 0.5 : volatility > 0.45 ? 0.75 : 1.0
  const confAdj = confidence === 'Elite' ? 1.2 : confidence === 'Strong' ? 1.0 : confidence === 'Playable' ? 0.8 : 0.6

  const adjustedStake = kelly.stake * volAdj * confAdj
  const cappedStake = Math.min(adjustedStake, options.maxStake || 0.05)

  let label = 'MINIMAL'
  if (cappedStake >= 0.03) label = 'STRONG'
  else if (cappedStake >= 0.02) label = 'MODERATE'
  else if (cappedStake >= 0.01) label = 'LIGHT'

  return {
    ...kelly,
    stake: cappedStake,
    volAdj,
    confAdj,
    label,
  }
}
