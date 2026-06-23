// Component Scores Engine
// Individual scores for each factor that contribute to FINAL_PROBABILITY

import { analyzeForm } from './formEngine.js'
import { checkDrawEligibility } from './trackProfile.js'

function parseFurlongs(distanceF) {
  if (!distanceF) return 0
  if (typeof distanceF === 'number') return distanceF
  const m = String(distanceF).match(/(\d+)m\s*(\d*)f?\s*(\d*)y?/)
  if (m) {
    const miles = Number(m[1]) || 0
    const furlongs = Number(m[2]) || 0
    const yards = Number(m[3]) || 0
    return miles * 8 + furlongs + yards / 220
  }
  return parseFloat(String(distanceF).replace(/[^0-9.]/g, '')) || 0
}

function computePaceScore(runner, race, paceMap) {
  const runningStyle = runner.runningStyle || runner.running_style || ''
  const draw = Number(runner.draw || 0)
  const fieldSize = (race.runners || []).length
  const distanceF = parseFurlongs(race.distance_f || '')
  const course = (race.course || '').toLowerCase()

  let score = 50

  const styleLower = runningStyle.toLowerCase()
  if (styleLower.includes('led') || styleLower.includes('front')) score += 15
  else if (styleLower.includes('prominent') || styleLower.includes('close up')) score += 10
  else if (styleLower.includes('midfield') || styleLower.includes('mid-division')) score += 5
  else if (styleLower.includes('held up') || styleLower.includes('rear')) score -= 5

  if (draw > 0 && fieldSize >= 8) {
    if (course.includes('chester') && distanceF <= 7) {
      if (draw <= 3) score += 20
      else if (draw >= fieldSize - 1) score -= 15
    }
    if (course.includes('york') && distanceF <= 6) {
      if (draw <= 3) score += 15
      else if (draw >= fieldSize - 2) score -= 10
    }
    if (course.includes('ascot') && distanceF <= 6) {
      if (draw <= 4) score += 12
      else if (draw >= fieldSize - 2) score -= 8
    }
    if (course.includes('newmarket') && distanceF <= 6) {
      if (draw <= 3) score += 10
    }
  }

  const frontRunners = paceMap?.frontRunners || 0
  const tempo = paceMap?.projectedTempo || 'EVEN'

  if (frontRunners <= 2 && (styleLower.includes('led') || styleLower.includes('front'))) {
    score += 15
  }
  if (frontRunners >= 4 && (styleLower.includes('led') || styleLower.includes('front'))) {
    score -= 10
  }
  if (frontRunners >= 3 && tempo === 'FAST' && (styleLower.includes('held up') || styleLower.includes('rear'))) {
    score += 10
  }

  return Math.max(0, Math.min(100, score))
}

function computeDrawScore(runner, race) {
  const rawDraw = Number(runner.draw || 0)
  const fieldSize = (race.runners || []).length
  const distanceF = parseFurlongs(race.distance_f || '')
  const course = (race.course || '').toLowerCase()

  const drawEligibility = checkDrawEligibility(race.course, race.type || race.race_type, rawDraw)
  if (!drawEligibility.eligible) return 50

  const draw = rawDraw
  if (draw === 0 || fieldSize < 5) return 50

  let score = 50

  if (course.includes('chester')) {
    if (distanceF <= 7) {
      if (draw <= 3) score = 85
      else if (draw <= 5) score = 65
      else if (draw >= fieldSize - 1) score = 20
      else score = 40
    } else {
      score = 50
    }
  } else if (course.includes('york')) {
    if (distanceF <= 6) {
      if (draw <= 3) score = 80
      else if (draw >= fieldSize - 2) score = 25
      else score = 50
    } else {
      score = 50
    }
  } else if (course.includes('ascot')) {
    if (distanceF <= 6) {
      if (draw <= 4) score = 75
      else if (draw >= fieldSize - 2) score = 30
      else score = 50
    } else {
      score = 50
    }
  } else if (course.includes('newmarket')) {
    if (distanceF <= 6) {
      if (draw <= 3) score = 70
      else if (draw >= fieldSize - 2) score = 35
      else score = 50
    } else {
      score = 50
    }
  } else if (course.includes('goodwood')) {
    if (distanceF <= 6) {
      if (draw <= 4) score = 70
      else if (draw >= fieldSize - 2) score = 35
      else score = 50
    } else {
      score = 50
    }
  } else {
    const midPoint = Math.floor(fieldSize / 2)
    if (draw <= 3) score = 60
    else if (draw >= fieldSize - 2) score = 40
    else score = 50
  }

  return Math.max(0, Math.min(100, score))
}

