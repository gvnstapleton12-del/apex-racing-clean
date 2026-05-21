const MIN_SAMPLES_FOR_ADJUSTMENT = 200
const MAX_LEARNING_RATE = 0.15
const DECAY_FACTOR = 0.95
const OUTlier_Z_THRESHOLD = 3.0
const MAX_SINGLE_ADJUSTMENT = 0.20
const ROLLING_WINDOW_SIZE = 500
const BASELINE_STABILITY_PERIOD = 50

export function computeRollingStats(records, windowSize = ROLLING_WINDOW_SIZE) {
  if (!records || records.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, count: 0 }
  }

  const window = records.slice(-windowSize)
  const values = window.map((r) => {
    const pos = Number(r.actualPosition) || 0
    const odds = Number(r.actualOdds) || 0
    return pos === 1 ? odds - 1 : -1
  })

  const count = values.length
  const mean = values.reduce((a, b) => a + b, 0) / count
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / count
  const std = Math.sqrt(variance)

  return {
    mean: Math.round(mean * 100) / 100,
    std: Math.round(std * 100) / 100,
    min: Math.min(...values),
    max: Math.max(...values),
    count,
  }
}

export function detectOutliers(records) {
  if (!records || records.length < 10) return { outliers: [], suppressed: 0 }

  const values = records.map((r) => {
    const pos = Number(r.actualPosition) || 0
    const odds = Number(r.actualOdds) || 0
    return pos === 1 ? odds - 1 : -1
  })

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) || 1

  const outliers = []
  let suppressed = 0

  records.forEach((r, i) => {
    const value = values[i]
    const zScore = Math.abs((value - mean) / std)

    if (zScore > OUTlier_Z_THRESHOLD) {
      outliers.push({
        index: i,
        horse: r.horse,
        race: r.race,
        value,
        zScore: Math.round(zScore * 100) / 100,
        suppressed: true,
      })
      suppressed++
    }
  })

  return { outliers, suppressed }
}

export function computeDecayedWeight(recordAge, currentWeight, decayFactor = DECAY_FACTOR) {
  const daysOld = Math.max(0, recordAge)
  const decayed = currentWeight * Math.pow(decayFactor, daysOld / 30)
  return Math.round(decayed * 1000) / 1000
}

export function computeDecayedInfluence(records, weights) {
  if (!records || records.length === 0) return weights

  const now = new Date()
  const agedWeights = {}

  records.forEach((r) => {
    const timestamp = r.timestamp ? new Date(r.timestamp) : now
    const daysOld = Math.max(0, (now - timestamp) / (1000 * 60 * 60 * 24))

    Object.entries(weights).forEach(([key, value]) => {
      if (!agedWeights[key]) agedWeights[key] = { total: 0, count: 0 }
      const decayed = computeDecayedWeight(daysOld, value)
      agedWeights[key].total += decayed
      agedWeights[key].count++
    })
  })

  const result = {}
  Object.entries(agedWeights).forEach(([key, data]) => {
    result[key] = data.count > 0 ? Math.round((data.total / data.count) * 1000) / 1000 : weights[key]
  })

  return result
}

export function safeLearningRate(currentRate, sampleSize, maxRate = MAX_LEARNING_RATE) {
  if (sampleSize < MIN_SAMPLES_FOR_ADJUSTMENT) {
    return 0
  }

  const scaledRate = maxRate * Math.min(1, (sampleSize - MIN_SAMPLES_FOR_ADJUSTMENT) / 500)
  return Math.round(scaledRate * 1000) / 1000
}

export function capAdjustment(currentValue, proposedValue, maxChange = MAX_SINGLE_ADJUSTMENT) {
  const change = proposedValue - currentValue
  const cappedChange = Math.max(-maxChange, Math.min(maxChange, change))
  return Math.round((currentValue + cappedChange) * 1000) / 1000
}

