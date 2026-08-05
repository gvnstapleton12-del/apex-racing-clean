export function createCalibrationRecord(prediction, result) {
  return {
    horse: prediction.horse,
    race: prediction.race,
    course: prediction.course,
    date: prediction.date,
    going: prediction.going || '',
    fieldSize: prediction.fieldSize || 0,
    trainer: prediction.trainer || '',
    raceType: prediction.raceType || '',
    predictedWinProb: prediction.predictedWinProb || prediction.estimatedWinProbability || prediction.winProb || 0,
    plattProb: prediction.plattProb || prediction.predictedWinProb || prediction.estimatedWinProbability || prediction.winProb || 0,
    predictedPlaceProb: prediction.predictedPlaceProb || prediction.placeProb || 0,
    predictedScore: prediction.confidence || prediction.finalScore || 0,
    predictedGrade: prediction.grade || '',
    predictedBetQuality: prediction.betQuality || prediction.selectionQuality?.label || '',
    predictedOdds: prediction.odds || 0,
    actualPosition: result.position || 0,
    actualWon: result.position === 1,
    actualPlaced: result.position >= 2 && result.position <= 3,
    actualOdds: result.spOdds || result.odds || 0,
    interactionAdjustment: prediction.interactions?.totalAdjustment || 0,
    interactionCount: prediction.interactions?.interactions?.length || 0,
    personalAffinity: prediction.personalAffinity ?? prediction.adjustment ?? null,
    previousRuns: prediction.previousRuns || 0,
    timestamp: new Date().toISOString(),
  }
}

export function computeCalibrationBuckets(records = [], bucketSize = 10) {
  if (!records.length) {
    return {
      buckets: [],
      totalRecords: 0,
      overallAccuracy: 0,
      brierScore: 0,
      reliability: 'INSUFFICIENT DATA',
    }
  }

  const buckets = {}
  const bucketKeys = []

  for (let i = 0; i <= 100; i += bucketSize) {
    const key = `${i}-${i + bucketSize - 1}`
    buckets[key] = {
      range: key,
      midPoint: i + bucketSize / 2,
      predicted: 0,
      actual: 0,
      count: 0,
      wins: 0,
      expectedWins: 0,
      runners: [],
    }
    bucketKeys.push(key)
  }

  records.forEach((r) => {
    const prob = Number(r.predictedWinProb) || 0
    const bucketIndex = Math.min(Math.floor(prob / bucketSize), 9)
    const key = bucketKeys[bucketIndex]

    if (!buckets[key]) return

    buckets[key].count += 1
    buckets[key].predicted += prob
    buckets[key].expectedWins += prob / 100

    if (r.actualWon) {
      buckets[key].wins += 1
      buckets[key].actual += 100
    }

    buckets[key].runners.push({
      horse: r.horse,
      race: r.race,
      predicted: prob,
      won: r.actualWon,
      position: r.actualPosition,
    })
  })

  const filledBuckets = bucketKeys
    .map((key) => buckets[key])
    .filter((b) => b.count > 0)
    .map((b) => {
      const avgPredicted = Math.round((b.predicted / b.count) * 10) / 10
      const actualRate = Math.round((b.wins / b.count) * 1000) / 10
      return {
        ...b,
        avgPredicted,
        actualRate,
        calibrationError: Math.round(Math.abs(avgPredicted - actualRate) * 10) / 10,
      }
    })

  const totalRecords = records.length
  const totalWins = records.filter((r) => r.actualWon).length
  const overallAccuracy = totalRecords > 0 ? Math.round((totalWins / totalRecords) * 1000) / 10 : 0

  const brierScore =
    records.reduce((sum, r) => {
      const prob = (Number(r.predictedWinProb) || 0) / 100
      const outcome = r.actualWon ? 1 : 0
      return sum + Math.pow(prob - outcome, 2)
    }, 0) / totalRecords

  // Only count statistically meaningful buckets (>= 30 records) in reliability calc
  const meaningfulBuckets = filledBuckets.filter(b => b.count >= 30)
  const avgCalibrationError =
    meaningfulBuckets.length > 0
      ? Math.round((meaningfulBuckets.reduce((sum, b) => sum + b.calibrationError, 0) / meaningfulBuckets.length) * 10) / 10
      : filledBuckets.length > 0
        ? Math.round((filledBuckets.reduce((sum, b) => sum + b.calibrationError, 0) / filledBuckets.length) * 10) / 10
        : 0

  let reliability = 'UNTESTED'
  if (totalRecords >= 500) {
    reliability = avgCalibrationError <= 5 ? 'EXCELLENT' : avgCalibrationError <= 10 ? 'GOOD' : 'NEEDS CALIBRATION'
  } else if (totalRecords >= 100) {
    reliability = avgCalibrationError <= 8 ? 'GOOD' : 'NEEDS CALIBRATION'
  } else if (totalRecords >= 20) {
    reliability = 'EARLY SIGNALS'
  }

  return {
    buckets: filledBuckets,
    totalRecords,
    totalWins,
    overallAccuracy,
    brierScore: Math.round(brierScore * 10000) / 10000,
    avgCalibrationError,
    reliability,
  }
}

