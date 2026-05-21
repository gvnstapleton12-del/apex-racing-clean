export function segmentByCourse(records = []) {
  if (!records.length) return { courses: [] }

  const courseMap = {}

  records.forEach((r) => {
    const course = r.course || 'Unknown'
    if (!courseMap[course]) {
      courseMap[course] = {
        course,
        runners: 0,
        wins: 0,
        places: 0,
        totalStake: 0,
        totalReturn: 0,
        runners_list: [],
      }
    }

    courseMap[course].runners += 1
    courseMap[course].totalStake += 1

    if (Number(r.actualPosition) === 1) {
      courseMap[course].wins += 1
      courseMap[course].totalReturn += Number(r.actualOdds) || 0
    }
    if (Number(r.actualPosition) >= 2 && Number(r.actualPosition) <= 3) {
      courseMap[course].places += 1
    }

    courseMap[course].runners_list.push({
      horse: r.horse,
      race: r.race,
      won: r.actualWon,
      odds: r.actualOdds,
    })
  })

  const courses = Object.values(courseMap).map((c) => {
    const roi = c.totalStake > 0 ? ((c.totalReturn - c.totalStake) / c.totalStake) * 100 : 0
    const strikeRate = c.runners > 0 ? (c.wins / c.runners) * 100 : 0
    const placeRate = c.runners > 0 ? (c.places / c.runners) * 100 : 0

    return {
      ...c,
      strikeRate: Math.round(strikeRate * 10) / 10,
      placeRate: Math.round(placeRate * 10) / 10,
      roi: Math.round(roi * 10) / 10,
      profitLoss: Math.round((c.totalReturn - c.totalStake) * 100) / 100,
    }
  }).sort((a, b) => b.roi - a.roi)

  return { courses }
}

export function segmentByRaceType(records = []) {
  if (!records.length) return { raceTypes: [] }

  const typeMap = {}

  records.forEach((r) => {
    const raceName = r.race || ''
    let raceType = 'Unknown'

    if (/handicap/i.test(raceName)) raceType = 'Handicap'
    else if (/maiden/i.test(raceName)) raceType = 'Maiden'
    else if (/novice/i.test(raceName)) raceType = 'Novice'
    else if (/claim/i.test(raceName)) raceType = 'Claimer'
    else if (/group\s*1|gr\s*1/i.test(raceName)) raceType = 'Group 1'
    else if (/group\s*2|gr\s*2/i.test(raceName)) raceType = 'Group 2'
    else if (/group\s*3|gr\s*3/i.test(raceName)) raceType = 'Group 3'
    else if (/listed/i.test(raceName)) raceType = 'Listed'
    else if (/nurser/i.test(raceName)) raceType = 'Nursery'
    else if (/selling/i.test(raceName)) raceType = 'Seller'

    if (!typeMap[raceType]) {
      typeMap[raceType] = {
        raceType,
        runners: 0,
        wins: 0,
        places: 0,
        totalStake: 0,
        totalReturn: 0,
      }
    }

    typeMap[raceType].runners += 1
    typeMap[raceType].totalStake += 1

    if (Number(r.actualPosition) === 1) {
      typeMap[raceType].wins += 1
      typeMap[raceType].totalReturn += Number(r.actualOdds) || 0
    }
    if (Number(r.actualPosition) >= 2 && Number(r.actualPosition) <= 3) {
      typeMap[raceType].places += 1
    }
  })

  const raceTypes = Object.values(typeMap).map((t) => {
    const roi = t.totalStake > 0 ? ((t.totalReturn - t.totalStake) / t.totalStake) * 100 : 0
    const strikeRate = t.runners > 0 ? (t.wins / t.runners) * 100 : 0
    const placeRate = t.runners > 0 ? (t.places / t.runners) * 100 : 0

    return {
      ...t,
      strikeRate: Math.round(strikeRate * 10) / 10,
      placeRate: Math.round(placeRate * 10) / 10,
      roi: Math.round(roi * 10) / 10,
      profitLoss: Math.round((t.totalReturn - t.totalStake) * 100) / 100,
    }
  }).sort((a, b) => b.roi - a.roi)

  return { raceTypes }
}

