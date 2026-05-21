// APEX v4 — Engine 2: Race Shape Simulator
// Simulates 500-5000 race shapes to estimate probability backbone
// Answers: "How does this race unfold?"

function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return s / 2147483647
  }
}

function computeEarlySpeed(runner, paceMap) {
  const style = runner.runningStyle || 'Midfield'
  const or = runner.or || runner.ofr || 0

  let base = 50

  if (style === 'Front Runner') base = 75 + (or > 100 ? 5 : 0)
  else if (style === 'Prominent') base = 60
  else if (style === 'Midfield') base = 40
  else if (style === 'Hold Up') base = 25

  const form = runner.form || ''
  const positions = []
  form.split(/[\s/-]+/).forEach((p) => {
    const num = parseInt(p, 10)
    if (!isNaN(num) && num >= 1 && num <= 20) positions.push(num)
  })

  if (positions.length > 0) {
    const recent = positions.slice(0, 3)
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
    if (recentAvg <= 3) base += 5
    else if (recentAvg > 8) base -= 5
  }

  return Math.max(10, Math.min(95, base))
}

function computeStaminaRetention(runner, race) {
  const style = runner.runningStyle || 'Midfield'
  const lastRun = runner.last_run || 999
  const form = runner.form || ''

  let base = 50

  if (style === 'Hold Up') base = 60
  else if (style === 'Midfield') base = 55
  else if (style === 'Prominent') base = 50
  else if (style === 'Front Runner') base = 45

  if (lastRun > 90) base -= 10
  else if (lastRun > 60) base -= 5
  else if (lastRun <= 14) base += 5

  const runs = form.split(/[\s/-]+/).filter((p) => /^\d+$/.test(p)).length
  if (runs >= 8) base += 5
  else if (runs <= 2) base -= 5

  const raceDist = parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0
  if (raceDist > 12 && style === 'Front Runner') base -= 5
  if (raceDist > 14 && style === 'Hold Up') base += 5

  return Math.max(10, Math.min(95, base))
}

function computeTrafficRisk(runner, paceMap, fieldSize) {
  const style = runner.runningStyle || 'Midfield'
  const draw = Number(runner.draw) || 0
  const frontRunners = paceMap?.frontRunners || 0

  let risk = 20

  if (style === 'Hold Up') {
    if (frontRunners >= 3) risk += 15
    if (frontRunners >= 4) risk += 10
    if (fieldSize >= 14) risk += 10
  }

  if (style === 'Midfield') {
    if (frontRunners >= 3) risk += 10
    if (fieldSize >= 12) risk += 8
  }

  if (style === 'Front Runner' && frontRunners >= 2) {
    risk += 10
  }

  if (draw > 0 && fieldSize > 0) {
    const drawRatio = draw / fieldSize
    if (drawRatio > 0.8) risk += 8
  }

  return Math.max(5, Math.min(80, risk))
}

function simulateRaceShape(runners, race, paceMap, rng) {
  const fieldSize = runners.length
  const results = runners.map((runner) => {
    const earlySpeed = computeEarlySpeed(runner, paceMap)
    const stamina = computeStaminaRetention(runner, race)
    const traffic = computeTrafficRisk(runner, paceMap, fieldSize)

    const noise = (rng() - 0.5) * 20
    const trafficHit = rng() * 100 < traffic ? -10 : 0

    const earlyScore = earlySpeed + noise * 0.3
    const midScore = stamina + noise * 0.2 + trafficHit
    const lateScore = stamina + noise * 0.5

    let finishScore
    const style = runner.runningStyle || 'Midfield'

    if (style === 'Front Runner') {
      finishScore = earlyScore * 0.5 + midScore * 0.3 + lateScore * 0.2
      if (earlyScore > 70) finishScore += 5
    } else if (style === 'Prominent') {
      finishScore = earlyScore * 0.3 + midScore * 0.4 + lateScore * 0.3
    } else if (style === 'Midfield') {
      finishScore = earlyScore * 0.2 + midScore * 0.3 + lateScore * 0.5
    } else {
      finishScore = earlyScore * 0.1 + midScore * 0.2 + lateScore * 0.7
      if (lateScore > 65) finishScore += 5
    }

    return {
      horse: runner.horse,
      horse_id: runner.horse_id || runner.horse,
      finishScore: finishScore + (rng() - 0.5) * 10,
      earlyScore,
      midScore,
      lateScore,
      trafficHit,
      style,
    }
  })

  results.sort((a, b) => b.finishScore - a.finishScore)
  return results.map((r, i) => ({ ...r, position: i + 1 }))
}

