export function classifyClassLevel(className, raceClass) {
  const cls = Number(raceClass || 0) || parseClassString(className)
  if (cls <= 1) return { level: 'GROUP', label: 'Group/Pattern', tier: 1 }
  if (cls === 2) return { level: 'CLASS_2', label: 'Class 2', tier: 2 }
  if (cls === 3) return { level: 'CLASS_3', label: 'Class 3', tier: 3 }
  if (cls === 4) return { level: 'CLASS_4', label: 'Class 4', tier: 4 }
  if (cls === 5) return { level: 'CLASS_5', label: 'Class 5', tier: 5 }
  if (cls === 6) return { level: 'CLASS_6', label: 'Class 6', tier: 6 }
  return { level: 'UNRATED', label: 'Unclassified', tier: 7 }
}

function parseClassString(str) {
  if (!str) return 0
  const m = String(str).match(/(\d)/)
  return m ? parseInt(m[1]) : 0
}

export function computeClassFit(horseClassHistory, currentClassLevel) {
  if (!horseClassHistory || horseClassHistory.length === 0) {
    return { fit: 0.5, label: 'Unknown', note: 'No class history' }
  }

  const currentTier = currentClassLevel.tier

  const wins = horseClassHistory.filter(r => r.position === 1)
  const tierWins = {}
  for (const w of wins) {
    const t = w.classTier || 5
    tierWins[t] = (tierWins[t] || 0) + 1
  }

  const winsAtCurrentTier = tierWins[currentTier] || 0
  const winsAtHigherTier = Object.entries(tierWins)
    .filter(([t]) => Number(t) < currentTier)
    .reduce((s, [, c]) => s + c, 0)
  const winsAtLowerTier = Object.entries(tierWins)
    .filter(([t]) => Number(t) > currentTier)
    .reduce((s, [, c]) => s + c, 0)

  const totalRuns = horseClassHistory.length
  const totalWins = wins.length
  const winRate = totalRuns > 0 ? totalWins / totalRuns : 0

  let fit = 0.5
  let label = 'Unproven'
  let note = ''

  if (winsAtCurrentTier > 0) {
    fit = 0.7 + Math.min(0.25, winsAtCurrentTier * 0.05)
    label = 'Proven at level'
    note = `${winsAtCurrentTier} wins at Class ${currentTier}`
  } else if (winsAtHigherTier > 0) {
    fit = 0.6
    label = 'Drops in class'
    note = `Class ${currentTier} winner stepping down`
  } else if (winsAtLowerTier > 0 && winRate > 0.15) {
    fit = 0.4
    label = 'Rises in class'
    note = `Wins at lower level but stepping up`
  } else if (totalRuns <= 2) {
    fit = 0.5
    label = 'Unexposed'
    note = `${totalRuns} runs only`
  } else {
    fit = Math.max(0.2, 0.5 - (currentTier - 5) * 0.05)
    label = 'Outclassed'
    note = `No wins at or above Class ${currentTier}`
  }

  return { fit, label, note, winsAtCurrentTier, winsAtHigherTier, winsAtLowerTier, winRate }
}

export function computeORFit(horseOR, currentOR, raceClass) {
  if (!horseOR || !currentOR) return { fit: 0.5, label: 'Unknown' }

  const diff = horseOR - currentOR
  let fit = 0.5
  let label = 'On rating'

  if (diff >= 10) {
    fit = 0.8
    label = 'Well handicapped'
  } else if (diff >= 5) {
    fit = 0.65
    label = 'Handicapped to win'
  } else if (diff >= -5) {
    fit = 0.5
    label = 'On rating'
  } else if (diff >= -10) {
    fit = 0.35
    label = 'High in weights'
  } else {
    fit = 0.2
    label = 'Exposed to handicap'
  }

  return { fit, label, diff }
}

export function computeRPRORFit(rpr, or, isHandicap, bhaTrend = 0, previousResults = [], computePerformanceRatingFn = null, raceType = '') {
  const hasRPR = rpr && or && rpr > 0 && or > 0
  const hasBHATrend = or > 0 && bhaTrend !== 0
  const hasPrevResults = previousResults && previousResults.length > 0

  if (!hasRPR && !hasBHATrend && !hasPrevResults) {
    return { gap: 0, adjustment: 0, label: 'No data', source: 'none' }
  }

  let gap, source

  if (hasRPR) {
    gap = rpr - or
    source = 'RPR'
  } else if (hasPrevResults && or > 0 && computePerformanceRatingFn) {
    const pr = computePerformanceRatingFn(previousResults, or, raceType)
    if (pr.runs > 0) {
      gap = pr.gap
      source = 'PR'
    }
  }

  if (!source) {
    if (hasBHATrend) {
      gap = -bhaTrend * 2.5
      source = 'BHA trend'
    } else {
      return { gap: 0, adjustment: 0, label: 'No data', source: 'none' }
    }
  }

  let adjustment = 0
  let label = 'Even'

  if (gap >= 15) {
    adjustment = isHandicap ? 5 : 3
    label = 'Well ahead of mark'
  } else if (gap >= 10) {
    adjustment = isHandicap ? 4 : 2
    label = 'Ahead of mark'
  } else if (gap >= 5) {
    adjustment = isHandicap ? 2.5 : 1.5
    label = 'Slightly ahead'
  } else if (gap >= -5) {
    adjustment = 0
    label = 'Even'
  } else if (gap >= -10) {
    adjustment = isHandicap ? -2 : -1
    label = 'Behind mark'
  } else {
    adjustment = isHandicap ? -4 : -2
    label = 'Well behind mark'
  }

  return { gap, adjustment, label, source }
}

