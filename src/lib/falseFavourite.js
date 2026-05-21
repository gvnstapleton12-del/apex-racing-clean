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

export function detectFalseFavourite(runners, race, options = {}) {
  const withOdds = runners.filter((r) => Number(r.odds || r.price || 0) > 0)
  if (withOdds.length === 0) return null

  const favourite = withOdds.reduce((a, b) =>
    Number(a.odds || a.price) < Number(b.odds || b.price) ? a : b
  )

  const favOdds = Number(favourite.odds || favourite.price || 0)
  const favImpliedProb = favOdds > 1 ? 1 / favOdds : 0
  const favModelProb = favourite.winProb ? favourite.winProb / 100 : 0

  const flags = []
  let severity = 0

  const or = Number(favourite.ofr || favourite.official_rating || favourite.or || 0)
  const rpr = Number(favourite.rpr || 0)
  const bestRating = Math.max(or, rpr)
  const formString = String(favourite.form || '')
  const positions = parseFormPositions(formString)
  const lastRun = Number(favourite.last_run || 0)
  const draw = Number(favourite.draw || 0)
  const fieldSize = runners.length
  const distanceF = parseFurlongs(race.distance_f || '')
  const going = (race.going || '').toLowerCase()
  const trainer = String(favourite.trainer || '').toLowerCase()
  const jockey = String(favourite.jockey || '').toLowerCase()

  const ors = runners.map((r) => Number(r.ofr || 0)).filter(Boolean)
  const maxOr = ors.length ? Math.max(...ors) : 0
  const avgOr = ors.length ? ors.reduce((a, b) => a + b, 0) / ors.length : 0

  const modelGap = Math.round((favImpliedProb - favModelProb) * 1000) / 1000
  if (modelGap > 0.20) {
    flags.push('MARKET OVERCONFIDENCE')
    severity += 4
  } else if (modelGap > 0.15) {
    flags.push('SLIGHT OVERCONFIDENCE')
    severity += 2
  } else if (modelGap > 0.10) {
    flags.push('MARGINALLY SHORT')
    severity += 1
  }

  if (positions.length >= 2) {
    const recent = positions.slice(0, 3)
    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
    const winRate = positions.filter((p) => p <= 1.5).length / positions.length
    const top3Rate = positions.filter((p) => p <= 3.5).length / positions.length
    const improved = recent[recent.length - 1] < recent[0]

    if (favOdds <= 3 && avgPos > 4) {
      flags.push('WEAK RECENT FORM')
      severity += 2
    }
    if (favOdds <= 3 && winRate < 0.15) {
      flags.push('LOW WIN RATE')
      severity += 2
    }
    if (favOdds <= 2.5 && !improved && avgPos >= 3) {
      flags.push('NO IMPROVEMENT')
      severity += 1
    }
    if (favOdds <= 4 && top3Rate < 0.3 && positions.length >= 3) {
      flags.push('POOR CONSISTENCY')
      severity += 2
    }
  }

  if (favourite.paceCompat) {
    const compat = favourite.paceCompat.compatibility || 50
    const collapse = favourite.paceCompat.collapseRisk || 'LOW'
    if (compat <= 35) {
      flags.push('POOR PACE SETUP')
      severity += 3
    } else if (compat <= 45) {
      flags.push('WEAK PACE SETUP')
      severity += 2
    }
    if (collapse === 'HIGH') {
      flags.push('COLLAPSE RISK')
      severity += 2
    }
  }

  if (distanceF > 0) {
    const distDb = options.distanceDb || {}
    const horseId = favourite.horse_id || favourite.horse
    const distProfile = distDb[horseId]
    if (distProfile?.lastDistance > 0) {
      const change = Math.abs(distanceF - distProfile.lastDistance)
      if (change >= 4) {
        flags.push('VULNERABLE TRIP')
        severity += 3
      } else if (change >= 2) {
        flags.push('TRIP CHANGE')
        severity += 1
      }
    }
  }

  if (bestRating > 0 && maxOr > 0 && bestRating <= maxOr - 8) {
    flags.push('INFERIOR RATING')
    severity += 2
  }

  if (bestRating > 0 && avgOr > 0 && bestRating <= avgOr - 5) {
    flags.push('BELOW AVERAGE OR')
    severity += 1
  }

  const topTrainers = ['skelton', 'henderson', 'nicholls', 'pipe', 'mullins', 'obrien', 'haggas', 'gosden', 'stoute']
  const topJockeys = ['de boinville', 'townend', 'blackmore', 'skelton', 'cobden', 'moore', 'doyle', 'johnson']
  const isTopConnections = topTrainers.some((t) => trainer.includes(t)) || topJockeys.some((j) => jockey.includes(j))

  if (isTopConnections && favOdds <= 3 && modelGap > 0.15) {
    flags.push('OVERBET CONNECTIONS')
    severity += 2
  }

  if (going.includes('heavy') || going.includes('soft')) {
    if (positions.length >= 2) {
      const recent = positions.slice(0, 3)
      const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
      if (avgPos >= 5) {
        flags.push('POOR SOFT GROUND FORM')
        severity += 2
      }
    }
  }

  if (draw > 0 && fieldSize > 0) {
    const wideCutoff = Math.ceil(fieldSize * 0.75)
    if (draw >= wideCutoff && fieldSize >= 10) {
      flags.push('WIDE DRAW')
      severity += 1
    }
  }

  if (lastRun >= 90 && favOdds <= 4) {
    flags.push('LONG LAYOFF')
    severity += 2
  }

  if (severity === 0) return null

  let label = 'VULNERABLE'
  if (severity >= 8) label = 'FALSE FAVOURITE'
  else if (severity >= 5) label = 'HIGHLY VULNERABLE'

  return {
    horse: favourite.horse,
    odds: favOdds,
    impliedProb: Math.round(favImpliedProb * 1000) / 10,
    modelProb: Math.round(favModelProb * 1000) / 10,
    modelGap: Math.round(modelGap * 1000) / 10,
    severity,
    label,
    flags,
    recommendation: severity >= 8 ? 'LAY' : severity >= 5 ? 'CONSIDER LAY' : 'CAUTION',
  }
}
