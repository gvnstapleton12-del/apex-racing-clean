// APEX v4 — Scenario Flags
// Pro-level race pattern detection

function detectPaceCollapse(runners, paceMap) {
  const frontRunners = paceMap?.frontRunners || 0
  const tempo = paceMap?.projectedTempo || 'EVEN'

  if (frontRunners >= 3 && tempo === 'FAST') {
    return {
      flag: 'Pace Collapse Risk',
      severity: 'high',
      description: `${frontRunners} front-runners in fast pace — likely early burnout`,
      action: 'Favor hold-up runners',
    }
  }
  if (frontRunners >= 4) {
    return {
      flag: 'Pace Collapse Risk',
      severity: 'high',
      description: `${frontRunners} front-runners — extreme pace pressure`,
      action: 'Favor hold-up runners',
    }
  }
  return null
}

function detectLoneSpeed(runners, paceMap) {
  const frontRunners = paceMap?.frontRunners || 0

  if (frontRunners === 1) {
    const leader = runners.find((r) => r.runningStyle === 'Front Runner')
    if (leader) {
      return {
        flag: 'Lone Speed',
        severity: 'medium',
        description: `${leader.horse} is the only likely front-runner`,
        action: 'Front-runner has clear run advantage',
      }
    }
  }
  return null
}

function detectBounceRisk(runner) {
  const form = runner.form || ''
  const positions = []
  form.split(/[\s/-]+/).forEach((p) => {
    const num = parseInt(p, 10)
    if (!isNaN(num) && num >= 1 && num <= 20) positions.push(num)
  })

  if (positions.length >= 2 && positions[0] === 1) {
    const lbs = runner.lbs || 0
    if (lbs > 5) {
      return {
        flag: 'Bounce Risk',
        severity: 'medium',
        description: `Won last time out, carrying ${lbs}lb extra`,
        action: 'Watch for regression',
      }
    }
  }

  const lastRun = runner.last_run || 999
  if (lastRun <= 7 && positions.length >= 2 && positions[0] <= 2) {
    return {
      flag: 'Bounce Risk',
      severity: 'low',
      description: 'Quick turnaround after strong effort',
      action: 'May not reproduce form',
    }
  }

  return null
}

function detectClassTrap(runner, race) {
  const or = runner.or || runner.ofr || 0
  const raceClass = race.race_class || race.class || 0

  if (or > 0 && raceClass > 0 && or - raceClass > 20) {
    return {
      flag: 'Class Trap',
      severity: 'medium',
      description: `Strong figures (OR ${or}) in weak race (class ${raceClass})`,
      action: 'Market may overbet — check pace setup',
    }
  }

  if (or > 120 && (race.race_name || '').toLowerCase().includes('claim')) {
    return {
      flag: 'Class Trap',
      severity: 'medium',
      description: 'High-rated horse in claiming race',
      action: 'May be vulnerable to pace pressure',
    }
  }

  return null
}

function detectFalseFavourite(runners, paceMap) {
  const sorted = [...runners].sort((a, b) => {
    const oddsA = Number(a.odds || a.price || 999)
    const oddsB = Number(b.odds || b.price || 999)
    return oddsA - oddsB
  })

  const favourite = sorted[0]
  if (!favourite) return null

  const favOdds = Number(favourite.odds || favourite.price || 0)
  if (favOdds <= 1) return null

  const form = favourite.form || ''
  const positions = []
  form.split(/[\s/-]+/).forEach((p) => {
    const num = parseInt(p, 10)
    if (!isNaN(num) && num >= 1 && num <= 20) positions.push(num)
  })

  let flags = 0
  if (positions.length > 0 && positions[0] > 4) flags++
  if (favourite.runningStyle === 'Front Runner' && paceMap?.frontRunners >= 3) flags++
  if (favourite.last_run > 60) flags++

  if (flags >= 2 && favOdds < 4) {
    return {
      flag: 'False Favourite',
      severity: 'high',
      description: `Market leader ${favourite.horse} at ${favOdds} has structural weaknesses`,
      action: 'Consider opposing or laying',
    }
  }

  return null
}

function detectHiddenImprover(runner) {
  const form = runner.form || ''
  const positions = []
  form.split(/[\s/-]+/).forEach((p) => {
    const num = parseInt(p, 10)
    if (!isNaN(num) && num >= 1 && num <= 20) positions.push(num)
  })

  if (positions.length >= 3) {
    const improving = positions[0] < positions[1] && positions[1] <= positions[2]
    if (improving && positions[0] <= 3) {
      return {
        flag: 'Hidden Improver',
        severity: 'medium',
        description: 'Progressive form profile — improving each run',
        action: 'Market may not have caught up yet',
      }
    }
  }

  const runs = positions.length
  if (runs <= 3 && runner.age <= 4) {
    const or = runner.or || runner.ofr || 0
    if (or > 0) {
      return {
        flag: 'Hidden Improver',
        severity: 'low',
        description: 'Low exposure young horse with rating',
        action: 'Could improve significantly',
      }
    }
  }

  return null
}

export function detectScenarioFlags(runner, runners, race, paceMap) {
  const flags = []

  const paceCollapse = detectPaceCollapse(runners, paceMap)
  if (paceCollapse) flags.push(paceCollapse)

  const loneSpeed = detectLoneSpeed(runners, paceMap)
  if (loneSpeed) flags.push(loneSpeed)

  const bounce = detectBounceRisk(runner)
  if (bounce) flags.push(bounce)

  const classTrap = detectClassTrap(runner, race)
  if (classTrap) flags.push(classTrap)

  const falseFav = detectFalseFavourite(runners, paceMap)
  if (falseFav && (runner.odds === Math.min(...runners.map((r) => Number(r.odds || r.price || 999))))) {
    flags.push(falseFav)
  }

  const improver = detectHiddenImprover(runner)
  if (improver) flags.push(improver)

  return {
    flags,
    hasHighSeverity: flags.some((f) => f.severity === 'high'),
    hasMediumSeverity: flags.some((f) => f.severity === 'medium'),
    flagCount: flags.length,
  }
}