export function computeWeightFit(lbs, fieldSize) {
  if (!lbs) return { fit: 0.5, impact: 'neutral' }
  const weight = Number(lbs) || 0
  if (weight <= 0) return { fit: 0.5, impact: 'neutral' }

  let fit = 0.5
  let impact = 'neutral'

  if (weight >= 140) {
    fit = 0.3
    impact = 'heavy'
  } else if (weight >= 130) {
    fit = 0.4
    impact = 'above average'
  } else if (weight >= 120) {
    fit = 0.5
    impact = 'average'
  } else if (weight >= 110) {
    fit = 0.6
    impact = 'below average'
  } else {
    fit = 0.7
    impact = 'light'
  }

  return { fit, impact }
}

const OR_BANDS = [
  { key: '0_60', min: 0, max: 60, label: 'Low (<60)' },
  { key: '60_75', min: 60, max: 75, label: 'Below Average (60-74)' },
  { key: '75_85', min: 75, max: 85, label: 'Average (75-84)' },
  { key: '85_95', min: 85, max: 95, label: 'Above Average (85-94)' },
  { key: '95_105', min: 95, max: 105, label: 'Good (95-104)' },
  { key: '105_plus', min: 105, max: Infinity, label: 'High (105+)' },
]

function classifyORBand(or) {
  const n = Number(or) || 0
  for (const band of OR_BANDS) {
    if (n >= band.min && n < band.max) return band.key
  }
  return n >= 105 ? '105_plus' : '0_60'
}

export function buildORHistory(records = []) {
  const history = {}

  for (const rec of records) {
    const horse = rec.horse
    const or = Number(rec.or || 0)
    const won = rec.won || rec.position === 1
    const placed = rec.position && rec.position <= 3

    if (!horse || or <= 0) continue
    if (!history[horse]) {
      history[horse] = { runs: 0, wins: 0, places: 0, bands: {} }
      for (const band of OR_BANDS) {
        history[horse].bands[band.key] = { runs: 0, wins: 0, places: 0 }
      }
    }

    const bandKey = classifyORBand(or)
    history[horse].runs++
    if (won) history[horse].wins++
    if (placed) history[horse].places++
    history[horse].bands[bandKey].runs++
    if (won) history[horse].bands[bandKey].wins++
    if (placed) history[horse].bands[bandKey].places++
  }

  return history
}

export function getHorseORProfile(horseName, orHistory) {
  if (!horseName || !orHistory?.[horseName]) return null

  const data = orHistory[horseName]
  if (data.runs < 2) return null

  const bands = {}
  let bestBand = null
  let bestWinRate = 0

  for (const band of OR_BANDS) {
    const b = data.bands[band.key]
    const winRate = b.runs > 0 ? b.wins / b.runs : 0
    const placeRate = b.runs > 0 ? b.places / b.runs : 0
    bands[band.key] = {
      label: band.label,
      runs: b.runs,
      wins: b.wins,
      places: b.places,
      winRate: Math.round(winRate * 100),
      placeRate: Math.round(placeRate * 100),
    }
    if (b.runs >= 2 && winRate > bestWinRate) {
      bestWinRate = winRate
      bestBand = band.key
    }
  }

  const overallWinRate = data.runs > 0 ? data.wins / data.runs : 0

  return {
    horse: horseName,
    totalRuns: data.runs,
    totalWins: data.wins,
    totalPlaces: data.places,
    overallWinRate: Math.round(overallWinRate * 100),
    bestORBand: bestBand ? OR_BANDS.find(b => b.key === bestBand)?.label : 'Unknown',
    bestORWinRate: Math.round(bestWinRate * 100),
    bands,
  }
}

export function computeORProfileAdjustment(horseName, currentOR, orHistory) {
  const profile = getHorseORProfile(horseName, orHistory)
  if (!profile) return { adjustment: 0, label: 'No data', profile: null }

  const currentBand = classifyORBand(currentOR)
  const bandData = profile.bands[currentBand]

  if (!bandData || bandData.runs < 2) {
    return { adjustment: 0, label: 'Unproven at this level', profile }
  }

  const bandWinRate = bandData.winRate / 100
  const overallWinRate = profile.overallWinRate / 100

  if (bandWinRate > overallWinRate * 1.5 && bandWinRate > 0.15) {
    return { adjustment: 3, label: `Thrives at OR ${currentBand.replace('_', '-')}`, profile }
  } else if (bandWinRate > overallWinRate * 1.2) {
    return { adjustment: 1.5, label: `Slightly above average at this level`, profile }
  } else if (bandWinRate < overallWinRate * 0.5 && bandData.runs >= 3) {
    return { adjustment: -2, label: `Struggles at OR ${currentBand.replace('_', '-')}`, profile }
  } else if (bandWinRate < overallWinRate * 0.8 && bandData.runs >= 3) {
    return { adjustment: -1, label: `Below average at this level`, profile }
  }

  return { adjustment: 0, label: 'Average at this level', profile }
}