export function runRaceSimulation(runners, race, paceMap, options = {}) {
  const numSimulations = options.numSimulations || 1000
  const seed = options.seed || Date.now()
  const rng = seededRandom(seed)

  const winCounts = {}
  const placeCounts = {}
  const positionSums = {}
  const earlyLeadCounts = {}
  const collapseCounts = {}

  runners.forEach((r) => {
    const key = r.horse_id || r.horse
    winCounts[key] = 0
    placeCounts[key] = 0
    positionSums[key] = 0
    earlyLeadCounts[key] = 0
    collapseCounts[key] = 0
  })

  for (let sim = 0; sim < numSimulations; sim++) {
    const result = simulateRaceShape(runners, race, paceMap, rng)

    result.forEach((r) => {
      const key = r.horse_id || r.horse
      positionSums[key] += r.position

      if (r.position === 1) winCounts[key]++
      if (r.position <= 3) placeCounts[key]++
      if (r.earlyScore > 65 && r.position > 3) collapseCounts[key]++
    })

    const earlyLeader = result.reduce((best, r) => r.earlyScore > best.earlyScore ? r : best, result[0])
    if (earlyLeader) {
      earlyLeadCounts[earlyLeader.horse_id || earlyLeader.horse]++
    }
  }

  const simulationResults = runners.map((runner) => {
    const key = runner.horse_id || runner.horse
    const winRate = (winCounts[key] / numSimulations) * 100
    const placeRate = (placeCounts[key] / numSimulations) * 100
    const avgPosition = positionSums[key] / numSimulations
    const earlyLeadRate = (earlyLeadCounts[key] / numSimulations) * 100
    const collapseRate = (collapseCounts[key] / numSimulations) * 100

    let raceShape = 'Standard'
    if (winRate > 25 && collapseRate < 5) raceShape = 'Dominant'
    else if (winRate > 15 && collapseRate < 10) raceShape = 'Strong Contender'
    else if (winRate > 8 && placeRate > 30) raceShape = 'Place Threat'
    else if (collapseRate > 20) raceShape = 'Collapse Risk'
    else if (earlyLeadRate > 30 && winRate < 10) raceShape = 'Speed Trap'
    else if (placeRate > 40) raceShape = 'Consistent Placer'

    return {
      horse: runner.horse,
      horse_id: key,
      winRate: Math.round(winRate * 10) / 10,
      placeRate: Math.round(placeRate * 10) / 10,
      avgPosition: Math.round(avgPosition * 10) / 10,
      earlyLeadRate: Math.round(earlyLeadRate * 10) / 10,
      collapseRate: Math.round(collapseRate * 10) / 10,
      raceShape,
      simulations: numSimulations,
    }
  })

  simulationResults.sort((a, b) => b.winRate - a.winRate)

  const raceShapeSummary = {
    totalSimulations: numSimulations,
    dominantHorses: simulationResults.filter((r) => r.raceShape === 'Dominant').length,
    collapseRisks: simulationResults.filter((r) => r.raceShape === 'Collapse Risk').length,
    speedTraps: simulationResults.filter((r) => r.raceShape === 'Speed Trap').length,
    avgWinRate: Math.round(simulationResults.reduce((s, r) => s + r.winRate, 0) / simulationResults.length * 10) / 10,
    competitiveness: simulationResults[0]?.winRate < 20 ? 'Open' : simulationResults[0]?.winRate < 30 ? 'Competitive' : 'One-Sided',
  }

  return {
    runners: simulationResults,
    summary: raceShapeSummary,
  }
}
