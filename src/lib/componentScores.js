import { getCourseProfile } from './courseProfiles.js'
import { REPLAY_TAG_LIBRARY } from './replayTagLibrary.js'

function parseFurlongs(distanceF) {
  if (!distanceF) return 0
  return parseFloat(String(distanceF).replace(/[^0-9.]/g, '')) || 0
}

function parseFormPositions(form = '') {
  const positions = []
  const segments = form.split(/[\/-]/)
  segments.forEach((seg) => {
    for (const ch of seg) {
      const n = parseInt(ch, 10)
      if (!isNaN(n)) positions.push(n)
    }
  })
  return positions.filter((p) => p > 0)
}

export function computeAbilityScore(runner, race) {
  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
  const rpr = Number(runner.rpr || 0)
  const bestRpr = Number(runner.best_rpr || rpr)
  const formPositions = parseFormPositions(runner.form || '')
  const fieldSize = (race.runners || []).length

  let score = 50

  if (or > 0) {
    const orNorm = Math.min(100, (or / 150) * 100)
    score += (orNorm - 50) * 0.6
  }

  if (rpr > 0) {
    const rprNorm = Math.min(100, (rpr / 150) * 100)
    score += (rprNorm - 50) * 0.4
  }

  if (bestRpr > rpr) {
    const peakGap = bestRpr - rpr
    if (peakGap <= 5) score += 5
    else if (peakGap <= 10) score += 2
    else if (peakGap > 20) score -= 5
  }

  if (formPositions.length >= 3) {
    const recent = formPositions.slice(0, 3)
    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
    const fieldNorm = avgPos / Math.max(fieldSize, 1)
    if (fieldNorm < 0.2) score += 12
    else if (fieldNorm < 0.35) score += 6
    else if (fieldNorm < 0.5) score += 2
    else if (fieldNorm > 0.75) score -= 8
    else score -= 3
  }

  if (formPositions.length >= 2) {
    const positions = [...formPositions].reverse()
    let improving = 0
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] < positions[i - 1]) improving++
    }
    const improvementRate = improving / (positions.length - 1)
    if (improvementRate > 0.7) score += 8
    else if (improvementRate > 0.5) score += 4
    else if (improvementRate < 0.2) score -= 5
  }

  return Math.max(1, Math.min(99, Math.round(score)))
}

export function computeFormScore(runner, race, races = []) {
  const horseId = runner.horse_id || runner.horse
  const formPositions = parseFormPositions(runner.form || '')
  const lastRun = Number(runner.last_run || 0)
  const fieldSize = (race.runners || []).length

  let score = 50

  if (formPositions.length > 0) {
    const recent = formPositions.slice(0, 3)
    const weights = [3, 2, 1]
    const slicedWeights = weights.slice(0, recent.length)
    const weightSum = slicedWeights.reduce((a, b) => a + b, 0)

    let weightedPos = 0
    recent.forEach((pos, i) => {
      weightedPos += pos * slicedWeights[i]
    })
    const avgWeighted = weightedPos / weightSum
    const fieldNorm = avgWeighted / Math.max(fieldSize, 1)

    if (fieldNorm < 0.15) score += 25
    else if (fieldNorm < 0.25) score += 15
    else if (fieldNorm < 0.4) score += 8
    else if (fieldNorm < 0.5) score += 3
    else if (fieldNorm > 0.75) score -= 15
    else score -= 6
  }

  if (lastRun > 0) {
    if (lastRun <= 14) score += 8
    else if (lastRun <= 21) score += 5
    else if (lastRun <= 35) score += 3
    else if (lastRun <= 60) score += 1
    else if (lastRun > 150) score -= 10
    else if (lastRun > 120) score -= 7
    else if (lastRun > 90) score -= 4
  }

  const horseRaces = races.filter((r) =>
    (r.runners || []).some((rn) => (rn.horse_id || rn.horse) === horseId)
  )
  if (horseRaces.length >= 2) {
    const recentRaces = horseRaces.slice(0, 3)
    let classEdge = 0
    recentRaces.forEach((hr) => {
      const rn = (hr.runners || []).find((r) => (r.horse_id || r.horse) === horseId)
      if (rn) {
        const prevClass = Number(hr.race_class || hr.class || 0)
        const todayClass = Number(race.race_class || race.class || 0)
        if (prevClass > 0 && todayClass > 0) {
          classEdge += todayClass - prevClass
        }
      }
    })
    const avgClassEdge = classEdge / recentRaces.length
    if (avgClassEdge < -2) score += 8
    else if (avgClassEdge < -1) score += 4
    else if (avgClassEdge > 2) score -= 8
    else if (avgClassEdge > 1) score -= 4
  }

  return Math.max(1, Math.min(99, Math.round(score)))
}

