import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { getTrackProfile } from './trackProfile.js'
import { parseFinishDistance } from './performanceRating.js'

const LEAGUE_AVG_WR = 0.15
const MIN_YEAR = 2025
const MAX_PREDICTIONS = 50
const BLEND_WEIGHT_PERSISTED = 0.4
const BLEND_WEIGHT_SL = 0.6
const MIN_VERIFIED_FOR_BLEND = 5

const STORE_PATH = join(process.cwd(), 'data', 'personalAffinity.json')

let _store = null

function loadStore() {
  if (_store) return _store
  try {
    if (existsSync(STORE_PATH)) {
      _store = JSON.parse(readFileSync(STORE_PATH, 'utf8').replace(/^\uFEFF/, ''))
    }
  } catch { _store = null }
  if (!_store) _store = { horses: {} }
  if (!_store.horses) _store.horses = {}
  return _store
}

function saveStore() {
  try {
    const dir = dirname(STORE_PATH)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(STORE_PATH, JSON.stringify(_store, null, 2), 'utf8')
  } catch { /* silent */ }
}

function createHorseEntry(horseName) {
  return {
    horseName,
    lastUpdated: null,
    macroMetrics: { totalScoredRuns: 0, globalModelConfidence: 0 },
    affinityProfiles: {
      track: { courses: {}, archetypes: {} },
      distance: {},
      going: {},
      surface: {},
      runningStyle: {},
    },
    systemVerificationHistory: {
      totalPredictionsGenerated: 0,
      highAffinityThresholdRuns: 0,
      highAffinityWins: 0,
      historicalPredictions: [],
    },
    calibrationState: {
      kAdjustments: { track: 15, distance: 8, going: 10, drawStyle: 3 },
      accuracyByDimension: {},
    },
  }
}

function getHorseStore(horseName) {
  const store = loadStore()
  const key = (horseName || '').toLowerCase().trim()
  if (!key) return null
  if (!store.horses[key]) {
    store.horses[key] = createHorseEntry(horseName)
  }
  const hs = store.horses[key]
  if (!hs.affinityProfiles) hs.affinityProfiles = { track: { courses: {}, archetypes: {} }, distance: {}, going: {}, surface: {}, runningStyle: {} }
  if (!hs.affinityProfiles.track) hs.affinityProfiles.track = { courses: {}, archetypes: {} }
  if (!hs.affinityProfiles.track.courses) hs.affinityProfiles.track.courses = {}
  if (!hs.affinityProfiles.track.archetypes) hs.affinityProfiles.track.archetypes = {}
  if (!hs.systemVerificationHistory) hs.systemVerificationHistory = { totalPredictionsGenerated: 0, highAffinityThresholdRuns: 0, highAffinityWins: 0, historicalPredictions: [] }
  if (!hs.calibrationState) hs.calibrationState = { kAdjustments: { track: 15, distance: 8, going: 10, drawStyle: 3 }, accuracyByDimension: {} }
  if (!hs.macroMetrics) hs.macroMetrics = { totalScoredRuns: 0, globalModelConfidence: 0 }
  return hs
}

function getDistanceBand(distF) {
  if (distF <= 6) return 'sprint'
  if (distF <= 8) return 'mile'
  if (distF <= 14) return 'middle'
  return 'staying'
}

function getGoingPool(going) {
  if (isSoftGoing(going)) return 'soft'
  if (isFastGoing(going)) return 'fast'
  return 'unknown'
}

function getSurfaceType(profile) {
  if (!profile) return 'turf'
  if (profile.aw) return 'aw'
  return 'turf'
}

function archetypeToKey(profile) {
  if (!profile) return 'unknown'
  const parts = []
  parts.push(profile.sharp ? 'sharp' : profile.galloping ? 'galloping' : 'flat')
  parts.push(profile.undulating ? 'undulating' : 'flat')
  const h = profile.handedness || ''
  parts.push(h.includes('Left') ? 'left' : h.includes('Right') ? 'right' : 'neutral')
  if (profile.uphillFinish) parts.push('uphill')
  return parts.join('_')
}

