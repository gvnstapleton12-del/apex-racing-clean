import { readFileSync } from 'fs'
import { resolve } from 'path'

const profiles = JSON.parse(readFileSync(resolve('data/trackProfiles.json'), 'utf8'))

const AW_COURSE_MULTIPLIER = {
  Newcastle: 1.2,
  Southwell: 1.0,
  Wolverhampton: 0.9,
  Kempton: 1.1,
  Lingfield: 0.95,
  Chelmsford: 1.0,
}

const AW_SURFACES = {
  tapeta: {
    bestGoing: ['Good', 'Good to Soft'],
    note: 'Tapeta transfers well to decent turf (good/good-to-soft)',
  },
  polytrack: {
    bestGoing: ['Good', 'Good to Firm'],
    note: 'Polytrack transfers to faster turf (good/good-to-firm)',
  },
  fibresand: {
    bestGoing: ['Soft', 'Heavy'],
    note: 'Fibresand transfers to softer turf',
  },
}

function normalizeGoing(going) {
  if (!going) return ''
  const g = going.toLowerCase().trim()
  if (g.includes('heavy')) return 'Heavy'
  if (g.includes('soft')) return 'Soft'
  if (g.includes('good to soft')) return 'Good to Soft'
  if (g.includes('good to firm')) return 'Good to Firm'
  if (g.includes('good')) return 'Good'
  if (g.includes('firm')) return 'Firm'
  return going
}

function isGoingCompatible(awSurface, turfGoing) {
  const info = AW_SURFACES[awSurface]
  if (!info) return { compatible: false, score: 0, reason: 'Unknown AW surface' }

  const norm = normalizeGoing(turfGoing)
  if (info.bestGoing.includes(norm)) {
    return { compatible: true, score: 10, reason: `Going (${norm}) suits ${awSurface} transfer` }
  }

  const goingOrder = ['Firm', 'Good to Firm', 'Good', 'Good to Soft', 'Soft', 'Heavy']
  const bestIdx = info.bestGoing.map(g => goingOrder.indexOf(g)).filter(i => i >= 0)
  const currentIdx = goingOrder.indexOf(norm)

  if (bestIdx.length === 0 || currentIdx < 0) {
    return { compatible: false, score: 0, reason: 'Cannot assess going compatibility' }
  }

  const minBest = Math.min(...bestIdx)
  const maxBest = Math.max(...bestIdx)
  const distance = currentIdx < minBest ? minBest - currentIdx : currentIdx - maxBest

  if (distance <= 1) {
    return { compatible: true, score: 5, reason: `Going (${norm}) close to ${awSurface} preferred` }
  }
  return { compatible: false, score: -5, reason: `Going (${norm}) poor fit for ${awSurface} transfer` }
}

function distanceModifier(distanceF) {
  if (!distanceF || distanceF <= 0) return { multiplier: 1.0, note: '' }
  if (distanceF >= 7 && distanceF <= 12) {
    return { multiplier: 1.15, note: '7f-12f — strongest transfer range' }
  }
  if (distanceF <= 6) {
    return { multiplier: 0.9, note: 'Sprint trip — AW specialists less reliable' }
  }
  if (distanceF >= 14) {
    return { multiplier: 0.85, note: 'Extreme stamina trip — AW form less predictive' }
  }
  return { multiplier: 1.0, note: '' }
}

function layoutMatch(awCourses, turfTrack) {
  if (!turfTrack || !turfTrack.layoutCategory) return { score: 0, note: '' }

  const awLayouts = awCourses.map(c => {
    const t = profiles.tracks[c]
    return t?.layoutCategory || null
  }).filter(Boolean)

  if (awLayouts.length === 0) return { score: 0, note: '' }

  const layoutCounts = {}
  for (const l of awLayouts) layoutCounts[l] = (layoutCounts[l] || 0) + 1
  const primaryLayout = Object.entries(layoutCounts).sort((a, b) => b[1] - a[1])[0][0]

  const turfLayout = turfTrack.layoutCategory

  if (primaryLayout === turfLayout) {
    return { score: 3, note: `Layout match: ${primaryLayout} AW → ${turfLayout} turf` }
  }

  const gallopingToTactical = primaryLayout === 'galloping' && (turfLayout === 'tactical')
  const tacticalToGalloping = primaryLayout === 'tactical' && (turfLayout === 'galloping')

  if (gallopingToTactical) {
    return { score: -2, note: `Layout mismatch: galloping AW → tactical turf` }
  }
  if (tacticalToGalloping) {
    return { score: -1, note: `Layout mismatch: tactical AW → galloping turf` }
  }

  if (turfLayout === 'undulating' || turfLayout === 'stiff') {
    if (primaryLayout === 'galloping') {
      return { score: -1, note: `Galloping AW → ${turfLayout} turf — moderate mismatch` }
    }
    return { score: -3, note: `Tactical AW → ${turfLayout} turf — poor match` }
  }

  return { score: 0, note: '' }
}

