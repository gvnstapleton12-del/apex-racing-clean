import { getCourseModifiers } from './courseProfiles.js'

function parseFurlongs(distanceF) {
  if (!distanceF) return 0
  if (typeof distanceF === 'number') return distanceF
  const m = String(distanceF).match(/(\d+)m\s*(\d*)f?\s*(\d*)y?/)
  if (m) {
    const miles = Number(m[1]) || 0
    const furlongs = Number(m[2]) || 0
    const yards = Number(m[3]) || 0
    return miles * 8 + furlongs + yards / 220
  }
  return parseFloat(String(distanceF).replace(/[^0-9.]/g, '')) || 0
}

function getFieldSizeTier(fieldSize) {
  if (fieldSize <= 4) return 'TINY'
  if (fieldSize <= 7) return 'SMALL'
  if (fieldSize <= 12) return 'MEDIUM'
  return 'LARGE'
}

function detectRaceType(race) {
  const name = (race.race_name || race.pattern || '').toLowerCase()
  const type = (race.type || race.race_type || '').toLowerCase()
  const raceClass = String(race.race_class || '').toLowerCase()

  if (type.includes('chase') || name.includes('chase') || raceClass.includes('chase')) return 'CHASE'
  if (type.includes('hurdle') || name.includes('hurdle') || raceClass.includes('hurdle')) return 'HURDLE'
  if (type.includes('nh flat') || name.includes('nh flat') || name.includes('national hunt flat')) return 'NH_FLAT'
  if (type.includes('flat') || name.includes('flat')) return 'FLAT'
  if (type.includes('bumper') || name.includes('bumper')) return 'NH_FLAT'

  if (name.includes('handicap')) return 'HANDICAP'
  if (name.includes('maiden')) return 'MAIDEN'
  if (name.includes('novice')) return 'NOVICE'
  if (name.includes('listed')) return 'LISTED'
  if (name.includes('group')) return 'GROUP'

  return 'UNKNOWN'
}

function detectDistanceBand(distanceF) {
  if (distanceF <= 0) return 'UNKNOWN'
  if (distanceF <= 5) return 'SPRINT'
  if (distanceF <= 7) return 'SHORT_MILE'
  if (distanceF <= 9) return 'MILE'
  if (distanceF <= 11) return 'MIDDLE'
  if (distanceF <= 14) return 'STAYING'
  return 'MARATHON'
}

export function classifyRaceArchetype(race) {
  const distanceF = parseFurlongs(race.distance_f || '')
  const pattern = (race.pattern || '').toLowerCase()
  const raceType = (race.type || race.race_type || '').toLowerCase()
  const raceClass = String(race.race_class || '').toLowerCase()
  const ageBand = (race.age_band || '').toLowerCase()
  const going = (race.going || '').toLowerCase()
  const surface = (race.surface || '').toLowerCase()
  const fieldSize = (race.runners || []).length

  const raceTypeDetected = detectRaceType(race)
  const distanceBand = detectDistanceBand(distanceF)
  const fieldTier = getFieldSizeTier(fieldSize)

  let archetype = 'STANDARD'
  const modifiers = []

  if (raceTypeDetected === 'CHASE') {
    archetype = 'CHASE'
    modifiers.push('jumping')
    if (distanceF >= 16) modifiers.push('staying_chase')
  } else if (raceTypeDetected === 'HURDLE') {
    archetype = 'HURDLE'
    modifiers.push('jumping')
    if (distanceF >= 16) modifiers.push('staying_hurdle')
  } else if (raceTypeDetected === 'NH_FLAT') {
    archetype = 'NH_FLAT'
    modifiers.push('flat_jumps')
  } else if (raceTypeDetected === 'GROUP' || raceTypeDetected === 'LISTED') {
    archetype = 'PATTERN'
    modifiers.push('class_race')
  }

  if (distanceF > 0 && distanceF <= 5 && archetype === 'STANDARD') {
    archetype = 'SPRINT_CHAOS'
    modifiers.push('short_distance')
  } else if (distanceF > 0 && distanceF >= 14 && archetype === 'STANDARD') {
    archetype = 'STAMINA_GRIND'
    modifiers.push('long_distance')
  }

  if (pattern.includes('maiden') || pattern.includes('novice') || raceType.includes('maiden') || raceTypeDetected === 'MAIDEN' || raceTypeDetected === 'NOVICE') {
    if (archetype === 'STANDARD' || archetype === 'SPRINT_CHAOS') {
      archetype = raceTypeDetected === 'NOVICE' ? 'NOVICE_RACE' : 'MAIDEN_NOVICE'
    }
    modifiers.push('inexperience')
  }

  if ((raceClass.includes('handicap') || pattern.includes('handicap') || raceTypeDetected === 'HANDICAP') && !['CHASE', 'HURDLE', 'PATTERN'].includes(archetype)) {
    if (archetype === 'STANDARD' || archetype === 'SPRINT_CHAOS') {
      archetype = 'HANDICAP_COMPRESSION'
    }
    modifiers.push('ratings_clustered')
  }

  if (ageBand.includes('2') || ageBand.includes('2yo')) {
    if (archetype === 'STANDARD') archetype = 'MAIDEN_NOVICE'
    modifiers.push('young_horses')
  }

  if (going.includes('heavy') || going.includes('soft')) {
    modifiers.push('testing_ground')
  }

  if (surface === 'all weather' || surface === 'polytrack' || surface === 'tapeta') {
    modifiers.push('artificial_surface')
  }

  modifiers.push(`field_${fieldTier.toLowerCase()}`)
  modifiers.push(`dist_${distanceBand.toLowerCase()}`)

  const courseMods = getCourseModifiers(race.course, archetype, distanceF)
  modifiers.push(...courseMods)

  return {
    archetype,
    modifiers,
    distanceF,
    fieldSize,
    fieldTier,
    distanceBand,
    raceType: raceTypeDetected,
    going,
    surface,
    raceClass,
    pattern,
    courseGroup: courseMods.length > 0 ? courseMods[0].replace('course_group_', '') : 'UNKNOWN',
  }
}

