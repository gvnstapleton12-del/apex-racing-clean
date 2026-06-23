// Horse Memory Intelligence Engine
// Historical handicap and performance analysis

function computeHorseMemory(runs, horseName, currentOR) {
  if (!runs || !runs.length) return null
  const peakRPR = Math.max(...runs.map(r => r.rpr_rating || 0), 0)
  const peakOR = Math.max(...runs.map(r => r.or_rating || 0), 0)
  const winningRuns = runs.filter(r => r.finish_position === 1)
  const lastWinningOR = winningRuns[0]?.or_rating || null
  const lastWinningRPR = winningRuns[0]?.rpr_rating || null
  const validRPR = runs.filter(r => r.rpr_rating > 0).map(r => r.rpr_rating)
  const avgRPR = validRPR.length > 0 ? validRPR.reduce((a, b) => a + b, 0) / validRPR.length : 0
  const recentRPR = validRPR.slice(0, 3).reduce((a, b) => a + b, 0) / 3 || 0
  const olderRPR = validRPR.slice(3, 6).reduce((a, b) => a + b, 0) / 3 || 0
  const rprTrend = recentRPR - olderRPR
  const bestDistance = getMostFrequent(winningRuns.map(r => r.distance_furlongs).filter(Boolean))
  const bestGoing = getMostFrequent(winningRuns.map(r => r.going).filter(Boolean))
  const bestCourse = getMostFrequent(winningRuns.map(r => r.course).filter(Boolean))
  return {
    horseName,
    runsCount: runs.length,
    peakRPR, peakOR, lastWinningOR, lastWinningRPR,
    currentVsPeak: currentOR > 0 && peakRPR > 0 ? currentOR - peakRPR : 0,
    currentVsLastWin: currentOR > 0 && lastWinningOR ? currentOR - lastWinningOR : 0,
    avgRPR: Math.round(avgRPR * 10) / 10,
    recentRPR: Math.round(recentRPR * 10) / 10,
    olderRPR: Math.round(olderRPR * 10) / 10,
    rprTrend: Math.round(rprTrend * 10) / 10,
    bestDistance, bestGoing, bestCourse,
    wins: winningRuns.length,
    winRate: runs.length > 0 ? Math.round((winningRuns.length / runs.length) * 100) : 0,
  }
}

export async function getHorseMemory(db, horseName, currentOR) {
  if (!db || !horseName) return null
  try {
    const runs = await db.all(
      `SELECT * FROM horse_runs WHERE horse_name = ? ORDER BY race_date DESC LIMIT 50`,
      [horseName]
    )
    return computeHorseMemory(runs, horseName, currentOR)
  } catch (error) {
    console.error('Error getting horse memory:', error.message)
    return null
  }
}

export async function getHorseMemoryBatch(db, horseNames, currentORByHorse = {}) {
  if (!db || !horseNames.length) return {}
  const unique = [...new Set(horseNames.filter(Boolean))]
  if (!unique.length) return {}
  try {
    const placeholders = unique.map(() => '?').join(',')
    const rows = await db.all(
      `SELECT * FROM horse_runs WHERE horse_name IN (${placeholders}) ORDER BY horse_name, race_date DESC LIMIT 50`,
      unique
    )
    const byHorse = {}
    for (const row of rows) {
      if (!byHorse[row.horse_name]) byHorse[row.horse_name] = []
      if (byHorse[row.horse_name].length < 50) byHorse[row.horse_name].push(row)
    }
    const result = {}
    for (const name of unique) {
      const runs = byHorse[name] || []
      const or = currentORByHorse[name] || 0
      result[name] = computeHorseMemory(runs, name, or)
    }
    return result
  } catch (error) {
    console.error('Error getting horse memory batch:', error.message)
    return {}
  }
}

export async function getHorseMemoryBatchBefore(db, horseNames, currentORByHorse = {}, beforeDate) {
  if (!db || !horseNames.length) return {}
  const unique = [...new Set(horseNames.filter(Boolean))]
  if (!unique.length) return {}
  try {
    const placeholders = unique.map(() => '?').join(',')
    const dateClause = beforeDate ? ` AND race_date < ?` : ''
    const params = beforeDate ? [...unique, beforeDate] : unique
    const rows = await db.all(
      `SELECT * FROM horse_runs WHERE horse_name IN (${placeholders})${dateClause} ORDER BY horse_name, race_date DESC LIMIT 50`,
      params
    )
    const byHorse = {}
    for (const row of rows) {
      if (!byHorse[row.horse_name]) byHorse[row.horse_name] = []
      if (byHorse[row.horse_name].length < 50) byHorse[row.horse_name].push(row)
    }
    const result = {}
    for (const name of unique) {
      const runs = byHorse[name] || []
      const or = currentORByHorse[name] || 0
      result[name] = computeHorseMemory(runs, name, or)
    }
    return result
  } catch (error) {
    console.error('Error getting horse memory batch before date:', error.message)
    return {}
  }
}

