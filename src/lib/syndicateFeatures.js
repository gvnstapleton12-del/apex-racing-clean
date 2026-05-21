import { calculateFieldStrength, normalizePosition, getRaceQualityScore } from './fieldStrength.js'

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

export function buildSyndicateFeatures(runner, race, options = {}) {
  const goingDb = options.goingDb || {}
  const distanceDb = options.distanceDb || {}
  const horseId = runner.horse_id || runner.horse

  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
  const rpr = Number(runner.rpr || 0)
  const bestRating = Math.max(or, rpr)
  const formString = String(runner.form || '')
  const positions = parseFormPositions(formString)
  const lastRun = Number(runner.last_run || 0)
  const age = Number(runner.age || 0)
  const weight = Number(runner.lbs || runner.weight_lbs || 0)
  const draw = Number(runner.draw || 0)
  const odds = Number(runner.odds || runner.price || 0)
  const trainerRtf = Number(runner.trainer_rtf || 0)

  const runners = race.runners || []
  const fieldSize = runners.length
  const raceClass = race.race_class || ''
  const going = (race.going || '').toLowerCase()
  const surface = (race.surface || '').toLowerCase()
  const distanceF = parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0

  const ors = runners.map((r) => Number(r.ofr || 0)).filter(Boolean)
  const maxOr = ors.length ? Math.max(...ors) : 0
  const avgOr = ors.length ? ors.reduce((a, b) => a + b, 0) / ors.length : 0
  const weights = runners.map((r) => Number(r.lbs || 0)).filter((w) => w > 0)
  const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0

  const features = {}

  const fieldStrength = calculateFieldStrength(runners, race)
  const raceQuality = getRaceQualityScore(race)

  features.ability = {
    or: or,
    rpr: rpr,
    peakRating: bestRating,
    orVsTop: or > 0 && maxOr > 0 ? Math.round((or - maxOr) * 10) / 10 : 0,
    orVsAvg: or > 0 && avgOr > 0 ? Math.round((or - avgOr) * 10) / 10 : 0,
    ratingConfidence: or > 0 ? 'OFFICIAL' : rpr > 0 ? 'ESTIMATED' : 'UNKNOWN',
  }

  const rawPositions = parseFormPositions(formString)
  const normalizedPositions = rawPositions.map((p) => normalizePosition(p, fieldStrength.strength, fieldSize))

  const decayWeights = [1.0, 0.7, 0.5, 0.3, 0.2]
  let weightedSum = 0
  let weightTotal = 0
  normalizedPositions.slice(0, 5).forEach((pos, i) => {
    const w = decayWeights[i] || 0.1
    weightedSum += Math.max(1, Math.min(20, pos)) * w
    weightTotal += w
  })
  const weightedAvgPos = weightTotal > 0 ? weightedSum / weightTotal : 99

  features.form = {
    rawPositions,
    normalizedPositions,
    runCount: normalizedPositions.length,
    weightedAvgPos: Math.round(weightedAvgPos * 10) / 10,
    winRate: normalizedPositions.length > 0 ? Math.round((normalizedPositions.filter((p) => p <= 1.5).length / normalizedPositions.length) * 100) : 0,
    top3Rate: normalizedPositions.length > 0 ? Math.round((normalizedPositions.filter((p) => p <= 3.5).length / normalizedPositions.length) * 100) : 0,
    lastRunPos: normalizedPositions[0] || 0,
    trend: normalizedPositions.length >= 3 ? (normalizedPositions[0] < normalizedPositions[normalizedPositions.length - 1] ? 'IMPROVING' : 'DECLINING') : 'UNKNOWN',
    consistency: normalizedPositions.length >= 3 ? Math.round((1 - (Math.max(...normalizedPositions) - Math.min(...normalizedPositions)) / 20) * 100) : 0,
  }

  features.field = {
    strength: fieldStrength.strength,
    depth: fieldStrength.depth,
    quality: raceQuality.score,
    qualityLabel: raceQuality.label,
    avgOr: fieldStrength.avgOr,
    maxOr: fieldStrength.maxOr,
    minOr: fieldStrength.minOr,
    orStd: fieldStrength.orStd,
    fieldSize: fieldStrength.fieldSize,
    topQuartileCount: fieldStrength.topQuartileCount,
    classBonus: fieldStrength.classBonus,
    goingPenalty: fieldStrength.goingPenalty,
    label: fieldStrength.label,
  }

  const goingProfile = goingDb[horseId]?.byGoing || {}
  const surfaceProfile = goingDb[horseId]?.bySurface || {}

  features.suitability = {
    going: going,
    surface: surface,
    goingRecord: goingProfile[going] || null,
    surfaceRecord: surfaceProfile[surface] || null,
    distanceF: distanceF,
    distanceBand: distanceF <= 6 ? 'SPRINT' : distanceF <= 9 ? 'MILE' : distanceF <= 11 ? 'MIDDLE' : 'STAYING',
    distanceChange: (() => {
      const lastDist = options.distanceDb?.[horseId]?.lastDistance || 0
      return lastDist > 0 ? Math.round((distanceF - lastDist) * 10) / 10 : 0
    })(),
  }

  const jockey = String(runner.jockey || '').toLowerCase()
  const trainer = String(runner.trainer || '').toLowerCase()

  features.connections = {
    trainer: runner.trainer,
    jockey: runner.jockey,
    trainerRtf: trainerRtf,
    trainerClass: trainerRtf >= 30 ? 'HOT' : trainerRtf >= 20 ? 'WARM' : trainerRtf > 0 ? 'COLD' : 'UNKNOWN',
    topJockey: ['de boinville', 'townend', 'blackmore', 'skelton', 'cobden', 'moore', 'doyle', 'johnson'].some((j) => jockey.includes(j)),
    topTrainer: ['skelton', 'henderson', 'nicholls', 'pipe', 'mullins', 'obrien'].some((t) => trainer.includes(t)),
  }

  features.pace = {
    runningStyle: options.runningStyle || 'UNKNOWN',
    draw: draw,
    drawVsField: draw > 0 && fieldSize > 0 ? Math.round(((draw - (fieldSize + 1) / 2) / fieldSize) * 100) : 0,
    headgear: runner.headgear || '',
    paceScore: options.paceScore || 0,
  }

  if (options.energy) {
    features.energy = {
      earlyEnergy: options.energy.earlyEnergy,
      efficiency: options.energy.efficiency,
      sustainability: options.energy.sustainability,
      profile: options.energy.profile,
      energyAdj: options.energy.energyAdj,
      factors: options.energy.factors,
    }
  }

  if (options.tags) {
    features.tags = options.tags
  }

  if (options.paceCompat) {
    features.paceCompat = {
      compatibility: options.paceCompat.compatibility,
      collapseRisk: options.paceCompat.collapseRisk,
    }
  }

  if (options.improver) {
    features.improver = {
      score: options.improver.score,
      label: options.improver.label,
      flags: options.improver.flags,
      factors: options.improver.factors,
    }
  }

  if (options.stableIntent) {
    features.stableIntent = {
      score: options.stableIntent.score,
      label: options.stableIntent.label,
      signals: options.stableIntent.signals,
      trainerProfile: options.stableIntent.trainerProfile,
      factors: options.stableIntent.factors,
    }
  }

  if (options.uncertainty) {
    features.uncertainty = {
      uncertainty: options.uncertainty.uncertainty,
      label: options.uncertainty.label,
      range: options.uncertainty.range,
      bankrollAdvice: options.uncertainty.bankrollAdvice,
      factors: options.uncertainty.factors,
    }
  }

  features.market = {
    odds: odds,
    impliedProb: odds > 1 ? Math.round((1 / odds) * 1000) / 10 : 0,
    priceBand: odds <= 2 ? 'SHORT' : odds <= 5 ? 'MID' : odds <= 10 ? 'LONG' : 'OUTSIDER',
  }

  features.context = {
    lastRun: lastRun,
    layoff: lastRun >= 180 ? 'EXTENDED' : lastRun >= 90 ? 'LONG' : lastRun >= 30 ? 'MODERATE' : 'FRESH',
    age: age,
    ageBand: age <= 3 ? 'YOUNG' : age <= 6 ? 'PRIME' : age <= 8 ? 'MATURE' : 'VETERAN',
    weight: weight,
    weightVsAvg: avgWeight > 0 ? Math.round(weight - avgWeight) : 0,
    fieldSize: fieldSize,
    raceClass: raceClass,
    course: race.course,
    distanceF: distanceF,
  }

  features.intangibles = {
    sire: runner.sire || '',
    dam: runner.dam || '',
    colour: runner.colour || '',
    sex: runner.sex || '',
    region: runner.region || '',
    owner: runner.owner || '',
  }

  return features
}
