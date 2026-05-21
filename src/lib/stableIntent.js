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

function parseFurlongs(distanceF) {
  if (!distanceF) return 0
  return parseFloat(String(distanceF).replace(/[^0-9.]/g, '')) || 0
}

const TRAINER_PROFILES = {
  'mullins': { targets: ['festivals', 'graded'], prepRuns: true, secondRunStrike: 0.35 },
  'skelton': { targets: ['handicaps', 'novices'], prepRuns: true, secondRunStrike: 0.28 },
  'henderson': { targets: ['festivals', 'graded'], prepRuns: true, secondRunStrike: 0.32 },
  'nicholls': { targets: ['handicaps', 'graded'], prepRuns: true, secondRunStrike: 0.30 },
  'obrien': { targets: ['group', 'classics'], prepRuns: true, secondRunStrike: 0.38 },
  'gosden': { targets: ['group', 'classics'], prepRuns: true, secondRunStrike: 0.35 },
  'haggas': { targets: ['handicaps', 'group'], prepRuns: false, secondRunStrike: 0.25 },
  'pipe': { targets: ['festivals', 'novices'], prepRuns: true, secondRunStrike: 0.27 },
  'stoute': { targets: ['group', 'classics'], prepRuns: true, secondRunStrike: 0.33 },
  'williams': { targets: ['handicaps', 'novices'], prepRuns: true, secondRunStrike: 0.22 },
  'elliott': { targets: ['festivals', 'graded'], prepRuns: true, secondRunStrike: 0.30 },
}