export function computeSuitabilityScore(runner, race, profile = null) {
  const distanceF = parseFurlongs(race.distance_f || '')
  const going = (race.going || '').toLowerCase()
  const course = race.course || ''
  const fieldSize = (race.runners || []).length
  const courseProfile = getCourseProfile(course)

  let score = 50

  if (distanceF > 0) {
    const distKey = `${Math.round(distanceF)}f`
    if (profile?.by_distance?.[distKey]) {
      const rec = profile.by_distance[distKey]
      if (rec.runs >= 3) {
        const rate = rec.wins / rec.runs
        if (rate > 0.35) score += 18
        else if (rate > 0.2) score += 10
        else if (rate > 0.1) score += 5
        else if (rate < 0.05) score -= 12
      } else if (rec.runs === 2) {
        if (rec.wins >= 1) score += 8
      } else if (rec.runs === 1) {
        if (rec.wins > 0) score += 5
      }
    }

    const runnerDistPref = runner.preferred_distance || runner.distance_preference
    if (runnerDistPref) {
      const prefF = parseFurlongs(runnerDistPref)
      if (prefF > 0) {
        const diff = Math.abs(distanceF - prefF)
        if (diff <= 1) score += 8
        else if (diff <= 2) score += 4
        else if (diff > 4) score -= 8
      }
    }
  }

  if (going) {
    const goingKey = going.includes('soft') || going.includes('heavy') ? 'soft' : going.includes('firm') || going.includes('fast') ? 'firm' : 'good'
    if (profile?.by_going?.[goingKey]) {
      const rec = profile.by_going[goingKey]
      if (rec.runs >= 3) {
        const rate = rec.wins / rec.runs
        if (rate > 0.35) score += 18
        else if (rate > 0.2) score += 10
        else if (rate > 0.1) score += 5
        else if (rate < 0.05) score -= 12
      } else if (rec.runs === 2) {
        if (rec.wins >= 1) score += 8
      } else if (rec.runs === 1) {
        if (rec.wins > 0) score += 5
      }
    }

    const runnerGoingPref = runner.preferred_going || runner.going_preference
    if (runnerGoingPref) {
      const prefKey = runnerGoingPref.toLowerCase()
      if (prefKey === goingKey) score += 8
      else if (prefKey === 'soft' && (going.includes('heavy') || going.includes('soft'))) score += 5
      else if (prefKey === 'firm' && (going.includes('firm') || going.includes('fast'))) score += 5
      else score -= 5
    }
  }

  if (courseProfile.handed !== 'unknown') {
    if (profile?.by_track_handed?.[courseProfile.handed]) {
      const rec = profile.by_track_handed[courseProfile.handed]
      if (rec.runs >= 3) {
        const rate = rec.wins / rec.runs
        if (rate > 0.3) score += 12
        else if (rate > 0.15) score += 6
        else if (rate < 0.05) score -= 10
      }
    }
  }

  if (courseProfile.type !== 'unknown') {
    if (profile?.by_track_type?.[courseProfile.type]) {
      const rec = profile.by_track_type[courseProfile.type]
      if (rec.runs >= 3) {
        const rate = rec.wins / rec.runs
        if (rate > 0.3) score += 8
        else if (rate < 0.05) score -= 5
      }
    }
  }

  if (courseProfile.uphill) {
    const uphillKey = 'true'
    if (profile?.by_uphill?.[uphillKey]) {
      const rec = profile.by_uphill[uphillKey]
      if (rec.runs >= 3) {
        const rate = rec.wins / rec.runs
        if (rate > 0.25) score += 8
        else if (rate < 0.05) score -= 6
      }
    }
  }

  if (fieldSize >= 16) score -= 4
  else if (fieldSize >= 14) score -= 2
  else if (fieldSize <= 6) score += 4

  return Math.max(1, Math.min(99, Math.round(score)))
}