function computeGroundScore(runner, race, goingDb) {
  const horseId = runner.horse_id || runner.horse
  const going = (race.going || '').toLowerCase()
  const formAnalysis = analyzeForm(runner, race)
  const positions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)

  let score = 50

  const goingProfile = goingDb[horseId]
  if (goingProfile?.byGoing) {
    const goingKey = race.going || 'Unknown'
    const record = goingProfile.byGoing[goingKey]
    if (record && record.runs >= 1) {
      const strikeRate = ((record.wins + record.places * 0.4) / record.runs) * 100
      if (strikeRate >= 50) score = 85
      else if (strikeRate >= 35) score = 70
      else if (strikeRate >= 20) score = 55
      else score = 35
    }
  }

  if (going.includes('heavy')) {
    const heavyRuns = formAnalysis.runs.filter(r => r.raw && (r.raw.includes('H') || r.raw.includes('h'))).length
    if (heavyRuns >= 2) score += 10
  }

  if (going.includes('soft')) {
    const softRuns = formAnalysis.runs.filter(r => r.raw && (r.raw.includes('S') || r.raw.includes('s'))).length
    if (softRuns >= 2) score += 8
  }

  return Math.max(0, Math.min(100, score))
}

function computeDistanceScore(runner, race, distanceDb) {
  const horseId = runner.horse_id || runner.horse
  const todayDist = parseFurlongs(race.distance_f || '')
  const formAnalysis = analyzeForm(runner, race)
  const positions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)

  let score = 50

  const distProfile = distanceDb[horseId]
  if (distProfile?.lastDistance > 0 && todayDist > 0) {
    const change = todayDist - distProfile.lastDistance

    if (Math.abs(change) <= 1) {
      score = 75
    } else if (change >= 2 && change <= 4) {
      score = 70
      const distRuns = distProfile.performances?.filter(p => p.distance >= todayDist - 2 && p.distance <= todayDist + 2) || []
      if (distRuns.length >= 1) {
        const wr = distRuns.filter(p => p.won).length / distRuns.length
        if (wr >= 0.3) score = 85
      }
    } else if (change <= -2 && change >= -4) {
      score = 65
    } else if (Math.abs(change) > 5) {
      score = 35
    }
  }

  if (todayDist > 0 && distProfile?.performances) {
    const similarRuns = distProfile.performances.filter(p => Math.abs(p.distance - todayDist) <= 2)
    if (similarRuns.length >= 2) {
      const wr = similarRuns.filter(p => p.won).length / similarRuns.length
      if (wr >= 0.4) score = Math.min(score + 15, 100)
    }
  }

  return Math.max(0, Math.min(100, score))
}

function computeClassMove(runner, race) {
  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
  const lastOR = Number(runner.last_or || runner.previous_or || runner.last_rating || 0)
  const raceClass = String(race.race_class || '').toLowerCase()
  const raceName = (race.race_name || race.pattern || '').toLowerCase()

  let score = 50

  if (lastOR > 0 && or > 0) {
    const drop = lastOR - or
    if (drop >= 10 && drop <= 20) {
      score = 80
    } else if (drop > 20) {
      score = 75
    } else if (drop > 0 && drop < 10) {
      score = 60
    } else if (or > lastOR && or - lastOR <= 5) {
      score = 55
    } else if (or > lastOR && or - lastOR > 5) {
      score = 40
    }
  }

  if (raceName.includes('handicap') && or > 0) {
    const runners = race.runners || []
    const ratings = runners.map(r => Number(r.ofr || 0)).filter(Boolean)
    if (ratings.length > 0) {
      const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length
      const orGap = or - avgRating
      if (orGap <= -10 && orGap >= -25) {
        score = Math.min(score + 15, 100)
      }
    }
  }

  return Math.max(0, Math.min(100, score))
}