function parseDistanceF(distStr) {
  if (!distStr) return 0
  const s = String(distStr).toLowerCase().trim()
  const mf = s.match(/(\d+)\s*m\s*(\d+)\s*f/)
  if (mf) return parseInt(mf[1]) * 8 + parseInt(mf[2])
  const fm = s.match(/(\d+)\s*m/)
  if (fm) return parseInt(fm[1]) * 8
  const ff = s.match(/(\d+)\s*f/)
  if (ff) return parseInt(ff[1])
  const num = parseFloat(s)
  return isNaN(num) ? 0 : num
}

function isSoftGoing(going) {
  return /soft|heavy|yielding/.test((going || '').toLowerCase())
}

function isFastGoing(going) {
  return /firm|good to firm|good\b|standard/.test((going || '').toLowerCase()) && !isSoftGoing(going)
}

function parseRecentResults(previousResults) {
  if (!Array.isArray(previousResults)) return []
  const parsed = []
  for (const r of previousResults) {
    if (!r) continue
    const year = r.date ? new Date(r.date).getFullYear() : 0
    if (year < MIN_YEAR) continue
    const pos = parseInt(r.position)
    if (isNaN(pos) || pos < 1) continue
    parsed.push({
      date: r.date,
      trackName: r.course_name || '',
      distanceF: parseDistanceF(r.distance),
      going: r.going || r.going_shortcode || '',
      goingPool: getGoingPool(r.going || r.going_shortcode || ''),
      position: pos,
      fieldSize: r.runner_count || 0,
      odds: r.odds || 0,
      raceClass: r.race_class || '',
      raceName: r.race_name || '',
      draw: r.draw || 0,
      runStyle: null,
      finishDistance: r.finish_distance || '',
    })
  }
  return parsed
}

const MASTER_ARCHETYPES = {}

function getMasterArchetype(trackName) {
  if (MASTER_ARCHETYPES[trackName]) return MASTER_ARCHETYPES[trackName]
  const profile = getTrackProfile(trackName)
  if (!profile) return null
  const arch = {
    handedness: profile.handedness || 'Unknown',
    sharp: !!profile.sharp,
    galloping: !!profile.galloping,
    undulating: !!profile.undulating,
    uphillFinish: !!profile.uphillFinish,
    surface: profile.surface || 'Turf',
    surfaceType: profile.surfaceType || 'turf',
    aw: !!profile.aw,
  }
  MASTER_ARCHETYPES[trackName] = arch
  return arch
}

function buildDynamicArchetype(scrapedMetadata) {
  if (!scrapedMetadata?.courseDescription) return null
  const desc = scrapedMetadata.courseDescription.toLowerCase()
  return {
    handedness: desc.includes('left') ? 'Left' : desc.includes('right') ? 'Right' : 'Unknown',
    sharp: desc.includes('sharp'),
    galloping: desc.includes('galloping') || desc.includes('stiff'),
    undulating: desc.includes('undulating'),
    uphillFinish: desc.includes('climbing') || desc.includes('uphill'),
    surface: 'Turf',
    surfaceType: 'turf',
    aw: false,
  }
}

const UNKNOWN_ARCHETYPE = {
  handedness: 'Unknown',
  sharp: false,
  galloping: false,
  undulating: false,
  uphillFinish: false,
  surface: 'Turf',
  surfaceType: 'turf',
  aw: false,
}

function resolveArchetype(trackName, scrapedMetadata) {
  const master = getMasterArchetype(trackName)
  if (master) return { profile: master, type: 'MASTER' }
  const dynamic = buildDynamicArchetype(scrapedMetadata)
  if (dynamic) return { profile: dynamic, type: 'DYNAMIC_RUNTIME' }
  return { profile: UNKNOWN_ARCHETYPE, type: 'UNKNOWN_BLENDED' }
}

function handednessOverlap(a, b) {
  if (a === 'Unknown' || b === 'Unknown') return false
  const aHands = a.split('/')
  const bHands = b.split('/')
  return aHands.some(ah => bHands.includes(ah))
}

function archetypeSimilarity(a, b) {
  let score = 0
  let total = 0
  if (a.handedness !== 'Unknown' && b.handedness !== 'Unknown') {
    total += 1
    if (handednessOverlap(a.handedness, b.handedness)) score += 1
  }
  for (const prop of ['sharp', 'galloping', 'undulating', 'uphillFinish']) {
    total += 1
    if (a[prop] === b[prop]) score += 1
  }
  if (a.aw !== undefined && b.aw !== undefined) {
    total += 1
    if (a.aw === b.aw) score += 1
  }
  return total > 0 ? score / total : 0.5
}