function assessTrackTransfer(turfTrack, turfCourse) {
  if (!turfTrack) return { score: 0, label: 'Unknown track' }

  let score = 0
  const reasons = []

  if (turfCourse === 'Epsom') {
    score -= 6
    reasons.push('Epsom — unique undulating test, AW form unreliable')
  } else if (turfCourse === 'Carlisle') {
    score -= 5
    reasons.push('Carlisle — stiff uphill finish, AW form rarely transfers')
  } else if (turfCourse === 'Ascot') {
    score -= 2
    reasons.push('Ascot — stiff but conventional galloping, moderate AW risk')
  } else if (turfTrack.uphillFinish && turfTrack.undulating) {
    score -= 4
    reasons.push('Stiff undulating track — AW form less reliable')
  } else if (turfTrack.uphillFinish) {
    score -= 3
    reasons.push('Uphill finish — tests stamina AW horses may lack')
  } else if (turfTrack.undulating && !turfTrack.galloping) {
    score -= 3
    reasons.push('Undulating non-galloping — balance needed')
  }

  if (turfTrack.layoutCategory === 'stiff' && !turfTrack.undulating && !turfTrack.uphillFinish) {
    score -= 1
    reasons.push('Stiff track — moderate AW transfer risk')
  }

  return { score, label: reasons.join('; ') || 'Fair track for AW transfer' }
}

function computePerformanceScaling(awRuns) {
  const total = awRuns.length
  if (total === 0) return { multiplier: 0, label: 'No AW runs' }

  const wins = awRuns.filter(r => r.position === 1).length
  const places = awRuns.filter(r => r.position <= 3).length
  const winRate = wins / total
  const placeRate = places / total

  let multiplier = 0

  if (winRate >= 0.4 && total >= 3) {
    multiplier = 1.0
  } else if (winRate >= 0.25 && total >= 4) {
    multiplier = 0.85
  } else if (placeRate >= 0.5 && total >= 3) {
    multiplier = 0.7
  } else if (winRate >= 0.15 || placeRate >= 0.35) {
    multiplier = 0.5
  } else if (total >= 3 && wins === 0 && places <= 1) {
    multiplier = 0.1
  } else if (total >= 2) {
    multiplier = 0.3
  } else {
    multiplier = 0.15
  }

  return {
    multiplier,
    winRate: Math.round(winRate * 100),
    placeRate: Math.round(placeRate * 100),
    wins,
    places,
    label: `${wins}W/${places}P from ${total} AW runs (${Math.round(winRate * 100)}% SR)`,
  }
}