function computeLastRunTrouble(runner) {
  const comments = (runner.comments || '').toLowerCase()
  const formAnalysis = analyzeForm(runner)
  const positions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)

  let score = 50

  const troublePatterns = [
    'blocked', 'hampered', 'no room', 'checked', 'crowded',
    'switched', 'ran green', 'green', 'looked winner', 'flew up',
    'head way', 'rally', 'stayed on well', 'never dangerous',
    'pulled up', 'fell', 'unseated', 'mistake', 'blunder',
    'lost ground', 'dropped to', 'outpaced', 'weakened'
  ]

  const troubleCount = troublePatterns.filter(p => comments.includes(p)).length

  if (troubleCount >= 2) {
    score = 75
  } else if (troubleCount === 1) {
    score = 65
  }

  if (positions.length >= 2) {
    const lastPos = positions[0]
    const prevPos = positions[1]
    if (lastPos >= 6 && prevPos <= 3) {
      score = Math.min(score + 10, 100)
    }
  }

  return Math.max(0, Math.min(100, score))
}

function computeTrainerForm(runner, trainerFormDb) {
  const trainer = (runner.trainer || '').toLowerCase()
  const trainerRtf = Number(runner.trainer_rtf || 0)

  let score = 50

  const trainerRecord = trainerFormDb[trainer]
  if (trainerRecord) {
    const runs = trainerRecord.runs || 0
    const wins = trainerRecord.wins || 0
    if (runs >= 10) {
      const winRate = (wins / runs) * 100
      if (winRate >= 25) score = 85
      else if (winRate >= 20) score = 75
      else if (winRate >= 15) score = 65
      else if (winRate >= 10) score = 55
      else score = 40
    }
  }

  if (trainerRtf >= 30) score = Math.min(score + 15, 100)
  else if (trainerRtf >= 25) score = Math.min(score + 10, 100)
  else if (trainerRtf >= 20) score = Math.min(score + 5, 100)
  else if (trainerRtf < 10) score = Math.max(score - 10, 0)

  return Math.max(0, Math.min(100, score))
}

function computeJockeyCourseSR(runner, race, jockeyFormDb) {
  const jockey = (runner.jockey || '').toLowerCase()
  const course = (race.course || '').toLowerCase()

  let score = 50

  const jockeyRecord = jockeyFormDb[jockey]
  if (jockeyRecord) {
    const runs = jockeyRecord.runs || 0
    const wins = jockeyRecord.wins || 0
    if (runs >= 10) {
      const winRate = (wins / runs) * 100
      if (winRate >= 25) score = 85
      else if (winRate >= 20) score = 75
      else if (winRate >= 15) score = 65
      else if (winRate >= 10) score = 55
      else score = 40
    }

    // Course-specific: check nested byCourse first, then flat key fallback
    const courseRecord = jockeyRecord.byCourse?.[course] || jockeyFormDb[`${jockey}|${course}`]
    if (courseRecord) {
      const courseRuns = courseRecord.runs || 0
      const courseWins = courseRecord.wins || 0
      if (courseRuns >= 5) {
        const courseSR = (courseWins / courseRuns) * 100
        if (courseSR >= 30) score = Math.min(score + 15, 100)
        else if (courseSR >= 20) score = Math.min(score + 10, 100)
        else if (courseSR < 10) score = Math.max(score - 10, 0)
      }
    }
  }

  return Math.max(0, Math.min(100, score))
}

