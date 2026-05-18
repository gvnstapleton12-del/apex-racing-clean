export function generateSignals(runner) {
  const signals = []

  const confidence =
    runner.aiProfile?.confidence || 0

  const odds = parseFloat(runner.odds || 0)

  if (confidence >= 90) {
    signals.push({
      type: 'ELITE BET',
      strength: 'HIGH',
      reason:
        'Extremely high AI confidence',
    })
  }

  if (
    confidence >= 80 &&
    odds > 8
  ) {
    signals.push({
      type: 'VALUE OVERLAY',
      strength: 'HIGH',
      reason:
        'High confidence at large odds',
    })
  }

  if (
    runner.market?.steamCount > 2
  ) {
    signals.push({
      type: 'MARKET STEAM',
      strength: 'MEDIUM',
      reason:
        'Heavy market support detected',
    })
  }

  if (
    runner.replayTriggers?.includes(
      'Strong Finish'
    )
  ) {
    signals.push({
      type: 'REPLAY HORSE',
      strength: 'HIGH',
      reason:
        'Positive replay intelligence',
    })
  }

  if (
    runner.replayTriggers?.includes(
      'Hidden Value Runner'
    )
  ) {
    signals.push({
      type: 'HIDDEN RUNNER',
      strength: 'HIGH',
      reason:
        'Hidden value profile detected',
    })
  }

  if (
    confidence < 60 &&
    odds < 4
  ) {
    signals.push({
      type: 'DANGEROUS FAVORITE',
      strength: 'HIGH',
      reason:
        'Low confidence despite market support',
    })
  }

  return signals
}