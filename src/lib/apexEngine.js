import { eliminationGate } from './eliminationGate.js'
import { corePowerScore } from './powerScore.js'
import { classifyRunningStyle, generatePaceMap, paceMatrixScore } from './paceEngine.js'
import { humanIntelligenceLayer } from './humanIntelligence.js'
import { marketIntelligence, marketAlignment } from './marketIntelligence.js'
import { volatilityIndex } from './volatilityIndex.js'

function winProbability(scores) {
  const scaled = scores.map((s) => Math.exp(Math.max(0, s) / 16))
  const total = scaled.reduce((a, b) => a + b, 0)
  return scaled.map((s) => (total > 0 ? (s / total) * 100 : 0))
}

function scoreToConfidence(rawScore, volatility) {
  const chaosPenalty = volatility > 0.6 ? 0.85 : volatility > 0.45 ? 0.95 : 1.0
  const effective = Math.round(rawScore * chaosPenalty)

  if (effective >= 78) return { label: 'Elite', score: effective }
  if (effective >= 68) return { label: 'Strong', score: effective }
  if (effective >= 58) return { label: 'Playable', score: effective }
  if (effective >= 48) return { label: 'Speculative', score: effective }
  return { label: 'Avoid', score: effective }
}

function betQuality(confidence, winProb, marketAdj, odds) {
  if (confidence === 'Avoid') return 'NO BET'
  if (confidence === 'Speculative' && winProb < 10) return 'NO BET'

  const value = winProb * (odds - 1) - (100 - winProb)

  if (value > 20 && confidence !== 'Avoid') return 'STRONG VALUE'
  if (value > 10) return 'VALUE'
  if (marketAdj >= 4 && winProb > 15) return 'PLAYABLE'
  if (marketAdj >= -2 && winProb > 20) return 'PLAYABLE'
  return 'SPECULATIVE'
}

export function runApexEngine(runners, race, options = {}) {
  const goingDb = options.goingDb || {}
  const distanceDb = options.distanceDb || {}
  const replayDb = options.replayDb || {}

  const volatility = volatilityIndex(race)
  const styles = runners.map((r) => classifyRunningStyle(r))
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

    const humanAdj = humanIntelligenceLayer(replayNote)

    const marketAdj = marketIntelligence(runner, powerScore, { odds: runner.odds })

    const trainerScore = options.trainerScores?.[horseId] || 0

    const paceNorm = ((paceScore + 15) / 30) * 100
    const humanNorm = ((humanAdj + 12) / 24) * 100
    const marketNorm = ((marketAdj + 10) / 20) * 100
    const trainerNorm = (trainerScore / 10) * 100

    const layeredScore = Math.round(
      powerScore * 0.60 +
      paceNorm * 0.15 +
      humanNorm * 0.10 +
      marketNorm * 0.05 +
      trainerNorm * 0.10
    )

    const chaosPenalty = volatility.chaos > 0.6 ? 0.88 : volatility.chaos > 0.45 ? 0.96 : 1.02
    const finalScore = Math.round(Math.max(1, Math.min(99, layeredScore * chaosPenalty)))

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
    }
  })

  const sorted = results.sort((a, b) => b.finalScore - a.finalScore)
  const scores = sorted.map((r) => r.finalScore)
  const probs = winProbability(scores)

  const output = sorted.map((r, i) => {
    const conf = scoreToConfidence(r.finalScore, r.volatility)
    return {
      ...r,
      winProb: Math.round(probs[i] * 10) / 10,
      confidenceLabel: conf.label,
      confidenceScore: conf.score,
      betQuality: betQuality(conf.label, probs[i], r.market.score, Number(r.odds || 0)),
    }
  })

  return {
    racecards: output,
    paceMap,
    volatility,
  }
}
