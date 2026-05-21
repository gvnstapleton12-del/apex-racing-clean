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
  return parseFloat(String(distanceF).replace(/[^0-9.]/g, '')) || 0
}

export function calculateUncertainty(runner, race, options = {}) {
  const formString = String(runner.form || '')
  const positions = parseFormPositions(formString)
  const lastRun = Number(runner.last_run || 0)
  const age = Number(runner.age || 0)
  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
  const rpr = Number(runner.rpr || 0)
  const trainer = String(runner.trainer || '').toLowerCase()
  const jockey = String(runner.jockey || '').toLowerCase()
  const trainerRtf = Number(runner.trainer_rtf || 0)
  const distanceF = parseFurlongs(race.distance_f || '')
  const going = (race.going || '').toLowerCase()
  const surface = (race.surface || '').toLowerCase()
  const fieldSize = (race.runners || []).length
  const pattern = (race.pattern || '').toLowerCase()
  const raceClass = (race.race_class || '').toLowerCase()

  const distanceDb = options.distanceDb || {}
  const goingDb = options.goingDb || {}
  const horseId = runner.horse_id || runner.horse

  let uncertainty = 0
  const factors = []

  const runCount = positions.length
  if (runCount === 0) {
    uncertainty += 25
    factors.push('NO FORM DATA')
  } else if (runCount <= 2) {
    uncertainty += 18
    factors.push('LOW EXPOSURE')
  } else if (runCount <= 4) {
    uncertainty += 10
    factors.push('LIMITED EXPOSURE')
  }

  if (positions.length >= 3) {
    const posSpread = Math.max(...positions) - Math.min(...positions)
    if (posSpread >= 10) {
      uncertainty += 15
      factors.push('HIGHLY INCONSISTENT')
    } else if (posSpread >= 6) {
      uncertainty += 8
      factors.push('INCONSISTENT')
    } else if (posSpread <= 2) {
      uncertainty -= 5
      factors.push('VERY CONSISTENT')
    }

    const recent = positions.slice(0, 3)
    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
    if (avgPos >= 6) {
      uncertainty += 5
      factors.push('POOR RECENT FORM')
    }
  }

  if (lastRun > 0) {
    if (lastRun >= 180) {
      uncertainty += 15
      factors.push('VERY LONG LAYOFF')
    } else if (lastRun >= 90) {
      uncertainty += 10
      factors.push('LONG LAYOFF')
    } else if (lastRun >= 60) {
      uncertainty += 5
      factors.push('MODERATE LAYOFF')
    } else if (lastRun <= 7) {
      uncertainty -= 3
      factors.push('VERY FRESH')
    }
  }

  const distProfile = distanceDb[horseId]
  if (distProfile?.lastDistance > 0 && distanceF > 0) {
    const change = Math.abs(distanceF - distProfile.lastDistance)
    if (change >= 4) {
      uncertainty += 12
      factors.push('MASSIVE TRIP CHANGE')
    } else if (change >= 2) {
      uncertainty += 6
      factors.push('SIGNIFICANT TRIP CHANGE')
    }
  }

  if (going.includes('heavy')) {
    uncertainty += 10
    factors.push('HEAVY GROUND')
  } else if (going.includes('soft')) {
    uncertainty += 5
    factors.push('SOFT GROUND')
  }

  if (goingDb[horseId]) {
    const gProfile = goingDb[horseId]
    const goingRec = gProfile.byGoing?.[race.going]
    if (!goingRec || goingRec.runs === 0) {
      uncertainty += 5
      factors.push('UNKNOWN ON GOING')
    }
  }

  if (surface === 'all weather') {
    const awRec = goingDb[horseId]?.bySurface?.['All Weather']
    if (!awRec || awRec.runs === 0) {
      uncertainty += 5
      factors.push('UNKNOWN ON AW')
    }
  }

  if (fieldSize >= 16) {
    uncertainty += 8
    factors.push('VERY LARGE FIELD')
  } else if (fieldSize >= 12) {
    uncertainty += 4
    factors.push('LARGE FIELD')
  } else if (fieldSize <= 5) {
    uncertainty -= 3
    factors.push('SMALL FIELD')
  }

  if (pattern.includes('maiden') || pattern.includes('novice')) {
    uncertainty += 10
    factors.push('MAIDEN/NOVICE RACE')
  }

  if (raceClass.includes('5') || raceClass.includes('6')) {
    uncertainty += 5
    factors.push('LOW CLASS RACE')
  }

  if (age <= 3) {
    uncertainty += 5
    factors.push('YOUNG HORSE')
  } else if (age >= 9) {
    uncertainty += 3
    factors.push('VETERAN')
  }

  const topTrainers = ['skelton', 'henderson', 'nicholls', 'pipe', 'mullins', 'obrien', 'haggas', 'gosden', 'stoute']
  const topJockeys = ['de boinville', 'townend', 'blackmore', 'skelton', 'cobden', 'moore', 'doyle', 'johnson']
  const isTopConnections = topTrainers.some((t) => trainer.includes(t)) || topJockeys.some((j) => jockey.includes(j))

  if (isTopConnections && trainerRtf >= 25) {
    uncertainty -= 5
    factors.push('TOP CONNECTIONS')
  } else if (trainerRtf < 10) {
    uncertainty += 3
    factors.push('COLD STABLE')
  }

  if (or > 0 || rpr > 0) {
    uncertainty -= 3
    factors.push('KNOWN RATING')
  } else {
    uncertainty += 5
    factors.push('UNRATED')
  }

  uncertainty = Math.max(3, Math.min(35, uncertainty))

  let label = 'RELIABLE'
  if (uncertainty >= 25) label = 'CHAOS MACHINE'
  else if (uncertainty >= 18) label = 'HIGH UNCERTAINTY'
  else if (uncertainty >= 12) label = 'MODERATE UNCERTAINTY'
  else if (uncertainty >= 8) label = 'LOW UNCERTAINTY'

  return {
    uncertainty,
    label,
    factors,
    range: {
      low: Math.max(1, Math.round(runner.finalScore - uncertainty)),
      high: Math.min(99, Math.round(runner.finalScore + uncertainty)),
    },
    bankrollAdvice: uncertainty >= 25 ? 'AVOID' : uncertainty >= 18 ? 'REDUCE STAKE 50%' : uncertainty >= 12 ? 'REDUCE STAKE 25%' : 'FULL STAKE',
  }
}
