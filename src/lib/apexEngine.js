import { eliminationGate } from './eliminationGate.js'
import { calculatePersonalAffinityBonus } from './personalAffinity.js'
import { corePowerScore } from './powerScore.js'
import { classifyRunningStyle, generatePaceMap, paceMatrixScore, computePacePressure, computeEarlyPaceScore, detectRaceShape } from './paceEngine.js'
import { humanIntelligenceLayer } from './humanIntelligence.js'
import { marketIntelligence, marketAlignment } from './marketIntelligence.js'
import { volatilityIndex } from './volatilityIndex.js'
import { syndicateStake } from './kellyEngine.js'
import { buildSyndicateFeatures } from './syndicateFeatures.js'
import { classifyRaceArchetype, getRaceWeights, getModifierAdjustments, getFieldSizeAdjustments } from './raceArchetype.js'
import { bucketKey, getBucketWeights } from './contextBuckets.js'
import { buildNarrative } from './narrativeBuilder.js'
import { matchConditions } from './conditionDB.js'
import { estimateEnergyDistribution } from './energyModel.js'
import { evaluatePaceCompatibility } from './horseTags.js'
import { detectFalseFavourite } from './falseFavourite.js'
import { detectHiddenImprover } from './hiddenImprover.js'
import { detectStableIntent } from './stableIntent.js'
import { calculateUncertainty } from './uncertaintyModel.js'
import { selectionQuality } from './selectionQuality.js'
import { placeTraits, bayesianPlaceProbabilities, bayesianWinProbabilities } from './placeModel.js'
import { computeInteractions, applyInteractionAdjustments } from './interactionEngine.js'
import { computeHorseQuality } from './engine1_horseQuality.js'
import { runRaceSimulation } from './engine2_raceSimulation.js'
import { analyzeMarket } from './engine3_marketModel.js'
import { computeValue } from './engine4_valueEngine.js'
import { computeBankroll } from './engine5_bankroll.js'
import { computeBetFilter } from './engine6_betFilter.js'
import { generateExplanation } from './explainability.js'
import { detectScenarioFlags } from './scenarioFlags.js'
import { computeConfidenceTier } from './confidenceTiers.js'
import { computeReplayFlags } from './replayFlagEngine.js'
import { computeAllComponents, computeComponentScores, computeFinalProbability, computeClassDrop } from './componentScores.js'
// import { computeCalibrationAdjustment } from './calibrationEngine.js'
import { computeTrackBiasFactor, getDrawBias, isAW, checkDrawEligibility } from './trackProfile.js'
import { evaluateAWTransfer } from './awTransfer.js'
import { classifyClassLevel, computeORFit, computeWeightFit, computeORProfileAdjustment, computeRPRORFit } from './classModel.js'
import { computePerformanceRating } from './performanceRating.js'
import { identifyWinPatterns } from './winPatternMatrix.js'
import { writeFileSync, appendFileSync } from 'fs'
import { join } from 'path'

function probBand(winProb) {
  if (winProb >= 30) return { label: 'High Probability', range: '30%+', tier: 1 }
  if (winProb >= 20) return { label: 'Medium-High', range: '20-30%', tier: 2 }
  if (winProb >= 12) return { label: 'Medium', range: '12-20%', tier: 3 }
  if (winProb >= 6) return { label: 'Low', range: '6-12%', tier: 4 }
  return { label: 'Very Low', range: '<6%', tier: 5 }
}

function betQuality(probBand, winProb, marketAdj, odds) {
  if (probBand.tier >= 5) return 'NO BET'
  if (probBand.tier >= 4 && winProb < 8) return 'NO BET'

  const value = winProb * (odds - 1) - (100 - winProb)

  if (value > 20 && probBand.tier <= 3) return 'STRONG VALUE'
  if (value > 10) return 'VALUE'
  if (marketAdj >= 4 && winProb > 12) return 'PLAYABLE'
  if (marketAdj >= -2 && winProb > 15) return 'PLAYABLE'
  return 'SPECULATIVE'
}

// --- DUAL-MODE ENGINE: Outlier detection for longshot bypass valve ---

const ELITE_YARDS = [
  'willie mullins', 'w. p. mullins', 'nicholas gifford', 'dan skelton',
  'n Henderson', 'nicky henderson', 'gordon elliott', 'olly murphy',
  'john mcconnell', 'p. n. murphy', 'emily upton', 'jonjo o\'neill',
  'paul nicholls', 'colin tizzard', 'kim bailey', 'venetia williams',
]

function checkOutlierTriggers(runner, rpPerformance) {
  const { lastRaceMargin = 0, speedTrend = [], highestRPR = 0 } = rpPerformance
  const trainerName = (runner.trainer || '').toLowerCase()

  // Rule 1: Multi-length dominant win (margin >= 5 lengths)
  if (lastRaceMargin >= 5.0) {
    return { isTriggered: true, reason: `Dominant Prep (${lastRaceMargin}L)` }
  }

  // Rule 2: Elite yard class reset — top trainer + high career RPR
  const matchesYard = ELITE_YARDS.some(yard => trainerName.includes(yard))
  if (matchesYard && highestRPR >= 125) {
    return { isTriggered: true, reason: `Elite Yard Reset (RPR ${highestRPR})` }
  }

  // Rule 3: Progressive speed curve — 3 consecutive improving RPRs
  if (speedTrend.length === 3) {
    const improving = speedTrend[2] > speedTrend[1] && speedTrend[1] > speedTrend[0]
    const gain = speedTrend[2] - speedTrend[0]
    if (improving && gain >= 15) {
      return { isTriggered: true, reason: `Speed Curve (${speedTrend.join('→')})` }
    }
  }

  return { isTriggered: false, reason: null }
}

