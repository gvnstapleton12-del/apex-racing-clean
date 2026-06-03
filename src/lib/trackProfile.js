import { readFileSync } from 'fs'
import { resolve } from 'path'

let profiles = null

function loadProfiles() {
  if (profiles) return profiles
  try {
    profiles = JSON.parse(readFileSync(resolve('data/trackProfiles.json'), 'utf8'))
  } catch {
    profiles = { tracks: {} }
  }
  return profiles
}

export function getTrackProfile(courseName) {
  const db = loadProfiles()
  if (!courseName) return null
  const normalized = courseName.trim()
  return db.tracks[normalized] || null
}

export function isAW(courseName) {
  const profile = getTrackProfile(courseName)
  return profile?.aw || false
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
  const profile = getTrackProfile(courseName)
  return profile?.surfaceType || 'turf'
}

export function isGalloping(courseName) {
  const profile = getTrackProfile(courseName)
  return profile?.galloping || false
}

export function isSharp(courseName) {
  const profile = getTrackProfile(courseName)
  return profile?.sharp || false
}

export function getHandedness(courseName) {
  const profile = getTrackProfile(courseName)
  return profile?.handedness || null
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

export function computeTrackBiasFactor(courseName, distanceF, runningStyle) {
  const profile = getTrackProfile(courseName)
  if (!profile) return 1.0

  let factor = 1.0

  const draw = getDrawBias(courseName, distanceF)
  if (draw) {
    if (draw.low === 'advantage' && runningStyle === 'Front Runner') factor += 0.05
    if (draw.high === 'advantage' && runningStyle === 'Hold Up') factor += 0.05
    if (draw.low === 'disadvantage' && runningStyle === 'Hold Up') factor -= 0.02
  }

  if (profile.sharp && (runningStyle === 'Front Runner' || runningStyle === 'Prominent')) {
    factor += 0.03
  }
  if (profile.galloping && runningStyle === 'Hold Up') {
    factor += 0.02
  }

  return Math.max(0.85, Math.min(1.15, factor))
}
