const DISTANCE_BANDS = {
  sprint: { max: 6, label: 'Sprint' },
  mile: { min: 7, max: 9, label: 'Mile' },
  middle: { min: 10, max: 11, label: 'Middle' },
  staying: { min: 12, label: 'Staying' },
}

function parseFurlongs(distanceF) {
  if (!distanceF) return 0
  return parseFloat(String(distanceF).replace(/[^0-9.]/g, '')) || 0
}

function getBand(dist) {
  if (dist <= 0) return null
  if (dist <= DISTANCE_BANDS.sprint.max) return 'sprint'
  if (dist <= DISTANCE_BANDS.mile.max) return 'mile'
  if (dist <= DISTANCE_BANDS.middle.max) return 'middle'
  return 'staying'
}

function bandChangePenalty(fromBand, toBand) {
  if (!fromBand || !toBand) return 0
  if (fromBand === toBand) return 0
  const order = ['sprint', 'mile', 'middle', 'staying']
  const fromIdx = order.indexOf(fromBand)
  const toIdx = order.indexOf(toBand)
  const diff = Math.abs(fromIdx - toIdx)
  if (diff >= 2) return -4
  return -2
}

export function getDistanceAdjustment(runner, race, distanceDb = {}) {
  const horseId = runner.horse_id || runner.horse
  const todayDist = parseFurlongs(race.distance_f || runner.distance_f || '')
  if (todayDist <= 0) return 0

  const profile = distanceDb[horseId]
  let adj = 0

  // ---- Historical data ----
  if (profile && profile.performances?.length >= 2) {
    const atDist = profile.performances.filter(
      (p) => Math.abs(p.distance - todayDist) <= 0.5
    )
    if (atDist.length >= 2) {
      const wpRate =
        ((atDist.filter((p) => p.won).length +
          atDist.filter((p) => p.placed).length * 0.4) /
          atDist.length) *
        100
      const avgWpRate = 25
      adj += Math.round((wpRate - avgWpRate) / 6)
    }

    const lastDist = profile.lastDistance
    if (lastDist > 0 && Math.abs(lastDist - todayDist) > 0.5) {
      const change = todayDist - lastDist
      const fromBand = getBand(lastDist)
      const toBand = getBand(todayDist)
      const bandPenalty = bandChangePenalty(fromBand, toBand)

      if (change >= 4) adj += -6 + bandPenalty
      else if (change >= 2) adj += -3 + bandPenalty
      else if (change <= -4) adj += 2
      else if (change <= -2) adj += 1
    }

    return Math.max(-8, Math.min(8, adj))
  }

  // ---- Cold-start heuristic ----
  if (profile && profile.lastDistance > 0) {
    const lastDist = profile.lastDistance
    const change = todayDist - lastDist
    if (change >= 4) adj = -5
    else if (change >= 2) adj = -3
    else if (change <= -4) adj = 2
    else if (change <= -2) adj = 1
  }

  return Math.max(-8, Math.min(8, adj))
}

export function getDistanceSummary(runner, race, distanceDb = {}) {
  const horseId = runner.horse_id || runner.horse
  const profile = distanceDb[horseId]
  const todayDist = parseFurlongs(race.distance_f || runner.distance_f || '')

  let parts = []
  if (profile?.lastDistance > 0) {
    const change = todayDist - profile.lastDistance
    if (Math.abs(change) > 0.5) {
      parts.push(`${change > 0 ? '+' : ''}${change}f`)
    }
  }
  const band = getBand(todayDist)
  if (band) parts.push(DISTANCE_BANDS[band].label)
  return parts.join(' ') || null
}
