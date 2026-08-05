import { calculateFieldStrength, normalizePosition } from './fieldStrength.js'
import { analyzeForm } from './formEngine.js'

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

function detectHiddenPositives(runner, race, fieldStrength) {
  const positives = []
  const formAnalysis = analyzeForm(runner, race)
  const positions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)
  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
  const rpr = Number(runner.rpr || 0)
  const lastRun = Number(runner.last_run || 0)
  const todayDist = parseFurlongs(race.distance_f || '')
  const going = (race.going || '').toLowerCase()
  const raceName = (race.race_name || race.pattern || '').toLowerCase()
  const raceType = (race.type || race.race_type || '').toLowerCase()
  const fieldSize = (race.runners || []).length
  const draw = Number(runner.draw || 0)

  const runCount = formAnalysis.summary.finishedRuns

  if (runCount <= 2 && runCount > 0) {
    positives.push({ factor: 'low_exposure', weight: 8, note: 'Lightly raced — market has less data' })
  }

  if (positions.length >= 3) {
    const recent = positions.slice(0, 3)
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length
    const older = positions.slice(3)
    const avgOlder = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : avgRecent

    if (avgRecent < avgOlder - 1.5) {
      positives.push({ factor: 'progressive', weight: 10, note: 'Improving form trend' })
    }

    const lastPos = positions[0]
    if (lastPos >= 7 && runCount >= 4) {
      const beforeLast = positions.slice(1, 4)
      const avgBefore = beforeLast.reduce((a, b) => a + b, 0) / beforeLast.length
      if (avgBefore <= 4) {
        positives.push({ factor: 'bounce_run', weight: 7, note: 'Bad last run after good form — bounce back candidate' })
      }
    }
  }

  // Use form engine's troubled run detection
  if (formAnalysis.troubled.isTroubled) {
    positives.push({ factor: 'badly_positioned', weight: 6, note: `Troubled run (${formAnalysis.troubled.keywords.join(', ')}) — form may understate ability` })
  }

  // Non-finishers can be betting angles
  if (formAnalysis.summary.nonFinishers > 0 && formAnalysis.summary.finishedRuns >= 2) {
    positives.push({ factor: 'non_finisher_angle', weight: 5, note: `${formAnalysis.summary.nonFinishers} non-finisher(s) in form — may hide ability` })
  }

  const distProfile = runner.distance_profile || {}
  if (distProfile.lastDistance > 0 && todayDist > 0) {
    const change = todayDist - distProfile.lastDistance
    if (change >= 2 && change <= 5) {
      positives.push({ factor: 'trip_upgrade', weight: 8, note: 'Step up in trip — may suit' })
    }
    if (change <= -2 && change >= -5) {
      positives.push({ factor: 'trip_drop', weight: 6, note: 'Drop in trip — speed test' })
    }
  }

  const goingProfile = runner.going_profile || {}
  const goingKey = race.going || 'Unknown'
  if (goingProfile[goingKey] && goingProfile[goingKey].runs >= 1) {
    const gp = goingProfile[goingKey]
    const strikeRate = ((gp.wins + gp.places * 0.4) / gp.runs) * 100
    if (strikeRate >= 40) {
      positives.push({ factor: 'going_specialist', weight: 7, note: `Strong record on ${goingKey}` })
    }
  }

  if (raceName.includes('handicap') && or > 0) {
    const ratings = (race.runners || []).map(r => Number(r.ofr || 0)).filter(Boolean)
    if (ratings.length > 0) {
      const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length
      const orGap = or - avgRating
      if (orGap <= -10 && orGap >= -25) {
        positives.push({ factor: 'handicap_angle', weight: 8, note: 'Below average mark — well handicapped' })
      }
    }
  }

  if (raceName.includes('handicap') && or > 0 && runCount >= 2) {
    const lastOR = Number(runner.last_or || runner.previous_or || 0)
    if (lastOR > 0 && or < lastOR) {
      positives.push({ factor: 'mark_dropped', weight: 9, note: `Rating dropped from ${lastOR} to ${or}` })
    }
  }

  if (draw > 0 && fieldSize >= 8) {
    const course = (race.course || '').toLowerCase()
    const dist = todayDist
    if (course.includes('chester') && dist <= 7) {
      if (draw <= 3) positives.push({ factor: 'draw_bias', weight: 10, note: 'Chester low draw advantage' })
      else if (draw >= fieldSize - 1) positives.push({ factor: 'draw_bias', weight: -8, note: 'Chester high draw penalty' })
    }
    if (course.includes('york') && dist <= 6) {
      if (draw <= 3) positives.push({ factor: 'draw_bias', weight: 8, note: 'York low draw advantage (sprint)' })
    }
    if (course.includes('ascot') && dist <= 6) {
      if (draw <= 4) positives.push({ factor: 'draw_bias', weight: 7, note: 'Ascot low draw advantage (sprint)' })
    }
  }

  const trainer = (runner.trainer || '').toLowerCase()
  const trainerRtf = Number(runner.trainer_rtf || 0)
  if (trainerRtf >= 25 && runCount <= 3) {
    positives.push({ factor: 'stable_intent', weight: 7, note: 'Hot stable with lightly raced horse' })
  }

  if (raceType.includes('novice') || raceType.includes('maiden')) {
    if (runCount === 0) {
      positives.push({ factor: 'debut_angle', weight: 5, note: 'Debutant — market uncertainty' })
    }
  }

  const totalWeight = positives.reduce((s, p) => s + p.weight, 0)
  return { positives, totalWeight }
}