function calcTrackAffinity(history, targetTrack, k = 15, scrapedMetadata) {
  const target = resolveArchetype(targetTrack, scrapedMetadata)
  let weightedWins = 0
  let totalRuns = 0
  let allHistAW = true
  let allHistTurf = true

  for (const race of history) {
    const histArch = resolveArchetype(race.trackName, null)
    let similarity = 0.5
    if (target.type !== 'UNKNOWN_BLENDED' && histArch.type !== 'UNKNOWN_BLENDED') {
      similarity = archetypeSimilarity(target.profile, histArch.profile)
    }
    if (!histArch.profile.aw) allHistAW = false
    if (histArch.profile.aw) allHistTurf = false
    const confidenceWeight = histArch.type === 'UNKNOWN_BLENDED' ? 0.3 : 1.0
    const effectiveRun = similarity * confidenceWeight
    if (race.position === 1) weightedWins += effectiveRun
    totalRuns += effectiveRun
  }

  const surfaceMismatch = (target.profile.aw && allHistTurf) || (!target.profile.aw && allHistAW)
  const effectiveK = target.type === 'UNKNOWN_BLENDED' ? 30 : surfaceMismatch ? k * 2 : k
  const posteriorWR = (weightedWins + LEAGUE_AVG_WR * effectiveK) / (totalRuns + effectiveK)
  const confidence = totalRuns / (totalRuns + effectiveK)

  return { winRate: posteriorWR, confidence, typeUsed: target.type, surfaceMismatch }
}

function calcDistanceAffinity(history, targetDistF, k = 8) {
  const targetBand = getDistanceBand(targetDistF)
  let wins = 0
  let runs = 0
  for (const race of history) {
    const band = getDistanceBand(race.distanceF)
    if (band === targetBand) {
      runs++
      if (race.position === 1) wins++
    }
  }
  const posteriorWR = (wins + LEAGUE_AVG_WR * k) / (runs + k)
  const confidence = runs / (runs + k)
  return { winRate: posteriorWR, confidence, runs }
}

function calcGoingAffinity(history, targetGoing, k = 10) {
  const targetPool = getGoingPool(targetGoing)
  if (targetPool === 'unknown') return { winRate: LEAGUE_AVG_WR, confidence: 0, runs: 0 }
  let wins = 0
  let runs = 0
  let allAW = true
  let allSoft = true
  for (const race of history) {
    if (race.goingPool === targetPool) {
      runs++
      if (race.position === 1) wins++
    }
    const histPool = getGoingPool(race.going)
    if (histPool !== 'fast') allAW = false
    if (histPool !== 'soft') allSoft = false
  }
  const surfaceMismatch = (targetPool === 'soft' && allAW) || (targetPool === 'fast' && allSoft)
  const effectiveK = surfaceMismatch ? k * 2 : k
  const posteriorWR = (wins + LEAGUE_AVG_WR * effectiveK) / (runs + effectiveK)
  const confidence = runs / (runs + effectiveK)
  return { winRate: posteriorWR, confidence, runs, surfaceMismatch }
}

