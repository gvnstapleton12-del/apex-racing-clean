export function analyzeMarketMovement({
  horse,
  currentOdds,
  previousOdds,
  aiConfidence = 0,
}) {
  const current = parseFloat(currentOdds)
  const previous = parseFloat(previousOdds)

  if (
    Number.isNaN(current) ||
    Number.isNaN(previous)
  ) {
    return {
      movement: 'UNKNOWN',
      delta: 0,
      strength: 'NONE',
      alert: null,
    }
  }

  const delta = Number(
    (previous - current).toFixed(2)
  )

  let movement = 'STABLE'
  let strength = 'LOW'
  let alert = null

  if (delta >= 2) {
    movement = 'STRONG_STEAMER'
    strength = 'HIGH'
  } else if (delta >= 1) {
    movement = 'STEAMER'
    strength = 'MEDIUM'
  } else if (delta <= -2) {
    movement = 'STRONG_DRIFTER'
    strength = 'HIGH'
  } else if (delta <= -1) {
    movement = 'DRIFTER'
    strength = 'MEDIUM'
  }

  if (
    movement.includes('STEAMER') &&
    aiConfidence >= 85
  ) {
    alert = {
      type: 'SMART_MONEY',
      horse,
      message: `${horse} backed in market with ${aiConfidence}% AI confidence`,
      severity: 'HIGH',
    }
  }

  return {
    movement,
    delta,
    strength,
    alert,
  }
}