export function computeCalibrationByGrade(records = []) {
  if (!records.length) {
    return { grades: [] }
  }

  const gradeMap = {}

  records.forEach((r) => {
    const grade = r.predictedGrade || 'UNKNOWN'
    if (!gradeMap[grade]) {
      gradeMap[grade] = {
        grade,
        count: 0,
        wins: 0,
        avgPredictedProb: 0,
        totalPredictedProb: 0,
        runners: [],
      }
    }

    gradeMap[grade].count += 1
    gradeMap[grade].totalPredictedProb += Number(r.predictedWinProb) || 0

    if (r.actualWon) {
      gradeMap[grade].wins += 1
    }

    gradeMap[grade].runners.push({
      horse: r.horse,
      race: r.race,
      predicted: r.predictedWinProb,
      won: r.actualWon,
    })
  })

  const grades = Object.values(gradeMap).map((g) => ({
    ...g,
    actualRate: Math.round((g.wins / g.count) * 1000) / 10,
    avgPredictedProb: Math.round((g.totalPredictedProb / g.count) * 10) / 10,
    calibrationError: Math.abs(
      Math.round((g.totalPredictedProb / g.count) * 10) / 10 - Math.round((g.wins / g.count) * 1000) / 10
    ),
  }))

  return { grades }
}

export function computeCalibrationByBetQuality(records = []) {
  if (!records.length) {
    return { qualities: [] }
  }

  const qualityMap = {}

  records.forEach((r) => {
    const quality = r.predictedBetQuality || 'UNKNOWN'
    if (!qualityMap[quality]) {
      qualityMap[quality] = {
        quality,
        count: 0,
        wins: 0,
        avgPredictedProb: 0,
        totalPredictedProb: 0,
        roi: 0,
        totalStake: 0,
        totalReturn: 0,
        runners: [],
      }
    }

    qualityMap[quality].count += 1
    qualityMap[quality].totalPredictedProb += Number(r.predictedWinProb) || 0
    qualityMap[quality].totalStake += 1

    if (r.actualWon) {
      qualityMap[quality].wins += 1
      qualityMap[quality].totalReturn += Number(r.actualOdds) || 0
    }

    qualityMap[quality].runners.push({
      horse: r.horse,
      race: r.race,
      predicted: r.predictedWinProb,
      won: r.actualWon,
      odds: r.actualOdds,
    })
  })

  const qualities = Object.values(qualityMap).map((q) => {
    const roi = q.totalStake > 0 ? ((q.totalReturn - q.totalStake) / q.totalStake) * 100 : 0
    return {
      ...q,
      actualRate: Math.round((q.wins / q.count) * 1000) / 10,
      avgPredictedProb: Math.round((q.totalPredictedProb / q.count) * 10) / 10,
      roi: Math.round(roi * 10) / 10,
      profitLoss: Math.round((q.totalReturn - q.totalStake) * 100) / 100,
    }
  })

  return { qualities }
}

