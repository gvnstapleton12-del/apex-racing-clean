function parseFormPositions(form = '') {
  const positions = []
  const segments = form.split(/[\/-]/)
  segments.forEach((seg) => {
    for (const ch of seg) {
      const n = parseInt(ch, 10)
      if (!isNaN(n)) positions.push(n)
    }
  })
  return positions.filter((p) => p > 0)
}

export function corePowerScore(runner, race, options = {}) {
  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
  const rpr = Number(runner.rpr || 0)
  const bestRating = Math.max(or, rpr)
  const runners = race.runners || []
  const formString = String(runner.form || '')

  const ors = runners.map((r) => Number(r.ofr || r.official_rating || r.or || 0)).filter(Boolean)
  const maxOr = ors.length ? Math.max(...ors) : 0
  const avgOr = ors.length ? ors.reduce((a, b) => a + b, 0) / ors.length : 0
  const minOr = ors.length ? Math.min(...ors) : 0

  const positions = parseFormPositions(formString)

  const weights = runners.map((r) => Number(r.lbs || r.weight_lbs || r.weight || 0)).filter((w) => w > 0)
  const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0
  const weightVsAvg = avgWeight > 0 ? Number(runner.lbs || 0) - avgWeight : 0

  let abilityScore = 0
  if (bestRating > 0 && maxOr > 0) {
    const ratio = bestRating / maxOr
    if (ratio >= 1) abilityScore = 46 + Math.min(4, (bestRating - maxOr) / 2)
    else if (ratio >= 0.96) abilityScore = 42
    else if (ratio >= 0.92) abilityScore = 38
    else if (ratio >= 0.87) abilityScore = 32
    else if (ratio >= 0.82) abilityScore = 26
    else if (ratio >= 0.75) abilityScore = 18
    else if (ratio >= 0.65) abilityScore = 10
    else abilityScore = 4

    if (or >= avgOr + 5) abilityScore = Math.min(50, abilityScore + 3)
    if (or >= avgOr + 10) abilityScore = Math.min(50, abilityScore + 2)
    if (rpr > 0 && rpr >= bestRating) abilityScore = Math.min(50, abilityScore + 2)

    if (weightVsAvg <= -5) abilityScore = Math.min(50, abilityScore + 2)
    else if (weightVsAvg >= 7) abilityScore = Math.max(0, abilityScore - 3)
  } else if (bestRating > 0) {
    abilityScore = Math.min(30, bestRating / 2)
  } else {
    const odds = Number(runner.odds || runner.price || 0)
    let formAbility = 10
    if (positions.length >= 2) {
      const recent = positions.slice(0, 3)
      const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
      const winRate = positions.filter((p) => p === 1).length / positions.length
      if (avgPos <= 2) formAbility = 30
      else if (avgPos <= 3) formAbility = 25
      else if (avgPos <= 4) formAbility = 20
      else if (avgPos <= 5) formAbility = 15
      else formAbility = 10
      if (winRate >= 0.3) formAbility = Math.min(50, formAbility + 5)
    }
    if (odds > 0 && odds <= 3) formAbility = Math.min(50, formAbility + 5)
    else if (odds > 0 && odds <= 5) formAbility = Math.min(50, formAbility + 3)

    const jockey = String(runner.jockey || '').toLowerCase()
    const topJockeys = ['de boinville', 'townend', 'blackmore', 'skelton', 'cobden', 'moore', 'doyle', 'johnson']
    if (topJockeys.some((j) => jockey.includes(j))) formAbility = Math.min(50, formAbility + 3)

    const trainer = String(runner.trainer || '').toLowerCase()
    const topTrainers = ['skelton', 'henderson', 'nicholls', 'pipe', 'mullins', 'obrien']
    if (topTrainers.some((t) => trainer.includes(t))) formAbility = Math.min(50, formAbility + 2)

    abilityScore = formAbility
  }

  abilityScore = Math.max(0, Math.min(50, Math.round(abilityScore)))

  let formScore = 0
  if (positions.length >= 1) {
    const decayWeights = [1.0, 0.7, 0.5, 0.3, 0.2]
    let weightedSum = 0
    let weightTotal = 0
    positions.slice(0, 5).forEach((pos, i) => {
      const w = decayWeights[i] || 0.1
      weightedSum += Math.max(1, Math.min(20, pos)) * w
      weightTotal += w
    })
    const weightedAvg = weightedSum / weightTotal

    if (weightedAvg <= 1.5) formScore = 28
    else if (weightedAvg <= 2.5) formScore = 24
    else if (weightedAvg <= 3.5) formScore = 20
    else if (weightedAvg <= 5) formScore = 15
    else if (weightedAvg <= 7) formScore = 9
    else formScore = 3

    if (positions[0] === 1) formScore = Math.min(30, formScore + 2)
    if (positions.length >= 3 && positions[0] < positions[positions.length - 1]) formScore = Math.min(30, formScore + 2)
  } else {
    formScore = 8
  }

  const lastRun = Number(runner.last_run || 0)
  if (lastRun > 0) {
    if (lastRun <= 7) formScore = Math.min(30, formScore + 2)
    else if (lastRun > 90) formScore = Math.max(0, formScore - 3)
    else if (lastRun > 60) formScore = Math.max(0, formScore - 1)
  }

  formScore = Math.max(0, Math.min(30, Math.round(formScore)))

  let suitabilityScore = 10

  const goingAdj = Number(options.goingAdj || 0)
  suitabilityScore += goingAdj * 0.6

  const distanceAdj = Number(options.distanceAdj || 0)
  suitabilityScore += distanceAdj * 0.5

  if (Number(runner.draw || 0) > 0 && runners.length > 0) {
    const draw = Number(runner.draw)
    const fieldSize = runners.length
    const middle = (fieldSize + 1) / 2
    const drawDiff = Math.abs(draw - middle)
    const maxDiff = Math.max(fieldSize - middle, middle - 1)
    if (maxDiff > 0) {
      suitabilityScore += ((maxDiff - drawDiff) / maxDiff) * 3
    }
  }

  suitabilityScore = Math.max(0, Math.min(20, Math.round(suitabilityScore)))

  const total = abilityScore + formScore + suitabilityScore

  return {
    ability: abilityScore,
    form: formScore,
    suitability: suitabilityScore,
    total: Math.min(100, Math.max(0, total)),
  }
}