function calcDrawStyleAffinity(history, targetDraw, targetStyle, targetTrack, k = 3, fieldFRCount, pacePressure) {
  const profile = getTrackProfile(targetTrack)
  if (!profile) return { bonus: 0, railLock: false, confidence: 0, dominantStyle: 'Midfield' }

  const targetDrawNum = parseInt(targetDraw) || 0
  if (targetDrawNum < 1) return { bonus: 0, railLock: false, confidence: 0, dominantStyle: 'Midfield' }

  const styleWins = { 'Front Runner': 0, 'Prominent': 0, 'Midfield': 0, 'Hold Up': 0 }
  const styleRuns = { 'Front Runner': 0, 'Prominent': 0, 'Midfield': 0, 'Hold Up': 0 }
  let totalWins = 0
  let totalRuns = 0

  for (const race of history) {
    if (race.runStyle) {
      styleRuns[race.runStyle] = (styleRuns[race.runStyle] || 0) + 1
      if (race.position === 1) {
        styleWins[race.runStyle] = (styleWins[race.runStyle] || 0) + 1
        totalWins++
      }
    }
    totalRuns++
  }

  let dominantStyle = 'Midfield'
  let bestWR = 0
  for (const [style, wins] of Object.entries(styleWins)) {
    const runs = styleRuns[style]
    if (runs >= 2) {
      const wr = (wins + LEAGUE_AVG_WR * k) / (runs + k)
      if (wr > bestWR) { bestWR = wr; dominantStyle = style }
    }
  }

  const railLock = (targetStyle === 'Front Runner' || targetStyle === 'Prominent') &&
    (targetDrawNum <= 3 || targetDrawNum >= 10)

  let bonus = 0
  if (targetStyle === dominantStyle && totalRuns >= 3) {
    bonus = (bestWR - LEAGUE_AVG_WR) * 0.5
    bonus = Math.max(-0.03, Math.min(0.03, bonus))
  }

  let confidence = Math.min(1, totalRuns / 10)

  if (fieldFRCount !== undefined && targetStyle === 'Front Runner' && fieldFRCount >= 3) {
    confidence *= 0.5
  }
  if (pacePressure !== undefined && pacePressure > 0.7 && targetStyle === 'Front Runner') {
    confidence *= 0.7
  }

  return { bonus, railLock, confidence, dominantStyle }
}

function blendWithPersisted(slWR, persistedBucket, k) {
  if (!persistedBucket || persistedBucket.runs < MIN_VERIFIED_FOR_BLEND) return slWR
  const persistedWR = persistedBucket.wins / persistedBucket.runs
  const dataWeight = Math.min(0.5, persistedBucket.runs / (persistedBucket.runs + k))
  return slWR * (1 - dataWeight) + persistedWR * dataWeight
}

function getCalibratedK(calibrationState, dimension) {
  if (!calibrationState?.kAdjustments) return null
  return calibrationState.kAdjustments[dimension]
}