const WEIGHT_PROFILES = {
  SPRINT_CHAOS: {
    power: 0.40,
    pace: 0.30,
    human: 0.05,
    market: 0.03,
    trainer: 0.20,
    elimination: {
      paceThreshold: 'FAST',
      drawPenalty: 1.5,
      formRecency: 30,
    },
    notes: 'Pace and draw dominate. Early speed critical. Traffic matters.',
  },
  STAMINA_GRIND: {
    power: 0.65,
    pace: 0.05,
    human: 0.10,
    market: 0.03,
    trainer: 0.15,
    elimination: {
      paceThreshold: 'SLOW',
      drawPenalty: 0.3,
      formRecency: 60,
    },
    notes: 'Class and staying power dominate. Consistency over speed.',
  },
  MAIDEN_NOVICE: {
    power: 0.30,
    pace: 0.08,
    human: 0.12,
    market: 0.05,
    trainer: 0.35,
    elimination: {
      paceThreshold: 'ANY',
      drawPenalty: 0.3,
      formRecency: 999,
    },
    notes: 'Huge uncertainty. Trainer intent matters most. Minimal market influence.',
  },
  NOVICE_RACE: {
    power: 0.35,
    pace: 0.10,
    human: 0.10,
    market: 0.05,
    trainer: 0.33,
    elimination: {
      paceThreshold: 'ANY',
      drawPenalty: 0.4,
      formRecency: 999,
    },
    notes: 'Some experience but still learning. Trainer and breeding matter.',
  },
  HANDICAP_COMPRESSION: {
    power: 0.35,
    pace: 0.25,
    human: 0.12,
    market: 0.03,
    trainer: 0.22,
    elimination: {
      paceThreshold: 'ANY',
      drawPenalty: 1.2,
      formRecency: 45,
    },
    notes: 'Ratings tightly clustered. Pace/setup edge matters most.',
  },
  CHASE: {
    power: 0.50,
    pace: 0.12,
    human: 0.10,
    market: 0.03,
    trainer: 0.22,
    elimination: {
      paceThreshold: 'ANY',
      drawPenalty: 0.3,
      formRecency: 60,
    },
    notes: 'Jumping ability and stamina. Class and experience critical.',
  },
  HURDLE: {
    power: 0.45,
    pace: 0.15,
    human: 0.10,
    market: 0.03,
    trainer: 0.22,
    elimination: {
      paceThreshold: 'ANY',
      drawPenalty: 0.4,
      formRecency: 45,
    },
    notes: 'Speed over hurdles. Pace and class both matter.',
  },
  NH_FLAT: {
    power: 0.30,
    pace: 0.10,
    human: 0.10,
    market: 0.05,
    trainer: 0.30,
    elimination: {
      paceThreshold: 'ANY',
      drawPenalty: 0.5,
      formRecency: 999,
    },
    notes: 'Bumper races. Minimal form — trainer dominates. Tiny market signal.',
  },
  PATTERN: {
    power: 0.55,
    pace: 0.12,
    human: 0.08,
    market: 0.03,
    trainer: 0.15,
    elimination: {
      paceThreshold: 'ANY',
      drawPenalty: 0.8,
      formRecency: 30,
    },
    notes: 'Class races. Best horse usually wins. Form and ability key.',
  },
  STANDARD: {
    power: 0.55,
    pace: 0.15,
    human: 0.10,
    market: 0.03,
    trainer: 0.15,
    elimination: {
      paceThreshold: 'ANY',
      drawPenalty: 1.0,
      formRecency: 60,
    },
    notes: 'Default profile. Balanced weighting across all layers.',
  },
}

