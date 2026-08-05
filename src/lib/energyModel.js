export function estimateEnergyDistribution(runner, race, options = {}) {
  const earlyPaceScore = options.earlyPaceScore ?? runner.earlyPaceScore ?? 50
  const raceShape = options.raceShape || null
  const runningStyle = options.runningStyle || 'Midfield'

  const fieldSize = (race?.runners || []).length || 8
  const collapseProb = raceShape?.collapseProb ?? 0
  const leaders = raceShape?.leaders ?? 0
  const tempo = raceShape?.tempo || 'EVEN'
  const distanceF = parseFloat(String(race?.distance_f || '').replace(/[^0-9.]/g, '')) || 0

  let earlyEnergy = earlyPaceScore
  let efficiency = 50
  let sustainability = 50

  if (earlyPaceScore >= 72) {
    efficiency += 10
    sustainability -= 5
    if (leaders >= 3) {
      sustainability -= 10
      efficiency -= 5
    }
    if (distanceF >= 10) sustainability -= 8
  } else if (earlyPaceScore >= 56) {
    efficiency += 5
  } else if (earlyPaceScore <= 35) {
    sustainability += 10
    efficiency += 3
    if (collapseProb >= 50) {
      efficiency += 8
      sustainability += 5
    }
  } else {
    sustainability += 3
  }

  const form = String(runner.form || '')
  const positions = parseFormPositions(form)
  if (positions.length >= 3) {
    const recent = positions.slice(0, 3)
    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
    const improved = recent[recent.length - 1] < recent[0]
    if (improved && avgPos <= 4) { efficiency += 8; sustainability += 5 }
    else if (avgPos >= 6) { efficiency -= 5; sustainability -= 3 }
  }

  const age = Number(runner.age || 0)
  if (age >= 5 && age <= 8) { sustainability += 5; efficiency += 3 }
  else if (age <= 3) { sustainability -= 3; efficiency -= 2 }
  else if (age >= 9) { sustainability -= 5; efficiency -= 3 }

  const lastRun = Number(runner.last_run || 0)
  if (lastRun > 0) {
    if (lastRun <= 14) { sustainability += 5; efficiency += 3 }
    else if (lastRun <= 60) { sustainability += 2 }
    else if (lastRun <= 120) { sustainability -= 3; efficiency -= 2 }
    else { sustainability -= 8; efficiency -= 5 }
  }

  const weight = Number(runner.lbs || runner.weight_lbs || 0)
  const weights = (race?.runners || []).map((r) => Number(r.lbs || 0)).filter((w) => w > 0)
  const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0
  if (weight > 0 && avgWeight > 0) {
    const diff = weight - avgWeight
    if (diff >= 7) { efficiency -= 5; sustainability -= 5 }
    else if (diff <= -5) { efficiency += 3; sustainability += 3 }
  }

  earlyEnergy = Math.max(10, Math.min(95, Math.round(earlyEnergy)))
  efficiency = Math.max(10, Math.min(95, Math.round(efficiency)))
  sustainability = Math.max(10, Math.min(95, Math.round(sustainability)))

  let profile = 'EVEN-PACED'
  if (earlyEnergy >= 72 && sustainability <= 40) profile = 'BURSTER'
  else if (earlyEnergy >= 60) profile = 'FRONT-LOADER'
  else if (earlyEnergy <= 30 && sustainability >= 60) profile = 'LATE-ENERGY'
  else if (sustainability >= 65 && earlyEnergy <= 50) profile = 'STAYER'

  let energyAdj = 0

  if (profile === 'FRONT-LOADER' || profile === 'BURSTER') {
    if (leaders === 1) energyAdj += 5
    else if (leaders === 2) energyAdj += 1
    else if (leaders >= 3) energyAdj -= 6
    if (tempo === 'SLOW') energyAdj += 4
    else if (tempo === 'FAST') energyAdj -= 5
  } else if (profile === 'LATE-ENERGY') {
    if (collapseProb >= 50) energyAdj += 6
    else if (tempo === 'FAST') energyAdj += 5
    else if (tempo === 'SLOW') energyAdj -= 5
  } else if (profile === 'STAYER') {
    if (distanceF >= 10) energyAdj += 4
    else if (distanceF <= 6) energyAdj -= 3
    if (collapseProb >= 50) energyAdj += 3
  } else {
    energyAdj += 1
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
  }
}

function parseFormPositions(form = '') {
  const positions = []
  const segments = form.split(/[\/\-]/)
  segments.forEach((seg) => {
    const cleaned = seg.replace(/[^0-9]/g, '')
    if (!cleaned) return
    const lastChar = seg.trim().slice(-1).toUpperCase()
    const isNonFinisher = /[FUPRDLCB]/.test(lastChar)
    if (isNonFinisher) return
    for (const ch of cleaned) {
      const n = parseInt(ch, 10)
      if (n > 0) positions.push(n)
    }
  })
  return positions.filter((p) => p > 0)
}