export function calculateHandicapScore(memory, currentOR) {
  if (!memory || !currentOR) {
    return { score: 50, label: 'Unknown', details: {} }
  }
  
  let score = 50
  const details = {}
  
  // OR Delta vs Last Win
  if (memory.lastWinningOR) {
    const orDelta = currentOR - memory.lastWinningOR
    details.orDelta = orDelta
    
    if (orDelta <= -8) {
      score += 25
      details.orLabel = 'Very Dangerous'
    } else if (orDelta <= -5) {
      score += 18
      details.orLabel = 'Well Treated'
    } else if (orDelta <= -3) {
      score += 12
      details.orLabel = 'Favourable'
    } else if (orDelta <= 0) {
      score += 6
      details.orLabel = 'Neutral'
    } else if (orDelta <= 5) {
      score -= 5
      details.orLabel = 'Slightly High'
    } else if (orDelta <= 10) {
      score -= 12
      details.orLabel = 'High'
    } else {
      score -= 20
      details.orLabel = 'Very High'
    }
  }
  
  // Peak RPR Gap
  if (memory.peakRPR > 0) {
    const peakGap = memory.peakRPR - currentOR
    details.peakGap = peakGap
    
    if (peakGap >= 15) {
      score += 15
      details.peakLabel = 'Massive Class'
    } else if (peakGap >= 10) {
      score += 10
      details.peakLabel = 'Hidden Class'
    } else if (peakGap >= 5) {
      score += 6
      details.peakLabel = 'Some Class'
    } else if (peakGap >= 0) {
      score += 3
      details.peakLabel = 'Consistent'
    } else {
      score -= 5
      details.peakLabel = 'Below Peak'
    }
  }
  
  // RPR Trend
  if (memory.rprTrend !== 0) {
    details.rprTrend = memory.rprTrend
    
    if (memory.rprTrend >= 10) {
      score += 12
      details.trendLabel = 'Rapidly Improving'
    } else if (memory.rprTrend >= 5) {
      score += 8
      details.trendLabel = 'Improving'
    } else if (memory.rprTrend >= 0) {
      score += 3
      details.trendLabel = 'Stable'
    } else if (memory.rprTrend >= -5) {
      score -= 5
      details.trendLabel = 'Declining'
    } else {
      score -= 10
      details.trendLabel = 'Rapidly Declining'
    }
  }
  
  // Win Rate Context
  if (memory.winRate >= 30) {
    score += 8
    details.winLabel = 'High Strike Rate'
  } else if (memory.winRate >= 20) {
    score += 5
    details.winLabel = 'Good Strike Rate'
  } else if (memory.winRate >= 15) {
    score += 3
    details.winLabel = 'Average'
  }
  
  const normalizedScore = Math.max(0, Math.min(100, score))
  
  let label
  if (normalizedScore >= 80) label = 'Elite Handicap'
  else if (normalizedScore >= 65) label = 'Well Handicapped'
  else if (normalizedScore >= 50) label = 'Fair'
  else if (normalizedScore >= 35) label = 'Poor'
  else label = 'Very Poor'
  
  return {
    score: Math.round(normalizedScore * 10) / 10,
    label,
    details,
  }
}

export function calculateAbilityFromMemory(memory, currentOR, currentRPR) {
  if (!memory || memory.runsCount === 0) {
    // Fallback to current ratings only
    if (currentOR > 0) return Math.min(100, (currentOR / 150) * 60)
    if (currentRPR > 0) return Math.min(100, (currentRPR / 150) * 50)
    return 50
  }
  
  let score = 50
  
  // Current OR base (35% weight)
  if (currentOR > 0) {
    score += ((currentOR / 150) * 60 - 50) * 0.35
  }
  
  // Current RPR (15% weight)
  if (currentRPR > 0) {
    score += ((currentRPR / 150) * 50 - 50) * 0.15
  }
  
  // Peak RPR gap - horses retaining ability (20% weight)
  if (memory.peakRPR > 0 && currentOR > 0) {
    const peakGap = memory.peakRPR - currentOR
    if (peakGap >= 15) score += 20
    else if (peakGap >= 10) score += 15
    else if (peakGap >= 5) score += 10
    else if (peakGap >= 0) score += 5
    else score -= 5
  }
  
  // OR delta - handicap position (20% weight)
  if (memory.lastWinningOR && currentOR > 0) {
    const orDelta = currentOR - memory.lastWinningOR
    if (orDelta <= -8) score += 20
    else if (orDelta <= -5) score += 15
    else if (orDelta <= -3) score += 10
    else if (orDelta <= 0) score += 5
    else if (orDelta <= 5) score -= 5
    else if (orDelta <= 10) score -= 10
    else score -= 15
  }
  
  // RPR trend - improving/declining (10% weight)
  if (memory.rprTrend !== 0) {
    if (memory.rprTrend >= 10) score += 12
    else if (memory.rprTrend >= 5) score += 8
    else if (memory.rprTrend >= 0) score += 3
    else if (memory.rprTrend >= -5) score -= 5
    else score -= 10
  }
  
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10))
}

