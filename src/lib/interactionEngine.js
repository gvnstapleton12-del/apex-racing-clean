function computeFieldSizeImpact(fieldSize) {
  if (fieldSize <= 5) return { label: 'Small', multiplier: 1.0 }
  if (fieldSize <= 8) return { label: 'Medium', multiplier: 1.0 }
  if (fieldSize <= 12) return { label: 'Large', multiplier: 1.0 }
  if (fieldSize <= 16) return { label: 'Very Large', multiplier: 1.0 }
  return { label: 'Massive', multiplier: 1.0 }
}

function computeRaceTypeImpact(raceName) {
  const name = (raceName || '').toLowerCase()
  if (/maiden/i.test(name)) return { label: 'Maiden', marketBoost: 1.2, classBoost: 0.8 }
  if (/novice/i.test(name)) return { label: 'Novice', marketBoost: 1.1, classBoost: 0.9 }
  if (/handicap/i.test(name)) return { label: 'Handicap', marketBoost: 1.0, classBoost: 1.2 }
  if (/group/i.test(name)) return { label: 'Group', marketBoost: 1.3, classBoost: 1.3 }
  if (/claim/i.test(name)) return { label: 'Claimer', marketBoost: 0.8, classBoost: 0.7 }
  if (/selling/i.test(name)) return { label: 'Seller', marketBoost: 0.7, classBoost: 0.6 }
  return { label: 'Standard', marketBoost: 1.0, classBoost: 1.0 }
}

function computePacePressureImpact(paceMap) {
  const frontRunners = paceMap?.frontRunners || 0
  const tempo = paceMap?.projectedTempo || 'EVEN'
  const collapseRisk = paceMap?.collapseRisk || 'LOW'

  if (frontRunners >= 3 && tempo === 'FAST') {
    return { label: 'High Pressure', drawBoost: 1.3, holdUpBoost: 1.2, frontRunnerPenalty: 0.8 }
  }
  if (frontRunners >= 2) {
    return { label: 'Moderate Pressure', drawBoost: 1.1, holdUpBoost: 1.1, frontRunnerPenalty: 0.9 }
  }
  if (frontRunners <= 1 && tempo === 'SLOW') {
    return { label: 'Low Pressure', drawBoost: 0.9, holdUpBoost: 0.8, frontRunnerPenalty: 1.1 }
  }
  return { label: 'Normal', drawBoost: 1.0, holdUpBoost: 1.0, frontRunnerPenalty: 1.0 }
}

function computeHorseExposure(runner) {
  const form = runner.form || ''
  const runs = form.split(/[\s/-]+/).filter((p) => /^\d+$/.test(p)).length
  if (runs <= 2) return { label: 'Very Light', trainerBoost: 1.3, marketPenalty: 0.8 }
  if (runs <= 5) return { label: 'Light', trainerBoost: 1.2, marketPenalty: 0.9 }
  if (runs <= 10) return { label: 'Moderate', trainerBoost: 1.0, marketPenalty: 1.0 }
  return { label: 'Experienced', trainerBoost: 0.9, marketPenalty: 1.0 }
}

function computeClassMismatchImpact(runner, race) {
  const horseOr = runner.or || runner.ofr || 0
  const raceClass = race.race_class || race.class || 0

  if (horseOr === 0) return { label: 'Unrated', classUncertainty: 1.2 }

  const diff = Math.abs(horseOr - raceClass)
  if (diff <= 5) return { label: 'Well Handicapped', classUncertainty: 1.0 }
  if (diff <= 15) return { label: 'Slight Mismatch', classUncertainty: 1.05 }
  if (diff <= 30) return { label: 'Clear Mismatch', classUncertainty: 1.1 }
  return { label: 'Major Mismatch', classUncertainty: 1.2 }
}

