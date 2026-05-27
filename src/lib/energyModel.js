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

function parseFurlongs(distanceF) {
  if (!distanceF) return 0
  if (typeof distanceF === 'number') return distanceF
  const m = String(distanceF).match(/(\d+)m\s*(\d*)f?\s*(\d*)y?/)
  if (m) {
    const miles = Number(m[1]) || 0
    const furlongs = Number(m[2]) || 0
    const yards = Number(m[3]) || 0
    return miles * 8 + furlongs + yards / 220
  }
  return parseFloat(String(distanceF).replace(/[^0-9.]/g, '')) || 0
}

export function estimateEnergyDistribution(runner, race, options = {}) {
  const formString = String(runner.form || '')
  const positions = parseFormPositions(formString)
  const runningStyle = options.runningStyle || 'Midfield'
  const paceMap = options.paceMap || { projectedTempo: 'EVEN', frontRunners: 0 }
  const draw = Number(runner.draw || 0)
  const fieldSize = (race.runners || []).length
  const weight = Number(runner.lbs || runner.weight_lbs || 0)
  const age = Number(runner.age || 0)
  const lastRun = Number(runner.last_run || 0)
  const going = (race.going || '').toLowerCase()
  const distanceF = parseFurlongs(race.distance_f || '')

  const ors = (race.runners || []).map((r) => Number(r.ofr || 0)).filter(Boolean)
  const avgOr = ors.length ? ors.reduce((a, b) => a + b, 0) / ors.length : 0
  const weights = (race.runners || []).map((r) => Number(r.lbs || 0)).filter((w) => w > 0)
  const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0

  let earlyEnergy = 50
  let efficiency = 50
  let sustainability = 50

  if (runningStyle === 'Front Runner') {
    earlyEnergy = 70
    if (paceMap.frontRunners >= 3) earlyEnergy += 15
    else if (paceMap.frontRunners === 2) earlyEnergy += 8
    else if (paceMap.frontRunners === 1) earlyEnergy -= 5
    if (paceMap.projectedTempo === 'FAST') earlyEnergy += 10
    else if (paceMap.projectedTempo === 'SLOW') earlyEnergy -= 5
    if (draw > fieldSize * 0.75) earlyEnergy += 5
  } else if (runningStyle === 'Prominent') {
    earlyEnergy = 50
    if (paceMap.frontRunners >= 3) earlyEnergy += 8
    if (paceMap.projectedTempo === 'FAST') earlyEnergy += 5
    else if (paceMap.projectedTempo === 'SLOW') earlyEnergy -= 3
  } else if (runningStyle === 'Midfield') {
    earlyEnergy = 35
    if (paceMap.projectedTempo === 'FAST') earlyEnergy -= 5
    else if (paceMap.projectedTempo === 'SLOW') earlyEnergy += 3
  } else if (runningStyle === 'Hold Up') {
    earlyEnergy = 20
    if (paceMap.projectedTempo === 'FAST') earlyEnergy -= 5
    else if (paceMap.projectedTempo === 'SLOW') earlyEnergy += 5
  }

  if (positions.length >= 2) {
    const recent = positions.slice(0, 3)
    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
    const winRate = positions.filter((p) => p <= 1.5).length / positions.length
    const top3Rate = positions.filter((p) => p <= 3.5).length / positions.length
    const improved = recent[recent.length - 1] < recent[0]
    const posSpread = positions.length >= 3 ? Math.max(...positions) - Math.min(...positions) : 0

    if (improved && avgPos <= 4) {
      efficiency += 15
      sustainability += 10
    } else if (avgPos <= 2.5) {
      efficiency += 10
      sustainability += 5
    } else if (avgPos >= 6) {
      efficiency -= 10
      sustainability -= 5
    }

    if (winRate >= 0.3) {
      efficiency += 10
      sustainability += 8
    }
    if (top3Rate >= 0.5) {
      efficiency += 5
      sustainability += 5
    }

    if (posSpread > 8) {
      efficiency -= 8
      sustainability -= 5
    } else if (posSpread <= 3 && positions.length >= 3) {
      efficiency += 5
      sustainability += 3
    }
  }

  if (weight > 0 && avgWeight > 0) {
    const weightDiff = weight - avgWeight
    if (weightDiff >= 7) {
      efficiency -= 5
      sustainability -= 5
    } else if (weightDiff <= -5) {
      efficiency += 3
      sustainability += 3
    }
  }

  if (going.includes('heavy')) {
    efficiency -= 8
    sustainability -= 5
    if (runningStyle === 'Front Runner') earlyEnergy += 5
  } else if (going.includes('soft')) {
    efficiency -= 3
    sustainability -= 2
  } else if (going.includes('firm')) {
    efficiency += 2
    sustainability += 1
  }

  if (lastRun > 0) {
    if (lastRun <= 14) {
      sustainability += 5
      efficiency += 3
    } else if (lastRun <= 30) {
      sustainability += 3
    } else if (lastRun <= 60) {
      sustainability += 0
    } else if (lastRun <= 90) {
      sustainability -= 3
      efficiency -= 2
    } else if (lastRun <= 180) {
      sustainability -= 8
      efficiency -= 5
    } else {
      sustainability -= 12
      efficiency -= 8
    }
  }

  if (age >= 5 && age <= 8) {
    sustainability += 5
    efficiency += 3
  } else if (age <= 3) {
    sustainability -= 5
    efficiency -= 3
  } else if (age >= 9) {
    sustainability -= 5
    efficiency -= 3
  }

  if (distanceF > 0) {
    const distBand = distanceF <= 6 ? 'SPRINT' : distanceF <= 9 ? 'MILE' : distanceF <= 11 ? 'MIDDLE' : 'STAYING'
    if (runningStyle === 'Front Runner' && distBand === 'SPRINT') {
      sustainability += 5
      earlyEnergy += 5
    } else if (runningStyle === 'Hold Up' && distBand === 'STAYING') {
      sustainability += 8
      earlyEnergy -= 5
    } else if (runningStyle === 'Front Runner' && distBand === 'STAYING') {
      sustainability -= 10
      earlyEnergy += 5
    }
  }

  earlyEnergy = Math.max(10, Math.min(95, Math.round(earlyEnergy)))
  efficiency = Math.max(10, Math.min(95, Math.round(efficiency)))
  sustainability = Math.max(10, Math.min(95, Math.round(sustainability)))

  let profile = 'EVEN-PACED'
  if (earlyEnergy >= 70 && sustainability <= 40) profile = 'BURSTER'
  else if (earlyEnergy >= 60) profile = 'FRONT-LOADER'
  else if (earlyEnergy <= 30 && sustainability >= 60) profile = 'LATE-ENERGY'
  else if (sustainability >= 65 && earlyEnergy <= 50) profile = 'STAYER'
  else if (earlyEnergy >= 40 && earlyEnergy <= 55 && sustainability >= 45) profile = 'EVEN-PACED'

  let energyAdj = 0
  if (profile === 'FRONT-LOADER' || profile === 'BURSTER') {
    if (paceMap.projectedTempo === 'SLOW') energyAdj += 5
    else if (paceMap.projectedTempo === 'FAST') energyAdj -= 6
    else if (paceMap.frontRunners >= 3) energyAdj -= 4
  } else if (profile === 'LATE-ENERGY') {
    if (paceMap.projectedTempo === 'FAST') energyAdj += 6
    else if (paceMap.projectedTempo === 'SLOW') energyAdj -= 5
    else if (paceMap.collapseRisk === 'HIGH') energyAdj += 2
  } else if (profile === 'STAYER') {
    if (distanceF >= 10) energyAdj += 4
    else if (distanceF <= 6) energyAdj -= 3
  } else if (profile === 'EVEN-PACED') {
    energyAdj += 2
  }

  if (efficiency >= 70) energyAdj += 2
  else if (efficiency <= 30) energyAdj -= 2

  energyAdj = Math.max(-8, Math.min(8, Math.round(energyAdj)))

  return {
    earlyEnergy,
    efficiency,
    sustainability,
    profile,
    energyAdj,
    factors: {
      pacePressure: paceMap.frontRunners >= 3 ? 'HIGH' : paceMap.frontRunners >= 2 ? 'MODERATE' : 'LOW',
      tempo: paceMap.projectedTempo,
      goingImpact: going.includes('heavy') ? 'HIGH_DRAIN' : going.includes('soft') ? 'MODERATE_DRAIN' : 'LOW_DRAIN',
      weightImpact: weight > 0 && avgWeight > 0 ? (weight - avgWeight >= 7 ? 'HEAVY' : weight - avgWeight <= -5 ? 'LIGHT' : 'NORMAL') : 'UNKNOWN',
      freshness: lastRun <= 14 ? 'FRESH' : lastRun <= 60 ? 'MODERATE' : lastRun <= 180 ? 'TIRED' : 'STALE',
    },
  }
}