function evaluateRunnerDualMode(runner, rpDataMap) {
  const odds = Number(runner.odds) || 0
  const paConf = runner.personalAffinity?.confidence ?? 0

  // Use winnerScore (raw, pre-PA-discount) to avoid double-penalizing
  // finalScore already has sqrt(paConfidence) applied
  const score = runner.winnerScore || runner.finalScore || runner.score || 0

  const horseKey = (runner.horse || runner.horse_name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
  const rpData = rpDataMap?.[horseKey] || null

  // MODE A: Favorites grinder (odds <= 8.0)
  // Checks raw winnerScore to avoid double-penalty with PA confidence
  if (odds > 0 && odds <= 8.0) {
    const passesScore = score >= 25
    const passesPA = paConf >= 0.25

    if (passesScore && passesPA) {
      return {
        engineLabel: odds <= 3.5 ? 'STRONG FAVORITE' : 'VALUE PLAY',
        triggerReason: null,
      }
    }
  }

  // MODE B: Outlier bypass valve (odds > 8.0)
  if (odds > 8.0 && rpData) {
    const check = checkOutlierTriggers(runner, rpData)
    if (check.isTriggered) {
      return {
        engineLabel: 'OUTLIER',
        triggerReason: check.reason,
      }
    }
  }

  return { engineLabel: null, triggerReason: null }
}

export function runApexEngine(runners, race, options = {}) {

  const goingDb = options.goingDb || {}
  const distanceDb = options.distanceDb || {}
  const replayDb = options.replayDb || {}
  const bucketDb = options.bucketDb || {}
  const rpDataMap = options.rpDataMap || {}

  // Track category lookup for per-category course affinity multipliers
  const trackProfiles = options.trackProfiles || null
  const CATEGORY_MULTIPLIERS = {
    tactical: 3.0,
    specialist: 3.0,
    stamina: 2.5,
    galloping: 2.0,
  }
  let trackCategory = 'galloping'
  if (trackProfiles?.tracks?.[race.course]) {
    trackCategory = trackProfiles.tracks[race.course].trackCategory || 'galloping'
  }
  const baseCourseMult = options.courseMultiplier ?? 2.5
  const courseMultiplier = options.courseMultipliers?.[trackCategory] ?? baseCourseMult

  const archetype = classifyRaceArchetype(race)
  const archetypeWeights = getRaceWeights(archetype.archetype)

  const raceBucket = bucketKey(race)
  const bucketWeights = getBucketWeights(bucketDb, raceBucket, archetypeWeights)

  const weights = bucketDb?.[raceBucket]?.predictions >= 20 ? bucketWeights : archetypeWeights
  const source = bucketDb?.[raceBucket]?.predictions >= 20 ? 'bucket' : 'archetype'

  const modifiers = getModifierAdjustments(archetype.modifiers)
  const fieldSizeAdj = getFieldSizeAdjustments(archetype.fieldTier)

  const adjustedWeights = {
    power: weights.power + (modifiers.paceAdj || 0) + (fieldSizeAdj.powerMod || 0),
    pace: weights.pace + (modifiers.paceAdj || 0) + (fieldSizeAdj.paceMod || 0),
    human: weights.human,
    market: weights.market + (modifiers.marketAdj || 0) + (fieldSizeAdj.marketMod || 0),
    trainer: weights.trainer + (modifiers.trainerAdj || 0) + (modifiers.drawAdj || 0) + (fieldSizeAdj.trainerMod || 0),
  }

  // Apply learned multiplier weights from learning engine
  // Maps: class→power, stride→pace, clv→human, trainer→trainer
  // traffic→market DISABLED for WinnerScore — market influence kept minimal
  const multiplier = options.multiplier || {}
  if (multiplier.class || multiplier.stride || multiplier.trainer || multiplier.clv) {
    adjustedWeights.power *= (multiplier.class || 1)
    adjustedWeights.pace *= (multiplier.stride || 1)
    adjustedWeights.human *= (multiplier.clv || 1)
    adjustedWeights.trainer *= (multiplier.trainer || 1)
  }

  const totalWeight = adjustedWeights.power + adjustedWeights.pace + adjustedWeights.human + adjustedWeights.market + adjustedWeights.trainer
  const normalizedWeights = {
    power: adjustedWeights.power / totalWeight,
    pace: adjustedWeights.pace / totalWeight,
    human: adjustedWeights.human / totalWeight,
    market: adjustedWeights.market / totalWeight,
    trainer: adjustedWeights.trainer / totalWeight,
  }

  const volatility = volatilityIndex(race)

  const earlyScores = runners.map((r) => computeEarlyPaceScore(r, race))
  const styles = runners.map((r, i) => {
    r.earlyPaceScore = earlyScores[i]
    return classifyRunningStyle(r, race)
  })
  const runnersWithScores = runners.map((r, i) => ({ ...r, runningStyle: styles[i], earlyPaceScore: earlyScores[i] }))
  const paceMap = generatePaceMap(runnersWithScores)
  const pacePressure = computePacePressure(paceMap)
  const raceShape = detectRaceShape(runnersWithScores, race)

  // Compute field average OR for class model
  const orValues = runners.map(r => Number(r.or || 0)).filter(n => n > 0)
  const fieldAvgOR = orValues.length > 0 ? orValues.reduce((s, v) => s + v, 0) / orValues.length : 0

  const fieldFRCount = styles.filter(s => s === 'Front Runner').length

  const results = runners.map((runner, idx) => {
    const runnerStart = Date.now()
    const runningStyle = styles[idx]
    const rawDraw = Number(runner.draw || 0)
    const fieldSize = runners.length
    const horseId = runner.horse_id || runner.horse
    const earlyPaceScore = earlyScores[idx]
    const drawEligibility = checkDrawEligibility(race.course, race.type, rawDraw)
    const draw = drawEligibility.eligible ? rawDraw : 0
    const replayKey = `${runner.horse}|${race.course}`
    const replayNote = replayDb[replayKey] || Object.entries(replayDb || {}).find(([key]) => key.startsWith(`${runner.horse}|`))?.[1] || {}

    const elimination = eliminationGate(runner, race, { distanceDb })

    const { total: rawPower } = corePowerScore(runner, race, {
      goingAdj: elimination.eliminated ? 0 : options.goingDbAdj?.[horseId] || 0,
      distanceAdj: elimination.eliminated ? 0 : options.distanceDbAdj?.[horseId] || 0,
    })

    const powerScore = Math.min(rawPower, elimination.maxScore)

    const paceScore = paceMatrixScore(runningStyle, paceMap, draw, fieldSize)

    const energy = estimateEnergyDistribution(runner, race, {
      runningStyle,
      paceMap,
      earlyPaceScore,
      raceShape,
    })

    const paceCompat = evaluatePaceCompatibility(
      computeEarlyPaceScore(runner, race),
      raceShape,
      parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0,
      fieldSize
    )

    const improver = detectHiddenImprover(runner, race, {
      goingDb,
      distanceDb,
      replayDb,
    })

    const stableIntent = detectStableIntent(runner, race, {
      goingDb,
      distanceDb,
    })

    // Condition matching — cross-reference historical wins/places
    const conditionMatch = matchConditions(
      runner.horse,
      race.going,
      race.distance_f,
      race.raceClass,
      runner.weight,
    )

    // Track profile — draw bias + surface/pace suitability
    const distanceF = parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0
    const courseType = race.courseType
      || (race.surface
        ? (race.surface.toLowerCase().includes('turf') ? 'Turf'
          : race.surface.toLowerCase().includes('aw') || race.surface.toLowerCase().includes('poly') || race.surface.toLowerCase().includes('tapeta') ? 'AW'
          : null)
        : null)
    const stallNumber = drawEligibility.eligible ? (Number(runner.draw) || 0) : 0
    const trackBiasFactor = computeTrackBiasFactor(
      race.course,
      distanceF,
      runningStyle,
      race.going || '',
      stallNumber,
      (runnersWithScores || runners).length,
      courseType,
      race.type || null,
      (() => {
        const hg = runner.headgear
        if (!hg) return null
        if (Array.isArray(hg)) return hg
        if (typeof hg === 'object') return hg.firstTimeItems || null
        return null
      })(),
      (() => {
        const hg = runner.headgear
        if (!hg) return null
        if (Array.isArray(hg)) return hg
        if (typeof hg === 'object') return hg.items || null
        return null
      })(),
      race.race_name || ''
    )
    const drawBias = drawEligibility.eligible ? getDrawBias(race.course, distanceF) : null
    const isAllWeather = isAW(race.course)
    const trackAdj = (trackBiasFactor - 1.0) * 100

    // AW transfer — flag only, no score adjustment
    const awTransfer = !isAllWeather ? evaluateAWTransfer(runner.previous_results || [], race.course, race.going, distanceF, runner.or) : { hasAWForm: false, adjustment: 0, label: 'AW race' }
    const awTransferAdj = 0 // Disabled as score modifier, kept for flags

    // Class model — class fit + OR fit
    const raceClass = classifyClassLevel(race.race_class, race.race_class)
    const raceName = (race.race_name || '').toLowerCase()
    const isHandicap = raceName.includes('handicap') || race.type === 'Handicap' || race.type === 'Hurdle' || race.type === 'Chase'
    const isMaiden = raceName.includes('maiden') || raceName.includes('novice') || raceName.includes('bumper')
    const isBigField = fieldSize >= 12

    // OR fit: full weight in handicaps, reduced elsewhere
    const orFit = computeORFit(runner.or, fieldAvgOR, raceClass)
    const orWeight = isHandicap ? 1.0 : isMaiden ? 0.2 : 0.4

    // Weight fit: full weight in handicaps + big fields, reduced in small/novice
    const weightFit = computeWeightFit(runner.lbs, fieldSize)
    const weightWeight = isHandicap && isBigField ? 1.0 : isHandicap ? 0.7 : isMaiden ? 0.2 : 0.4

    const classAdj = (orFit.fit - 0.5) * 8 * orWeight + (weightFit.fit - 0.5) * 4 * weightWeight

    // OR profile — historical win rate at this OR level
    const orProfileAdj = options.orHistory
      ? computeORProfileAdjustment(runner.horse, runner.or || fieldAvgOR, options.orHistory)
      : { adjustment: 0, label: 'No data', profile: null }

    // RPR vs OR gap — horse ahead of or behind handicapper's mark
    const rprORFit = computeRPRORFit(runner.rpr, runner.or, isHandicap, runner.bha_trend || 0, runner.previous_results || [], computePerformanceRating, race.type || race.race_name || '')

    const humanAdj = humanIntelligenceLayer(replayNote, race.course)
    const profileAdj = options.horseProfiles?.[horseId]?.profile_adjustment || 0

    const marketAdj = marketIntelligence(runner, powerScore, { odds: runner.odds })

    // Market movement weighting — steamers boost, drifters suppress
    const marketMovement = runner.marketMovement || 'UNKNOWN'
    const movementMultiplier = marketMovement === 'STRONG STEAM' ? 1.12 :
      marketMovement === 'STEAM' ? 1.06 :
      marketMovement === 'DRIFT' ? 0.94 :
      marketMovement === 'STRONG DRIFT' ? 0.88 : 1.0

    const trainerScore = options.trainerScores?.[horseId] || 0

    // Trainer/jockey form tracking
    const trainerForm = options.trainerForm?.[runner.trainer] || { winRate: 0, runs: 0 }
    const jockeyForm = options.jockeyForm?.[runner.jockey] || { winRate: 0, runs: 0 }

    const trainerAdj = trainerForm.runs >= 5 ? (trainerForm.winRate - 15) * 0.1 : 0
    const jockeyAdj = jockeyForm.runs >= 5 ? (jockeyForm.winRate - 15) * 0.2 : 0

    const features = buildSyndicateFeatures(runner, race, {
      goingDb,
      distanceDb,
      runningStyle,
      paceScore,
      energy,
      paceCompat,
      improver,
      stableIntent,
    })

    // Component Scores Engine - separate Ability, Form, Suitability, Pace, Replay, Trainer/Jockey
    const profile = options.horseProfiles?.[horseId]?.profile || null
    const components = computeAllComponents(runner, race, {
      profile,
      replayNote,
      paceMap,
      races: options.races || [],
    })

    // New Component Scores: PACE, DRAW, GROUND, DISTANCE, CLASS_MOVE, LAST_RUN_TROUBLE, TRAINER_FORM, JOCKEY_COURSE_SR
    const newComponents = computeComponentScores(runner, race, {
      paceMap,
      goingDb,
      distanceDb,
      trainerForm: options.trainerForm || {},
      jockeyForm: options.jockeyForm || {},
    })
    newComponents.classDrop = computeClassDrop(runner, race)

    // Engine 1: Horse Quality Model — pure racing merit, ignores odds
    const horseQuality = computeHorseQuality(runner, race, paceMap)

    // FINAL_PROBABILITY from component scores
    const finalProbability = computeFinalProbability(newComponents)

    // Race Shape Suitability Score
    // Who benefits MOST if this race unfolds a certain way?
    const raceShapeSuitability = Math.round(
      horseQuality.paceCompat * 0.30 +
      horseQuality.finishing.score * 0.25 +
      horseQuality.staminaBias * 0.20 +
      pacePressure * 0.15 +
      (stableIntent.hiddenUpside || 0) * 0.05
    )

    // Blend component score with legacy layered score
    const paceNorm = ((paceScore + 15) / 30) * 100
    const humanNorm = ((humanAdj + 12) / 24) * 100
    const marketNorm = ((marketAdj + 10) / 20) * 100
    const trainerNorm = (trainerScore / 10) * 100
    const profileNorm = ((profileAdj + 10) / 20) * 100

    const legacyLayeredScore = Math.round(
      powerScore * normalizedWeights.power +
      paceNorm * normalizedWeights.pace +
      humanNorm * normalizedWeights.human +
      marketNorm * normalizedWeights.market +
      trainerNorm * normalizedWeights.trainer +
      profileNorm * 0.05
    )

    // Use component score as primary, legacy as fallback
    const componentBlend = Math.round(
      components.finalScore * 0.65 +
      legacyLayeredScore * 0.35
    )

    // Movement multiplier — kept for ValueScore, NOT applied to WinnerScore
    // const withMovement = componentBlend * movementMultiplier
    const withMovement = componentBlend

    // Chaotic race suppression — high volatility fields cap max confidence
    const chaosSuppression = volatility.chaos > 0.7 ? 0.75 :
      volatility.chaos > 0.55 ? 0.88 :
      volatility.chaos > 0.4 ? 0.95 : 1.0
    const paceCompatAdj = (paceCompat.compatibility - 50) * 0.08

    // Blend trainer/jockey form into score
    const formAdj = trainerAdj + jockeyAdj

    // Condition match adjustment — historical wins on today's going/distance/class/weight
    const conditionAdj = conditionMatch.hasHistory
      ? (conditionMatch.overallScore - 50) * 0.15
      : 0

    const layeredWithChaos = withMovement * chaosSuppression

    const personalAffinity = calculatePersonalAffinityBonus(runner.previous_results, {
      trackName: race.course,
      distanceF: parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0,
      going: race.going || '',
      draw: runner.draw,
      predictedRunStyle: runningStyle,
      horseName: runner.horse,
      fieldFRCount,
      pacePressure: pacePressure || 0,
    }, {
      courseMultiplier,
      disableGoing: options.disableGoing ?? true,
    })
    let personalAffinityAdj = (personalAffinity.factor - 1.0) * 100
    if (personalAffinityAdj > 0) {
      personalAffinityAdj = Math.pow(personalAffinityAdj, 1.5)
    }

    // Proven Zone modifier — adjusts PA based on distance from winning conditions
    const provenZoneScore = runner.horseMemory?.provenZoneScore
    if (provenZoneScore != null && personalAffinityAdj !== 0) {
      const zoneModifier = 0.9 + (provenZoneScore / 100) * 0.2
      personalAffinityAdj = personalAffinityAdj * zoneModifier
    }

    // Expose individual affinity components as separate score adjustments
    const courseAffinityAdj = personalAffinity.breakdown?.track?.adjustment
      ? Math.round(personalAffinity.breakdown.track.adjustment * 100) / 10 : 0
    const distanceAffinityAdj = personalAffinity.breakdown?.distance?.adjustment
      ? Math.round(personalAffinity.breakdown.distance.adjustment * 100) / 10 : 0
    const goingAffinityAdj = personalAffinity.breakdown?.going?.adjustment
      ? Math.round(personalAffinity.breakdown.going.adjustment * 100) / 10 : 0

    // Course Affinity Score — avgBHA at this course vs avg career BHA
    // Capped at ±8 to nudge rankings, not dominate them
    function computeCourseAffinity(prevResults, currentCourse) {
      if (!prevResults || prevResults.length === 0) return 0
      const courseRuns = prevResults.filter(r => r.course_name === currentCourse && r.bha > 0)
      if (courseRuns.length < 2) return 0
      const avgCourseBHA = courseRuns.reduce((s, r) => s + r.bha, 0) / courseRuns.length
      const allBHA = prevResults.filter(r => r.bha > 0)
      if (allBHA.length === 0) return 0
      const avgCareerBHA = allBHA.reduce((s, r) => s + r.bha, 0) / allBHA.length
      const affinity = avgCourseBHA - avgCareerBHA
      return Math.max(-8, Math.min(8, Math.round(affinity)))
    }
    const courseAffinity = computeCourseAffinity(runner.previous_results, race.course)

    const rawFinalScore = layeredWithChaos + energy.energyAdj + paceCompatAdj + formAdj + conditionAdj + trackAdj + awTransferAdj + classAdj + orProfileAdj.adjustment + rprORFit.adjustment + personalAffinityAdj + courseAffinity

    // Win Pattern Matrix — historical winning shape modifier
    const winPattern = identifyWinPatterns(runner, race, paceMap, raceShape, runningStyle, options.horseProfileDb?.[runner.horse])
    const winPatternAdj = winPattern.adjustment

    const finalScore = Number.isFinite(rawFinalScore + winPatternAdj) ? Math.round(Math.max(1, Math.min(99, rawFinalScore + winPatternAdj))) : 50

    // Early race bonus — pre-15:00 races have 57.1% WR vs 24.0% late (14-day live data)
    let earlyBonus = 0
    if (race.off_time) {
      const hour = parseInt(race.off_time.split(':')[0], 10)
      if (hour < 15) earlyBonus = 1.5
    }

    // Store courseAffinity on runner for output
    runner.courseAffinity = courseAffinity
    runner.trackCategory = trackCategory
    runner.courseMultiplierUsed = courseMultiplier

    const rawQAS = (horseQuality.finalScore || 0) * 0.50 +
      (finalScore + earlyBonus) * 0.30 +
      (raceShapeSuitability || 0) * 0.20
    const qualityAdjustedScore = Number.isFinite(rawQAS) ? Math.round(rawQAS) : 50

    // Spread multiplier — widen compressed 32-60 band back to 20-80
    const SCORE_SPREAD_MULTIPLIER = 1.6
    const centered = qualityAdjustedScore - 50
    const rescaledScore = Math.round(
      Math.max(1, Math.min(99, 50 + centered * SCORE_SPREAD_MULTIPLIER))
    )

    // Confidence-weighted scoring: discount finalScore when PA signal is weak
    // sqrt creates steep penalty for ultra-low confidence but flattens quickly
    // Floor at 0.65 so low-data horses aren't penalised more than 35%
    const paConfidence = (Number.isFinite(personalAffinity.confidence) && personalAffinity.confidence >= 0)
      ? personalAffinity.confidence : 1.0
    const confidenceMultiplier = Math.max(0.65, Math.sqrt(paConfidence))
    const scoreWithConfidence = Math.round(rescaledScore * confidenceMultiplier)

    // Chaos detection: widen probability distributions for high-volatility races
    // This allows outsiders more realistic chances in chaotic races
    const chaosWidening = volatility.chaos > 0.7 ? 1.25 :
      volatility.chaos > 0.55 ? 1.15 :
      volatility.chaos > 0.4 ? 1.05 : 1.0

    const uncertainty = calculateUncertainty({
      ...runner,
      finalScore: rescaledScore,
      raceShapeSuitability,
      chaosWidening,
    }, race, {
      goingDb,
      distanceDb,
    })

    features.uncertainty = {
      uncertainty: uncertainty.uncertainty,
      label: uncertainty.label,
      range: uncertainty.range,
      bankrollAdvice: uncertainty.bankrollAdvice,
      factors: uncertainty.factors,
    }

    // Build historical snapshot
    const signals = {
      formEngine: {
        formPositions: runner.form ? runner.form.split(/[-–]/).filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0 && n <= 20) : [],
      },
      paceEngine: {
        runningStyle,
        pacePressure: pacePressure[race.course] || pacePressure,
      },
      componentScores: {
        pace: newComponents.pace || 50,
        draw: newComponents.draw || 50,
        ground: newComponents.ground || 50,
        distance: newComponents.distance || 50,
        classMove: newComponents.classMove || 50,
        classDrop: newComponents.classDrop || 0,
        lastRunTrouble: newComponents.lastRunTrouble || 50,
        trainerForm: newComponents.trainerForm || 50,
        jockeyCourseSR: newComponents.jockeyCourseSR || 50,
      },
      hiddenImprover: {
        classDrop: improver.classDrop || false,
        tripStepUp: improver.tripStepUp || false,
        secondRunAfterLayoff: improver.secondRunAfterLayoff || false,
        trainerHiddenUpside: improver.trainerHiddenUpside || false,
      },
      stableIntent: {
        equipmentChange: stableIntent.equipmentChange || null,
        jockeyChange: stableIntent.jockeyChange || false,
        trainerPattern: stableIntent.trainerPattern || null,
      },
      finishingStrength: {
        stayedOn: runner.comments?.toLowerCase().includes('stayed on') || false,
        weakened: runner.comments?.toLowerCase().includes('weakened') || false,
        staminaBias: raceShapeSuitability > 60 ? true : false,
      },
      conditionMatch: {
        hasHistory: conditionMatch.hasHistory,
        overallScore: conditionMatch.overallScore,
        goingMatch: conditionMatch.goingMatch,
        distanceMatch: conditionMatch.distanceMatch,
        classMatch: conditionMatch.classMatch,
        weightMatch: conditionMatch.weightMatch,
        positives: conditionMatch.positives || [],
        negatives: conditionMatch.negatives || [],
      },
    }

    const scoreSnapshot = {
      legacyLayeredScore: Math.round(withMovement),
      componentBlend: Math.round(components.finalScore * 0.65 + (withMovement) * 0.35),
      marketAdjustment: Math.round(marketAdj * 10) / 10,
      volatilityAdjustment: Math.round(chaosSuppression * 100) / 100,
      winPatternAdjustment: Math.round(winPatternAdj * 10) / 10,
      finalScore: rescaledScore,
    }

    // Horse Profile — career, course, distance, going, C&D stats from results history
    const hp = options.horseProfileDb?.[runner.horse]
    const horseProfile = hp ? {
      career: hp.career,
      course: hp.course?.[race.course] || null,
      distance: hp.distance?.[race.distance_f] || null,
      going: hp.going?.[race.going] || null,
      courseDistance: race.course && race.distance_f ? hp.courseDistance?.[`${race.course}|${race.distance_f}`] || null : null,
    } : null

    const commentary = buildNarrative(signals, scoreSnapshot, runner, race)

    const snapshot = {
      signals,
      scores: scoreSnapshot,
      commentary,
      timestamp: new Date().toISOString(),
    }

    return {
      ...runner,
      runningStyle,
      earlyPaceScore,
      elimination,
      paceCompatAdj,
      formAdj,
      conditionAdj,
      energyAdj: energy.energyAdj,
      power: {
        total: powerScore,
        raw: rawPower,
      },
      pace: {
        score: paceScore,
        tempo: paceMap.projectedTempo,
      },
      energy,
      paceCompat,
      improver,
      stableIntent,
      conditionMatch,
      winPattern: {
        adjustment: winPatternAdj,
        patterns: winPattern.patterns,
      },
      personalAffinity: {
        factor: Math.round(personalAffinity.factor * 1000) / 1000,
        confidence: Math.round(personalAffinity.confidence * 100) / 100,
        adjustment: Math.round(personalAffinityAdj * 10) / 10,
        courseAdj: courseAffinityAdj,
        distanceAdj: distanceAffinityAdj,
        goingAdj: goingAffinityAdj,
        breakdown: personalAffinity.breakdown,
        note: personalAffinity.note,
      },
      provenZone: {
        score: runner.horseMemory?.provenZoneScore ?? null,
        inZone: runner.horseMemory?.provenZoneInZone ?? false,
        details: runner.horseMemory?.provenZoneDetails ?? {},
      },
      trackProfile: {
        trackBiasFactor: Math.round(trackBiasFactor * 1000) / 1000,
        drawBias,
        isAllWeather,
        trackAdj: Math.round(trackAdj * 10) / 10,
      },
      awTransfer: {
        hasAWForm: awTransfer.hasAWForm || false,
        adjustment: 0, // Flag only, no score adjustment
        label: awTransfer.label || '',
        awRuns: awTransfer.awRuns || 0,
        awWins: awTransfer.awWins || 0,
        awWinRate: awTransfer.awWinRate || 0,
        primarySurface: awTransfer.primarySurface || '',
        goingCompatible: awTransfer.goingCompatible || false,
        goingNote: awTransfer.goingNote || '',
        trackNote: awTransfer.trackNote || '',
        isAWSpecialist: awTransfer.isAWSpecialist || false,
        specialistNote: awTransfer.specialistNote || '',
        surfaceSwitch: (awTransfer.hasAWForm || false) && !isAllWeather,
        provenBothSurfaces: (awTransfer.awWins || 0) > 0 && (awTransfer.turfWins || 0) > 0,
      },
      classModel: {
        raceClass: raceClass.label,
        orFit: orFit.label,
        orFitScore: orFit.fit,
        weightFit: weightFit.impact,
        classAdj: Math.round(classAdj * 10) / 10,
        orProfile: orProfileAdj.label,
        orProfileAdj: orProfileAdj.adjustment,
        rprORGap: rprORFit.gap,
        rprORLabel: rprORFit.label,
        rprORAdj: rprORFit.adjustment,
        rprORSource: rprORFit.source || 'unknown',
      },
      components,
      newComponents,
      finalProbability,
      raceShapeSuitability,
      chaosWidening,
      human: {
        score: humanAdj,
        tags: replayNote.tags || [],
      },
      market: {
        score: marketAdj,
        alignment: marketAlignment(runner, powerScore),
      },
      trainerScore,
      volatility: volatility.chaos,
      winnerScore: rescaledScore,
      finalScore: scoreWithConfidence,
      horseQuality,
      features,
      snapshot,
      horseProfile,
    }
  })

  const interactionResults = results.map((r) => {
    const interactions = computeInteractions(r, race, paceMap)
    const adjustedScore = applyInteractionAdjustments(r.finalScore, interactions.interactions)
    return {
      ...r,
      finalScore: adjustedScore,
      interactions,
    }
  })

  if (process.env.APEX_DIAGNOSTIC === '1') {
    console.log('[DIAG CHECK] APEX_DIAGNOSTIC is 1, calling diagnostic for race:', race?.course, race?.off_time)
    logSignalDilutionDiagnostic(race, results, interactionResults)
  }

  const sorted = interactionResults.sort((a, b) => b.winnerScore - a.winnerScore)
  const winProbs = bayesianWinProbabilities(sorted, race)
  const placeProbs = bayesianPlaceProbabilities(sorted)

  /**
   * Platt Scaling — transforms raw compressed probabilities into calibrated win probabilities
   * using logit-space linear transformation (A > 1 stretches distribution, B shifts center).
   * Derived from empirical calibration errors across 2602 records.
   */
  function calibrateWinProbability(rawProb) {
    if (rawProb <= 0 || rawProb >= 1) return rawProb
    const logit = Math.log(rawProb / (1 - rawProb))
    const A = 1.440
    const B = 1.321
    const calibratedLogit = (A * logit) + B
    const calibratedProb = 1 / (1 + Math.exp(-calibratedLogit))
    return Math.max(0.01, Math.min(0.99, calibratedProb))
  }

  const enablePaCalibration = options.enablePaCalibration !== false
  const paCalibrationCap = options.paCalibrationCap ?? 0.45
  const plattWinProbs = []
  const adjustedWinProbs = winProbs.map((p, i) => {
    const prob = p / 100
    const calibrated = calibrateWinProbability(prob)
    plattWinProbs.push(calibrated)
    return Math.round(calibrated * 1000) / 10
  })
  const adjustedPlaceProbs = placeProbs.map((p) => {
    const prob = p / 100
    const calibrated = calibrateWinProbability(prob)
    return Math.round(calibrated * 1000) / 10
  })

  // Engine 2: Race Shape Simulation
  const simulation = runRaceSimulation(sorted, race, paceMap, {
    numSimulations: options.numSimulations ?? 50,
    seed: Date.now(),
  })

  // Merge simulation results into runners
  const simMap = {}
  simulation.runners.forEach((s) => {
    simMap[s.horse_id] = s
  })

  // Engine 3: Market Model
  const marketAnalysis = analyzeMarket(sorted, race)
  const marketMap = {}
  marketAnalysis.runners.forEach((m) => {
    marketMap[m.horse_id] = m
  })

  // Engine 4: Value Engine
  const sortedWithModelProb = sorted.map((r, i) => ({
    ...r,
    modelProb: adjustedWinProbs[i],
    previousRuns: (r.previous_results || []).length,
  }))
  const valueAnalysis = computeValue(sortedWithModelProb, race)
  const valueMap = {}
  valueAnalysis.runners.forEach((v) => {
    valueMap[v.horse_id] = v
  })

  // Engine 5: Bankroll Engine
  const bankrollAnalysis = computeBankroll(sortedWithModelProb, race, {
    bankroll: options.bankroll || 100,
    maxStake: 0.05,
    kellyFraction: 0.25,
    minEdge: 2,
  })
  const bankrollMap = {}
  bankrollAnalysis.runners.forEach((b) => {
    bankrollMap[b.horse_id] = b
  })

  // Engine 6: Bet Filter
  const betFilter = computeBetFilter(sorted, race, paceMap)

  const output = sorted.map((r, i) => {
    const band = probBand(adjustedWinProbs[i])
    const odds = Number(r.odds || r.price || 0)
    const traits = placeTraits(r)
    const key = r.horse_id || r.horse
    const sim = simMap[key] || {}
    const market = marketMap[key] || {}
    const value = valueMap[key] || {}
    const bankroll = bankrollMap[key] || {}

    const kelly = syndicateStake(adjustedWinProbs[i], odds, r.probBand, r.volatility, { maxStake: 0.05, uncertainty: r.uncertainty?.uncertainty || 0 })

    // Scenario Flags
    const scenarioFlags = detectScenarioFlags(r, sorted, race, paceMap)

    // Replay Intelligence Flags
    const replayFlags = computeReplayFlags(r, race, { paceMap, runners: sorted })

    // Explainability
    const explanation = generateExplanation(r, race, paceMap, sim, value, r.uncertainty)

    // Confidence Tier
    const confidenceTier = computeConfidenceTier(r, race, paceMap, sim, value, bankroll, betFilter)

    return {
      ...r,
      courseAffinity: r.courseAffinity || 0,
      winProb: Math.round(adjustedWinProbs[i] * 10) / 10,
      rawBayesianProb: Math.round(winProbs[i] * 10) / 10,
      plattProb: Math.round(plattWinProbs[i] * 10000) / 100,
      placeProb: Math.round(Math.max(adjustedPlaceProbs[i], adjustedWinProbs[i]) * 10) / 10,
      probBand: band.label,
      probRange: band.range,
      probTier: band.tier,
      confidenceScore: r.finalScore,
      betQuality: betQuality(band, adjustedWinProbs[i], r.market.score, odds),
      // Dual-mode engine label — additive, doesn't replace betQuality
      ...(() => {
        const dualMode = evaluateRunnerDualMode(r, rpDataMap)
        return {
          engineLabel: dualMode.engineLabel,
          triggerReason: dualMode.triggerReason,
        }
      })(),
      selectionQuality: selectionQuality(
        adjustedWinProbs[i],
        odds,
        r.probBand,
        r.volatility,
        r.uncertainty?.uncertainty || 0,
        r.market.score
      ),
      placeTraits: traits,
      kelly: kelly,
      features: r.features,
      interactions: r.interactions,
      simulation: {
        winRate: sim.winRate || 0,
        placeRate: sim.placeRate || 0,
        avgPosition: sim.avgPosition || 0,
        collapseRate: sim.collapseRate || 0,
        raceShape: sim.raceShape || 'Unknown',
      },
      marketModel: market.marketStrength || {},
      valueEngine: {
        edge: value.edge || 0,
        edgeLabel: value.edgeLabel || 'No Data',
        bettable: value.bettable || false,
        expectedValue: value.expectedValue || 0,
        roi: value.roi || 0,
        valueGrade: value.valueGrade || 'F',
      },
      bankrollEngine: bankroll.stake || {},
      scenarioFlags,
      explanation,
      confidenceTier,
      replayFlags,
      replayTriggers: replayFlags,
    }
  })

  const falseFavourite = detectFalseFavourite(output, race, {
    distanceDb: options.distanceDb || {},
  })

  return {
    racecards: output,
    paceMap,
    raceShape,
    volatility,
    archetype: archetype.archetype,
    archetypeInfo: archetype,
    weights: normalizedWeights,
    weightSource: source,
    bucket: raceBucket,
    bucketData: bucketDb?.[raceBucket] || null,
    falseFavourite,
    simulation: simulation.summary,
    marketModel: marketAnalysis.summary,
    valueEngine: valueAnalysis.summary,
    bankrollEngine: bankrollAnalysis.summary,
    betFilter,
  }
}

