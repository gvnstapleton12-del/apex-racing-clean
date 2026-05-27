export function isRaceEnvironmentValid(race = {}) {
  const runners = Number(race.field_size ?? race.runners?.length ?? 0)
  const raceClass = String(race.class || race.race_class || '')

  // Ignore tiny fields
  if (runners > 0 && runners < 5) {
    return {
      valid: false,
      reason: 'SMALL_FIELD_DISTORTION',
    }
  }

  // Avoid huge low-grade chaos handicaps
  if (runners >= 16 && raceClass.includes('Class 6')) {
    return {
      valid: false,
      reason: 'LOW_GRADE_CHAOS',
    }
  }

  // Apprentice races are unstable
  const title = String(race.race_name || '').toLowerCase()

  if (title.includes('apprentice')) {
    return {
      valid: false,
      reason: 'APPRENTICE_RACE_FILTER',
    }
  }

  return {
    valid: true,
    reason: 'PASSED',
  }
}

export function detectHatTrickCandidate(horse = {}) {
  const wins = Number(horse.consecutiveWins || 0)
  const lastMargin = Number(horse.lastWinningMargin || 0)
  const classMove = Number(horse.classMove || 0)
  const careerHighWeight = Boolean(horse.careerHighWeight)

  if (wins < 2) {
    return false
  }

  if (lastMargin < 3) {
    return false
  }

  if (classMove > 0) {
    return false
  }

  if (careerHighWeight) {
    return false
  }

  return true
}

export function detectTrainerArchetype(runner = {}) {
  const trainer = String(runner.trainer || '').toLowerCase()

  if (trainer.includes('skelton')) {
    return 'SKELTON_RAIDER'
  }

  if (trainer.includes('olly murphy')) {
    return 'OLLY_MURPHY_TARGET'
  }

  if (trainer.includes('james owen')) {
    return 'JAMES_OWEN_TAPETA'
  }

  if (trainer.includes('mcconnell')) {
    return 'MCCONNELL_ALERT'
  }

  return 'STANDARD'
}
