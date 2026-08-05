const GOING_ORDER = [
  'Firm',
  'Good to Firm',
  'Good',
  'Good to Soft',
  'Soft',
  'Heavy',
]

const AW_SURFACES = ['All Weather', 'Fibresand', 'Polytrack', 'Tapeta']

function normalizeGoing(going = '') {
  const g = going.trim()
  if (AW_SURFACES.some((s) => g.toLowerCase().includes(s.toLowerCase()))) {
    return 'All Weather'
  }
  return g
}

function goingSeverity(going) {
  const idx = GOING_ORDER.indexOf(going)
  if (idx === -1) return 0
  return idx
}

export function getGoingAdjustment(runner, race, goingDb = {}) {
  const raceGoing = normalizeGoing(race.going || '')
  const raceSurface = (race.surface || '').toLowerCase()
  const horseId = runner.horse_id || runner.horse
  const profile = goingDb[horseId]
  const isAW = raceSurface === 'all weather' || AW_SURFACES.some((s) => raceGoing.includes(s))

  let adj = 0

  // ---- Historical data branch ----
  if (profile) {
    const goingRec = profile.byGoing?.[raceGoing]
    const surfaceRec = profile.bySurface?.[raceSurface]

    if (goingRec && goingRec.runs >= 3) {
      const wpRate = ((goingRec.wins + goingRec.places * 0.4) / goingRec.runs) * 100
      const avgWpRate = 25
      const diff = wpRate - avgWpRate
      adj += Math.round(diff / 6)
    }

    if (surfaceRec && surfaceRec.runs >= 3) {
      const wpRate = ((surfaceRec.wins + surfaceRec.places * 0.4) / surfaceRec.runs) * 100
      const avgWpRate = 25
      const diff = wpRate - avgWpRate
      adj += Math.round(diff / 8)
    }

    return Math.max(-8, Math.min(8, adj))
  }

  // ---- Cold-start heuristics ----
  if (isAW) {
    const sire = (runner.sire || '').toLowerCase()
    const awSires = [
      'invincible spirit', 'dark angel', 'exceed and excel', 'acclamation',
      'kodiac', 'mehmas', 'showcasing', 'profitable', 'dandy man',
      'holy roman emperor', 'slade power', 'cable bay', 'new bay',
      'advertise', 'blue point', 'hello youmzain',
    ]
    if (awSires.some((s) => sire.includes(s)))
      adj += 2
  }

  if (raceGoing === 'Heavy') {
    adj -= 1
  }

  return Math.max(-8, Math.min(8, adj))
}

export function getSurfaceSummary(runner, race, goingDb = {}) {
  const raceGoing = normalizeGoing(race.going || '')
  const raceSurface = (race.surface || '').toLowerCase()
  const horseId = runner.horse_id || runner.horse
  const profile = goingDb[horseId]
  if (!profile || !profile.byGoing?.[raceGoing]) return null
  const g = profile.byGoing[raceGoing]
  return `${g.wins}-${g.places}-${g.runs}`
}