export function computePlaceCalibration(records = [], bucketSize = 10) {
  if (!records.length) {
    return {
      buckets: [],
      totalRecords: 0,
      overallPlaceRate: 0,
      brierScore: 0,
      reliability: 'INSUFFICIENT DATA',
    }
  }

  const buckets = {}
  const bucketKeys = []

  for (let i = 0; i <= 100; i += bucketSize) {
    const key = `${i}-${i + bucketSize - 1}`
    buckets[key] = {
      range: key,
      midPoint: i + bucketSize / 2,
      predicted: 0,
      actual: 0,
      count: 0,
      places: 0,
      expectedPlaces: 0,
      runners: [],
    }
    bucketKeys.push(key)
  }

  records.forEach((r) => {
    const prob = Number(r.predictedPlaceProb) || 0
    const bucketIndex = Math.min(Math.floor(prob / bucketSize), 9)
    const key = bucketKeys[bucketIndex]

    if (!buckets[key]) return

    buckets[key].count += 1
    buckets[key].predicted += prob
    buckets[key].expectedPlaces += prob / 100

    if (r.actualPlaced || r.actualWon) {
      buckets[key].places += 1
      buckets[key].actual += 100
    }

    buckets[key].runners.push({
      horse: r.horse,
      race: r.race,
      predicted: prob,
      placed: r.actualPlaced || r.actualWon,
      position: r.actualPosition,
    })
  })

  const filledBuckets = bucketKeys
    .map((key) => buckets[key])
    .filter((b) => b.count > 0)
    .map((b) => {
      const avgPredicted = Math.round((b.predicted / b.count) * 10) / 10
      const actualRate = Math.round((b.places / b.count) * 1000) / 10
      return {
        ...b,
        avgPredicted,
        actualRate,
        calibrationError: Math.round(Math.abs(avgPredicted - actualRate) * 10) / 10,
      }
    })

  const totalRecords = records.length
  const totalPlaces = records.filter((r) => r.actualPlaced || r.actualWon).length
  const overallPlaceRate = totalRecords > 0 ? Math.round((totalPlaces / totalRecords) * 1000) / 10 : 0

  const brierScore =
    records.reduce((sum, r) => {
      const prob = (Number(r.predictedPlaceProb) || 0) / 100
      const outcome = (r.actualPlaced || r.actualWon) ? 1 : 0
      return sum + Math.pow(prob - outcome, 2)
    }, 0) / totalRecords

  const avgCalibrationError =
    filledBuckets.length > 0
      ? Math.round((filledBuckets.reduce((sum, b) => sum + b.calibrationError, 0) / filledBuckets.length) * 10) / 10
      : 0

  let reliability = 'UNTESTED'
  if (totalRecords >= 500) {
    reliability = avgCalibrationError <= 5 ? 'EXCELLENT' : avgCalibrationError <= 10 ? 'GOOD' : 'NEEDS CALIBRATION'
  } else if (totalRecords >= 100) {
    reliability = avgCalibrationError <= 8 ? 'GOOD' : 'NEEDS CALIBRATION'
  } else if (totalRecords >= 20) {
    reliability = 'EARLY SIGNALS'
  }

  return {
    buckets: filledBuckets,
    totalRecords,
    totalPlaces,
    overallPlaceRate,
    brierScore: Math.round(brierScore * 10000) / 10000,
    avgCalibrationError,
    reliability,
  }
}

export function computeCalibrationAdjustment(calibrationData) {
  if (!calibrationData?.byProbability?.buckets?.length) {
    return { winAdj: 0, placeAdj: 0, confidence: 'none' }
  }

  const buckets = calibrationData.byProbability.buckets
  const totalRecords = calibrationData.byProbability.totalRecords || 0

  if (totalRecords < 50) {
    return { winAdj: 0, placeAdj: 0, confidence: 'insufficient' }
  }

  let totalWeightedAdj = 0
  let totalWeight = 0

  buckets.forEach((bucket) => {
    if (bucket.count < 5) return

    const error = bucket.actualRate - bucket.avgPredicted
    const weight = bucket.count
    totalWeightedAdj += error * weight
    totalWeight += weight
  })

  if (totalWeight === 0) {
    return { winAdj: 0, placeAdj: 0, confidence: 'empty' }
  }

  const rawWinAdj = totalWeightedAdj / totalWeight
  const winAdj = Math.max(-3, Math.min(3, Math.round(rawWinAdj * 10) / 10))

  let placeAdj = 0
  if (calibrationData.byPlaceProbability?.buckets?.length) {
    const placeBuckets = calibrationData.byPlaceProbability.buckets
    let totalPlaceAdj = 0
    let totalPlaceWeight = 0

    placeBuckets.forEach((bucket) => {
      if (bucket.count < 5) return
      const error = bucket.actualRate - bucket.avgPredicted
      totalPlaceAdj += error * bucket.count
      totalPlaceWeight += bucket.count
    })

    if (totalPlaceWeight > 0) {
      placeAdj = Math.max(-3, Math.min(3, Math.round((totalPlaceAdj / totalPlaceWeight) * 10) / 10))
    }
  }

  return {
    winAdj,
    placeAdj,
    confidence: totalRecords >= 200 ? 'high' : totalRecords >= 100 ? 'medium' : 'low',
    totalRecords,
    avgError: Math.round(totalWeightedAdj / totalWeight * 10) / 10,
  }
}
