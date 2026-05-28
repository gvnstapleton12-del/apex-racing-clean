import { bucketKey, bucketComponents, updateBucketLearning } from './contextBuckets.js'

export function analyzeHistoricalPerformance(records = []) {
  if (!records.length) {
    return {
      totalBets: 0,
      winners: 0,
      strikeRate: 0,
      roi: 0,
      averageConfidence: 0,
      profitableSignals: [],
      bankroll: 0,
      longestWinStreak: 0,
      longestLoseStreak: 0,
      confidenceBands: [],
      profitCurve: [],
    }
  }

  const winners = records.filter(
    (r) => Number(r.position) === 1
  )

  const totalStake = records.length

  let bankroll = 0
  let runningProfit = 0

  let currentWinStreak = 0
  let currentLoseStreak = 0

  let longestWinStreak = 0
  let longestLoseStreak = 0

  const profitCurve = []

  const totalReturn = records.reduce(
    (acc, r, index) => {
      const odds = Number(r.spOdds) || 0

      if (Number(r.position) === 1) {
        currentWinStreak += 1
        currentLoseStreak = 0

        if (
          currentWinStreak > longestWinStreak
        ) {
          longestWinStreak = currentWinStreak
        }

        runningProfit += odds - 1

        profitCurve.push({
          bet: index + 1,
          profit: Number(
            runningProfit.toFixed(2)
          ),
        })

        bankroll = runningProfit

        return acc + odds
      }

      currentLoseStreak += 1
      currentWinStreak = 0

      if (
        currentLoseStreak > longestLoseStreak
      ) {
        longestLoseStreak = currentLoseStreak
      }

      runningProfit -= 1

      profitCurve.push({
        bet: index + 1,
        profit: Number(
          runningProfit.toFixed(2)
        ),
      })

      bankroll = runningProfit

      return acc
    },
    0
  )

  const strikeRate = Number(
    (
      (winners.length / records.length) *
      100
    ).toFixed(2)
  )

  const roi = Number(
    (
      ((totalReturn - totalStake) /
        totalStake) *
      100
    ).toFixed(2)
  )

  const averageConfidence = Number(
    (
      records.reduce(
        (acc, r) =>
          acc +
          (r.aiConfidence || 0),
        0
      ) / records.length
    ).toFixed(2)
  )

  const signalPerformance = {}

  const confidenceBuckets = {
    low: {
      runs: 0,
      wins: 0,
    },
    medium: {
      runs: 0,
      wins: 0,
    },
    high: {
      runs: 0,
      wins: 0,
    },
  }

  records.forEach((record) => {
    const signal =
      record.signal || 'UNKNOWN'

    if (!signalPerformance[signal]) {
      signalPerformance[signal] = {
        runs: 0,
        wins: 0,
      }
    }

    signalPerformance[signal].runs += 1

    const confidence =
      Number(record.aiConfidence) || 0

    let bucket = 'low'

    if (confidence >= 75) {
      bucket = 'high'
    } else if (confidence >= 55) {
      bucket = 'medium'
    }

    confidenceBuckets[bucket].runs += 1

    if (Number(record.position) === 1) {
      signalPerformance[signal].wins += 1
      confidenceBuckets[bucket].wins += 1
    }
  })

  const profitableSignals = Object.entries(
    signalPerformance
  )
    .map(([signal, stats]) => ({
      signal,
      strikeRate: Number(
        (
          (stats.wins / stats.runs) *
          100
        ).toFixed(2)
      ),
      runs: stats.runs,
      wins: stats.wins,
    }))
    .sort(
      (a, b) =>
        b.strikeRate - a.strikeRate
    )

  const confidenceBands = Object.entries(
    confidenceBuckets
  ).map(([band, stats]) => ({
    band,
    runs: stats.runs,
    wins: stats.wins,
    strikeRate:
      stats.runs > 0
        ? Number(
            (
              (stats.wins / stats.runs) *
              100
            ).toFixed(2)
          )
        : 0,
  }))

  return {
    totalBets: records.length,
    winners: winners.length,
    strikeRate,
    roi,
    averageConfidence,
    profitableSignals,
    bankroll: Number(bankroll.toFixed(2)),
    longestWinStreak,
    longestLoseStreak,
    confidenceBands,
    profitCurve,
  }
}