function computeGoingImpact(runner, race) {
  const going = (race.going || '').toLowerCase()
  const horseGoing = runner.going_preference || ''

  if (!going || going === 'good') return { label: 'Standard', goingBoost: 1.0 }

  if (horseGoing && going.includes(horseGoing)) {
    return { label: 'Preferred', goingBoost: 1.15 }
  }

  if (going.includes('heavy') || going.includes('soft')) {
    const or = runner.or || runner.ofr || 0
    if (or > 120) return { label: 'Stamina Test', goingBoost: 1.05 }
    return { label: 'Challenging', goingBoost: 0.95 }
  }

  if (going.includes('firm') || going.includes('fast')) {
    const age = runner.age || 5
    if (age <= 4) return { label: 'Speed Test', goingBoost: 1.05 }
    return { label: 'Standard', goingBoost: 1.0 }
  }

  return { label: 'Standard', goingBoost: 1.0 }
}

function computeDistanceFit(runner, race) {
  const raceDist = parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0
  const lastRun = runner.last_run || 999
  const form = runner.form || ''

  if (lastRun > 90) {
    return { label: 'Rusty', distanceUncertainty: 1.1 }
  }

  const runs = form.split(/[\s/-]+/).filter((p) => /^\d+$/.test(p)).length
  if (runs <= 2 && raceDist > 10) {
    return { label: 'Unproven Trip', distanceUncertainty: 1.15 }
  }

  return { label: 'Known', distanceUncertainty: 1.0 }
}

