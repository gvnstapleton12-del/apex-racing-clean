export function generateConfidence(runner) {
  let confidence = 50

  const reasons = []

  const odds = parseFloat(runner.odds || 0)

  if (runner.form?.includes('1')) {
    confidence += 15
    reasons.push('Winning form')
  }

  if (runner.form?.includes('2')) {
    confidence += 10
    reasons.push('Consistent recent runs')
  }

  if (odds && odds < 5) {
    confidence += 15
    reasons.push('Strong market support')
  }

  if (
    runner.replayTriggers?.includes(
      'Strong Finish'
    )
  ) {
    confidence += 12
    reasons.push('Strong replay profile')
  }

  if (
    runner.replayTriggers?.includes(
      'Hidden Value Runner'
    )
  ) {
    confidence += 10
    reasons.push('Hidden market value')
  }

  if (
    runner.market?.steamCount > 2
  ) {
    confidence += 15
    reasons.push('Heavy steam detected')
  }

  if (
    runner.horseProfile?.averageScore >
    75
  ) {
    confidence += 10
    reasons.push('Elite historical profile')
  }

  if (
    runner.paceProfile?.projectedTempo ===
    'FAST'
  ) {
    confidence += 5
    reasons.push('Strong pace setup')
  }

  confidence = Math.max(
    1,
    Math.min(confidence, 99)
  )

  let risk = 'MEDIUM'

  if (confidence >= 85) {
    risk = 'LOW'
  }

  if (confidence <= 60) {
    risk = 'HIGH'
  }

  return {
    confidence,
    risk,
    reasons,
  }
}