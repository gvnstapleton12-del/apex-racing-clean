// APEX v4 — Historical Memory
// Store contextual intelligence over time
// Not just learning weights — actual patterns

export function loadHistoricalMemory(db = {}) {
  return {
    horseTendencies: db.horseTendencies || {},
    trainerPatterns: db.trainerPatterns || {},
    raceArchetypeOutcomes: db.raceArchetypeOutcomes || {},
    courseBehavior: db.courseBehavior || {},
    paceBiasHistory: db.paceBiasHistory || {},
    goingBias: db.goingBias || {},
  }
}

export function updateHorseTendency(memory, runner, result) {
  const key = runner.horse_id || runner.horse
  if (!memory.horseTendencies[key]) {
    memory.horseTendencies[key] = {
      horse: runner.horse,
      runs: 0,
      wins: 0,
      places: 0,
      avgPosition: 0,
      positionSum: 0,
      preferredGoing: {},
      preferredDistance: {},
      courseRecord: {},
      lastPositions: [],
    }
  }

  const tendency = memory.horseTendencies[key]
  tendency.runs++
  tendency.positionSum += result.position
  tendency.avgPosition = tendency.positionSum / tendency.runs

  if (result.position === 1) tendency.wins++
  if (result.position <= 3) tendency.places++

  tendency.lastPositions.unshift(result.position)
  if (tendency.lastPositions.length > 10) tendency.lastPositions.pop()

  if (result.going) {
    if (!tendency.preferredGoing[result.going]) tendency.preferredGoing[result.going] = { runs: 0, wins: 0 }
    tendency.preferredGoing[result.going].runs++
    if (result.position === 1) tendency.preferredGoing[result.going].wins++
  }

  if (result.distance) {
    if (!tendency.preferredDistance[result.distance]) tendency.preferredDistance[result.distance] = { runs: 0, wins: 0 }
    tendency.preferredDistance[result.distance].runs++
    if (result.position === 1) tendency.preferredDistance[result.distance].wins++
  }

  if (result.course) {
    if (!tendency.courseRecord[result.course]) tendency.courseRecord[result.course] = { runs: 0, wins: 0, places: 0 }
    tendency.courseRecord[result.course].runs++
    if (result.position === 1) tendency.courseRecord[result.course].wins++
    if (result.position <= 3) tendency.courseRecord[result.course].places++
  }

  return memory
}

export function updateTrainerPattern(memory, trainer, result) {
  if (!trainer) return memory

  if (!memory.trainerPatterns[trainer]) {
    memory.trainerPatterns[trainer] = {
      trainer,
      runs: 0,
      wins: 0,
      places: 0,
      rtf: 0,
      recentRuns: [],
      courseRecord: {},
      goingRecord: {},
      distanceRecord: {},
      raceTypeRecord: {},
    }
  }

  const pattern = memory.trainerPatterns[trainer]
  pattern.runs++
  pattern.recentRuns.unshift({ position: result.position, date: result.date || new Date().toISOString() })
  if (pattern.recentRuns.length > 20) pattern.recentRuns.pop()

  if (result.position === 1) pattern.wins++
  if (result.position <= 3) pattern.places++
  pattern.rtf = pattern.runs > 0 ? (pattern.wins / pattern.runs) * 100 : 0

  if (result.course) {
    if (!pattern.courseRecord[result.course]) pattern.courseRecord[result.course] = { runs: 0, wins: 0 }
    pattern.courseRecord[result.course].runs++
    if (result.position === 1) pattern.courseRecord[result.course].wins++
  }

  if (result.going) {
    if (!pattern.goingRecord[result.going]) pattern.goingRecord[result.going] = { runs: 0, wins: 0 }
    pattern.goingRecord[result.going].runs++
    if (result.position === 1) pattern.goingRecord[result.going].wins++
  }

  if (result.distance) {
    if (!pattern.distanceRecord[result.distance]) pattern.distanceRecord[result.distance] = { runs: 0, wins: 0 }
    pattern.distanceRecord[result.distance].runs++
    if (result.position === 1) pattern.distanceRecord[result.distance].wins++
  }

  if (result.raceType) {
    if (!pattern.raceTypeRecord[result.raceType]) pattern.raceTypeRecord[result.raceType] = { runs: 0, wins: 0 }
    pattern.raceTypeRecord[result.raceType].runs++
    if (result.position === 1) pattern.raceTypeRecord[result.raceType].wins++
  }

  return memory
}

export function updateRaceArchetypeOutcome(memory, archetype, result) {
  if (!archetype) return memory

  if (!memory.raceArchetypeOutcomes[archetype]) {
    memory.raceArchetypeOutcomes[archetype] = {
      archetype,
      races: 0,
      winners: [],
      avgFieldSize: 0,
      fieldSizeSum: 0,
      avgWinningOdds: 0,
      oddsSum: 0,
      paceBiasWins: {},
    }
  }

  const outcome = memory.raceArchetypeOutcomes[archetype]
  outcome.races++
  outcome.fieldSizeSum += result.fieldSize || 0
  outcome.avgFieldSize = outcome.fieldSizeSum / outcome.races

  if (result.position === 1) {
    outcome.winners.push({
      horse: result.horse,
      odds: result.odds,
      date: result.date || new Date().toISOString(),
    })
    if (result.odds) {
      outcome.oddsSum += result.odds
      outcome.avgWinningOdds = outcome.oddsSum / outcome.winners.length
    }
    if (result.runningStyle) {
      if (!outcome.paceBiasWins[result.runningStyle]) outcome.paceBiasWins[result.runningStyle] = 0
      outcome.paceBiasWins[result.runningStyle]++
    }
  }

  return memory
}