export function calculatePersonalAffinityBonus(history, target, options = {}) {
  const recentHistory = parseRecentResults(history)
  const horseName = options.horseName || ''
  const persisted = horseName ? getPersistedAffinity(horseName) : null
  const calState = persisted?.calibrationState || null

  if (recentHistory.length === 0 && !persisted) {
    return {
      factor: 1.0,
      confidence: 0,
      breakdown: { track: null, distance: null, going: null, drawStyle: null },
      note: 'No recent form data',
    }
  }

  const trackK = getCalibratedK(calState, 'track') || options.trackK || 15
  const distK = getCalibratedK(calState, 'distance') || options.distK || 8
  const goingK = getCalibratedK(calState, 'going') || options.goingK || 10
  const dsK = getCalibratedK(calState, 'drawStyle') || options.dsK || 3

  let trackAff = calcTrackAffinity(recentHistory, target.trackName, trackK, options.scrapedMetadata || null)
  let distAff = calcDistanceAffinity(recentHistory, target.distanceF || 0, distK)
  let goingAff = calcGoingAffinity(recentHistory, target.going || '', goingK)
  let dsAff = calcDrawStyleAffinity(recentHistory, target.draw, target.predictedRunStyle, target.trackName, dsK, options.fieldFRCount, options.pacePressure)

  if (persisted) {
    const ap = persisted.affinityProfiles
    const trackCourse = ap?.track?.courses?.[target.trackName]
    if (trackCourse && trackCourse.runs >= MIN_VERIFIED_FOR_BLEND) {
      trackAff.winRate = blendWithPersisted(trackAff.winRate, trackCourse, trackK)
    }
    const distBand = getDistanceBand(target.distanceF || 0)
    const distBucket = ap?.distance?.[distBand]
    if (distBucket && distBucket.runs >= MIN_VERIFIED_FOR_BLEND) {
      distAff.winRate = blendWithPersisted(distAff.winRate, distBucket, distK)
    }
    const goingPool = getGoingPool(target.going || '')
    const goingBucket = ap?.going?.[goingPool]
    if (goingBucket && goingBucket.runs >= MIN_VERIFIED_FOR_BLEND) {
      goingAff.winRate = blendWithPersisted(goingAff.winRate, goingBucket, goingK)
    }
    const styleBucket = ap?.runningStyle?.[target.predictedRunStyle]
    if (styleBucket && styleBucket.runs >= MIN_VERIFIED_FOR_BLEND) {
      const persistedStyleWR = styleBucket.wins / styleBucket.runs
      const styleBoost = (persistedStyleWR - LEAGUE_AVG_WR) * 0.3
      dsAff.bonus = Math.max(-0.03, Math.min(0.03, dsAff.bonus + styleBoost))
    }
  }

  const rawTrack = (trackAff.winRate - LEAGUE_AVG_WR) * 0.35
  const rawDist = (distAff.winRate - LEAGUE_AVG_WR) * 0.30
  const rawGoing = (goingAff.winRate - LEAGUE_AVG_WR) * 0.25
  const rawDS = dsAff.bonus * 0.10

  const rawBonus = rawTrack + rawDist + rawGoing + rawDS
  const factor = Math.max(0.85, Math.min(1.20, 1.0 + rawBonus))

  const confidences = [trackAff.confidence, distAff.confidence, goingAff.confidence, dsAff.confidence]
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length

  const persistedNote = persisted ? ' + verified store' : ''

  return {
    factor,
    confidence: avgConfidence,
    breakdown: {
      track: {
        winRate: trackAff.winRate,
        confidence: trackAff.confidence,
        typeUsed: trackAff.typeUsed,
        surfaceMismatch: trackAff.surfaceMismatch || false,
        adjustment: rawTrack,
        persisted: !!persisted?.affinityProfiles?.track?.courses?.[target.trackName],
      },
      distance: {
        winRate: distAff.winRate,
        confidence: distAff.confidence,
        runs: distAff.runs,
        adjustment: rawDist,
        persisted: !!persisted?.affinityProfiles?.distance?.[getDistanceBand(target.distanceF || 0)],
      },
      going: {
        winRate: goingAff.winRate,
        confidence: goingAff.confidence,
        runs: goingAff.runs,
        surfaceMismatch: goingAff.surfaceMismatch || false,
        adjustment: rawGoing,
        persisted: !!persisted?.affinityProfiles?.going?.[getGoingPool(target.going || '')],
      },
      drawStyle: {
        bonus: dsAff.bonus,
        railLock: dsAff.railLock,
        confidence: dsAff.confidence,
        dominantStyle: dsAff.dominantStyle,
        adjustment: rawDS,
        persisted: !!persisted?.affinityProfiles?.runningStyle?.[target.predictedRunStyle],
        fieldFRCount: options.fieldFRCount,
        pacePressure: options.pacePressure,
      },
    },
    note: `${recentHistory.length} recent runs, confidence ${(avgConfidence * 100).toFixed(0)}%${persistedNote}`,
  }
}

export function parsePastPerformances(previousResults) {
  return parseRecentResults(previousResults)
}

export function recordAffinityPrediction(horseName, race, prediction) {
  const hs = getHorseStore(horseName)
  if (!hs) return

  const raceKey = `${race.course}|${race.off_time || ''}|${race.date || ''}`
  const entry = {
    raceKey,
    course: race.course,
    distanceF: parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0,
    going: race.going || '',
    draw: race.draw,
    runStyle: prediction.runningStyle || '',
    fieldSize: (race.runners || []).length,
    factor: prediction.personalAffinity?.factor || 1.0,
    confidence: prediction.personalAffinity?.confidence || 0,
    breakdown: prediction.personalAffinity?.breakdown || null,
    winProb: prediction.winProb || 0,
    finalScore: prediction.finalScore || 0,
    odds: prediction.odds || 0,
    baseRPR: prediction.rpr || 0,
    timestamp: new Date().toISOString(),
    verificationStatus: 'PENDING',
    actualPosition: null,
    actualWon: false,
    beatenLengths: 0,
  }

  hs.systemVerificationHistory.historicalPredictions.push(entry)
  if (hs.systemVerificationHistory.historicalPredictions.length > MAX_PREDICTIONS) {
    hs.systemVerificationHistory.historicalPredictions = hs.systemVerificationHistory.historicalPredictions.slice(-MAX_PREDICTIONS)
  }
  hs.systemVerificationHistory.totalPredictionsGenerated++
  hs.macroMetrics.totalScoredRuns++
  hs.lastUpdated = new Date().toISOString()
  saveStore()
}