export function computeStability(records, windowSize = BASELINE_STABILITY_PERIOD) {
  if (!records || records.length < windowSize) {
    return { stable: false, reason: `Need ${windowSize}+ records (have ${records?.length || 0})`, variance: 0 }
  }

  const recent = records.slice(-windowSize)
  const roiValues = recent.map((r) => {
    const pos = Number(r.actualPosition) || 0
    const odds = Number(r.actualOdds) || 0
    return pos === 1 ? odds - 1 : -1
  })

  const mean = roiValues.reduce((a, b) => a + b, 0) / roiValues.length
  const variance = roiValues.reduce((s, v) => s + (v - mean) ** 2, 0) / roiValues.length

  const isStable = variance < 4

  return {
    stable: isStable,
    reason: isStable ? 'Variance within acceptable range' : `High variance: ${Math.round(variance * 100) / 100}`,
    variance: Math.round(variance * 100) / 100,
    meanRoi: Math.round(mean * 100) / 100,
    sampleSize: windowSize,
  }
}

export function validateWeightAdjustment(currentWeights, proposedWeights, sampleSize) {
  const learningRate = safeLearningRate(0, sampleSize)
  if (learningRate === 0) {
    return {
      approved: false,
      reason: `Insufficient samples: ${sampleSize}/${MIN_SAMPLES_FOR_ADJUSTMENT}`,
      currentWeights,
      proposedWeights: currentWeights,
    }
  }

  const adjustments = {}
  let anyExceedsCap = false

  Object.entries(proposedWeights).forEach(([key, proposed]) => {
    const current = currentWeights[key] || 1
    const capped = capAdjustment(current, proposed)
    adjustments[key] = capped
    if (Math.abs(proposed - current) > MAX_SINGLE_ADJUSTMENT) {
      anyExceedsCap = true
    }
  })

  return {
    approved: true,
    learningRate,
    anyCapped: anyExceedsCap,
    currentWeights,
    proposedWeights: adjustments,
  }
}

export function computeAntiOverfitReport(records, currentWeights) {
  const rolling = computeRollingStats(records)
  const outliers = detectOutliers(records)
  const stability = computeStability(records)
  const decayedWeights = computeDecayedInfluence(records, currentWeights)

  const learningRate = safeLearningRate(0, records?.length || 0)

  return {
    sampleSize: records?.length || 0,
    minSamplesRequired: MIN_SAMPLES_FOR_ADJUSTMENT,
    canAdjust: (records?.length || 0) >= MIN_SAMPLES_FOR_ADJUSTMENT,
    learningRate,
    maxLearningRate: MAX_LEARNING_RATE,
    rollingStats: rolling,
    outliers,
    stability,
    decayedWeights,
    currentWeights,
    protectionRules: {
      minSamples: MIN_SAMPLES_FOR_ADJUSTMENT,
      maxLearningRate: MAX_LEARNING_RATE,
      decayFactor: DECAY_FACTOR,
      outlierZThreshold: OUTlier_Z_THRESHOLD,
      maxSingleAdjustment: MAX_SINGLE_ADJUSTMENT,
      rollingWindowSize: ROLLING_WINDOW_SIZE,
    },
  }
}

export function applyProtectedAdjustment(currentWeights, proposedWeights, records) {
  const sampleSize = records?.length || 0
  const validation = validateWeightAdjustment(currentWeights, proposedWeights, sampleSize)

  if (!validation.approved) {
    return {
      adjusted: false,
      reason: validation.reason,
      weights: currentWeights,
    }
  }

  const outliers = detectOutliers(records)
  const stability = computeStability(records)

  if (!stability.stable && sampleSize < 1000) {
    return {
      adjusted: false,
      reason: `Model unstable: ${stability.reason}`,
      weights: currentWeights,
    }
  }

  const learningRate = validation.learningRate
  const protectedWeights = {}

  Object.entries(validation.proposedWeights).forEach(([key, proposed]) => {
    const current = currentWeights[key] || 1
    const adjustment = (proposed - current) * learningRate
    protectedWeights[key] = Math.round((current + adjustment) * 1000) / 1000
  })

  return {
    adjusted: true,
    learningRate,
    outliersSuppressed: outliers.suppressed,
    stability: stability.stable,
    weights: protectedWeights,
    previousWeights: currentWeights,
  }
}
