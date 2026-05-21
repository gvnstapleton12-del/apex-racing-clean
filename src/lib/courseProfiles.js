export const COURSE_PROFILES = {
  // UK Left-handed tracks
  ascot: { handed: 'left', type: 'oval', uphill: true },
  ayr: { handed: 'left', type: 'oval', uphill: true },
  bath: { handed: 'left', type: 'oval', uphill: true },
  cheltenham: { handed: 'left', type: 'oval', uphill: true },
  chepstow: { handed: 'left', type: 'oval', uphill: false },
  doncaster: { handed: 'left', type: 'oval', uphill: false },
  fontwell: { handed: 'left', type: 'oval', uphill: false },
  goodwood: { handed: 'left', type: 'oval', uphill: true },
  haydock: { handed: 'left', type: 'oval', uphill: false },
  kempton: { handed: 'left', type: 'oval', uphill: false },
  newbury: { handed: 'left', type: 'oval', uphill: false },
  newmarket_july: { handed: 'left', type: 'straight', uphill: false },
  newmarket_rowley: { handed: 'left', type: 'straight', uphill: false },
  nottingham: { handed: 'left', type: 'oval', uphill: false },
  pontefract: { handed: 'left', type: 'oval', uphill: true },
  salisbury: { handed: 'left', type: 'oval', uphill: true },
  sandown: { handed: 'left', type: 'oval', uphill: true },
  thirsk: { handed: 'left', type: 'oval', uphill: false },
  worcester: { handed: 'left', type: 'oval', uphill: false },
  york: { handed: 'left', type: 'straight', uphill: false },

  // UK Right-handed tracks
  brighton: { handed: 'right', type: 'oval', uphill: true },
  cartmel: { handed: 'right', type: 'oval', uphill: false },
  catterick: { handed: 'right', type: 'oval', uphill: false },
  chelmsford: { handed: 'right', type: 'oval', uphill: false },
  chester: { handed: 'right', type: 'oval', uphill: false },
  exeter: { handed: 'right', type: 'oval', uphill: true },
  hereford: { handed: 'right', type: 'oval', uphill: false },
  huntingdon: { handed: 'right', type: 'oval', uphill: false },
  leicester: { handed: 'right', type: 'oval', uphill: false },
  lingfield: { handed: 'right', type: 'oval', uphill: false },
  ludlow: { handed: 'right', type: 'oval', uphill: false },
  market_rasen: { handed: 'right', type: 'oval', uphill: false },
  newcastle: { handed: 'right', type: 'oval', uphill: false },
  plampton: { handed: 'right', type: 'oval', uphill: false },
  ripon: { handed: 'right', type: 'oval', uphill: false },
  southwell: { handed: 'right', type: 'oval', uphill: false },
  stratford: { handed: 'right', type: 'oval', uphill: false },
  taunton: { handed: 'right', type: 'oval', uphill: false },
  uttoxeter: { handed: 'right', type: 'oval', uphill: false },
  warwick: { handed: 'right', type: 'oval', uphill: false },
  windsor: { handed: 'right', type: 'oval', uphill: false },
  wollaton: { handed: 'right', type: 'oval', uphill: false },

  // IRE Left-handed tracks
  ballinrobe: { handed: 'left', type: 'oval', uphill: false },
  bellewstown: { handed: 'left', type: 'oval', uphill: false },
  cork: { handed: 'left', type: 'oval', uphill: true },
  downpatrick: { handed: 'left', type: 'oval', uphill: false },
  galway: { handed: 'left', type: 'oval', uphill: false },
  kilbeggan: { handed: 'left', type: 'oval', uphill: false },
  lethbridge: { handed: 'left', type: 'oval', uphill: false },
  limerick: { handed: 'left', type: 'oval', uphill: false },
  listowel: { handed: 'left', type: 'oval', uphill: false },
  punchestown: { handed: 'left', type: 'oval', uphill: true },
  sligo: { handed: 'left', type: 'oval', uphill: false },
  tipperary: { handed: 'left', type: 'oval', uphill: false },
  tramore: { handed: 'left', type: 'oval', uphill: false },
  tuam: { handed: 'left', type: 'oval', uphill: false },

  // IRE Right-handed tracks
  clonmel: { handed: 'right', type: 'oval', uphill: false },
  fairyhouse: { handed: 'right', type: 'oval', uphill: false },
  navan: { handed: 'right', type: 'oval', uphill: false },
  naas: { handed: 'right', type: 'oval', uphill: false },
  roscommon: { handed: 'right', type: 'oval', uphill: false },
}

export function normalizeCourseName(course) {
  if (!course) return ''
  const c = course.toLowerCase().replace(/[^a-z]/g, '')
  if (c.includes('newmarket')) {
    return c.includes('july') ? 'newmarket_july' : 'newmarket_rowley'
  }
  for (const key of Object.keys(COURSE_PROFILES)) {
    if (c.includes(key) || key.includes(c)) return key
  }
  return c
}

export function getCourseProfile(course) {
  const key = normalizeCourseName(course)
  return COURSE_PROFILES[key] || { handed: 'unknown', type: 'unknown', uphill: false }
}

export function computeTrackCompatibility(noteCourse, raceCourse) {
  const noteProfile = getCourseProfile(noteCourse)
  const raceProfile = getCourseProfile(raceCourse)

  if (noteProfile.handed === 'unknown' || raceProfile.handed === 'unknown') return 1.0
  if (noteProfile.handed === raceProfile.handed) return 1.0

  return 0.5
}