export function verifyAffinityResult(horseName, raceKey, position, finishDistance, runStyle) {
  const hs = getHorseStore(horseName)
  if (!hs) return null

  const pred = hs.systemVerificationHistory.historicalPredictions.find(p => p.raceKey === raceKey && p.verificationStatus === 'PENDING')
  if (!pred) return null

  const won = position === 1
  const placed = pred.factor > 1.05 ? position <= 3 : position <= 2
  const beatenLengths = won ? parseFinishDistance(finishDistance) : parseFinishDistance(finishDistance)

  if (won) {
    pred.verificationStatus = 'VERIFIED_WIN'
  } else if (placed) {
    pred.verificationStatus = 'VERIFIED_PLACED'
  } else {
    pred.verificationStatus = 'VERIFIED_LOST'
  }
  pred.actualPosition = position
  pred.actualWon = won
  pred.beatenLengths = beatenLengths

  if (won) {
    hs.systemVerificationHistory.highAffinityWins++
  }
  if (pred.factor > 1.05) {
    hs.systemVerificationHistory.highAffinityThresholdRuns++
  }

  const course = pred.course
  const distBand = getDistanceBand(pred.distanceF)
  const goingPool = getGoingPool(pred.going)
  const surface = getSurfaceType(getTrackProfile(course))
  const ap = hs.affinityProfiles

  updateBucket(ap.track.courses, course, won, placed)
  const targetArch = resolveArchetype(course, null)
  const archKey = archetypeToKey(targetArch.profile)
  updateArchetypeBucket(ap.track.archetypes, archKey, won, pred.factor > 1.05 ? 1.0 : placed ? 0.5 : 0)
  updateBucket(ap.distance, distBand, won, placed)
  if (goingPool !== 'unknown') updateBucket(ap.going, goingPool, won, placed)
  updateBucket(ap.surface, surface, won, placed)

  const styleKey = pred.runStyle || runStyle || 'unknown'
  updateStyleBucket(ap.runningStyle, styleKey, won, placed, beatenLengths)

  recalibrateK(hs, 'track')
  recalibrateK(hs, 'distance')
  recalibrateK(hs, 'going')
  recalibrateK(hs, 'drawStyle')

  const verified = hs.systemVerificationHistory.historicalPredictions.filter(p => p.verificationStatus !== 'PENDING')
  const highFactor = verified.filter(p => p.factor > 1.05)
  const highWins = highFactor.filter(p => p.verificationStatus === 'VERIFIED_WIN')
  hs.macroMetrics.globalModelConfidence = highFactor.length > 0
    ? Math.round((highWins.length / highFactor.length) * 100) / 100
    : 0

  hs.lastUpdated = new Date().toISOString()
  saveStore()

  return {
    predicted: pred.factor,
    actualPosition: position,
    won,
    placed,
    beatenLengths,
    verificationStatus: pred.verificationStatus,
    course,
    distBand,
    goingPool,
    surface,
    archKey,
  }
}

function updateBucket(buckets, key, won, placed) {
  if (!buckets[key]) buckets[key] = { runs: 0, wins: 0, places: 0, lastVerified: null }
  const b = buckets[key]
  b.runs++
  if (won) b.wins++
  if (placed) b.places++
  b.lastVerified = new Date().toISOString()
}

function updateArchetypeBucket(buckets, key, won, weightedScore) {
  if (!buckets[key]) buckets[key] = { weightedWins: 0, effectiveRuns: 0, lastVerified: null }
  const b = buckets[key]
  b.effectiveRuns++
  if (won) b.weightedWins += weightedScore
  b.lastVerified = new Date().toISOString()
}

function updateStyleBucket(buckets, key, won, placed, beatenLengths) {
  if (!buckets[key]) buckets[key] = { runs: 0, wins: 0, places: 0, totalBeatenLengths: 0, avgBeatenLengths: 0, lastVerified: null }
  const b = buckets[key]
  b.runs++
  if (won) b.wins++
  if (placed) b.places++
  b.totalBeatenLengths += beatenLengths
  b.avgBeatenLengths = Math.round((b.totalBeatenLengths / b.runs) * 10) / 10
  b.lastVerified = new Date().toISOString()
}

