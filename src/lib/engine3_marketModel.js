// APEX v4 — Engine 3: Market Model
// What does the market believe?
// Answers: "Where is the crowd smart/wrong?"

function computeMarketConfidence(odds, fieldSize) {
  if (!odds || odds <= 1) return 0

  const implied = 1 / odds
  const overround = 1 + (fieldSize * 0.05)
  const trueProb = implied / overround

  if (trueProb >= 0.35) return 90
  if (trueProb >= 0.25) return 80
  if (trueProb >= 0.15) return 70
  if (trueProb >= 0.10) return 60
  if (trueProb >= 0.06) return 50

  return 40
}

function detectSuspiciousMove(currentOdds, openingOdds, timeSinceOpen) {
  if (!currentOdds || !openingOdds || currentOdds <= 1 || openingOdds <= 1) {
    return { label: 'No Data', severity: 0, direction: 'stable' }
  }

  const move = ((openingOdds - currentOdds) / openingOdds) * 100

  if (Math.abs(move) < 5) return { label: 'Stable', severity: 0, direction: 'stable', move }
  if (move > 20) return { label: 'Heavy Steam', severity: 3, direction: 'shortening', move }
  if (move > 10) return { label: 'Strong Steam', severity: 2, direction: 'shortening', move }
  if (move > 5) return { label: 'Steam', severity: 1, direction: 'shortening', move }
  if (move < -20) return { label: 'Heavy Drift', severity: 3, direction: 'drifting', move }
  if (move < -10) return { label: 'Strong Drift', severity: 2, direction: 'drifting', move }
  if (move < -5) return { label: 'Drift', severity: 1, direction: 'drifting', move }

  return { label: 'Minor Move', severity: 0, direction: move > 0 ? 'shortening' : 'drifting', move }
}

function computeMarketEfficiency(odds, modelProb, fieldSize) {
  if (!odds || odds <= 1 || !modelProb) return { label: 'Unknown', efficiency: 50 }

  const implied = (1 / odds) * 100
  const diff = Math.abs(implied - modelProb)

  if (diff < 3) return { label: 'Efficient', efficiency: 90 }
  if (diff < 7) return { label: 'Reasonable', efficiency: 75 }
  if (diff < 15) return { label: 'Inefficient', efficiency: 50 }
  if (diff < 25) return { label: 'Very Inefficient', efficiency: 30 }

  return { label: 'Broken', efficiency: 10 }
}

function computeMarketStrength(runner, race) {
  const odds = Number(runner.odds || runner.price || 0)
  const fieldSize = race.field_size || race.fieldSize || 8
  const openingOdds = runner.openingOdds || runner.opening_odds || odds

  const confidence = computeMarketConfidence(odds, fieldSize)
  const suspicious = detectSuspiciousMove(odds, openingOdds, 0)
  const efficiency = computeMarketEfficiency(odds, runner.modelProb || 20, fieldSize)

  let strength = 50

  if (confidence >= 80) strength += 15
  else if (confidence >= 60) strength += 8

  if (suspicious.severity >= 2 && suspicious.direction === 'shortening') strength += 10
  else if (suspicious.severity >= 2 && suspicious.direction === 'drifting') strength -= 15

  if (efficiency.efficiency >= 75) strength += 5
  else if (efficiency.efficiency < 30) strength -= 10

  const or = runner.or || runner.ofr || 0
  if (or > 120 && odds > 5) strength += 5

  return {
    confidence,
    suspicious,
    efficiency,
    strength: Math.max(0, Math.min(100, Math.round(strength * 10) / 10)),
    impliedProb: odds > 1 ? Math.round((1 / odds) * 1000) / 10 : 0,
    label: strength >= 75 ? 'Strong' : strength >= 60 ? 'Moderate' : strength >= 40 ? 'Weak' : 'Poor',
  }
}

export function analyzeMarket(runners, race) {
  const results = runners.map((runner) => {
    const marketStrength = computeMarketStrength(runner, race)
    return {
      horse: runner.horse,
      horse_id: runner.horse_id || runner.horse,
      odds: runner.odds || runner.price || 0,
      marketStrength,
    }
  })

  const totalImplied = results.reduce((s, r) => s + (r.marketStrength.impliedProb || 0), 0)
  const overround = totalImplied > 0 ? Math.round((totalImplied - 100) * 10) / 10 : 0

  const strongMarket = results.filter((r) => r.marketStrength.label === 'Strong').length
  const suspiciousMoves = results.filter((r) => r.marketStrength.suspicious.severity >= 2).length

  return {
    runners: results,
    summary: {
      overround,
      strongMarket,
      suspiciousMoves,
      avgConfidence: Math.round(results.reduce((s, r) => s + r.marketStrength.confidence, 0) / results.length * 10) / 10,
      marketType: strongMarket >= 2 ? 'Focused' : strongMarket === 1 ? 'Single Favourite' : 'Open',
    },
  }
}