function detectDominantAtOR(awRuns, currentOR) {
  if (!currentOR || currentOR <= 0 || awRuns.length < 2) {
    return { isDominant: false, score: 0, label: '' }
  }

  const winsAtOR = awRuns.filter(r => {
    const runOR = r.bha || 0
    return r.position === 1 && runOR > 0 && Math.abs(runOR - currentOR) <= 5
  })

  const placesAtOR = awRuns.filter(r => {
    const runOR = r.bha || 0
    return r.position <= 3 && runOR > 0 && Math.abs(runOR - currentOR) <= 5
  })

  const runsAtOR = awRuns.filter(r => {
    const runOR = r.bha || 0
    return runOR > 0 && Math.abs(runOR - currentOR) <= 5
  })

  if (runsAtOR.length === 0) {
    return { isDominant: false, score: 0, label: 'No runs at current OR' }
  }

  const winRate = winsAtOR.length / runsAtOR.length
  const placeRate = placesAtOR.length / runsAtOR.length

  let score = 0
  let label = ''

  if (winsAtOR.length >= 2 && winRate >= 0.5) {
    score = 3
    label = `Dominant at OR ${currentOR} — ${winsAtOR.length}W/${placesAtOR.length}P from ${runsAtOR.length} runs (${Math.round(winRate * 100)}% SR)`
  } else if (winsAtOR.length >= 1 && winRate >= 0.33) {
    score = 2
    label = `Strong at OR ${currentOR} — ${winsAtOR.length}W/${placesAtOR.length}P from ${runsAtOR.length} runs`
  } else if (placeRate >= 0.5) {
    score = 1
    label = `Competitive at OR ${currentOR} — ${placesAtOR.length} places from ${runsAtOR.length} runs`
  }

  return {
    isDominant: score >= 2,
    score,
    label,
    winsAtOR: winsAtOR.length,
    placesAtOR: placesAtOR.length,
    runsAtOR: runsAtOR.length,
    winRate: Math.round(winRate * 100),
    placeRate: Math.round(placeRate * 100),
  }
}

function detectAWSpecialist(awRuns, turfRuns) {
  if (awRuns.length < 3) return { isSpecialist: false, score: 0, label: '' }

  const awRatings = awRuns.map(r => Number(r.bha) || 0).filter(r => r > 0)
  const turfRatings = turfRuns.map(r => Number(r.bha) || 0).filter(r => r > 0)

  const bestAW = awRatings.length > 0 ? Math.max(...awRatings) : 0
  const bestTurf = turfRatings.length > 0 ? Math.max(...turfRatings) : 0

  const ratingGap = bestAW - bestTurf

  let score = 0
  let label = ''

  if (ratingGap >= 13) {
    score = -6
    label = `AW specialist — best AW ${bestAW} vs best turf ${bestTurf} (gap ${ratingGap})`
  } else if (ratingGap >= 8) {
    score = -4
    label = `AW specialist — best AW ${bestAW} vs best turf ${bestTurf} (gap ${ratingGap})`
  } else if (ratingGap >= 4) {
    score = -2
    label = `AW-preferred — best AW ${bestAW} vs best turf ${bestTurf} (gap ${ratingGap})`
  } else if (ratingGap >= 0 && bestAW > 0 && bestTurf > 0) {
    score = 0
    label = `Dual-surface — best AW ${bestAW} vs best turf ${bestTurf}`
  } else if (bestTurf === 0 && awRuns.length >= 3) {
    const awWins = awRuns.filter(r => r.position === 1).length
    const awWinRate = awWins / awRuns.length
    if (awWinRate >= 0.3) {
      score = -3
      label = `AW-only — ${Math.round(awWinRate * 100)}% AW SR, no turf form`
    } else {
      score = -1
      label = `AW-only — no turf form`
    }
  } else {
    const awWins = awRuns.filter(r => r.position === 1).length
    const awPlaces = awRuns.filter(r => r.position <= 3).length
    const awWinRate = awWins / awRuns.length
    const awPlaceRate = awPlaces / awRuns.length
    const turfWins = turfRuns.filter(r => r.position === 1).length
    const turfPlaces = turfRuns.filter(r => r.position <= 3).length
    const turfWinRate = turfRuns.length > 0 ? turfWins / turfRuns.length : 0
    const turfPlaceRate = turfRuns.length > 0 ? turfPlaces / turfRuns.length : 0

    if (awWinRate >= 0.3 && turfWinRate <= 0.05 && awRuns.length >= 4) {
      score = -2
      label = `AW specialist — ${Math.round(awWinRate * 100)}% AW SR vs ${Math.round(turfWinRate * 100)}% turf SR`
    } else if (awPlaceRate >= 0.6 && turfPlaceRate <= 0.2 && awRuns.length >= 4) {
      score = -1
      label = `AW-dependent — ${Math.round(awPlaceRate * 100)}% AW PR vs ${Math.round(turfPlaceRate * 100)}% turf PR`
    }
  }

  return {
    isSpecialist: score <= -4,
    score,
    label,
    bestAW,
    bestTurf,
    ratingGap,
  }
}