export function updateCourseBehavior(memory, course, result) {
  if (!course) return memory

  if (!memory.courseBehavior[course]) {
    memory.courseBehavior[course] = {
      course,
      races: 0,
      avgFieldSize: 0,
      fieldSizeSum: 0,
      drawBias: {},
      paceBiasWins: {},
      goingRecord: {},
    }
  }

  const behavior = memory.courseBehavior[course]
  behavior.races++
  behavior.fieldSizeSum += result.fieldSize || 0
  behavior.avgFieldSize = behavior.fieldSizeSum / behavior.races

  if (result.draw && result.position <= 3) {
    const drawBand = result.draw <= 3 ? 'low' : result.draw <= 6 ? 'mid' : 'high'
    if (!behavior.drawBias[drawBand]) behavior.drawBias[drawBand] = { runs: 0, wins: 0, places: 0 }
    behavior.drawBias[drawBand].runs++
    if (result.position === 1) behavior.drawBias[drawBand].wins++
    if (result.position <= 3) behavior.drawBias[drawBand].places++
  }

  if (result.position === 1 && result.runningStyle) {
    if (!behavior.paceBiasWins[result.runningStyle]) behavior.paceBiasWins[result.runningStyle] = 0
    behavior.paceBiasWins[result.runningStyle]++
  }

  if (result.going) {
    if (!behavior.goingRecord[result.going]) behavior.goingRecord[result.going] = { runs: 0, wins: 0 }
    behavior.goingRecord[result.going].runs++
    if (result.position === 1) behavior.goingRecord[result.going].wins++
  }

  return memory
}

export function updatePaceBiasHistory(memory, paceMap, result) {
  if (!paceMap) return memory

  const tempo = paceMap.projectedTempo || 'EVEN'
  const frontRunners = paceMap.frontRunners || 0
  const key = `${tempo}_${frontRunners}`

  if (!memory.paceBiasHistory[key]) {
    memory.paceBiasHistory[key] = {
      tempo,
      frontRunners,
      races: 0,
      winnerStyles: {},
      avgWinPosition: 0,
      positionSum: 0,
    }
  }

  const bias = memory.paceBiasHistory[key]
  bias.races++
  bias.positionSum += result.position
  bias.avgWinPosition = bias.positionSum / bias.races

  if (result.position === 1 && result.runningStyle) {
    if (!bias.winnerStyles[result.runningStyle]) bias.winnerStyles[result.runningStyle] = 0
    bias.winnerStyles[result.runningStyle]++
  }

  return memory
}

export function updateGoingBias(memory, going, result) {
  if (!going) return memory

  if (!memory.goingBias[going]) {
    memory.goingBias[going] = {
      going,
      races: 0,
      avgWinningOdds: 0,
      oddsSum: 0,
      winners: 0,
      winnerStyles: {},
    }
  }

  const bias = memory.goingBias[going]
  bias.races++

  if (result.position === 1) {
    bias.winners++
    if (result.odds) {
      bias.oddsSum += result.odds
      bias.avgWinningOdds = bias.oddsSum / bias.winners
    }
    if (result.runningStyle) {
      if (!bias.winnerStyles[result.runningStyle]) bias.winnerStyles[result.runningStyle] = 0
      bias.winnerStyles[result.runningStyle]++
    }
  }

  return memory
}

export function processHistoricalMemory(memory, result) {
  updateHorseTendency(memory, result, result)
  updateTrainerPattern(memory, result.trainer, result)
  updateRaceArchetypeOutcome(memory, result.archetype, result)
  updateCourseBehavior(memory, result.course, result)
  updatePaceBiasHistory(memory, result.paceMap, result)
  updateGoingBias(memory, result.going, result)
  return memory
}

export function getHorseInsight(memory, runner, race) {
  const key = runner.horse_id || runner.horse
  const tendency = memory.horseTendencies[key]

  if (!tendency) return null

  const going = race.going || ''
  const goingRecord = tendency.preferredGoing[going]
  const course = race.course || ''
  const courseRecord = tendency.courseRecord[course]

  const insights = []

  if (goingRecord && goingRecord.runs >= 2) {
    const winRate = (goingRecord.wins / goingRecord.runs) * 100
    if (winRate > 30) insights.push(`Strong on ${going} (${Math.round(winRate)}% SR)`)
  }

  if (courseRecord && courseRecord.runs >= 2) {
    const winRate = (courseRecord.wins / courseRecord.runs) * 100
    if (winRate > 25) insights.push(`Course specialist (${Math.round(winRate)}% SR)`)
  }

  if (tendency.avgPosition < 4 && tendency.runs >= 5) {
    insights.push(`Consistent performer (avg pos ${tendency.avgPosition.toFixed(1)})`)
  }

  return insights.length > 0 ? insights : null
}