export function computeClassDrop(runner, race) {
  const todayClass = Number(race.race_class || 0)
  if (todayClass < 1 || todayClass > 7) return 0

  // Determine today's race code
  const raceType = (race.type || race.race_name || '').toLowerCase()
  const isJumps = /(hurdle|chase|nh\s*flat|national hunt)/.test(raceType)
  const todayCode = isJumps ? 'JUMPS' : 'FLAT'

  // Filter previous results by same code, take last 5
  const prev = (runner.previous_results || []).filter(pr => {
    const rt = (pr.run_type || '').toUpperCase()
    if (todayCode === 'JUMPS') return ['HURDLE', 'CHASE', 'NH_FLAT'].includes(rt)
    return rt === 'FLAT'
  }).slice(0, 5)

  if (prev.length < 2) return 0

  // Confidence gate: at least 2 of last 3 same-code runs at higher class
  const last3 = prev.slice(0, 3)
  const atHigherClass = last3.filter(pr => {
    const prClass = Number(pr.race_class || 0)
    return prClass >= 1 && prClass <= 7 && prClass < todayClass
  })
  if (atHigherClass.length < 2) return 0

  // Average class of last 5 relevant runs
  const avgRecentClass = prev.reduce((s, pr) => {
    const pc = Number(pr.race_class || 0)
    return s + (pc >= 1 && pc <= 7 ? pc : todayClass)
  }, 0) / prev.length

  const classDrop = todayClass - avgRecentClass
  if (classDrop <= 0) return 0

  if (classDrop >= 3) return 95
  if (classDrop >= 2) return 80
  if (classDrop >= 1) return 65
  return 55
}

export function computeComponentScores(runner, race, options = {}) {
  const paceMap = options.paceMap || {}
  const goingDb = options.goingDb || {}
  const distanceDb = options.distanceDb || {}
  const trainerFormDb = options.trainerForm || {}
  const jockeyFormDb = options.jockeyForm || {}

  return {
    pace: computePaceScore(runner, race, paceMap),
    draw: computeDrawScore(runner, race),
    ground: computeGroundScore(runner, race, goingDb),
    distance: computeDistanceScore(runner, race, distanceDb),
    classMove: computeClassMove(runner, race),
    lastRunTrouble: computeLastRunTrouble(runner),
    trainerForm: computeTrainerForm(runner, trainerFormDb),
    jockeyCourseSR: computeJockeyCourseSR(runner, race, jockeyFormDb),
  }
}

// Legacy alias for backward compatibility
export function computeAllComponents(runner, race, options = {}) {
  const scores = computeComponentScores(runner, race, options)
  const avg = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length
  return {
    ...scores,
    finalScore: Math.round(avg * 10) / 10,
  }
}

export function computeFinalProbability(components, weights = {}) {
  const defaultWeights = {
    pace: 0.20,
    draw: 0.15,
    ground: 0.10,
    distance: 0.10,
    classMove: 0.15,
    lastRunTrouble: 0.10,
    trainerForm: 0.10,
    jockeyCourseSR: 0.10,
  }

  const w = { ...defaultWeights, ...weights }
  const totalWeight = Object.values(w).reduce((a, b) => a + b, 0)

  const weightedScore = (
    (components.pace || 50) * (w.pace / totalWeight) +
    (components.draw || 50) * (w.draw / totalWeight) +
    (components.ground || 50) * (w.ground / totalWeight) +
    (components.distance || 50) * (w.distance / totalWeight) +
    (components.classMove || 50) * (w.classMove / totalWeight) +
    (components.lastRunTrouble || 50) * (w.lastRunTrouble / totalWeight) +
    (components.trainerForm || 50) * (w.trainerForm / totalWeight) +
    (components.jockeyCourseSR || 50) * (w.jockeyCourseSR / totalWeight)
  )

  return Math.max(0, Math.min(100, Math.round(weightedScore * 10) / 10))
}
