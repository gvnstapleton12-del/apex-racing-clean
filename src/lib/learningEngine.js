export function analyzeHistoricalPerformance(records = []) {
  if (!records.length) {
    return {
      totalBets: 0,
      winners: 0,
      strikeRate: 0,
      roi: 0,
      averageConfidence: 0,
      profitableSignals: [],
    }
  }

  const winners = records.filter(
    (r) => r.position === 1
  )

  const totalStake = records.length

  const totalReturn = records.reduce(
    (acc, r) => {
      if (r.position === 1) {
        return (
          acc + (parseFloat(r.spOdds) || 0)
        )
      }

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

    if (record.position === 1) {
      signalPerformance[signal].wins += 1
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

  return {
    totalBets: records.length,
    winners: winners.length,
    strikeRate,
    roi,
    averageConfidence,
    profitableSignals,
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
