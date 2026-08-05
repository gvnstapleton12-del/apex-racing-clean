import { getCourseProfile } from './courseProfiles.js'

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

export function buildHorseProfile(horseId, races = []) {
  const horseRaces = races.filter((r) =>
    (r.runners || []).some((rn) => (rn.horse_id || rn.horse) === horseId)
  )

  if (horseRaces.length === 0) return null

  const profile = {
    horse_id: horseId,
    horse: '',
    runs: 0,
    wins: 0,
    places: 0,
    win_rate: 0,
    place_rate: 0,
    by_track_handed: { left: { runs: 0, wins: 0, places: 0 }, right: { runs: 0, wins: 0, places: 0 } },
    by_track_type: { oval: { runs: 0, wins: 0 }, straight: { runs: 0, wins: 0 } },
    by_uphill: { true: { runs: 0, wins: 0 }, false: { runs: 0, wins: 0 } },
    by_distance: {},
    by_going: {},
    by_or_range: { '0-60': { runs: 0, wins: 0 }, '61-80': { runs: 0, wins: 0 }, '81-100': { runs: 0, wins: 0 }, '101+': { runs: 0, wins: 0 } },
    by_weight: { 'light': { runs: 0, wins: 0 }, 'medium': { runs: 0, wins: 0 }, 'heavy': { runs: 0, wins: 0 } },
    avg_or_when_winning: 0,
    avg_weight_when_winning: 0,
    best_rpr: 0,
    preferred_distance: null,
    preferred_going: null,
    preferred_track: null,
    preferred_or_range: null,
  }

  let orSumWins = 0
  let weightSumWins = 0
  let winCount = 0

  horseRaces.forEach((race) => {
    const runner = (race.runners || []).find((rn) => (rn.horse_id || rn.horse) === horseId)
    if (!runner) return

    const pos = Number(runner.position || 0)
    if (pos < 1) return

    profile.runs++
    profile.horse = runner.horse
    if (pos === 1) profile.wins++
    if (pos <= 3) profile.places++

    const courseProfile = getCourseProfile(race.course)
    const handed = courseProfile.handed || 'unknown'
    const trackType = courseProfile.type || 'unknown'
    const uphill = courseProfile.uphill || false

    if (profile.by_track_handed[handed]) {
      profile.by_track_handed[handed].runs++
      if (pos === 1) profile.by_track_handed[handed].wins++
      if (pos <= 3) profile.by_track_handed[handed].places++
    }

    if (profile.by_track_type[trackType]) {
      profile.by_track_type[trackType].runs++
      if (pos === 1) profile.by_track_type[trackType].wins++
    }

    const uphillKey = String(uphill)
    if (profile.by_uphill[uphillKey] !== undefined) {
      profile.by_uphill[uphillKey].runs++
      if (pos === 1) profile.by_uphill[uphillKey].wins++
    }

    const distF = parseFurlongs(race.distance_f || '')
    const distKey = distF > 0 ? `${Math.round(distF)}f` : 'unknown'
    if (!profile.by_distance[distKey]) profile.by_distance[distKey] = { runs: 0, wins: 0 }
    profile.by_distance[distKey].runs++
    if (pos === 1) profile.by_distance[distKey].wins++

    const going = (race.going || 'unknown').toLowerCase()
    const goingKey = going.includes('soft') || going.includes('heavy') ? 'soft' : going.includes('firm') || going.includes('fast') ? 'firm' : 'good'
    if (!profile.by_going[goingKey]) profile.by_going[goingKey] = { runs: 0, wins: 0 }
    profile.by_going[goingKey].runs++
    if (pos === 1) profile.by_going[goingKey].wins++

    const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
    const orRange = or <= 60 ? '0-60' : or <= 80 ? '61-80' : or <= 100 ? '81-100' : '101+'
    if (!profile.by_or_range[orRange]) profile.by_or_range[orRange] = { runs: 0, wins: 0 }
    profile.by_or_range[orRange].runs++
    if (pos === 1) profile.by_or_range[orRange].wins++

    const weight = Number(runner.lbs || runner.weight_lbs || 0)
    const weightKey = weight <= 140 ? 'light' : weight <= 160 ? 'medium' : 'heavy'
    if (!profile.by_weight[weightKey]) profile.by_weight[weightKey] = { runs: 0, wins: 0 }
    profile.by_weight[weightKey].runs++
    if (pos === 1) profile.by_weight[weightKey].wins++

    const rpr = Number(runner.rpr || 0)
    if (rpr > profile.best_rpr) profile.best_rpr = rpr

    if (pos === 1) {
      winCount++
      if (or > 0) orSumWins += or
      if (weight > 0) weightSumWins += weight
    }
  })

  if (profile.runs > 0) {
    profile.win_rate = Math.round((profile.wins / profile.runs) * 100)
    profile.place_rate = Math.round((profile.places / profile.runs) * 100)
  }
  if (winCount > 0) {
    profile.avg_or_when_winning = Math.round(orSumWins / winCount)
    profile.avg_weight_when_winning = Math.round(weightSumWins / winCount)
  }

  profile.preferred_distance = findBestCategory(profile.by_distance)
  profile.preferred_going = findBestCategory(profile.by_going)
  profile.preferred_track = findBestHanded(profile.by_track_handed)
  profile.preferred_or_range = findBestCategory(profile.by_or_range)

  return profile
}

