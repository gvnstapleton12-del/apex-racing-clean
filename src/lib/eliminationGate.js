import { calculateFieldStrength, normalizePosition } from './fieldStrength.js'

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

export function eliminationGate(runner, race, options = {}) {
  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
  const rpr = Number(runner.rpr || 0)
  const bestRating = Math.max(or, rpr)
  const formString = String(runner.form || '')
  const lastRun = Number(runner.last_run || 0)
  const todayDist = parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0

  const runners = race.runners || []
  const fieldSize = runners.length
  const fieldStrength = calculateFieldStrength(runners, race)
  const ratings = runners.map((r) => Math.max(Number(r.ofr || 0), Number(r.rpr || 0))).filter(Boolean)
  const topRating = ratings.length ? Math.max(...ratings) : 0
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
  const rawPositions = parseFormPositions(formString)
  const positions = rawPositions.map((p) => normalizePosition(p, fieldStrength.strength, fieldSize))

  let maxScore = 100
  const reasons = []

  if (topRating > 0 && bestRating > 0 && bestRating <= topRating - 10) {
    maxScore = 38
    reasons.push('or_gap')
  }

  if (positions.length >= 3 && !positions.slice(0, 5).some((p) => p <= 3)) {
    maxScore = 38
    reasons.push('no_form')
  }

  if (lastRun >= 180) {
    maxScore = 38
    reasons.push('layoff')
  }

  const horseId = runner.horse_id || runner.horse
  const distanceDb = options.distanceDb || {}
  const distProfile = distanceDb[horseId]
  if (distProfile?.lastDistance > 0 && todayDist > 0 && Math.abs(todayDist - distProfile.lastDistance) >= 4) {
    maxScore = 38
    reasons.push('dist_change')
  }

  if (bestRating > 0 && avgRating > 0) {
    const orGap = bestRating - avgRating
    if (orGap <= -15) {
      maxScore = 38
      reasons.push('class_mismatch')
    }
  }

  if (positions.length >= 3) {
    const heavyLosses = positions.filter((p) => p >= 8).length
    if (heavyLosses >= 3) {
      maxScore = 38
      reasons.push('heavy_defeats')
    }
  }

  return {
    eliminated: reasons.length > 0,
    isContender: reasons.length === 0,
    maxScore,
    reasons,
  }
}