function recalibrateK(horseStore, dimension) {
  const vh = horseStore.systemVerificationHistory
  const verified = vh.historicalPredictions.filter(p => p.verificationStatus !== 'PENDING')
  if (verified.length < 10) return

  const highFactor = verified.filter(p => p.factor > 1.05)
  if (highFactor.length < 5) return

  const accuracy = highFactor.filter(p => p.verificationStatus === 'VERIFIED_WIN').length / highFactor.length

  const baseK = { track: 15, distance: 8, going: 10, drawStyle: 3 }
  if (accuracy > 0.40 && verified.length >= 20) {
    horseStore.calibrationState.kAdjustments[dimension] = Math.max(5, Math.round(baseK[dimension] * 0.6))
  } else if (accuracy < 0.15 && verified.length >= 15) {
    horseStore.calibrationState.kAdjustments[dimension] = Math.min(30, Math.round(baseK[dimension] * 1.5))
  }

  horseStore.calibrationState.accuracyByDimension[dimension] = {
    accuracy: Math.round(accuracy * 100) / 100,
    sampleSize: highFactor.length,
    calibratedK: horseStore.calibrationState.kAdjustments[dimension],
  }
}

export function getPersistedAffinity(horseName) {
  const store = loadStore()
  const key = (horseName || '').toLowerCase().trim()
  return store.horses[key] || null
}

export function getAffinitySummary(horseName) {
  const data = getPersistedAffinity(horseName)
  if (!data) return null

  const ap = data.affinityProfiles

  const bestTracks = Object.entries(ap.track.courses)
    .filter(([, v]) => v.runs >= 2)
    .sort((a, b) => (b[1].wins / b[1].runs) - (a[1].wins / a[1].runs))
    .slice(0, 5)
    .map(([k, v]) => ({ track: k, runs: v.runs, wins: v.wins, wr: (v.wins / v.runs).toFixed(3) }))

  const bestArchetypes = Object.entries(ap.track.archetypes)
    .filter(([, v]) => v.effectiveRuns >= 3)
    .sort((a, b) => (b[1].weightedWins / b[1].effectiveRuns) - (a[1].weightedWins / a[1].effectiveRuns))
    .slice(0, 5)
    .map(([k, v]) => ({ archetype: k, effectiveRuns: Math.round(v.effectiveRuns), weightedWinRate: (v.weightedWins / v.effectiveRuns).toFixed(3) }))

  const bestGoing = Object.entries(ap.going)
    .filter(([, v]) => v.runs >= 2)
    .sort((a, b) => (b[1].wins / b[1].runs) - (a[1].wins / a[1].runs))
    .map(([k, v]) => ({ going: k, runs: v.runs, wins: v.wins, wr: (v.wins / v.runs).toFixed(3) }))

  const bestDistance = Object.entries(ap.distance)
    .filter(([, v]) => v.runs >= 2)
    .sort((a, b) => (b[1].wins / b[1].runs) - (a[1].wins / a[1].runs))
    .map(([k, v]) => ({ distance: k, runs: v.runs, wins: v.wins, wr: (v.wins / v.runs).toFixed(3) }))

  const styleProfile = Object.entries(ap.runningStyle)
    .filter(([, v]) => v.runs >= 1)
    .sort((a, b) => (b[1].wins / b[1].runs) - (a[1].wins / a[1].runs))
    .map(([k, v]) => ({
      style: k,
      runs: v.runs,
      wins: v.wins,
      wr: v.runs > 0 ? (v.wins / v.runs).toFixed(3) : '0',
      avgBeatenLengths: v.avgBeatenLengths || 0,
    }))

  const vh = data.systemVerificationHistory
  const verified = vh.historicalPredictions.filter(p => p.verificationStatus !== 'PENDING')

  return {
    horseName,
    macroMetrics: data.macroMetrics,
    bestTracks,
    bestArchetypes,
    bestGoing,
    bestDistance,
    styleProfile,
    totalPredictions: vh.totalPredictionsGenerated,
    verifiedPredictions: verified.length,
    highAffinityWinRate: vh.highAffinityThresholdRuns > 0
      ? (vh.highAffinityWins / vh.highAffinityThresholdRuns).toFixed(3) : 'N/A',
    calibrationState: data.calibrationState,
    lastUpdated: data.lastUpdated,
  }
}