export function buildLearningRecord({
  horse,
  aiConfidence,
  signal,
  spOdds,
  position,
  marketMovement,
}) {
  return {
    horse,
    aiConfidence,
    signal,
    spOdds,
    position,
    marketMovement,
    timestamp: new Date().toISOString(),
  }
}

export function learnFromResults(records = [], currentWeights = {}) {
  const withBreakdown = records.filter(
    (r) => r.breakdown && typeof r.breakdown.powerScore === 'number'
  )

  if (withBreakdown.length < 50) {
    return {
      adjusted: false,
      reason: `Only ${withBreakdown.length} records with breakdown data (need 50+)`,
      weights: currentWeights,
    }
  }

  const winners = withBreakdown.filter((r) => Number(r.position) === 1)
  const losers = withBreakdown.filter(
    (r) => Number(r.position) > 1 && Number(r.position) <= 20
  )

  if (winners.length < 10) {
    return {
      adjusted: false,
      reason: `Only ${winners.length} winners in data (need 10+)`,
      weights: currentWeights,
    }
  }

  if (!losers.length) {
    return {
      adjusted: false,
      reason: 'Need at least 1 loser in data',
      weights: currentWeights,
    }
  }

  // Map apex engine breakdown fields to learning factors
  const factors = ['powerScore', 'paceScore', 'humanAdj', 'marketAdj']
  const factorLabels = {
    powerScore: 'class',
    paceScore: 'stride',
    humanAdj: 'trainer',
    marketAdj: 'traffic',
  }

  const analysis = factors.map((factor) => {
    const winAvg = winners.reduce((s, r) => s + (r.breakdown[factor] || 0), 0) / winners.length
    const loseAvg = losers.reduce((s, r) => s + (r.breakdown[factor] || 0), 0) / losers.length
    const separation = winAvg - loseAvg
    const maxScore = Math.max(winAvg, loseAvg, 1)
    const ratio = maxScore > 0 ? separation / maxScore : 0

    return {
      factor: factorLabels[factor] || factor,
      winAvg: Number(winAvg.toFixed(2)),
      loseAvg: Number(loseAvg.toFixed(2)),
      separation: Number(separation.toFixed(2)),
      ratio: Number(ratio.toFixed(3)),
    }
  })

  const baseMult = currentWeights.multiplier || {}

  const learningRate = 0.3

  const newMult = { ...baseMult }

  analysis.forEach((a) => {
    const multKey = a.factor
    const currentMult = baseMult[multKey] || 1
    const normalizedRatio = Math.max(-0.5, Math.min(0.5, a.ratio))
    const adjustment = 1 + normalizedRatio * learningRate
    newMult[multKey] = Number((currentMult * adjustment).toFixed(3))
  })

  const newWeights = {
    multiplier: newMult,
  }

  return {
    adjusted: true,
    totalRecords: withBreakdown.length,
    winners: winners.length,
    losers: losers.length,
    analysis,
    weights: newWeights,
    previousWeights: currentWeights,
  }
}

export function learnFromBuckets(bucketDb, racesWithResults) {
  let updated = false

  racesWithResults.forEach((raceResult) => {
    const race = raceResult.race
    const results = raceResult.results || []
    const predictions = raceResult.predictions || []

    if (!race || results.length === 0 || predictions.length === 0) return

    const key = bucketKey(race)
    const components = bucketComponents(race)

    const predData = predictions.map((p) => ({
      powerScore: p.powerScore || p.power?.total || 50,
      paceScore: p.paceScore || p.pace?.score || 0,
      humanScore: p.humanScore || p.human?.score || 0,
      marketAdj: p.marketScore || p.market?.score || 0,
      trainerRtf: p.trainerRtf || 0,
    }))

    const resultData = results.map((r) => ({
      position: Number(r.position || 0),
    }))

    const before = bucketDb[key]?.predictions || 0
    updateBucketLearning(bucketDb, key, predData, resultData)
    const after = bucketDb[key]?.predictions || 0

    if (after > before) updated = true
  })

  return {
    updated,
    bucketCount: Object.keys(bucketDb).length,
    buckets: Object.entries(bucketDb).map(([key, data]) => ({
      key,
      predictions: data.predictions,
      winners: data.winners,
      placed: data.placed,
      weights: data.layerImportance,
      lastUpdated: data.lastUpdated,
    })),
  }
}
