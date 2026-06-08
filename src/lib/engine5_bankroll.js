// APEX v4 — Engine 5: Bankroll Engine
// Most important for survival
// Kelly-lite staking with no-bet feature

function computeKellyFraction(modelProb, marketOdds) {
  if (!marketOdds || marketOdds <= 1 || !modelProb) return 0

  const p = modelProb / 100
  const q = 1 - p
  const b = marketOdds - 1

  const edge = p * b - q
  if (edge <= 0) return 0

  return edge / b
}

function computeStake(modelProb, marketOdds, options = {}) {
  const {
    bankroll = 100,
    maxStake = 0.05,
    kellyFraction = 0.25,
    minEdge = 2,
    volatility = 0.5,
    uncertainty = 0,
    confidence = 'Medium',
    engine = 'CORE',
  } = options

  if (!marketOdds || marketOdds <= 1 || !modelProb) {
    return {
      stake: 0,
      units: 0,
      label: 'NO BET',
      reason: 'No valid odds or probability',
      kelly: 0,
      adjustedKelly: 0,
    }
  }

  const edge = modelProb - (1 / marketOdds) * 100

  // CHAOS engine: flat stakes for longshot overlays
  if (engine === 'CHAOS') {
    if (marketOdds > 13.0) {
      return {
        stake: 0,
        units: 0,
        label: 'AVOID',
        reason: 'Exceeds odds gate (>12/1)',
        kelly: 0,
        fractionalKelly: 0,
        adjustedKelly: 0,
        adjustments: { volatility: 1.0, uncertainty: 1.0, confidence: 1.0 },
      }
    }

    const flatStake = bankroll * 0.01
    const units = flatStake / (bankroll * 0.01)

    let label = 'NO BET'
    let reason = ''

    if (edge < minEdge) {
      label = 'NO BET'
      reason = `Edge ${edge.toFixed(1)}% below minimum ${minEdge}%`
    } else if (edge >= 10) {
      label = 'STRONG BET'
      reason = `High edge (${edge.toFixed(1)}%), flat stake`
    } else if (edge >= 5) {
      label = 'BET'
      reason = `Positive edge (${edge.toFixed(1)}%)`
    } else if (edge >= minEdge) {
      label = 'CONSIDER'
      reason = `Marginal edge (${edge.toFixed(1)}%)`
    }

    return {
      stake: Math.round(flatStake * 100) / 100,
      units: Math.round(units * 10) / 10,
      label,
      reason,
      kelly: 0,
      fractionalKelly: 0,
      adjustedKelly: 0,
      adjustments: {
        volatility: 1.0,
        uncertainty: 1.0,
        confidence: 1.0,
      },
    }
  }

  // CORE engine: fractional Kelly with adjustments
  const fullKelly = computeKellyFraction(modelProb, marketOdds)
  const fractionalKelly = fullKelly * kellyFraction

  let volAdj = 1.0
  if (volatility > 0.7) volAdj = 0.4
  else if (volatility > 0.55) volAdj = 0.6
  else if (volatility > 0.4) volAdj = 0.8

  let uncAdj = 1.0
  if (uncertainty >= 25) uncAdj = 0.25
  else if (uncertainty >= 18) uncAdj = 0.5
  else if (uncertainty >= 12) uncAdj = 0.75

  let confAdj = 1.0
  if (confidence === 'Elite') confAdj = 1.2
  else if (confidence === 'Strong') confAdj = 1.0
  else if (confidence === 'Playable') confAdj = 0.8
  else confAdj = 0.6

  const adjustedKelly = fractionalKelly * volAdj * uncAdj * confAdj
  const cappedKelly = Math.min(adjustedKelly, maxStake)
  const stake = bankroll * cappedKelly
  const units = stake / (bankroll * 0.01)

  let label = 'NO BET'
  let reason = ''

  if (edge < minEdge) {
    label = 'NO BET'
    reason = `Edge ${edge.toFixed(1)}% below minimum ${minEdge}%`
  } else if (cappedKelly < 0.005 && edge >= minEdge) {
    label = 'MICRO BET'
    reason = `Tiny stake (${(cappedKelly * 100).toFixed(2)}% Kelly) but edge exists`
  } else if (volatility > 0.7) {
    label = 'AVOID'
    reason = 'High volatility race'
  } else if (uncertainty >= 25) {
    label = 'AVOID'
    reason = 'Chaos machine — too unpredictable'
  } else if (edge >= 10 && cappedKelly >= 0.02) {
    label = 'STRONG BET'
    reason = `High edge (${edge.toFixed(1)}%), strong Kelly`
  } else if (edge >= 5 && cappedKelly >= 0.01) {
    label = 'BET'
    reason = `Positive edge (${edge.toFixed(1)}%)`
  } else if (edge >= minEdge) {
    label = 'CONSIDER'
    reason = `Marginal edge (${edge.toFixed(1)}%)`
  }

  return {
    stake: Math.round(stake * 100) / 100,
    units: Math.round(units * 10) / 10,
    label,
    reason,
    kelly: Math.round(fullKelly * 1000) / 1000,
    fractionalKelly: Math.round(fractionalKelly * 1000) / 1000,
    adjustedKelly: Math.round(cappedKelly * 1000) / 1000,
    adjustments: {
      volatility: volAdj,
      uncertainty: uncAdj,
      confidence: confAdj,
    },
  }
}

export function computeBankroll(runners, race, options = {}) {
  const volatility = race.volatility || 0.5
  const results = runners.map((runner) => {
    const modelProb = runner.modelProb || runner.winProb || 0
    const marketOdds = Number(runner.odds || runner.price || 0)
    const uncertainty = runner.uncertainty?.uncertainty || 0
    const confidence = runner.probBand || 'Medium'

    // Determine engine based on grade and odds
    const coreGrades = ['S', 'A', 'B', 'B+']
    const grade = runner.selectionQuality?.grade || ''
    const isCoreGrade = coreGrades.includes(grade)
    const isCoreOdds = marketOdds > 0 && marketOdds <= 9.0
    const engine = (isCoreGrade && isCoreOdds) ? 'CORE' : 'CHAOS'

    const stake = computeStake(modelProb, marketOdds, {
      ...options,
      volatility,
      uncertainty,
      confidence,
      engine,
    })

    return {
      horse: runner.horse,
      horse_id: runner.horse_id || runner.horse,
      modelProb: Math.round(modelProb * 10) / 10,
      marketOdds,
      engine,
      stake,
    }
  })

  const bettable = results.filter((r) => r.stake.label === 'BET' || r.stake.label === 'STRONG BET')
  const avoid = results.filter((r) => r.stake.label === 'AVOID')
  const noBet = results.filter((r) => r.stake.label === 'NO BET')

  const coreBets = bettable.filter((r) => r.engine === 'CORE')
  const chaosBets = bettable.filter((r) => r.engine === 'CHAOS')

  const totalStake = bettable.reduce((s, r) => s + r.stake.stake, 0)
  const totalUnits = bettable.reduce((s, r) => s + r.stake.units, 0)

  return {
    runners: results,
    summary: {
      bettableCount: bettable.length,
      avoidCount: avoid.length,
      noBetCount: noBet.length,
      coreBets: coreBets.length,
      chaosBets: chaosBets.length,
      totalStake: Math.round(totalStake * 100) / 100,
      totalUnits: Math.round(totalUnits * 10) / 10,
      recommendation: bettable.length === 0 ? 'No bets today' : bettable.length === 1 ? 'Single bet' : `${bettable.length} bets`,
    },
  }
}