let diagnosticRaceCount = 0
function logSignalDilutionDiagnostic(race, rawResults, finalResults) {
  console.log('[DIAG TEST] logSignalDilutionDiagnostic called for race:', race?.course, race?.off_time)
  diagnosticRaceCount++

  const rawFinalScores = rawResults.map(r => {
    const fs = r.finalScore
    const hq = r.horseQuality?.finalScore || 0
    const rs = r.raceShapeSuitability || 0
    return {
      horse: r.horse,
      finalScore: fs,
      horseQuality: hq,
      raceShape: rs,
      qualityAdjusted: Math.round(hq * 0.50 + fs * 0.20 + rs * 0.30),
      trackAdj: r.trackProfile?.trackAdj || 0,
      classAdj: r.classModel?.classAdj || 0,
      orProfileAdj: r.classModel?.orProfileAdj || 0,
      rprORAdj: r.classModel?.rprORAdj || 0,
      paceCompatAdj: r.paceCompatAdj || 0,
      formAdj: r.formAdj || 0,
      conditionAdj: r.conditionAdj || 0,
    }
  })

  const fsRange = rangeOf(rawFinalScores.map(r => r.finalScore))
  const qaRange = rangeOf(rawFinalScores.map(r => r.qualityAdjusted))
  const hqRange = rangeOf(rawFinalScores.map(r => r.horseQuality))
  const rsRange = rangeOf(rawFinalScores.map(r => r.raceShape))

  const finalRanges = finalResults.map(r => r.finalScore)
  const finalRange = rangeOf(finalRanges)

  console.log(`\n[DIAGNOSTIC] Race ${diagnosticRaceCount}: ${race.course} ${race.off_time} ${race.race_name || ''}`)
  console.log(`  Runners: ${rawResults.length}`)
  console.log(`  Ranges (min-max):`)
  console.log(`    finalScore (pre-quality):  ${fsRange.min.toFixed(1)} - ${fsRange.max.toFixed(1)} (spread: ${fsRange.spread.toFixed(1)})`)
  console.log(`    horseQuality:              ${hqRange.min.toFixed(1)} - ${hqRange.max.toFixed(1)} (spread: ${hqRange.spread.toFixed(1)})`)
  console.log(`    raceShapeSuitability:      ${rsRange.min.toFixed(1)} - ${rsRange.max.toFixed(1)} (spread: ${rsRange.spread.toFixed(1)})`)
  console.log(`    qualityAdjustedScore:      ${qaRange.min.toFixed(1)} - ${qaRange.max.toFixed(1)} (spread: ${qaRange.spread.toFixed(1)})`)
  console.log(`    after interactionAdj:      ${finalRange.min.toFixed(1)} - ${finalRange.max.toFixed(1)} (spread: ${finalRange.spread.toFixed(1)})`)

  const trackAdjRange = rangeOf(rawFinalScores.map(r => r.trackAdj))
  const classAdjRange = rangeOf(rawFinalScores.map(r => r.classAdj))
  const rprORRange = rangeOf(rawFinalScores.map(r => r.rprORAdj))
  const orProfileRange = rangeOf(rawFinalScores.map(r => r.orProfileAdj))
  const paceCompatRange = rangeOf(rawFinalScores.map(r => r.paceCompatAdj))
  const formRange = rangeOf(rawFinalScores.map(r => r.formAdj))
  const conditionRange = rangeOf(rawFinalScores.map(r => r.conditionAdj))

  console.log(`  Adjustment ranges (min-max):`)
  console.log(`    trackAdj:       ${trackAdjRange.min.toFixed(2)} - ${trackAdjRange.max.toFixed(2)}`)
  console.log(`    classAdj:       ${classAdjRange.min.toFixed(2)} - ${classAdjRange.max.toFixed(2)}`)
  console.log(`    rprORAdj:       ${rprORRange.min.toFixed(2)} - ${rprORRange.max.toFixed(2)}`)
  console.log(`    orProfileAdj:   ${orProfileRange.min.toFixed(2)} - ${orProfileRange.max.toFixed(2)}`)
  console.log(`    paceCompatAdj:  ${paceCompatRange.min.toFixed(2)} - ${paceCompatRange.max.toFixed(2)}`)
  console.log(`    formAdj:        ${formRange.min.toFixed(2)} - ${formRange.max.toFixed(2)}`)
  console.log(`    conditionAdj:   ${conditionRange.min.toFixed(2)} - ${conditionRange.max.toFixed(2)}`)

  const sorted = [...rawFinalScores].sort((a, b) => b.finalScore - a.finalScore).slice(0, 5)
  console.log(`  Top 5 by finalScore:`)
  for (const r of sorted) {
    console.log(`    ${r.horse.padEnd(20)} fs=${r.finalScore.toFixed(0).padStart(3)} hq=${r.horseQuality.toFixed(0).padStart(3)} rs=${r.raceShape.toFixed(0).padStart(3)} qa=${r.qualityAdjusted.toFixed(0).padStart(3)} track=${r.trackAdj.toFixed(1).padStart(5)} class=${r.classAdj.toFixed(1).padStart(5)} rprOR=${r.rprORAdj.toFixed(1).padStart(5)}`)
  }

  if (qaRange.spread < fsRange.spread * 0.5) {
    console.log(`  ⚠ SMOOTHING DETECTED: qualityAdjusted spread (${qaRange.spread.toFixed(1)}) is less than half of finalScore spread (${fsRange.spread.toFixed(1)})`)
  }

  // Dump all runners to file for backtest analysis
  try {
    const dumpFile = join(process.cwd(), 'data', 'diagnostic-dump.jsonl')
    const dumpLine = JSON.stringify({
      race: `${race.course} ${race.off_time}`,
      raceName: race.race_name,
      runners: rawResults.map(r => ({
        horse: r.horse,
        finalScore: r.finalScore,
        horseQuality: r.horseQuality?.finalScore || 0,
        raceShape: r.raceShapeSuitability || 0,
        qualityAdjusted: Math.round((r.horseQuality?.finalScore || 0) * 0.50 + r.finalScore * 0.20 + (r.raceShapeSuitability || 0) * 0.30),
        winProb: r.winProb,
        odds: r.odds,
        trackAdj: r.trackProfile?.trackAdj || 0,
        classAdj: r.classModel?.classAdj || 0,
        rprORAdj: r.classModel?.rprORAdj || 0,
        orProfileAdj: r.classModel?.orProfileAdj || 0,
        paceCompatAdj: r.paceCompatAdj || 0,
        formAdj: r.formAdj || 0,
        conditionAdj: r.conditionAdj || 0,
      }))
    })
    appendFileSync(dumpFile, dumpLine + '\n')
  } catch (e) {
    console.error('[DIAG DUMP ERROR]', e.message)
  }
}

function rangeOf(arr) {
  if (arr.length === 0) return { min: 0, max: 0, spread: 0 }
  const min = Math.min(...arr)
  const max = Math.max(...arr)
  return { min, max, spread: max - min }
}