export function eliminationGate(runner, race, options = {}) {
  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
  const rpr = Number(runner.rpr || 0)
  const bestRating = Math.max(or, rpr)
  const lastRun = Number(runner.last_run || 0)
  const todayDist = parseFurlongs(race.distance_f || '')

  const runners = race.runners || []
  const fieldSize = runners.length

  // Small field penalty instead of elimination
  // Small fields can produce clean pace maps — don't skip, just reduce confidence
  const fieldSizePenalty = fieldSize < 5 ? 0.82 :
                           fieldSize < 7 ? 0.92 :
                           fieldSize >= 14 ? 0.90 : 1.0

  const fieldStrength = calculateFieldStrength(runners, race)
  const ratings = runners.map((r) => Math.max(Number(r.ofr || 0), Number(r.rpr || 0))).filter(Boolean)
  const topRating = ratings.length ? Math.max(...ratings) : 0
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0

  // Use new form engine
  const formAnalysis = analyzeForm(runner, race)
  const rawPositions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)
  const positions = rawPositions.map((p) => normalizePosition(p, fieldStrength.strength, fieldSize))

  let maxScore = 100
  const reasons = []

  const hiddenPositives = detectHiddenPositives(runner, race, fieldStrength)

  if (topRating > 0 && bestRating > 0 && bestRating <= topRating - 20) {
    maxScore = Math.max(maxScore - 15, 50)
    reasons.push('or_gap')
  }

  if (lastRun >= 300) {
    maxScore = Math.max(maxScore - 10, 55)
    reasons.push('long_layoff')
  }

  // Use form engine's quality score instead of raw position check
  if (formAnalysis.quality.score < 35 && formAnalysis.summary.finishedRuns >= 3) {
    maxScore = Math.max(maxScore - 10, 55)
    reasons.push('poor_form')
  }

  // Bonus for troubled runs that may understate ability
  if (formAnalysis.troubled.isTroubled && formAnalysis.quality.score >= 50) {
    maxScore = Math.min(maxScore + 8, 100)
  }

  if (hiddenPositives.totalWeight >= 15) {
    maxScore = Math.min(maxScore + 10, 100)
  } else if (hiddenPositives.totalWeight >= 8) {
    maxScore = Math.min(maxScore + 5, 100)
  }

  return {
    eliminated: reasons.length >= 3 && hiddenPositives.totalWeight < 10,
    isContender: reasons.length === 0 || hiddenPositives.totalWeight >= 15,
    maxScore,
    reasons,
    hiddenPositives,
    fieldSizePenalty,
    formAnalysis,
  }
}
