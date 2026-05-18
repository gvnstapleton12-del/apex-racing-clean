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
