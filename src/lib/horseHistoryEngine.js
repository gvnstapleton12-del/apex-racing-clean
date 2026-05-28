// Horse Memory Engine
// Historical rating tracking for ability context

/**
 * @typedef {Object} HorseRun
 * @property {string} horse
 * @property {string} [horseId]
 * @property {string} date
 * @property {string} course
 * @property {number} distance
 * @property {string} going
 * @property {number} or
 * @property {number} rpr
 * @property {number} finishPos
 * @property {number} [odds]
 * @property {string} [class]
 * @property {boolean} [won]
 */

/**
 * @typedef {Object} HorseHistory
 * @property {string} horse
 * @property {string} [horseId]
 * @property {HorseRun[]} runs
 * @property {number} peakRPR
 * @property {number} peakOR
 * @property {number|null} lastWinOR
 * @property {number|null} lastWinRPR
 * @property {number} avgRPR
 * @property {number} recentRPR
 * @property {number} olderRPR
 * @property {number} rprTrend
 * @property {number|null} bestDistance
 * @property {string|null} bestGoing
 * @property {string|null} bestCourse
 */

const HORSE_HISTORY_DB = new Map()

/**
 * @param {HorseRun} run
 */
export function addHorseRun(run) {
  const key = run.horseId || run.horse.toLowerCase()
  
  if (!HORSE_HISTORY_DB.has(key)) {
    HORSE_HISTORY_DB.set(key, {
      horse: run.horse,
      horseId: run.horseId,
      runs: [],
      peakRPR: 0,
      peakOR: 0,
      lastWinOR: null,
      lastWinRPR: null,
      avgRPR: 0,
      recentRPR: 0,
      olderRPR: 0,
      rprTrend: 0,
      bestDistance: null,
      bestGoing: null,
      bestCourse: null,
    })
  }
  
  const history = HORSE_HISTORY_DB.get(key)
  history.runs.unshift(run)
  
  // Update peak values
  if (run.rpr > 0 && run.rpr > history.peakRPR) {
    history.peakRPR = run.rpr
  }
  if (run.or > 0 && run.or > history.peakOR) {
    history.peakOR = run.or
  }
  
  // Track last winning OR/RPR
  if (run.finishPos === 1 && run.or > 0) {
    history.lastWinOR = run.or
  }
  if (run.finishPos === 1 && run.rpr > 0) {
    history.lastWinRPR = run.rpr
  }
  
  // Recalculate averages and trends
  recalculateMetrics(history)
}

/**
 * @param {HorseHistory} history
 */
function recalculateMetrics(history) {
  const validRPR = history.runs.filter(r => r.rpr > 0).map(r => r.rpr)
  
  if (validRPR.length > 0) {
    history.avgRPR = validRPR.reduce((a, b) => a + b, 0) / validRPR.length
    
    // Recent vs older RPR trend
    const recent = validRPR.slice(0, 3)
    const older = validRPR.slice(3, 6)
    
    history.recentRPR = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : history.avgRPR
    history.olderRPR = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : history.avgRPR
    history.rprTrend = history.recentRPR - history.olderRPR
  }
  
  // Find best conditions
  const wins = history.runs.filter(r => r.finishPos === 1)
  if (wins.length > 0) {
    const distanceFreq = {}
    const goingFreq = {}
    const courseFreq = {}
    
    wins.forEach(w => {
      distanceFreq[w.distance] = (distanceFreq[w.distance] || 0) + 1
      goingFreq[w.going] = (goingFreq[w.going] || 0) + 1
      courseFreq[w.course] = (courseFreq[w.course] || 0) + 1
    })
    
    history.bestDistance = Object.keys(distanceFreq)
      .reduce((a, b) => distanceFreq[a] > distanceFreq[b] ? a : b, Object.keys(distanceFreq)[0])
    history.bestGoing = Object.keys(goingFreq)
      .reduce((a, b) => goingFreq[a] > goingFreq[b] ? a : b, Object.keys(goingFreq)[0])
    history.bestCourse = Object.keys(courseFreq)
      .reduce((a, b) => courseFreq[a] > courseFreq[b] ? a : b, Object.keys(courseFreq)[0])
  }
}

/**
 * @param {string} horse
 * @param {string} [horseId]
 * @returns {HorseHistory|null}
 */
export function getHorseHistory(horse, horseId) {
  const key = horseId || horse.toLowerCase()
  return HORSE_HISTORY_DB.get(key) || null
}

/**
 * @param {number} currentOR
 * @param {HorseHistory|null} history
 * @returns {number}
 */
export function calculateORDelta(currentOR, history) {
  if (!history || !history.lastWinOR || currentOR <= 0) {
    return 0
  }
  return currentOR - history.lastWinOR
}

/**
 * @param {number} currentOR
 * @param {HorseHistory|null} history
 * @returns {number}
 */