export function computePaceCompatibility(runner, race, paceMap = {}) {
  const runningStyle = runner.runningStyle || classifyRunningStyle(runner)
  const draw = Number(runner.draw || 0)
  const fieldSize = (race.runners || []).length
  const projectedTempo = paceMap.projectedTempo || 'EVEN'
  const frontRunners = paceMap.frontRunners || 0

  let score = 50

  if (runningStyle === 'FRONT_RUNNER') {
    if (frontRunners <= 1) score += 15
    else if (frontRunners <= 2) score += 8
    else if (frontRunners >= 5) score -= 15
    else if (frontRunners >= 4) score -= 8

    if (projectedTempo === 'SLOW') score += 12
    else if (projectedTempo === 'EVEN') score += 4
    else if (projectedTempo === 'FAST') score -= 10

    if (draw <= 2 && fieldSize >= 8) score += 6
    else if (draw >= fieldSize - 1 && fieldSize >= 8) score -= 5
  }

  if (runningStyle === 'PRESSER') {
    if (frontRunners >= 3) score += 12
    else if (frontRunners >= 2) score += 6
    else if (frontRunners <= 1) score -= 8

    if (projectedTempo === 'EVEN' || projectedTempo === 'FAST') score += 8
    else if (projectedTempo === 'SLOW') score -= 6
  }

  if (runningStyle === 'MID_PACK') {
    if (frontRunners >= 4) score += 10
    else if (frontRunners >= 3) score += 5
    else if (frontRunners <= 1) score -= 5

    if (projectedTempo === 'FAST') score += 8
    else if (projectedTempo === 'EVEN') score += 3
    else if (projectedTempo === 'SLOW') score -= 5
  }

  if (runningStyle === 'CLOSER' || runningStyle === 'HOLD_UP') {
    if (frontRunners >= 5) score += 18
    else if (frontRunners >= 4) score += 12
    else if (frontRunners >= 3) score += 6
    else if (frontRunners <= 1) score -= 12

    if (projectedTempo === 'FAST') score += 18
    else if (projectedTempo === 'EVEN') score += 5
    else if (projectedTempo === 'SLOW') score -= 15

    if (fieldSize >= 12) score += 6
    else if (fieldSize >= 10) score += 3
    else if (fieldSize <= 6) score -= 8
  }

  const distanceF = parseFurlongs(race.distance_f || '')
  if (distanceF > 0 && distanceF <= 6) {
    if (runningStyle === 'FRONT_RUNNER') score += 8
    else if (runningStyle === 'CLOSER' || runningStyle === 'HOLD_UP') score -= 6
  }

  return Math.max(1, Math.min(99, Math.round(score)))
}

function classifyRunningStyle(runner) {
  const earlyPace = Number(runner.early_pace || runner.pace_figure_early || 0)
  const latePace = Number(runner.late_pace || runner.pace_figure_late || 0)
  const runningStyle = (runner.running_style || runner.style || '').toLowerCase()

  if (runningStyle.includes('front') || runningStyle.includes('lead')) return 'FRONT_RUNNER'
  if (runningStyle.includes('press') || runningStyle.includes('prom')) return 'PRESSER'
  if (runningStyle.includes('mid') || runningStyle.includes('stalk')) return 'MID_PACK'
  if (runningStyle.includes('closer') || runningStyle.includes('hold') || runningStyle.includes('back')) return 'CLOSER'

  if (earlyPace > 0 && latePace > 0) {
    if (earlyPace > 70) return 'FRONT_RUNNER'
    if (earlyPace > 50 && latePace > 50) return 'PRESSER'
    if (latePace > 60) return 'CLOSER'
    return 'MID_PACK'
  }

  return 'MID_PACK'
}

