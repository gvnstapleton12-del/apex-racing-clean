function parseFurlongs(distanceF) {
  if (!distanceF) return 0
  return parseFloat(String(distanceF).replace(/[^0-9.]/g, '')) || 0
}

export function calculateFieldStrength(runners, race = {}) {
  if (!runners || runners.length === 0) return { strength: 0, depth: 0, quality: 0, label: 'UNKNOWN' }

  const fieldSize = runners.length
  const ors = runners.map((r) => Number(r.ofr || r.official_rating || r.or || 0)).filter(Boolean)
  const avgOr = ors.length ? ors.reduce((a, b) => a + b, 0) / ors.length : 0
  const maxOr = ors.length ? Math.max(...ors) : 0
  const minOr = ors.length ? Math.min(...ors) : 0
  const orStd = ors.length > 1 ? Math.sqrt(ors.reduce((s, o) => s + (o - avgOr) ** 2, 0) / ors.length) : 0

  const topQuartile = ors.filter((o) => o >= avgOr + orStd * 0.5).length
  const depthIndex = ors.length > 0 ? topQuartile / ors.length : 0

  const raceClass = (race.race_class || '').toLowerCase()
  const pattern = (race.pattern || '').toLowerCase()
  const going = (race.going || '').toLowerCase()

  let classBonus = 0
  if (raceClass.includes('1') || pattern.includes('group')) classBonus = 15
  else if (raceClass.includes('2')) classBonus = 10
  else if (raceClass.includes('3')) classBonus = 5
  else if (raceClass.includes('5') || raceClass.includes('6')) classBonus = -5

  let goingPenalty = 0
  if (going.includes('heavy')) goingPenalty = -3
  else if (going.includes('soft')) goingPenalty = -1

  const fieldSizeFactor = Math.min(1, (fieldSize - 1) / 15)
  const orFactor = avgOr > 0 ? Math.min(1, avgOr / 120) : 0.3
  const depthFactor = depthIndex
  const qualityScore = (orFactor * 0.4 + depthFactor * 0.3 + (classBonus + 10) / 25 * 0.3) + goingPenalty / 100

  const strength = Math.max(0, Math.min(1, fieldSizeFactor * 0.4 + orFactor * 0.35 + depthFactor * 0.25))

  let label = 'WEAK'
  if (strength >= 0.7) label = 'STRONG'
  else if (strength >= 0.5) label = 'MODERATE'
  else if (strength >= 0.3) label = 'AVERAGE'

  return {
    strength: Math.round(strength * 100) / 100,
    depth: Math.round(depthIndex * 100) / 100,
    quality: Math.round(qualityScore * 100) / 100,
    avgOr: Math.round(avgOr * 10) / 10,
    maxOr: Math.round(maxOr * 10) / 10,
    minOr: Math.round(minOr * 10) / 10,
    orStd: Math.round(orStd * 10) / 10,
    fieldSize,
    topQuartileCount: topQuartile,
    classBonus,
    goingPenalty,
    label,
  }
}

export function normalizePosition(position, fieldStrength, fieldSize) {
  if (!position || position <= 0) return 0
  if (fieldStrength <= 0 || fieldSize <= 0) return position

  const raw = position / fieldSize
  const normalized = raw * (1 + (1 - fieldStrength) * 0.5)
  const adjusted = normalized * fieldSize

  return Math.max(1, Math.round(adjusted * 10) / 10)
}

export function getRaceQualityScore(race) {
  const runners = race.runners || []
  const field = calculateFieldStrength(runners, race)

  const distanceF = parseFurlongs(race.distance_f || '')
  const distanceFactor = distanceF > 0 ? Math.min(1, distanceF / 16) : 0.5

  const ageBand = (race.age_band || '').toLowerCase()
  const ageFactor = ageBand.includes('2yo') ? 0.7 : ageBand.includes('3yo') ? 0.85 : 1.0

  const raceClass = (race.race_class || '').toLowerCase()
  const classFactor = raceClass.includes('1') ? 1.0 : raceClass.includes('2') ? 0.85 : raceClass.includes('3') ? 0.7 : 0.6

  const quality = (field.strength * 0.5 + distanceFactor * 0.2 + ageFactor * 0.15 + classFactor * 0.15)

  return {
    score: Math.round(quality * 100) / 100,
    label: quality >= 0.7 ? 'HIGH' : quality >= 0.5 ? 'MEDIUM' : 'LOW',
    field,
  }
}