export function detectStableIntent(runner, race, options = {}) {
  const goingDb = options.goingDb || {}
  const distanceDb = options.distanceDb || {}
  const horseId = runner.horse_id || runner.horse
  const trainer = String(runner.trainer || '').toLowerCase()
  const jockey = String(runner.jockey || '').toLowerCase()
  const trainerRtf = Number(runner.trainer_rtf || 0)
  const formString = String(runner.form || '')
  const positions = parseFormPositions(formString)
  const lastRun = Number(runner.last_run || 0)
  const age = Number(runner.age || 0)
  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
  const distanceF = parseFurlongs(race.distance_f || '')
  const raceClass = String(race.race_class || '').toLowerCase()
  const pattern = (race.pattern || '').toLowerCase()
  const going = (race.going || '').toLowerCase()

  const signals = []
  let intentScore = 0

  const knownTrainer = TRAINER_PROFILES[Object.keys(TRAINER_PROFILES).find((k) => trainer.includes(k))]

  if (lastRun > 0) {
    if (lastRun >= 60 && lastRun <= 120) {
      signals.push('SECOND RUN AFTER BREAK')
      intentScore += 20
      if (knownTrainer?.prepRuns) {
        intentScore += 10
        signals.push('KNOWN PREP TRAINER')
      }
    } else if (lastRun >= 30 && lastRun < 60) {
      signals.push('FRESH RUN')
      intentScore += 10
    } else if (lastRun >= 120 && lastRun <= 180) {
      signals.push('RETURN FROM LONG BREAK')
      intentScore += 15
      if (knownTrainer?.prepRuns) {
        signals.push('LIKELY PREP RUN')
        intentScore -= 5
      }
    }
  }

  const distProfile = distanceDb[horseId]
  if (distProfile?.lastDistance > 0 && distanceF > 0) {
    const change = distanceF - distProfile.lastDistance
    if (change >= 2 && change <= 4) {
      signals.push('STEP UP IN TRIP')
      intentScore += 12
    } else if (change <= -2 && change >= -4) {
      signals.push('DROP IN TRIP')
      intentScore += 8
    } else if (change >= 4) {
      signals.push('MASSIVE TRIP CHANGE')
      intentScore += 15
    }
  }

  if (positions.length >= 2) {
    const recent = positions.slice(0, 3)
    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
    const lastPos = positions[0]

    if (lastPos >= 6 && avgPos <= 4) {
      signals.push('POOR LAST RUN, GOOD FORM')
      intentScore += 10
    }

    if (lastPos <= 2 && avgPos >= 4) {
      signals.push('RECENT IMPROVEMENT')
      intentScore += 8
    }
  }

  const ors = (race.runners || []).map((r) => Number(r.ofr || 0)).filter(Boolean)
  const avgOr = ors.length ? ors.reduce((a, b) => a + b, 0) / ors.length : 0
  if (or > 0 && avgOr > 0 && or <= avgOr - 3) {
    if (raceClass.includes('handicap') || pattern.includes('handicap')) {
      signals.push('HANDICAP DEBUT')
      intentScore += 15
      if (positions.length >= 2) {
        const recent = positions.slice(0, 3)
        const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
        if (avgPos <= 4) {
          intentScore += 10
          signals.push('WELL HANDICAPPED')
        }
      }
    }
  }

  if (raceClass.includes('5') || raceClass.includes('6')) {
    if (or > 0 && or >= avgOr + 5) {
      signals.push('CLASS DROP')
      intentScore += 12
    }
  }

  const topJockeys = ['de boinville', 'townend', 'blackmore', 'skelton', 'cobden', 'moore', 'doyle', 'johnson']
  const isTopJockey = topJockeys.some((j) => jockey.includes(j))
  if (isTopJockey && trainerRtf < 20) {
    signals.push('JOCKEY UPGRADE')
    intentScore += 10
  }

  if (knownTrainer) {
    if (knownTrainer.targets.some((t) => pattern.includes(t) || raceClass.includes(t))) {
      signals.push('TARGET RACE TYPE')
      intentScore += 15
    }

    if (knownTrainer.secondRunStrike >= 0.30 && lastRun >= 60 && lastRun <= 120) {
      signals.push('HIGH SECOND-RUN STRIKE')
      intentScore += 10
    }
  }

  if (goingDb[horseId]) {
    const gProfile = goingDb[horseId]
    const goingRec = gProfile.byGoing?.[race.going]
    if (goingRec && goingRec.runs >= 2) {
      const wpRate = ((goingRec.wins + goingRec.places * 0.4) / goingRec.runs) * 100
      if (wpRate >= 40) {
        signals.push('GOING SPECIALIST')
        intentScore += 8
      }
    }
  }

  const odds = Number(runner.odds || runner.price || 0)
  if (odds > 0 && odds >= 10 && intentScore >= 30) {
    signals.push('MARKET UNDERESTIMATING INTENT')
    intentScore += 10
  }

  intentScore = Math.max(0, Math.min(100, intentScore))

  let label = 'NO CLEAR INTENT'
  if (intentScore >= 60) label = 'STRONG INTENT'
  else if (intentScore >= 45) label = 'CLEAR INTENT'
  else if (intentScore >= 30) label = 'POSSIBLE INTENT'
  else if (intentScore >= 15) label = 'SLIGHT INTENT'

  return {
    score: intentScore,
    label,
    signals,
    trainerProfile: knownTrainer ? {
      name: trainer,
      targets: knownTrainer.targets,
      prepRuns: knownTrainer.prepRuns,
      secondRunStrike: knownTrainer.secondRunStrike,
    } : null,
    factors: {
      breakStatus: lastRun >= 120 ? 'LONG BREAK' : lastRun >= 60 ? 'MODERATE BREAK' : lastRun >= 30 ? 'FRESH' : 'RECENT',
      tripChange: distProfile?.lastDistance > 0 && distanceF > 0 ? Math.round((distanceF - distProfile.lastDistance) * 10) / 10 : 'UNKNOWN',
      handicapDebut: raceClass.includes('handicap') && or > 0 && avgOr > 0 && or <= avgOr - 3,
      classDrop: raceClass.includes('5') || raceClass.includes('6') ? (or > 0 && avgOr > 0 && or >= avgOr + 5) : false,
      jockeyUpgrade: isTopJockey && trainerRtf < 20,
      targetRace: knownTrainer ? knownTrainer.targets.some((t) => pattern.includes(t) || raceClass.includes(t)) : false,
    },
  }
}