export function computeReplayScore(runner, race, replayNote = {}) {
  let score = 50

  const tags = replayNote.tags || []
  if (tags.length > 0) {
    let tagScore = 0
    for (const tag of tags) {
      const key = tag.toLowerCase().replace(/\s+/g, '_')
      const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[key])
      if (def) tagScore += def.score
    }

    const normalizedTagScore = (tagScore / 20) * 50
    score += normalizedTagScore
  }

  const manualAdj = Number(replayNote.adjustment || 0)
  if (manualAdj !== 0) {
    score += manualAdj * 2
  }

  const catScores = replayNote.category_scores || {}
  for (const [, catScore] of Object.entries(catScores)) {
    if (catScore > 0) score += catScore * 1.5
    else if (catScore < 0) score += catScore
  }

  const wlPriority = replayNote.watchlist_priority || 'LOW'
  if (wlPriority === 'HIGH') score += 5
  else if (wlPriority === 'MEDIUM') score += 3

  return Math.max(1, Math.min(99, Math.round(score)))
}

export function computeTrainerJockeyScore(runner) {
  let score = 50

  const trainerRtf = Number(runner.trainer_rtf || runner.trainer_win_rate || 0)
  const jockeyRtf = Number(runner.jockey_rtf || runner.jockey_win_rate || 0)

  if (trainerRtf > 0) {
    if (trainerRtf >= 35) score += 15
    else if (trainerRtf >= 30) score += 10
    else if (trainerRtf >= 25) score += 7
    else if (trainerRtf >= 20) score += 4
    else if (trainerRtf >= 15) score += 2
    else if (trainerRtf < 8) score -= 5
  }

  if (jockeyRtf > 0) {
    if (jockeyRtf >= 30) score += 12
    else if (jockeyRtf >= 25) score += 8
    else if (jockeyRtf >= 20) score += 5
    else if (jockeyRtf >= 15) score += 3
    else if (jockeyRtf < 8) score -= 4
  }

  const trainer = (runner.trainer || '').toLowerCase()
  const jockey = (runner.jockey || '').toLowerCase()

  const eliteTrainers = ['obrien', 'mullins', 'henderson', 'nicholls', 'gosden', 'haggas', 'stoute', 'appleby', 'varian', 'skelton']
  const eliteJockeys = ['moore', 'townend', 'blackmore', 'de boinville', 'cobden', 'doyle', 'johnson', 'skelton', 'bryan', 'bass']

  if (eliteTrainers.some((t) => trainer.includes(t))) score += 8
  if (eliteJockeys.some((j) => jockey.includes(j))) score += 6

  const comboKey = `${trainer}_${jockey}`
  const comboRtf = Number(runner.trainer_jockey_rtf || 0)
  if (comboRtf > 0) {
    if (comboRtf >= 30) score += 10
    else if (comboRtf >= 25) score += 6
    else if (comboRtf >= 20) score += 4
  }

  return Math.max(1, Math.min(99, Math.round(score)))
}

export function computeContextualWeightEffect(runner, race) {
  const weight = Number(runner.lbs || runner.weight_lbs || 0)
  const distanceF = parseFurlongs(race.distance_f || '')
  const going = (race.going || '').toLowerCase()
  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)

  let effect = 0

  if (weight > 0) {
    const avgWeight = 155
    const diff = weight - avgWeight

    let weightMultiplier = 1.0
    if (distanceF >= 14) weightMultiplier = 1.5
    else if (distanceF >= 10) weightMultiplier = 1.2
    else if (distanceF <= 6) weightMultiplier = 0.6

    if (going.includes('soft') || going.includes('heavy')) weightMultiplier *= 1.3
    else if (going.includes('firm') || going.includes('fast')) weightMultiplier *= 0.8

    if (or > 100) weightMultiplier *= 0.8
    else if (or < 70) weightMultiplier *= 1.2

    effect = -(diff * weightMultiplier * 0.15)
  }

  return Math.max(-10, Math.min(10, Math.round(effect * 10) / 10))
}

