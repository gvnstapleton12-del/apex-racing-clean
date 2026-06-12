import { readFileSync } from 'fs'
import { resolve } from 'path'
import { getLearnedBias } from './trackBiasLearner.js'

const PROFILES_PATH = resolve('data/trackProfiles.json')
let profiles = null

function loadProfiles() {
  if (profiles) return profiles
  try {
    profiles = JSON.parse(readFileSync(PROFILES_PATH, 'utf8'))
  } catch {
    profiles = { tracks: {} }
  }
  return profiles
}

export function getTrackProfile(courseName) {
  const db = loadProfiles()
  if (!courseName) return null
  const name = courseName.trim()

  // Newmarket sub-track resolution
  // "Newmarket" alone should route to Rowley Mile (canonical default)
  if (name.toLowerCase() === 'newmarket') {
    return db.tracks['Newmarket (Rowley Mile)']
  }
  // "Newmarket July" or any string containing July after Newmarket → July Course
  if (name.toLowerCase().includes('newmarket') && /july/i.test(name)) {
    return db.tracks['Newmarket (July Course)']
  }

  // Exact match — highest priority after alias resolution
  if (db.tracks[name]) return db.tracks[name]

  const slug = name.toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/'/g, '')
    .replace(/\s+/g, '-')
    .replace(/-downs?$/, '')
    .replace(/-park$/, '')
    .replace(/-city$/, '')
    .replace(/-racecourse$/, '')
    .replace(/^the-/, '')
  if (db.tracks[slug]) return db.tracks[slug]

  for (const [key, profile] of Object.entries(db.tracks)) {
    const keySlug = key.toLowerCase()
      .replace(/\s*\(.*?\)\s*/g, '')
      .replace(/'/g, '')
      .replace(/\s+/g, '-')
      .replace(/-downs?$/, '')
      .replace(/-park$/, '')
      .replace(/-city$/, '')
      .replace(/-racecourse$/, '')
      .replace(/^the-/, '')
    if (keySlug === slug) return profile
  }

  return null
}

const JUMPS_ONLY_TRACKS = new Set([
  'Aintree', 'Ballinrobe', 'Bangor-on-Dee', 'Cartmel', 'Cheltenham',
  'Downpatrick', 'Fakenham', 'Fontwell', 'Hexham', 'Huntingdon',
  'Kelso', 'Ludlow', 'Market Rasen', 'Newton Abbot', 'Perth',
  'Plumpton', 'Punchestown', 'Stratford', 'Taunton', 'Thurles',
  'Tramore', 'Uttoxeter', 'Wetherby', 'Wexford', 'Worcester',
])

export function isJumpsOnly(courseName) {
  return JUMPS_ONLY_TRACKS.has(courseName)
}

export function isNHorJumpsRace(raceType) {
  if (!raceType) return false
  const t = raceType.toLowerCase()
  return t === 'hurdle' || t === 'chase' || t === 'nh flat'
}

export function checkDrawEligibility(courseName, raceType, drawValue) {
  const isNH = isJumpsOnly(courseName) || isNHorJumpsRace(raceType)
  if (isNH) {
    return {
      eligible: false,
      reason: 'DRAW N/A: National Hunt flip-start conditions. Evaluate by run-style (FR/PR) only.',
      drawValue: 0,
    }
  }
  return {
    eligible: true,
    reason: null,
    drawValue: Number(drawValue) || 0,
  }
}

export function isAW(courseName) {
  return getTrackProfile(courseName)?.aw || false
}

export function getDrawBias(courseName, distanceF) {
  const profile = getTrackProfile(courseName)
  if (!profile?.drawBias) return null
  const key = Object.keys(profile.drawBias).find(k => {
    const num = parseFloat(k.replace('f', ''))
    return Math.abs(num - distanceF) < 1.5
  })
  return key ? profile.drawBias[key] : null
}

export function getSurfaceType(courseName) {
  return getTrackProfile(courseName)?.surfaceType || 'turf'
}

export function isGalloping(courseName) {
  return getTrackProfile(courseName)?.galloping || false
}

export function isSharp(courseName) {
  return getTrackProfile(courseName)?.sharp || false
}

export function getHandedness(courseName) {
  return getTrackProfile(courseName)?.handedness || null
}

export function getTrackBiasSummary(courseName) {
  const profile = getTrackProfile(courseName)
  if (!profile) return null
  return {
    course: courseName,
    handedness: profile.handedness,
    surface: profile.surface,
    aw: profile.aw || false,
    galloping: profile.galloping || false,
    sharp: profile.sharp || false,
    paceBias: profile.paceBias || '',
    keyTraits: profile.keyTraits || [],
    notable: profile.notable || '',
    drawBias: profile.drawBias || {},
  }
}

export function getSystemExclusions(courseName) {
  const profile = getTrackProfile(courseName)
  return profile?.systemExclusions || []
}

export function checkRaceExclusion(race) {
  if (!race) return null
  const course = race.course || race.course_name
  const exclusions = getSystemExclusions(course)
  if (!exclusions.length) return null

  const raceName = (race.race_name || '').toLowerCase()
  const raceType = (race.type || race.race_type || '').toLowerCase()
  const raceClass = race.race_class
  const runners = race.runners || []
  const fieldSize = runners.length

  for (const ex of exclusions) {
    if (ex.type === 'race_type_exclusion') {
      // When both raceType AND raceNameContains are set, BOTH must match (AND logic)
      // When only one is set, only that one needs to match
      const raceTypeMatch = ex.raceType ? ex.raceType.toLowerCase() === raceType : true
      const raceNameMatch = ex.raceNameContains ? raceName.includes(ex.raceNameContains.toLowerCase()) : true
      if (raceTypeMatch && raceNameMatch) {
        return ex.note || `Race type ${ex.raceType || ''} excluded at ${course}`
      }
    } else if (ex.type === 'class_handicap_field_size') {
      const isHcap = raceName.includes('handicap') || raceType === 'hurdle' || raceType === 'chase' || raceType === 'national hunt flat'
      if (ex.raceClass && Number(raceClass) === ex.raceClass && isHcap && fieldSize >= (ex.maxRunners + 1)) {
        return ex.note || `Class ${ex.raceClass} handicap with ${fieldSize} runners excluded at ${course}`
      }
      if (ex.raceClass && Number(raceClass) === ex.raceClass && !isHcap && fieldSize >= (ex.maxRunners + 1)) {
        return ex.note || `Class ${ex.raceClass} with ${fieldSize} runners excluded at ${course}`
      }
    } else if (ex.type === 'distance_draw_raceType') {
      if (ex.raceType && ex.raceType.toLowerCase() === raceType && ex.distanceF && Math.abs(Number(race.distance_f) - ex.distanceF) < 0.5) {
        if (!ex.drawRange || (race.draw && race.draw >= ex.drawRange[0] && race.draw <= ex.drawRange[1])) {
          return ex.note || `Distance/draw/raceType combo excluded at ${course}`
        }
      }
    }
  }
  return null
}

function isSoftGoing(going = '') {
  return /soft|heavy|yielding/.test(going.toLowerCase())
}

function inRange(value, min, max) {
  if (max !== undefined) return value >= min && value <= max
  return value >= min
}

function matchCondition(cond, ctx) {
  const { distanceF, runningStyle, draw, going, stallNumber, fieldSize, courseType, raceType, raceName, headgearFirstTime, headgearAny } = ctx
  const hasStallData = Number.isInteger(stallNumber) && stallNumber > 0
  if (cond.minDistance !== undefined && distanceF < cond.minDistance) return false
  if (cond.maxDistance !== undefined && distanceF > cond.maxDistance) return false
  if (cond.exactDistance !== undefined && distanceF !== cond.exactDistance) return false
  if (cond.runningStyle && !cond.runningStyle.includes(runningStyle)) return false
  if (cond.drawLow && draw?.low !== cond.drawLow) return false
  if (cond.drawHigh && draw?.high !== cond.drawHigh) return false
  if (cond.softOnly && !isSoftGoing(going)) return false
  if (cond.fastOnly && isSoftGoing(going)) return false
  if ((cond.drawMax !== undefined || cond.drawMin !== undefined || cond.drawRange)
      && !hasStallData) return false
  if (cond.drawMax !== undefined && (!hasStallData || stallNumber > cond.drawMax)) return false
  if (cond.drawMin !== undefined && (!hasStallData || stallNumber < cond.drawMin)) return false
  if (cond.drawRange && Array.isArray(cond.drawRange) && cond.drawRange.length === 2) {
    const [lo, hi] = cond.drawRange
    if (!hasStallData || stallNumber < lo || stallNumber > hi) return false
  }
  if (cond.minField !== undefined && (fieldSize === undefined || fieldSize < cond.minField)) return false
  if (cond.maxField !== undefined && (fieldSize === undefined || fieldSize > cond.maxField)) return false
  if (cond.courseType && courseType !== cond.courseType) return false
  if (cond.raceType && raceType !== cond.raceType) return false
  if (cond.raceTypes && Array.isArray(cond.raceTypes) && !cond.raceTypes.includes(raceType)) return false
  if (cond.raceNameContains && Array.isArray(cond.raceNameContains)) {
    if (!raceName || !cond.raceNameContains.some(t => raceName.toLowerCase().includes(t.toLowerCase()))) return false
  }
  if (cond.heavyOnly && !isHeavyGoing(going)) return false
  if (cond.softOrHeavy && !isSoftGoing(going)) return false
  if (cond.headgearFirstTime && (!headgearFirstTime || headgearFirstTime.length === 0)) return false
  if (cond.headgearFirstTimeAny && (!headgearFirstTime || headgearFirstTime.length === 0)) return false
  if (cond.headgearAny && (!headgearAny || headgearAny.length === 0)) return false
  if (cond.headgearFirstTimeIncludes && Array.isArray(cond.headgearFirstTimeIncludes)) {
    if (!headgearFirstTime || !cond.headgearFirstTimeIncludes.some(h => headgearFirstTime.includes(h))) return false
  }
  return true
}

function isHeavyGoing(going = '') {
  return /heavy/.test(going.toLowerCase())
}

function applyBiasRules(rules, ctx) {
  if (!rules || rules.length === 0) return 0
  let adjustment = 0
  for (const rule of rules) {
    if (matchCondition(rule.when, ctx)) {
      adjustment += rule.adj
    }
  }
  return adjustment
}

export function computeTrackBiasFactor(courseName, distanceF, runningStyle, going = '', stallNumber, fieldSize, courseType, raceType, headgearFirstTime, headgearAny, raceName) {
  const profile = getTrackProfile(courseName)
  if (!profile) return 1.0

  const ctx = {
    distanceF: Number(distanceF) || 0,
    runningStyle: runningStyle || 'Midfield',
    draw: getDrawBias(courseName, distanceF),
    going: going || '',
    stallNumber,
    fieldSize,
    courseType,
    raceType,
    raceName,
    headgearFirstTime,
    headgearAny,
  }

  const draw = ctx.draw
  let staticFactor = 1.0

  const drawAdj = applyBiasRules(profile.drawBiasRules, ctx)
  staticFactor += drawAdj

  const layoutAdj = applyBiasRules(profile.layoutBiasRules, ctx)
  staticFactor += layoutAdj

  const featureAdj = applyBiasRules(profile.featureRules, ctx)
  staticFactor += featureAdj

  if (!profile.biasRules) {
    staticFactor = Math.max(0.85, Math.min(1.15, staticFactor))
  } else {
    const customAdj = applyBiasRules(profile.biasRules, ctx)
    staticFactor += customAdj
  }

  staticFactor = Math.max(0.85, Math.min(1.15, staticFactor))

  const learned = getLearnedBias(courseName, runningStyle)
  if (!learned) return staticFactor

  const learnedFactor = 1.0 + (learned.bias / 200)
  const blended = learnedFactor * learned.confidence + staticFactor * (1 - learned.confidence)

  return Math.max(0.85, Math.min(1.15, blended))
}