export function segmentByFieldSize(records = []) {
  if (!records.length) return { fieldSizes: [] }

  const sizeMap = {}

  records.forEach((r) => {
    const fieldSize = Number(r.fieldSize) || 0
    let bucket = 'Unknown'

    if (fieldSize <= 5) bucket = 'Small (2-5)'
    else if (fieldSize <= 8) bucket = 'Medium (6-8)'
    else if (fieldSize <= 12) bucket = 'Large (9-12)'
    else if (fieldSize <= 16) bucket = 'Very Large (13-16)'
    else if (fieldSize > 16) bucket = 'Massive (17+)'

    if (!sizeMap[bucket]) {
      sizeMap[bucket] = {
        fieldSize: bucket,
        runners: 0,
        wins: 0,
        places: 0,
        totalStake: 0,
        totalReturn: 0,
      }
    }

    sizeMap[bucket].runners += 1
    sizeMap[bucket].totalStake += 1

    if (Number(r.actualPosition) === 1) {
      sizeMap[bucket].wins += 1
      sizeMap[bucket].totalReturn += Number(r.actualOdds) || 0
    }
    if (Number(r.actualPosition) >= 2 && Number(r.actualPosition) <= 3) {
      sizeMap[bucket].places += 1
    }
  })

  const order = ['Small (2-5)', 'Medium (6-8)', 'Large (9-12)', 'Very Large (13-16)', 'Massive (17+)', 'Unknown']
  const fieldSizes = Object.values(sizeMap).map((s) => {
    const roi = s.totalStake > 0 ? ((s.totalReturn - s.totalStake) / s.totalStake) * 100 : 0
    const strikeRate = s.runners > 0 ? (s.wins / s.runners) * 100 : 0
    const placeRate = s.runners > 0 ? (s.places / s.runners) * 100 : 0

    return {
      ...s,
      strikeRate: Math.round(strikeRate * 10) / 10,
      placeRate: Math.round(placeRate * 10) / 10,
      roi: Math.round(roi * 10) / 10,
      profitLoss: Math.round((s.totalReturn - s.totalStake) * 100) / 100,
    }
  }).sort((a, b) => order.indexOf(a.fieldSize) - order.indexOf(b.fieldSize))

  return { fieldSizes }
}

export function segmentByGoing(records = []) {
  if (!records.length) return { goings: [] }

  const goingMap = {}

  records.forEach((r) => {
    const going = r.going || 'Unknown'
    if (!goingMap[going]) {
      goingMap[going] = {
        going,
        runners: 0,
        wins: 0,
        places: 0,
        totalStake: 0,
        totalReturn: 0,
      }
    }

    goingMap[going].runners += 1
    goingMap[going].totalStake += 1

    if (Number(r.actualPosition) === 1) {
      goingMap[going].wins += 1
      goingMap[going].totalReturn += Number(r.actualOdds) || 0
    }
    if (Number(r.actualPosition) >= 2 && Number(r.actualPosition) <= 3) {
      goingMap[going].places += 1
    }
  })

  const goings = Object.values(goingMap).map((g) => {
    const roi = g.totalStake > 0 ? ((g.totalReturn - g.totalStake) / g.totalStake) * 100 : 0
    const strikeRate = g.runners > 0 ? (g.wins / g.runners) * 100 : 0
    const placeRate = g.runners > 0 ? (g.places / g.runners) * 100 : 0

    return {
      ...g,
      strikeRate: Math.round(strikeRate * 10) / 10,
      placeRate: Math.round(placeRate * 10) / 10,
      roi: Math.round(roi * 10) / 10,
      profitLoss: Math.round((g.totalReturn - g.totalStake) * 100) / 100,
    }
  }).sort((a, b) => b.roi - a.roi)

  return { goings }
}