export function getBestConditions(memory) {
  if (!memory) {
    return {}
  }
  
  return {
    distance: memory.bestDistance,
    going: memory.bestGoing,
    course: memory.bestCourse,
  }
}

function getMostFrequent(arr) {
  if (!arr || arr.length === 0) return null
  
  const counts = {}
  for (const item of arr) {
    const key = String(item)
    counts[key] = (counts[key] || 0) + 1
  }
  
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return sorted[0] ? sorted[0][0] : null
}

export async function getHorsesByTrainer(db, trainer, minRuns = 5) {
  if (!db || !trainer) {
    return []
  }
  
  const results = await db.all(`
    SELECT 
      horse_name,
      COUNT(*) as runs,
      SUM(CASE WHEN finish_position = 1 THEN 1 ELSE 0 END) as wins,
      AVG(or_rating) as avgOR,
      MAX(rpr_rating) as peakRPR
    FROM horse_runs
    WHERE trainer = ?
    GROUP BY horse_name
    HAVING runs >= ?
    ORDER BY wins DESC, runs DESC
  `, [trainer, minRuns])
  
  return results.map(r => ({
    horseName: r.horse_name,
    runs: r.runs,
    wins: r.wins,
    winRate: Math.round((r.wins / r.runs) * 100),
    avgOR: Math.round(r.avgOR),
    peakRPR: r.peakRPR,
  }))
}

export async function findWellHandicappedHorses(db, course, date) {
  if (!db) {
    return []
  }
  
  const results = await db.all(`
    SELECT 
      h1.horse_name,
      h1.or_rating as currentOR,
      h2.or_rating as lastWinOR,
      h1.rpr_rating as currentRPR,
      (SELECT MAX(rpr_rating) FROM horse_runs WHERE horse_name = h1.horse_name) as peakRPR,
      h1.course,
      h1.race_date
    FROM horse_runs h1
    LEFT JOIN horse_runs h2 ON h1.horse_name = h2.horse_name 
      AND h2.finish_position = 1
    WHERE h1.course = ? 
      AND h1.race_date = ?
      AND h2.or_rating IS NOT NULL
      AND h1.or_rating < h2.or_rating
    ORDER BY (h2.or_rating - h1.or_rating) DESC
    LIMIT 10
  `, [course, date])
  
  return results.map(r => ({
    horseName: r.horse_name,
    currentOR: r.currentOR,
    lastWinOR: r.lastWinOR,
    orDelta: r.currentOR - r.lastWinOR,
    currentRPR: r.currentRPR,
    peakRPR: r.peakRPR,
    course: r.course,
    raceDate: r.race_date,
  }))
}

const GOING_TO_NUM = {
  'firm': 1, 'good to firm': 2, 'good': 3, 'good to soft': 4, 'soft': 5, 'heavy': 6,
  'standard': 3, 'standard to slow': 4, 'standard to fast': 2,
}

export function getWinningAnchor(runs) {
  if (!runs || !runs.length) return null
  for (const run of runs) {
    if (run.proven_zone && run.finish_position === 1) {
      try { return JSON.parse(run.proven_zone) } catch { return null }
    }
  }
  return null
}

export async function getCohortBaseline(db, trainer, course) {
  if (!db || !trainer) return null
  try {
    let query, params
    if (course) {
      query = `
        SELECT COUNT(*) as total,
               SUM(CASE WHEN finish_position = 1 THEN 1 ELSE 0 END) as wins,
               AVG(CASE WHEN finish_position = 1 THEN field_size ELSE NULL END) as avgWinFieldSize,
               AVG(CASE WHEN finish_position = 1 THEN or_rating ELSE NULL END) as avgWinOR
        FROM horse_runs
        WHERE trainer = ? AND course = ?
      `
      params = [trainer, course]
    } else {
      query = `
        SELECT COUNT(*) as total,
               SUM(CASE WHEN finish_position = 1 THEN 1 ELSE 0 END) as wins,
               AVG(CASE WHEN finish_position = 1 THEN field_size ELSE NULL END) as avgWinFieldSize,
               AVG(CASE WHEN finish_position = 1 THEN or_rating ELSE NULL END) as avgWinOR
        FROM horse_runs
        WHERE trainer = ?
      `
      params = [trainer]
    }
    const row = await db.get(query, params)
    if (!row || row.total < 5) return null
    return {
      winRate: row.total > 0 ? (row.wins / row.total) : 0,
      totalRuns: row.total,
      totalWins: row.wins || 0,
      avgWinFieldSize: Math.round(row.avgWinFieldSize || 0),
      avgWinOR: Math.round(row.avgWinOR || 0),
    }
  } catch {
    return null
  }
}