export function evaluateAWTransfer(previousResults, turfCourse, turfGoing, raceDistanceF = 0, currentOR = 0) {
  if (!previousResults || previousResults.length === 0) {
    return { hasAWForm: false, adjustment: 0, label: 'No previous form' }
  }

  const awRuns = []
  const turfRuns = []

  for (const run of previousResults) {
    const course = run.course_name || ''
    const track = profiles.tracks[course]
    if (track && track.aw) {
      awRuns.push({ ...run, track, courseName: course })
    } else {
      turfRuns.push(run)
    }
  }

  if (awRuns.length === 0) {
    return { hasAWForm: false, adjustment: 0, label: 'No AW form' }
  }

  const surfaceTypes = [...new Set(awRuns.map(r => r.track.surfaceType))]
  const primarySurface = surfaceTypes.sort((a, b) =>
    awRuns.filter(r => r.track.surfaceType === b).length -
    awRuns.filter(r => r.track.surfaceType === a).length
  )[0]

  const awCourses = [...new Set(awRuns.map(r => r.courseName))]
  const primaryAWCourse = awCourses.sort((a, b) =>
    awRuns.filter(r => r.courseName === b).length -
    awRuns.filter(r => r.courseName === a).length
  )[0]

  const courseMultiplier = AW_COURSE_MULTIPLIER[primaryAWCourse] || 1.0
  const turfTrack = profiles.tracks[turfCourse]
  const goingCheck = isGoingCompatible(primarySurface, turfGoing)
  const trackCheck = assessTrackTransfer(turfTrack, turfCourse)
  const layoutCheck = layoutMatch(awCourses, turfTrack)
  const distCheck = distanceModifier(raceDistanceF)
  const perfCheck = computePerformanceScaling(awRuns)
  const specialistCheck = detectAWSpecialist(awRuns, turfRuns)

  let baseAdjustment = 0

  if (perfCheck.winRate >= 30 && goingCheck.compatible && trackCheck.score >= 0) {
    baseAdjustment = 5
  } else if (perfCheck.winRate >= 20 && goingCheck.compatible) {
    baseAdjustment = 3
  } else if (perfCheck.winRate >= 15 || perfCheck.placeRate >= 40) {
    baseAdjustment = 1
  } else if (awRuns.length >= 3 && perfCheck.wins === 0) {
    baseAdjustment = -2
  } else {
    baseAdjustment = 0
  }

  baseAdjustment += goingCheck.score / 5
  baseAdjustment += trackCheck.score / 3
  baseAdjustment += layoutCheck.score

  let adjustment = baseAdjustment * courseMultiplier * distCheck.multiplier * perfCheck.multiplier

  if (specialistCheck.score <= -4) {
    adjustment = specialistCheck.score
  } else if (specialistCheck.score < 0) {
    adjustment = Math.min(adjustment, specialistCheck.score)
  }

  adjustment = Math.round(Math.max(-8, Math.min(8, adjustment)) * 10) / 10

  const label = specialistCheck.isSpecialist
    ? `AW SPECIALIST — ${specialistCheck.label}`
    : perfCheck.label

  const turfWins = turfRuns.filter(r => r.position === 1).length

  return {
    hasAWForm: true,
    adjustment,
    label,
    awRuns: awRuns.length,
    awWins: perfCheck.wins,
    awPlaces: perfCheck.places,
    awWinRate: perfCheck.winRate,
    awPlaceRate: perfCheck.placeRate,
    turfRuns: turfRuns.length,
    turfWins,
    primarySurface,
    primaryAWCourse,
    courseMultiplier,
    goingCompatible: goingCheck.compatible,
    goingNote: goingCheck.reason,
    trackNote: trackCheck.label,
    layoutNote: layoutCheck.note,
    distanceNote: distCheck.note,
    isAWSpecialist: specialistCheck.isSpecialist,
    specialistScore: specialistCheck.score,
    specialistNote: specialistCheck.label,
    bestAW: specialistCheck.bestAW,
    bestTurf: specialistCheck.bestTurf,
    ratingGap: specialistCheck.ratingGap,
    totalRuns: previousResults.length,
  }
}
