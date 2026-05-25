// APEX Backtesting Engine
// Run the model against historical data to answer: "Would this have made money?"

import { runApexEngine } from './apexEngine.js'

export function runBacktest(historicalRaces, options = {}) {
  const {
    minScore = 50,
    minEdge = 0,
    maxPicksPerRace = 3,
    bankroll = 100,
    kellyFraction = 0.25,
    maxStakePct = 0.05,
  } = options

  const results = []
  let runningBankroll = bankroll
  let totalBets = 0
  let totalWins = 0
  let totalPlaces = 0
  let totalStaked = 0
  let totalReturned = 0

  for (const race of historicalRaces) {
    if (!race.runners || race.runners.length < 5) continue

    const runnersWithResults = race.runners.filter(r => r.position > 0)
    if (runnersWithResults.length === 0) continue

    let engineResult
    try {
      engineResult = runApexEngine(race.runners, race, {
        goingDb: options.goingDb || {},
        distanceDb: options.distanceDb || {},
        replayDb: options.replayDb || {},
        bucketDb: options.bucketDb || {},
        horseProfiles: options.horseProfiles || {},
        races: options.races || [],
        trainerForm: options.trainerForm || {},
        jockeyForm: options.jockeyForm || {},
      })
    } catch (e) {
      continue
    }

    const picks = engineResult.racecards
      .filter(r => {
        const score = r.finalScore || 0
        const edge = r.valueEngine?.edge || 0
        const bettable = r.bankrollEngine?.label !== 'NO BET' && r.bankrollEngine?.label !== 'AVOID'
        return score >= minScore && edge >= minEdge && bettable
      })
      .slice(0, maxPicksPerRace)

    if (picks.length === 0) continue

    const raceResult = {
      date: race.date || race.off_dt?.slice(0, 10) || '',
      course: race.course,
      offTime: race.off_time,
      runners: race.runners.length,
      picks: [],
      racePnl: 0,
    }

    for (const pick of picks) {
      const actualResult = runnersWithResults.find(
        r => (r.horse_id || r.horse) === (pick.horse_id || pick.horse)
      )

      const odds = Number(pick.odds || 0)
      const stake = Math.min(
        runningBankroll * maxStakePct,
        runningBankroll * (pick.bankrollEngine?.adjustedKelly || 0.01) * kellyFraction
      )

      let returned = 0
      let won = false
      let placed = false
      let position = 0

      if (actualResult) {
        position = actualResult.position
        won = position === 1
        placed = position >= 2 && position <= 4

        if (won && odds > 1) {
          returned = stake * (odds - 1) + stake
        } else if (placed && odds > 1) {
          const placeOdds = odds / 4
          returned = stake * (placeOdds - 1) + stake
        }
      }

      const pnl = returned - stake
      runningBankroll += pnl
      totalBets++
      if (won) totalWins++
      if (placed) totalPlaces++
      totalStaked += stake
      totalReturned += returned

      raceResult.picks.push({
        horse: pick.horse,
        score: pick.finalScore,
        odds,
        stake: Math.round(stake * 100) / 100,
        position,
        won,
        placed,
        returned: Math.round(returned * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        edge: pick.valueEngine?.edge || 0,
        bankrollLabel: pick.bankrollEngine?.label || '',
      })

      raceResult.racePnl += pnl
    }

    raceResult.racePnl = Math.round(raceResult.racePnl * 100) / 100
    results.push(raceResult)
  }

  const winRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0
  const placeRate = totalBets > 0 ? (totalPlaces / totalBets) * 100 : 0
  const roi = totalStaked > 0 ? ((totalReturned - totalStaked) / totalStaked) * 100 : 0
  const profit = Math.round((runningBankroll - bankroll) * 100) / 100
  const avgOdds = totalBets > 0 ? results.flatMap(r => r.picks).reduce((s, p) => s + p.odds, 0) / totalBets : 0
  const avgStake = totalBets > 0 ? totalStaked / totalBets : 0

  const losingStreak = calculateMaxLosingStreak(results)
  const winningStreak = calculateMaxWinningStreak(results)

  return {
    summary: {
      totalRaces: results.length,
      totalBets,
      totalWins,
      totalPlaces,
      winRate: Math.round(winRate * 10) / 10,
      placeRate: Math.round(placeRate * 10) / 10,
      roi: Math.round(roi * 10) / 10,
      profit,
      startBankroll: bankroll,
      endBankroll: Math.round(runningBankroll * 100) / 100,
      totalStaked: Math.round(totalStaked * 100) / 100,
      totalReturned: Math.round(totalReturned * 100) / 100,
      avgOdds: Math.round(avgOdds * 10) / 10,
      avgStake: Math.round(avgStake * 100) / 100,
      losingStreak,
      winningStreak,
      betsPerRace: results.length > 0 ? Math.round((totalBets / results.length) * 10) / 10 : 0,
    },
    byMonth: groupByMonth(results),
    byCourse: groupByCourse(results),
    topPicks: getTopPicks(results),
    worstPicks: getWorstPicks(results),
    dailyPnl: results.map(r => ({ date: r.date, pnl: r.racePnl })),
    races: results,
  }
}

function calculateMaxLosingStreak(results) {
  let maxStreak = 0
  let currentStreak = 0
  for (const race of results) {
    for (const pick of race.picks) {
      if (pick.won) {
        maxStreak = Math.max(maxStreak, currentStreak)
        currentStreak = 0
      } else {
        currentStreak++
      }
    }
  }
  return Math.max(maxStreak, currentStreak)
}

function calculateMaxWinningStreak(results) {
  let maxStreak = 0
  let currentStreak = 0
  for (const race of results) {
    for (const pick of race.picks) {
      if (pick.won) {
        currentStreak++
        maxStreak = Math.max(maxStreak, currentStreak)
      } else {
        currentStreak = 0
      }
    }
  }
  return maxStreak
}

function groupByMonth(results) {
  const months = {}
  for (const race of results) {
    const month = race.date?.slice(0, 7) || 'Unknown'
    if (!months[month]) months[month] = { bets: 0, wins: 0, places: 0, staked: 0, returned: 0, pnl: 0 }
    for (const pick of race.picks) {
      months[month].bets++
      if (pick.won) months[month].wins++
      if (pick.placed) months[month].places++
      months[month].staked += pick.stake
      months[month].returned += pick.returned
      months[month].pnl += pick.pnl
    }
  }
  Object.values(months).forEach(m => {
    m.staked = Math.round(m.staked * 100) / 100
    m.returned = Math.round(m.returned * 100) / 100
    m.pnl = Math.round(m.pnl * 100) / 100
    m.winRate = m.bets > 0 ? Math.round((m.wins / m.bets) * 1000) / 10 : 0
    m.roi = m.staked > 0 ? Math.round(((m.returned - m.staked) / m.staked) * 1000) / 10 : 0
  })
  return months
}

function groupByCourse(results) {
  const courses = {}
  for (const race of results) {
    const course = race.course || 'Unknown'
    if (!courses[course]) courses[course] = { bets: 0, wins: 0, staked: 0, returned: 0 }
    for (const pick of race.picks) {
      courses[course].bets++
      if (pick.won) courses[course].wins++
      courses[course].staked += pick.stake
      courses[course].returned += pick.returned
    }
  }
  Object.entries(courses).forEach(([name, data]) => {
    data.winRate = data.bets > 0 ? Math.round((data.wins / data.bets) * 1000) / 10 : 0
    data.roi = data.staked > 0 ? Math.round(((data.returned - data.staked) / data.staked) * 1000) / 10 : 0
    data.staked = Math.round(data.staked * 100) / 100
    data.returned = Math.round(data.returned * 100) / 100
  })
  return courses
}

function getTopPicks(results) {
  return results
    .flatMap(r => r.picks.map(p => ({ ...p, course: r.course, date: r.date })))
    .filter(p => p.won)
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 10)
}

function getWorstPicks(results) {
  return results
    .flatMap(r => r.picks.map(p => ({ ...p, course: r.course, date: r.date })))
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 10)
}
