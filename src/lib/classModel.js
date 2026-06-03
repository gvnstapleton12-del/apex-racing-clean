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