export function computeInteractions(runner, race, paceMap) {
  const fieldSize = computeFieldSizeImpact(race.field_size || race.fieldSize || 8)
  const raceType = computeRaceTypeImpact(race.race_name || race.raceName || '')
  const pacePressure = computePacePressureImpact(paceMap)
  const exposure = computeHorseExposure(runner)
  const classMismatch = computeClassMismatchImpact(runner, race)
  const goingImpact = computeGoingImpact(runner, race)
  const distanceFit = computeDistanceFit(runner, race)

  const interactions = []
  let totalAdjustment = 0

  // Draw × Pace Pressure
  if (pacePressure.drawBoost !== 1.0 && runner.draw) {
    const draw = Number(runner.draw)
    const fieldSize = race.field_size || race.fieldSize || 8
    const drawRatio = draw / fieldSize

    let drawAdj = 0
    if (pacePressure.label === 'High Pressure') {
      if (drawRatio <= 0.3) drawAdj = 5
      else if (drawRatio >= 0.7) drawAdj = -3
    } else if (pacePressure.label === 'Moderate Pressure') {
      if (drawRatio <= 0.3) drawAdj = 2
      else if (drawRatio >= 0.7) drawAdj = -2
    }

    if (drawAdj !== 0) {
      interactions.push({
        type: 'draw_pace',
        label: `Draw ${draw} + ${pacePressure.label}`,
        adjustment: drawAdj,
        direction: drawAdj > 0 ? 'positive' : 'negative',
      })
      totalAdjustment += drawAdj
    }
  }

  // Class × Field Size
  if (fieldSize.label === 'Small' && classMismatch.classUncertainty > 1.0) {
    const classAdj = classMismatch.classUncertainty > 1.1 ? -4 : -2
    interactions.push({
      type: 'class_fieldsize',
      label: `Class Mismatch in Small Field`,
      adjustment: classAdj,
      direction: 'negative',
    })
    totalAdjustment += classAdj
  }

  if (fieldSize.label === 'Large' || fieldSize.label === 'Very Large' || fieldSize.label === 'Massive') {
    const or = runner.or || runner.ofr || 0
    if (or > 100) {
      interactions.push({
        type: 'class_fieldsize',
        label: `Class stands out in large field`,
        adjustment: 3,
        direction: 'positive',
      })
      totalAdjustment += 3
    }
  }

  // Market × Race Type
  if (raceType.marketBoost !== 1.0) {
    const marketScore = runner.market?.score || 0
    const marketAdj = Math.round(marketScore * (raceType.marketBoost - 1) * 10) / 10
    if (Math.abs(marketAdj) > 0.5) {
      interactions.push({
        type: 'market_racetype',
        label: `Market ${raceType.marketBoost > 1 ? 'stronger' : 'weaker'} in ${raceType.label}`,
        adjustment: marketAdj,
        direction: marketAdj > 0 ? 'positive' : 'negative',
      })
      totalAdjustment += marketAdj
    }
  }

  // Trainer × Exposure
  if (exposure.trainerBoost !== 1.0) {
    const trainerRtf = runner.trainer_rtf || 0
    const trainerAdj = Math.round(trainerRtf * (exposure.trainerBoost - 1) * 10) / 10
    if (Math.abs(trainerAdj) > 0.5) {
      interactions.push({
        type: 'trainer_exposure',
        label: `${exposure.label} horse + trainer RTF ${trainerRtf}%`,
        adjustment: trainerAdj,
        direction: trainerAdj > 0 ? 'positive' : 'negative',
      })
      totalAdjustment += trainerAdj
    }
  }

  // Going × Ability
  if (goingImpact.goingBoost !== 1.0) {
    const or = runner.or || runner.ofr || 0
    const goingAdj = Math.round(or * (goingImpact.goingBoost - 1) * 0.1 * 10) / 10
    if (Math.abs(goingAdj) > 0.5) {
      interactions.push({
        type: 'going_ability',
        label: `${goingImpact.label} (${race.going || 'Unknown'})`,
        adjustment: goingAdj,
        direction: goingAdj > 0 ? 'positive' : 'negative',
      })
      totalAdjustment += goingAdj
    }
  }

  // Distance × Experience
  if (distanceFit.distanceUncertainty > 1.0) {
    const uncertaintyAdj = Math.round((distanceFit.distanceUncertainty - 1) * -10 * 10) / 10
    if (uncertaintyAdj < 0) {
      interactions.push({
        type: 'distance_experience',
        label: `${distanceFit.label}`,
        adjustment: uncertaintyAdj,
        direction: 'negative',
      })
      totalAdjustment += uncertaintyAdj
    }
  }

  // Pace Style × Pace Pressure
  const runningStyle = runner.runningStyle || ''
  if (runningStyle === 'Front Runner' && pacePressure.frontRunnerPenalty < 1.0) {
    const penalty = Math.round((pacePressure.frontRunnerPenalty - 1) * 10 * 10) / 10
    if (penalty < 0) {
      interactions.push({
        type: 'style_pace',
        label: `Front runner in ${pacePressure.label}`,
        adjustment: penalty,
        direction: 'negative',
      })
      totalAdjustment += penalty
    }
  }

  if (runningStyle === 'Hold Up' && pacePressure.holdUpBoost > 1.0) {
    const boost = Math.round((pacePressure.holdUpBoost - 1) * 10 * 10) / 10
    if (boost > 0) {
      interactions.push({
        type: 'style_pace',
        label: `Hold-up runner benefits from ${pacePressure.label}`,
        adjustment: boost,
        direction: 'positive',
      })
      totalAdjustment += boost
    }
  }

  return {
    interactions,
    totalAdjustment: Math.round(totalAdjustment * 10) / 10,
    context: {
      fieldSize: fieldSize.label,
      raceType: raceType.label,
      pacePressure: pacePressure.label,
      exposure: exposure.label,
      classFit: classMismatch.label,
      goingFit: goingImpact.label,
      distanceFit: distanceFit.label,
    },
  }
}

export function applyInteractionAdjustments(score, interactions) {
  if (!interactions || interactions.length === 0) return score

  const maxInteractionCap = 15
  const totalAdjustment = interactions.reduce((sum, i) => sum + i.adjustment, 0)
  const cappedAdjustment = Math.max(-maxInteractionCap, Math.min(maxInteractionCap, totalAdjustment))

  return Math.max(1, Math.min(99, score + cappedAdjustment))
}
