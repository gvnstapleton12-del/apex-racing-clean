export function createBet({
  horse,
  odds,
  confidence,
  signal,
  stake = 1,
}) {
  return {
    horse,
    odds: parseFloat(odds || 0),
    confidence,
    signal,
    stake,
    result: 'PENDING',
    profit: 0,
    timestamp: new Date().toISOString(),
  }
}

export function settleBet(
  bet,
  position
) {
  const settled = {
    ...bet,
    position,
  }

  if (position === 1) {
    settled.result = 'WIN'

    settled.profit = Number(
      (
        (bet.odds - 1) *
        bet.stake
      ).toFixed(2)
    )
  } else {
    settled.result = 'LOSS'

    settled.profit = Number(
      (-bet.stake).toFixed(2)
    )
  }

  return settled
}

export function analyzeBankroll(
  bets = []
) {
  const settled = bets.filter(
    (bet) =>
      bet.result !== 'PENDING'
  )

  const wins = settled.filter(
    (bet) => bet.result === 'WIN'
  )

  const totalStaked =
    settled.reduce(
      (acc, bet) =>
        acc + bet.stake,
      0
    )

  const totalProfit =
    settled.reduce(
      (acc, bet) =>
        acc + bet.profit,
      0
    )

  const roi = totalStaked
    ? Number(
        (
          (totalProfit /
            totalStaked) *
          100
        ).toFixed(2)
      )
    : 0

  const strikeRate =
    settled.length
      ? Number(
          (
            (wins.length /
              settled.length) *
            100
          ).toFixed(2)
        )
      : 0

  let bankroll = 100
  let peak = 100
  let maxDrawdown = 0

  settled.forEach((bet) => {
    bankroll += bet.profit

    if (bankroll > peak) {
      peak = bankroll
    }

    const drawdown =
      peak - bankroll

    if (
      drawdown >
      maxDrawdown
    ) {
      maxDrawdown = drawdown
    }
  })

  return {
    totalBets: settled.length,
    wins: wins.length,
    losses:
      settled.length - wins.length,
    totalProfit: Number(
      totalProfit.toFixed(2)
    ),
    roi,
    strikeRate,
    bankroll: Number(
      bankroll.toFixed(2)
    ),
    maxDrawdown: Number(
      maxDrawdown.toFixed(2)
    ),
  }
}