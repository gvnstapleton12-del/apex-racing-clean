// Horse Memory Intelligence Engine
// Historical handicap and performance analysis

export async function getHorseMemory(db, horseName, currentOR) {
  if (!db || !horseName) {
    return null
  }
  
  try {
    const runs = await db.all(`
      SELECT *
      FROM horse_runs
      WHERE horse_name = ?
      ORDER BY race_date DESC
      LIMIT 50
    `, [horseName])
    
    if (!runs.length) {
      return null
    }
    
    const peakRPR = Math.max(...runs.map(r => r.rpr_rating || 0), 0)
    const peakOR = Math.max(...runs.map(r => r.or_rating || 0), 0)
    
    const winningRuns = runs.filter(r => r.finish_position === 1)
    const lastWinningOR = winningRuns[0]?.or_rating || null
    const lastWinningRPR = winningRuns[0]?.rpr_rating || null
    
    const validRPR = runs.filter(r => r.rpr_rating > 0).map(r => r.rpr_rating)
    const avgRPR = validRPR.length > 0 
      ? validRPR.reduce((a, b) => a + b, 0) / validRPR.length 
      : 0
    
    const recentRPR = validRPR.slice(0, 3).reduce((a, b) => a + b, 0) / 3 || 0
    const olderRPR = validRPR.slice(3, 6).reduce((a, b) => a + b, 0) / 3 || 0
    const rprTrend = recentRPR - olderRPR
    
    const bestDistance = getMostFrequent(winningRuns.map(r => r.distance_furlongs).filter(Boolean))
    const bestGoing = getMostFrequent(winningRuns.map(r => r.going).filter(Boolean))
    const bestCourse = getMostFrequent(winningRuns.map(r => r.course).filter(Boolean))
    
    return {
      horseName,
      runsCount: runs.length,
      peakRPR,
      peakOR,
      lastWinningOR,
      lastWinningRPR,
      currentVsPeak: currentOR > 0 && peakRPR > 0 ? currentOR - peakRPR : 0,
      currentVsLastWin: currentOR > 0 && lastWinningOR ? currentOR - lastWinningOR : 0,
      avgRPR: Math.round(avgRPR * 10) / 10,
      recentRPR: Math.round(recentRPR * 10) / 10,
      olderRPR: Math.round(olderRPR * 10) / 10,
      rprTrend: Math.round(rprTrend * 10) / 10,
      bestDistance,
      bestGoing,
      bestCourse,
      wins: winningRuns.length,
      winRate: runs.length > 0 ? Math.round((winningRuns.length / runs.length) * 100) : 0,
    }
  } catch (error) {
    console.error('Error getting horse memory:', error.message)
    return null
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