function scoreDimension(current, anchor, threshold) {
  if (!anchor) return 0.5
  const delta = Math.abs(current - anchor)
  if (delta <= threshold * 0.5) return 1.0
  if (delta <= threshold) return 0.7
  if (delta <= threshold * 2) return 0.3
  return 0.0
}

export function computeProvenZoneScore(runs, currentConditions, cohortBaseline) {
  if (!runs || !runs.length) return { score: 50, details: {}, inZone: false }

  const anchor = getWinningAnchor(runs)
  const winCount = runs.filter(r => r.finish_position === 1).length
  const totalRuns = runs.length

  if (!anchor) {
    if (cohortBaseline && cohortBaseline.totalRuns >= 10) {
      const cohortScore = Math.min(80, 30 + cohortBaseline.winRate * 200)
      return { score: cohortScore, details: { source: 'cohort', winRate: cohortBaseline.winRate }, inZone: false }
    }
    return { score: 50, details: { source: 'default' }, inZone: false }
  }

  const weights = { or: 0.35, going: 0.20, distance: 0.20, fieldSize: 0.15, class: 0.10 }
  const scores = {}
  const details = {}

  // OR Buffer
  const orDelta = (currentConditions.or || 0) - (anchor.orAtWin || 0)
  scores.or = orDelta <= 0 ? 1.0 : orDelta <= 3 ? 0.7 : orDelta <= 6 ? 0.3 : 0.0
  details.orDelta = orDelta
  details.orInZone = orDelta <= 0
  details.anchorOR = anchor.orAtWin

  // Going distance
  const currentGoingNum = currentConditions.goingNum || GOING_TO_NUM[(currentConditions.going || '').toLowerCase()] || 0
  scores.going = scoreDimension(currentGoingNum, anchor.goingNumAtWin, 1)
  details.goingDelta = currentGoingNum - anchor.goingNumAtWin
  details.anchorGoing = anchor.goingAtWin

  // Distance match
  const currentDist = currentConditions.distanceFurlongs || 0
  scores.distance = scoreDimension(currentDist, anchor.distanceFurlongsAtWin, 2)
  details.distanceDelta = Math.abs(currentDist - anchor.distanceFurlongsAtWin)
  details.anchorDistance = anchor.distanceFurlongsAtWin

  // Field size
  const fieldDelta = Math.abs((currentConditions.fieldSize || 0) - (anchor.fieldSizeAtWin || 0))
  scores.fieldSize = fieldDelta <= 2 ? 1.0 : fieldDelta <= 4 ? 0.7 : fieldDelta <= 6 ? 0.3 : 0.0
  details.fieldDelta = fieldDelta
  details.anchorFieldSize = anchor.fieldSizeAtWin

  // Class
  const currentClass = parseInt(currentConditions.raceClass) || 0
  const anchorClass = parseInt(anchor.raceClassAtWin) || 0
  if (anchorClass > 0 && currentClass > 0) {
    scores.class = currentClass >= anchorClass ? 1.0 : currentClass === anchorClass - 1 ? 0.7 : 0.3
  } else {
    scores.class = 0.5
  }
  details.anchorClass = anchor.raceClassAtWin
  details.anchorCourse = anchor.courseAtWin

  let weightedScore = 0
  for (const [dim, weight] of Object.entries(weights)) {
    weightedScore += (scores[dim] || 0.5) * weight
  }
  const rawScore = Math.round(weightedScore * 100)

  // Blend with cohort for low win counts
  let finalScore = rawScore
  if (winCount < 3 && cohortBaseline && cohortBaseline.totalRuns >= 10) {
    const n = winCount
    const k = 5
    const cohortScore = Math.min(80, 30 + cohortBaseline.winRate * 200)
    finalScore = Math.round(((n / (n + k)) * rawScore) + ((k / (n + k)) * cohortScore))
    details.cohortBlended = true
    details.cohortWinRate = cohortBaseline.winRate
  }

  const inZone = scores.or <= 0 && (scores.going >= 0.7) && (scores.distance >= 0.7)
  details.scores = scores

  return { score: finalScore, details, inZone, anchor }
}