export function calculatePeakRPRGap(currentOR, history) {
  if (!history || history.peakRPR <= 0 || currentOR <= 0) {
    return 0
  }
  return history.peakRPR - currentOR
}

/**
 * @param {HorseHistory|null} history
 * @returns {number}
 */
export function calculateRPRtrend(history) {
  if (!history) {
    return 0
  }
  return history.rprTrend
}

/**
 * @param {number} currentOR
 * @param {HorseHistory|null} history
 * @returns {number}
 */
export function calculateHandicapRecoveryScore(currentOR, history) {
  if (!history || !history.lastWinOR) {
    return 50
  }
  
  const delta = currentOR - history.lastWinOR
  
  // Below last winning mark = dangerous
  if (delta <= -8) return 95
  if (delta <= -5) return 85
  if (delta <= -3) return 75
  if (delta <= 0) return 65
  
  // Above last winning mark
  if (delta <= 5) return 50
  if (delta <= 10) return 35
  return 25
}

/**
 * @param {number} currentOR
 * @param {number} currentRPR
 * @param {HorseHistory|null} history
 * @returns {number}
 */
export function calculateAbilityFromHistory(currentOR, currentRPR, history) {
  if (!history || history.runs.length === 0) {
    // Fallback to current ratings only
    if (currentOR > 0) return Math.min(100, (currentOR / 150) * 60)
    if (currentRPR > 0) return Math.min(100, (currentRPR / 150) * 50)
    return 50
  }
  
  let score = 50
  
  // Current OR base (40% weight)
  if (currentOR > 0) {
    score += ((currentOR / 150) * 60 - 50) * 0.4
  }
  
  // Current RPR (20% weight)
  if (currentRPR > 0) {
    score += ((currentRPR / 150) * 50 - 50) * 0.2
  }
  
  // Peak RPR gap - horses retaining ability (15% weight)
  const peakGap = calculatePeakRPRGap(currentOR, history)
  if (peakGap >= 10) {
    score += 15
  } else if (peakGap >= 5) {
    score += 10
  } else if (peakGap >= 0) {
    score += 5
  }
  
  // OR delta - handicap position (15% weight)
  const orDelta = calculateORDelta(currentOR, history)
  if (orDelta <= -8) {
    score += 20
  } else if (orDelta <= -5) {
    score += 15
  } else if (orDelta <= -3) {
    score += 10
  } else if (orDelta <= 0) {
    score += 5
  } else if (orDelta <= 5) {
    score -= 5
  } else if (orDelta <= 10) {
    score -= 10
  } else {
    score -= 15
  }
  
  // RPR trend - improving/declining (10% weight)
  const trend = calculateRPRtrend(history)
  if (trend >= 10) {
    score += 12
  } else if (trend >= 5) {
    score += 8
  } else if (trend >= 0) {
    score += 3
  } else if (trend >= -5) {
    score -= 5
  } else {
    score -= 10
  }
  
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10))
}

/**
 * @param {HorseHistory|null} history
 * @returns {{ distance?: number, going?: string, course?: string }}
 */
export function getBestConditions(history) {
  if (!history) {
    return {}
  }
  
  return {
    distance: history.bestDistance ? Number(history.bestDistance) : undefined,
    going: history.bestGoing || undefined,
    course: history.bestCourse || undefined,
  }
}

/**
 * @param {string} horse
 * @param {string} formString
 * @param {number} [currentOR]
 * @returns {HorseHistory|null}
 */
export function loadHorseHistoryFromForm(horse, formString, currentOR = 0) {
  // Parse form string like "1-2-3-1-4" into runs
  // This is a simplified loader - full implementation would parse detailed form
  const positions = formString.split(/[-\s]+/).map(p => parseInt(p.trim())).filter(p => !isNaN(p))
  
  if (positions.length === 0) {
    return null
  }
  
  const history = {
    horse,
    runs: positions.map((pos, i) => ({
      horse,
      date: new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      course: 'Unknown',
      distance: 0,
      going: 'Unknown',
      or: currentOR - i * 2,
      rpr: currentOR - i * 2,
      finishPos: pos,
      won: pos === 1,
    })),
    peakRPR: 0,
    peakOR: 0,
    lastWinOR: null,
    lastWinRPR: null,
    avgRPR: 0,
    recentRPR: 0,
    olderRPR: 0,
    rprTrend: 0,
    bestDistance: null,
    bestGoing: null,
    bestCourse: null,
  }
  
  recalculateMetrics(history)
  return history
}

export function clearHorseHistory() {
  HORSE_HISTORY_DB.clear()
}

/**
 * @returns {Record<string, HorseHistory>}
 */
export function exportHorseHistory() {
  return Object.fromEntries(HORSE_HISTORY_DB)
}

/**
 * @param {Record<string, HorseHistory>} data
 */
export function importHorseHistory(data) {
  Object.entries(data).forEach(([key, history]) => {
    HORSE_HISTORY_DB.set(key, history)
  })
}
