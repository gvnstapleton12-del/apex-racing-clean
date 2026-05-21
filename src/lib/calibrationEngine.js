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
    predictedWinProb: prediction.predictedWinProb || prediction.estimatedWinProbability || 0,
    predictedScore: prediction.confidence || prediction.finalScore || 0,
    predictedGrade: prediction.grade || '',
    predictedBetQuality: prediction.betQuality || prediction.selectionQuality?.label || '',
    predictedOdds: prediction.odds || 0,
    actualPosition: result.position || 0,
    actualWon: result.position === 1,
    actualOdds: result.spOdds || result.odds || 0,
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
    .map((b) => ({
      ...b,
      avgPredicted: Math.round((b.predicted / b.count) * 10) / 10,
      actualRate: Math.round((b.wins / b.count) * 1000) / 10,
      calibrationError: Math.abs(b.avgPredicted - b.actualRate),
    }))

  const totalRecords = records.length
  const totalWins = records.filter((r) => r.actualWon).length
  const overallAccuracy = totalRecords > 0 ? Math.round((totalWins / totalRecords) * 1000) / 10 : 0

  const brierScore =
    records.reduce((sum, r) => {
      const prob = (Number(r.predictedWinProb) || 0) / 100
      const outcome = r.actualWon ? 1 : 0
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