const FIELD_SIZE_ADJUSTMENTS = {
  TINY: {
    powerMod: 0.10,
    paceMod: -0.05,
    marketMod: 0.0,
    trainerMod: -0.05,
    notes: 'Small fields — favourite wins more often. Trainer matters.',
  },
  SMALL: {
    powerMod: 0.05,
    paceMod: 0.05,
    marketMod: 0.0,
    trainerMod: 0.0,
    notes: 'Small-medium fields. Pace setup matters more than usual.',
  },
  MEDIUM: {
    powerMod: 0.0,
    paceMod: 0.0,
    marketMod: 0.0,
    trainerMod: 0.0,
    notes: 'Standard field size. No adjustment needed.',
  },
  LARGE: {
    powerMod: -0.05,
    paceMod: 0.10,
    marketMod: 0.0,
    trainerMod: 0.05,
    notes: 'Large fields — chaos factor increases. Pace and draw critical.',
  },
}

export function getRaceWeights(archetype) {
  return WEIGHT_PROFILES[archetype] || WEIGHT_PROFILES.STANDARD
}

export function getFieldSizeAdjustments(fieldTier) {
  return FIELD_SIZE_ADJUSTMENTS[fieldTier] || FIELD_SIZE_ADJUSTMENTS.MEDIUM
}

export function getModifierAdjustments(modifiers) {
  let adjustments = {
    paceAdj: 0,
    drawAdj: 0,
    trainerAdj: 0,
    marketAdj: 0,
  }

  if (modifiers.includes('testing_ground')) {
    adjustments.trainerAdj += 0.05
    adjustments.paceAdj -= 0.05
  }

  if (modifiers.includes('large_field') || modifiers.includes('field_large')) {
    adjustments.drawAdj += 0.08
    adjustments.paceAdj += 0.05
  }

  if (modifiers.includes('field_small')) {
    adjustments.marketAdj += 0.0
  }

  if (modifiers.includes('field_tiny')) {
    adjustments.marketAdj += 0.0
    adjustments.paceAdj -= 0.05
  }

  if (modifiers.includes('young_horses')) {
    adjustments.trainerAdj += 0.05
    adjustments.marketAdj += 0.0
  }

  if (modifiers.includes('artificial_surface')) {
    adjustments.paceAdj -= 0.03
  }

  if (modifiers.includes('dist_sprint')) {
    adjustments.paceAdj += 0.05
    adjustments.drawAdj += 0.03
  }

  if (modifiers.includes('dist_staying') || modifiers.includes('dist_marathon')) {
    adjustments.paceAdj -= 0.05
    adjustments.trainerAdj += 0.03
  }

  if (modifiers.includes('jumping')) {
    adjustments.trainerAdj += 0.03
  }

  // Course archetype adjustments
  if (modifiers.includes('tight_sprint')) {
    adjustments.paceAdj += 0.08
    adjustments.drawAdj += 0.08
  }

  if (modifiers.includes('tight_staying')) {
    adjustments.trainerAdj += 0.05
  }

  if (modifiers.includes('undulating_stamina_test')) {
    adjustments.paceAdj -= 0.05
    adjustments.trainerAdj += 0.05
  }

  if (modifiers.includes('galloping_stamina')) {
    adjustments.trainerAdj += 0.03
  }

  if (modifiers.includes('high_draw_bias_sprint')) {
    adjustments.drawAdj += 0.06
  }

  if (modifiers.includes('pace_advantage_course')) {
    adjustments.paceAdj += 0.05
  }

  if (modifiers.includes('course_specialist')) {
    adjustments.trainerAdj += 0.04
  }

  if (modifiers.includes('course_uphill_finish')) {
    adjustments.paceAdj -= 0.03
    adjustments.trainerAdj += 0.02
  }

  return adjustments
}
