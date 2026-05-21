function parseFurlongs(distanceF) {
  if (!distanceF) return 0
  return parseFloat(String(distanceF).replace(/[^0-9.]/g, '')) || 0
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

  let archetype = 'STANDARD'
  const modifiers = []

  if (distanceF > 0 && distanceF <= 6) {
    archetype = 'SPRINT_CHAOS'
    modifiers.push('short_distance')
    if (fieldSize >= 12) modifiers.push('large_field')
  } else if (distanceF > 0 && distanceF >= 12) {
    archetype = 'STAMINA_GRIND'
    modifiers.push('long_distance')
  }

  if (pattern.includes('maiden') || pattern.includes('novice') || raceType.includes('maiden')) {
    archetype = 'MAIDEN_NOVICE'
    modifiers.push('inexperience')
  }

  if (raceClass.includes('handicap') || pattern.includes('handicap')) {
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

  return {
    archetype,
    modifiers,
    distanceF,
    fieldSize,
    going,
    surface,
    raceClass,
    pattern,
  }
}

const WEIGHT_PROFILES = {
  SPRINT_CHAOS: {
    power: 0.45,
    pace: 0.25,
    human: 0.08,
    market: 0.07,
    trainer: 0.15,
    elimination: {
      paceThreshold: 'FAST',
      drawPenalty: 1.5,
      formRecency: 30,
    },
    notes: 'Pace and draw dominate. Early speed critical. Traffic matters.',
  },
  STAMINA_GRIND: {
    power: 0.65,
    pace: 0.08,
    human: 0.10,
    market: 0.05,
    trainer: 0.12,
    elimination: {
      paceThreshold: 'SLOW',
      drawPenalty: 0.5,
      formRecency: 60,
    },
    notes: 'Class and staying power dominate. Consistency over speed.',
  },
  MAIDEN_NOVICE: {
    power: 0.35,
    pace: 0.10,
    human: 0.10,
    market: 0.15,
    trainer: 0.30,
    elimination: {
      paceThreshold: 'ANY',
      drawPenalty: 0.5,
      formRecency: 999,
    },
    notes: 'Huge uncertainty. Trainer intent and market intelligence matter most.',
  },
  HANDICAP_COMPRESSION: {
    power: 0.40,
    pace: 0.22,
    human: 0.12,
    market: 0.08,
    trainer: 0.18,
    elimination: {
      paceThreshold: 'ANY',
      drawPenalty: 1.2,
      formRecency: 45,
    },
    notes: 'Ratings tightly clustered. Pace/setup edge matters most.',
  },
  STANDARD: {
    power: 0.60,
    pace: 0.15,
    human: 0.10,
    market: 0.05,
    trainer: 0.10,
    elimination: {
      paceThreshold: 'ANY',
      drawPenalty: 1.0,
      formRecency: 60,
    },
    notes: 'Default profile. Balanced weighting across all layers.',
  },
}

export function getRaceWeights(archetype) {
  return WEIGHT_PROFILES[archetype] || WEIGHT_PROFILES.STANDARD
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

  if (modifiers.includes('large_field')) {
    adjustments.drawAdj += 0.05
    adjustments.paceAdj += 0.05
  }

  if (modifiers.includes('young_horses')) {
    adjustments.trainerAdj += 0.05
    adjustments.marketAdj += 0.05
  }

  if (modifiers.includes('artificial_surface')) {
    adjustments.paceAdj -= 0.03
  }

  return adjustments
}