export function segmentByOddsRange(records = []) {
  if (!records.length) return { oddsRanges: [] }

  const rangeMap = {}

  records.forEach((r) => {
    const odds = Number(r.actualOdds) || Number(r.predictedOdds) || 0
    let bucket = 'Unknown'

    if (odds <= 2) bucket = '1/1 - 2/1 (1.0-2.0)'
    else if (odds <= 3) bucket = '2/1 - 3/1 (2.0-3.0)'
    else if (odds <= 5) bucket = '3/1 - 5/1 (3.0-5.0)'
    else if (odds <= 8) bucket = '5/1 - 8/1 (5.0-8.0)'
    else if (odds <= 12) bucket = '8/1 - 12/1 (8.0-12.0)'
    else if (odds <= 20) bucket = '12/1 - 20/1 (12.0-20.0)'
    else if (odds > 20) bucket = '20/1+ (20.0+)'

    if (!rangeMap[bucket]) {
      rangeMap[bucket] = {
        oddsRange: bucket,
        runners: 0,
        wins: 0,
        places: 0,
        totalStake: 0,
        totalReturn: 0,
      }
    }

    rangeMap[bucket].runners += 1
    rangeMap[bucket].totalStake += 1

    if (Number(r.actualPosition) === 1) {
      rangeMap[bucket].wins += 1
      rangeMap[bucket].totalReturn += Number(r.actualOdds) || 0
    }
    if (Number(r.actualPosition) >= 2 && Number(r.actualPosition) <= 3) {
      rangeMap[bucket].places += 1
    }
  })

  const order = [
    '1/1 - 2/1 (1.0-2.0)',
    '2/1 - 3/1 (2.0-3.0)',
    '3/1 - 5/1 (3.0-5.0)',
    '5/1 - 8/1 (5.0-8.0)',
    '8/1 - 12/1 (8.0-12.0)',
    '12/1 - 20/1 (12.0-20.0)',
    '20/1+ (20.0+)',
    'Unknown',
  ]
  const oddsRanges = Object.values(rangeMap).map((o) => {
    const roi = o.totalStake > 0 ? ((o.totalReturn - o.totalStake) / o.totalStake) * 100 : 0
    const strikeRate = o.runners > 0 ? (o.wins / o.runners) * 100 : 0
    const placeRate = o.runners > 0 ? (o.places / o.runners) * 100 : 0

    return {
      ...o,
      strikeRate: Math.round(strikeRate * 10) / 10,
      placeRate: Math.round(placeRate * 10) / 10,
      roi: Math.round(roi * 10) / 10,
      profitLoss: Math.round((o.totalReturn - o.totalStake) * 100) / 100,
    }
  }).sort((a, b) => order.indexOf(a.oddsRange) - order.indexOf(b.oddsRange))

  return { oddsRanges }
}

export function segmentByTrainer(records = []) {
  if (!records.length) return { trainers: [] }

  const trainerMap = {}

  records.forEach((r) => {
    const trainer = r.trainer || 'Unknown'
    if (!trainerMap[trainer]) {
      trainerMap[trainer] = {
        trainer,
        runners: 0,
        wins: 0,
        places: 0,
        totalStake: 0,
        totalReturn: 0,
      }
    }

    trainerMap[trainer].runners += 1
    trainerMap[trainer].totalStake += 1

    if (Number(r.actualPosition) === 1) {
      trainerMap[trainer].wins += 1
      trainerMap[trainer].totalReturn += Number(r.actualOdds) || 0
    }
    if (Number(r.actualPosition) >= 2 && Number(r.actualPosition) <= 3) {
      trainerMap[trainer].places += 1
    }
  })

  const trainers = Object.values(trainerMap)
    .filter((t) => t.runners >= 3)
    .map((t) => {
      const roi = t.totalStake > 0 ? ((t.totalReturn - t.totalStake) / t.totalStake) * 100 : 0
      const strikeRate = t.runners > 0 ? (t.wins / t.runners) * 100 : 0
      const placeRate = t.runners > 0 ? (t.places / t.runners) * 100 : 0

      return {
        ...t,
        strikeRate: Math.round(strikeRate * 10) / 10,
        placeRate: Math.round(placeRate * 10) / 10,
        roi: Math.round(roi * 10) / 10,
        profitLoss: Math.round((t.totalReturn - t.totalStake) * 100) / 100,
      }
    }).sort((a, b) => b.roi - a.roi)

  return { trainers }
}

export function computeAllSegmentations(records = []) {
  return {
    byCourse: segmentByCourse(records),
    byRaceType: segmentByRaceType(records),
    byFieldSize: segmentByFieldSize(records),
    byGoing: segmentByGoing(records),
    byOddsRange: segmentByOddsRange(records),
    byTrainer: segmentByTrainer(records),
  }
}