function findBestCategory(cat) {
  let best = null
  let bestRate = 0
  for (const [key, val] of Object.entries(cat)) {
    if (val.runs >= 2) {
      const rate = val.wins / val.runs
      if (rate > bestRate) {
        bestRate = rate
        best = key
      }
    }
  }
  return best
}

function findBestHanded(handed) {
  let best = null
  let bestRate = 0
  for (const [key, val] of Object.entries(handed)) {
    if (val.runs >= 2) {
      const rate = val.wins / val.runs
      if (rate > bestRate) {
        bestRate = rate
        best = key
      }
    }
  }
  return best
}

export function computeProfileAdjustment(profile, race) {
  if (!profile || profile.runs < 2) return 0

  let adj = 0
  const courseProfile = getCourseProfile(race.course)
  const handed = courseProfile.handed || 'unknown'
  const going = (race.going || 'unknown').toLowerCase()
  const goingKey = going.includes('soft') || going.includes('heavy') ? 'soft' : going.includes('firm') || going.includes('fast') ? 'firm' : 'good'
  const distF = parseFurlongs(race.distance_f || '')
  const distKey = distF > 0 ? `${Math.round(distF)}f` : 'unknown'
  const or = Number(race.ofr || race.official_rating || race.or || 0)
  const orRange = or <= 60 ? '0-60' : or <= 80 ? '61-80' : or <= 100 ? '81-100' : '101+'
  const weight = Number(race.lbs || race.weight_lbs || 0)
  const weightKey = weight <= 140 ? 'light' : weight <= 160 ? 'medium' : 'heavy'

  if (profile.by_track_handed[handed] && profile.by_track_handed[handed].runs >= 2) {
    const rate = profile.by_track_handed[handed].wins / profile.by_track_handed[handed].runs
    if (rate > 0.2) adj += 3
    else if (rate < 0.05) adj -= 3
  }

  if (profile.by_going[goingKey] && profile.by_going[goingKey].runs >= 2) {
    const rate = profile.by_going[goingKey].wins / profile.by_going[goingKey].runs
    if (rate > 0.25) adj += 4
    else if (rate < 0.05) adj -= 4
  }

  if (profile.by_distance[distKey] && profile.by_distance[distKey].runs >= 2) {
    const rate = profile.by_distance[distKey].wins / profile.by_distance[distKey].runs
    if (rate > 0.2) adj += 3
    else if (rate < 0.05) adj -= 3
  }

  if (profile.by_or_range[orRange] && profile.by_or_range[orRange].runs >= 2) {
    const rate = profile.by_or_range[orRange].wins / profile.by_or_range[orRange].runs
    if (rate > 0.2) adj += 2
    else if (rate < 0.05) adj -= 2
  }

  if (profile.by_weight[weightKey] && profile.by_weight[weightKey].runs >= 2) {
    const rate = profile.by_weight[weightKey].wins / profile.by_weight[weightKey].runs
    if (rate > 0.2) adj += 2
    else if (rate < 0.05) adj -= 2
  }

  return Math.max(-10, Math.min(10, adj))
}
