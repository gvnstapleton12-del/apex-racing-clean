import { analyzeForm } from './formEngine.js'

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

export function detectHiddenImprover(runner, race, options = {}) {
  const goingDb = options.goingDb || {}
  const distanceDb = options.distanceDb || {}
  const replayDb = options.replayDb || {}
  const horseId = runner.horse_id || runner.horse

  const formAnalysis = analyzeForm(runner, race)
  const positions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)
  const lastRun = Number(runner.last_run || 0)
  const age = Number(runner.age || 0)
  const or = Number(runner.ofr || runner.official_rating || runner.or || 0)
  const rpr = Number(runner.rpr || 0)
  const trainer = String(runner.trainer || '').toLowerCase()
  const jockey = String(runner.jockey || '').toLowerCase()
  const trainerRtf = Number(runner.trainer_rtf || 0)
  const distanceF = parseFurlongs(race.distance_f || '')
  const going = (race.going || '').toLowerCase()
  const surface = (race.surface || '').toLowerCase()

  const score = 0
  const flags = []
  let potential = 0

  const runCount = formAnalysis.summary.finishedRuns
  if (runCount <= 2 && runCount > 0) {
    potential += 20
    flags.push('LOW EXPOSURE')
  } else if (runCount <= 3) {
    potential += 10
    flags.push('LIGHTLY RACED')
  }

  if (positions.length >= 3) {
    const recent = positions.slice(0, 3)
    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
    const improved = recent[recent.length - 1] < recent[0]
    const lastPos = positions[0]
    const posSpread = Math.max(...positions) - Math.min(...positions)

    if (improved && lastPos <= 4) {
      potential += 15
      flags.push('PROGRESSIVE PROFILE')
    }

    if (lastPos >= 6 && posSpread >= 6) {
      const lastWasBad = lastPos >= 7
      if (lastWasBad) {
        potential += 10
        flags.push('RECENT BOUNCE RUN')
      }
    }

    if (positions.length >= 4) {
      const firstHalf = positions.slice(Math.floor(positions.length / 2))
      const secondHalf = positions.slice(0, Math.floor(positions.length / 2))
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
      if (firstAvg < secondAvg - 1) {
        potential += 10
        flags.push('IMPROVING TREND')
      }
    }
  }

  const replayKey = `${runner.horse}|${race.course}`
  const replayNote = replayDb[replayKey] || Object.entries(replayDb || {}).find(([key]) => key.startsWith(`${runner.horse}|`))?.[1] || {}
  const replayTags = replayNote.tags || []
  const replayAdj = Number(replayNote.adjustment) || 0

  const positiveTags = ['strong_finish', 'blocked_run', 'wrong_trip', 'hampered', 'no_room', 'looked_winner', 'ran_green', 'green', 'flew_up_hill', 'head_way', 'rally']
  const positiveTagCount = replayTags.filter((t) => positiveTags.some((pt) => t.toLowerCase().replace(/\s+/g, '_').includes(pt))).length

  if (positiveTagCount >= 2 || replayAdj > 0) {
    potential += 12
    flags.push('POSITIVE REPLAY NOTES')
  } else if (positiveTagCount >= 1) {
    potential += 6
    flags.push('REPLAY POSITIVE')
  }

  if (age >= 3 && age <= 5) {
    potential += 8
    flags.push('PRIME AGE CURVE')
  } else if (age === 2) {
    potential += 12
    flags.push('YOUNG IMPROVER')
  } else if (age === 6) {
    potential += 3
    flags.push('MATURE PEAK')
  }

  const distProfile = distanceDb[horseId]
  if (distProfile?.lastDistance > 0 && distanceF > 0) {
    const change = distanceF - distProfile.lastDistance
    if (change >= 2 && change <= 4) {
      potential += 10
      flags.push('STEP UP IN TRIP')
    } else if (change <= -2 && change >= -4) {
      potential += 8
      flags.push('DROP IN TRIP')
    }
  }

  if (goingDb[horseId]) {
    const gProfile = goingDb[horseId]
    const todayGoing = going.includes('soft') || going.includes('heavy') ? 'soft' : going.includes('firm') ? 'firm' : 'good'
    const goingRec = gProfile.byGoing?.[race.going]
    if (goingRec && goingRec.runs >= 1) {
      const wpRate = ((goingRec.wins + goingRec.places * 0.4) / goingRec.runs) * 100
      if (wpRate >= 40) {
        potential += 8
        flags.push('GOING SPECIALIST')
      }
    }
  }

  if (going.includes('heavy') || going.includes('soft')) {
    if (positions.length >= 2) {
      const recent = positions.slice(0, 3)
      const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
      if (avgPos >= 5) {
        potential += 5
        flags.push('PREVIOUS SOFT/HEAVY STRUGGLES')
      }
    }
  }

  if (surface === 'all weather') {
    if (goingDb[horseId]?.bySurface?.['All Weather']?.runs === 0) {
      potential += 3
      flags.push('AW UNKNOWN')
    }
  }

  const topTrainers = ['skelton', 'henderson', 'nicholls', 'pipe', 'mullins', 'obrien', 'haggas', 'gosden', 'stoute']
  const topJockeys = ['de boinville', 'townend', 'blackmore', 'skelton', 'cobden', 'moore', 'doyle', 'johnson']
  const isTopConnections = topTrainers.some((t) => trainer.includes(t)) || topJockeys.some((j) => jockey.includes(j))

  if (isTopConnections && trainerRtf >= 25) {
    potential += 8
    flags.push('HOT STABLE')
  } else if (trainerRtf >= 20) {
    potential += 5
    flags.push('WARM STABLE')
  }

  if (lastRun > 0) {
    if (lastRun >= 60 && lastRun <= 120) {
      potential += 5
      flags.push('REFRESHED AFTER BREAK')
    } else if (lastRun >= 30 && lastRun <= 60) {
      potential += 3
      flags.push('WELL RESTED')
    }

    if (runCount === 2 && lastRun >= 30 && lastRun <= 90) {
      potential += 12
      flags.push('2ND RUN AFTER LAYOFF')
    }
  }

  const lastOR = Number(runner.last_or || runner.previous_or || runner.last_rating || 0)
  if (lastOR > 0 && or > 0 && or < lastOR) {
    const drop = lastOR - or
    if (drop >= 5 && drop <= 15) {
      potential += 10
      flags.push('DROPPED IN CLASS')
    } else if (drop > 15) {
      potential += 8
      flags.push('HEAVY CLASS DROP')
    }
  }

  if (distProfile?.lastDistance > 0 && distanceF > 0) {
    const change = distanceF - distProfile.lastDistance
    if (change >= 2 && change <= 5) {
      potential += 10
      flags.push('STEP UP IN TRIP')
    }
  }

  if (positions.length >= 3) {
    const lastPos = positions[0]
    const prevPositions = positions.slice(1, 4)
    const avgPrev = prevPositions.reduce((a, b) => a + b, 0) / prevPositions.length
    if (lastPos >= 6 && avgPrev <= 3) {
      potential += 12
      flags.push('HIDDEN SPEED FIGURE')
    }
  }

  const odds = Number(runner.odds || runner.price || 0)
  if (odds > 0 && odds >= 8 && potential >= 30) {
    potential += 10
    flags.push('MARKET UNDERESTIMATING')
  } else if (odds > 0 && odds >= 5 && potential >= 25) {
    potential += 5
    flags.push('VALUE POTENTIAL')
  }

  potential = Math.max(0, Math.min(100, potential))

  let label = 'NO IMPROVEMENT EXPECTED'
  if (potential >= 60) label = 'STRONG IMPROVER'
  else if (potential >= 45) label = 'LIKELY IMPROVER'
  else if (potential >= 30) label = 'POSSIBLE IMPROVER'
  else if (potential >= 15) label = 'SLIGHT IMPROVER'

  return {
    score: potential,
    label,
    flags,
    factors: {
      exposure: runCount <= 2 ? 'LOW' : runCount <= 3 ? 'LIGHT' : 'EXPOSED',
      formTrend: positions.length >= 3 ? (positions[0] < positions[positions.length - 1] ? 'IMPROVING' : 'DECLINING') : 'UNKNOWN',
      ageCurve: age <= 3 ? 'YOUNG' : age <= 6 ? 'PRIME' : 'MATURE',
      stableForm: trainerRtf >= 25 ? 'HOT' : trainerRtf >= 15 ? 'WARM' : 'COLD',
      tripChange: distProfile?.lastDistance > 0 && distanceF > 0 ? Math.round((distanceF - distProfile.lastDistance) * 10) / 10 : 'UNKNOWN',
      replayNotes: positiveTagCount > 0 || replayAdj > 0 ? 'POSITIVE' : 'NEUTRAL',
    },
  }
}
