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
    const replayNote = replayDb[replayKey] || {}

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

    const humanAdj = humanIntelligenceLayer(replayNote)

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

    const paceNorm = ((paceScore + 15) / 30) * 100
    const humanNorm = ((humanAdj + 12) / 24) * 100
    const marketNorm = ((marketAdj + 10) / 20) * 100
    const trainerNorm = (trainerScore / 10) * 100

    const layeredScore = Math.round(
      powerScore * normalizedWeights.power +
      paceNorm * normalizedWeights.pace +
      humanNorm * normalizedWeights.human +
      marketNorm * normalizedWeights.market +
      trainerNorm * normalizedWeights.trainer
    )

    const chaosPenalty = volatility.chaos > 0.6 ? 0.88 : volatility.chaos > 0.45 ? 0.96 : 1.02
    const paceCompatAdj = (paceCompat.compatibility - 50) * 0.08
    const layeredWithChaos = layeredScore * chaosPenalty
    const finalScore = Math.round(Math.max(1, Math.min(99, layeredWithChaos + energy.energyAdj + paceCompatAdj)))

    const uncertainty = calculateUncertainty({
      ...runner,
      finalScore,
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
      finalScore,
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

  const output = sorted.map((r, i) => {
    const band = probBand(winProbs[i])
    const odds = Number(r.odds || r.price || 0)
    const traits = placeTraits(r)
    const kelly = syndicateStake(winProbs[i], odds, r.probBand, r.volatility, { maxStake: 0.05, uncertainty: r.uncertainty?.uncertainty || 0 })
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
  }
}