export function computeConditionMatching(runner, race, paceMap = {}) {
  const runningStyle = runner.runningStyle || classifyRunningStyle(runner)
  const projectedTempo = paceMap.projectedTempo || 'EVEN'
  const frontRunners = paceMap.frontRunners || 0
  const fieldSize = (race.runners || []).length
  const distanceF = parseFurlongs(race.distance_f || '')

  let match = 0

  const replayNote = runner.replayNote || {}
  const tags = replayNote.tags || []

  if (tags.includes('finished_well') || tags.includes('stayed_on') || tags.includes('strong_finish')) {
    if (frontRunners >= 3 || projectedTempo === 'FAST') match += 6
    if (distanceF >= 10) match += 3
  }

  if (tags.includes('outpaced') || tags.includes('outpaced_early') || tags.includes('outpaced_mid')) {
    if (frontRunners <= 2 || projectedTempo === 'SLOW') match += 5
  }

  if (tags.includes('travelled_well') || tags.includes('looked_winner')) {
    if (projectedTempo === 'EVEN' || projectedTempo === 'FAST') match += 4
  }

  if (tags.includes('flew_up_hill') || tags.includes('best work late')) {
    const courseProfile = getCourseProfile(race.course)
    if (courseProfile.uphill) match += 5
  }

  if (tags.includes('wide_trip') || tags.includes('unlucky_run') || tags.includes('blocked_run')) {
    if (fieldSize >= 10) match += 3
  }

  if (runningStyle === 'CLOSER' || runningStyle === 'HOLD_UP') {
    if (frontRunners >= 4 && projectedTempo === 'FAST') match += 5
    else if (frontRunners <= 2 && projectedTempo === 'SLOW') match -= 4
  }

  if (runningStyle === 'FRONT_RUNNER') {
    if (frontRunners <= 2 && projectedTempo !== 'FAST') match += 5
    else if (frontRunners >= 5) match -= 4
  }

  return Math.max(-10, Math.min(10, match))
}

export function computeAllComponents(runner, race, options = {}) {
  const profile = options.profile || null
  const replayNote = options.replayNote || {}
  const paceMap = options.paceMap || {}
  const races = options.races || []

  const ability = computeAbilityScore(runner, race)
  const form = computeFormScore(runner, race, races)
  const suitability = computeSuitabilityScore(runner, race, profile)
  const pace = computePaceCompatibility(runner, race, paceMap)
  const replay = computeReplayScore(runner, race, replayNote)
  const trainerJockey = computeTrainerJockeyScore(runner)
  const weightEffect = computeContextualWeightEffect(runner, race)
  const conditionMatch = computeConditionMatching(runner, race, paceMap)

  const blueprintWeights = {
    ability: 0.40,
    form: 0.25,
    suitability: 0.15,
    pace: 0.10,
    replay: 0.05,
    trainerJockey: 0.05,
  }

  const rawScore =
    ability * blueprintWeights.ability +
    form * blueprintWeights.form +
    suitability * blueprintWeights.suitability +
    pace * blueprintWeights.pace +
    replay * blueprintWeights.replay +
    trainerJockey * blueprintWeights.trainerJockey

  const adjustedScore = rawScore + weightEffect + conditionMatch

  const finalScore = Math.max(1, Math.min(99, Math.round(adjustedScore)))

  return {
    ability,
    form,
    suitability,
    pace,
    replay,
    trainerJockey,
    weightEffect,
    conditionMatch,
    rawScore: Math.round(rawScore),
    finalScore,
  }
}
