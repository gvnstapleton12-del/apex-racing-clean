import { eliminationGate } from './eliminationGate.js'
import { corePowerScore } from './powerScore.js'
import { classifyRunningStyle, generatePaceMap, paceMatrixScore } from './paceEngine.js'
import { humanIntelligenceLayer } from './humanIntelligence.js'
import { marketIntelligence, marketAlignment } from './marketIntelligence.js'
import { volatilityIndex } from './volatilityIndex.js'
import { syndicateStake } from './kellyEngine.js'
import { buildSyndicateFeatures } from './syndicateFeatures.js'
import { classifyRaceArchetype, getRaceWeights, getModifierAdjustments } from './raceArchetype.js'
import { bucketKey, getBucketWeights } from './contextBuckets.js'
import { estimateEnergyDistribution } from './energyModel.js'
import { classifyHorseTags, evaluatePaceCompatibility } from './horseTags.js'
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
import { computeAllComponents } from './componentScores.js'

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

export function runApexEngine(runners, race, options = {}) {
  const goingDb = options.goingDb || {}
  const distanceDb = options.distanceDb || {}
  const replayDb = options.replayDb || {}
  const bucketDb = options.bucketDb || {}

  const archetype = classifyRaceArchetype(race)
  const archetypeWeights = getRaceWeights(archetype.archetype)

  const raceBucket = bucketKey(race)
  const bucketWeights = getBucketWeights(bucketDb, raceBucket, archetypeWeights)

  const weights = bucketDb?.[raceBucket]?.predictions >= 20 ? bucketWeights : archetypeWeights
  const source = bucketDb?.[raceBucket]?.predictions >= 20 ? 'bucket' : 'archetype'

  const modifiers = getModifierAdjustments(archetype.modifiers)

  const adjustedWeights = {
    power: weights.power + (modifiers.paceAdj || 0),
    pace: weights.pace + (modifiers.paceAdj || 0),
    human: weights.human,
    market: weights.market + (modifiers.marketAdj || 0),
    trainer: weights.trainer + (modifiers.trainerAdj || 0) + (modifiers.drawAdj || 0),
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
  const styles = runners.map((r) => classifyRunningStyle(r, race))
  const paceMap = generatePaceMap(runners.map((r, i) => ({ ...r, runningStyle: styles[i] })))

  const results = runners.map((runner, idx) => {
    const runningStyle = styles[idx]
    const draw = Number(runner.draw || 0)
    const fieldSize = runners.length
    const horseId = runner.horse_id || runner.horse
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
    })

    const tags = classifyHorseTags(runner, race)
    const paceCompat = evaluatePaceCompatibility(tags, paceMap, parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0)

    const improver = detectHiddenImprover(runner, race, {
      goingDb,
      distanceDb,
      replayDb,
    })

    const stableIntent = detectStableIntent(runner, race, {
      goingDb,
      distanceDb,
    })

    const humanAdj = humanIntelligenceLayer(replayNote, race.course)
    const profileAdj = options.horseProfiles?.[horseId]?.profile_adjustment || 0

    const marketAdj = marketIntelligence(runner, powerScore, { odds: runner.odds })

    const trainerScore = options.trainerScores?.[horseId] || 0

    const features = buildSyndicateFeatures(runner, race, {
      goingDb,
      distanceDb,
      runningStyle,
      paceScore,
      energy,
      tags,
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

    // Engine 1: Horse Quality Model — pure racing merit, ignores odds
    const horseQuality = computeHorseQuality(runner, race, paceMap)

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

    const chaosPenalty = volatility.chaos > 0.6 ? 0.88 : volatility.chaos > 0.45 ? 0.96 : 1.02
    const paceCompatAdj = (paceCompat.compatibility - 50) * 0.08
    const layeredWithChaos = componentBlend * chaosPenalty
    const finalScore = Math.round(Math.max(1, Math.min(99, layeredWithChaos + energy.energyAdj + paceCompatAdj)))

    const qualityAdjustedScore = Math.round(
      horseQuality.finalScore * 0.70 +
      finalScore * 0.30
    )

    const uncertainty = calculateUncertainty({
      ...runner,
      finalScore: qualityAdjustedScore,
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

    return {
      ...runner,
      runningStyle,
      elimination,
      power: {
        total: powerScore,
        raw: rawPower,
      },
      pace: {
        score: paceScore,
        tempo: paceMap.projectedTempo,
      },
      energy,
      tags,
      paceCompat,
      improver,
      stableIntent,
      components,
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
      finalScore: qualityAdjustedScore,
      horseQuality,
      features,
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

  const sorted = interactionResults.sort((a, b) => b.finalScore - a.finalScore)
  const winProbs = bayesianWinProbabilities(sorted)
  const placeProbs = bayesianPlaceProbabilities(sorted)

  // Engine 2: Race Shape Simulation
  const simulation = runRaceSimulation(sorted, race, paceMap, {
    numSimulations: 1000,
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
    modelProb: winProbs[i],
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
    const band = probBand(winProbs[i])
    const odds = Number(r.odds || r.price || 0)
    const traits = placeTraits(r)
    const key = r.horse_id || r.horse
    const sim = simMap[key] || {}
    const market = marketMap[key] || {}
    const value = valueMap[key] || {}
    const bankroll = bankrollMap[key] || {}

    const kelly = syndicateStake(winProbs[i], odds, r.probBand, r.volatility, { maxStake: 0.05, uncertainty: r.uncertainty?.uncertainty || 0 })

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
      winProb: Math.round(winProbs[i] * 10) / 10,
      placeProb: Math.round(placeProbs[i] * 10) / 10,
      probBand: band.label,
      probRange: band.range,
      probTier: band.tier,
      confidenceScore: r.finalScore,
      betQuality: betQuality(band, winProbs[i], r.market.score, odds),
      selectionQuality: selectionQuality(
        winProbs[i],
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
