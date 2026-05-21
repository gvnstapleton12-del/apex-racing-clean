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

function detectFastFinisher(runner, paceMap) {
  const style = runner.runningStyle || 'Midfield'
  const tags = runner.tags || []
  const score = runner.finalScore || runner.score || 0
  const collapseRisk = paceMap.collapseRisk || 'LOW'
  const tempo = paceMap.projectedTempo || 'EVEN'
  const frontRunners = paceMap.frontRunners || 0

  const isHoldUpOrMidfield = style === 'Hold Up' || style === 'Midfield'
  const paceCollapseExpected = collapseRisk === 'HIGH' || (frontRunners >= 3 && tempo === 'FAST')
  const isStrongFinisher = tags.includes('strong finisher')

  if (isHoldUpOrMidfield && paceCollapseExpected && score >= 50) {
    return { key: 'FAST_FINISHER', label: 'Fast Finisher', severity: 'info' }
  }
  if (isStrongFinisher && paceCollapseExpected) {
    return { key: 'FAST_FINISHER', label: 'Fast Finisher', severity: 'info' }
  }
  if (isHoldUpOrMidfield && isStrongFinisher && score >= 40) {
    return { key: 'FAST_FINISHER', label: 'Fast Finisher', severity: 'info' }
  }
  return null
}

function detectPaceExcuse(runner, paceMap) {
  const style = runner.runningStyle || 'Midfield'
  const collapseRisk = paceMap.collapseRisk || 'LOW'
  const frontRunners = paceMap.frontRunners || 0
  const tempo = paceMap.projectedTempo || 'EVEN'
  const paceCompat = runner.paceCompat || {}

  if (style !== 'Front Runner') return null

  const extremePressure = frontRunners >= 4
  const fastCollapse = frontRunners >= 3 && tempo === 'FAST' && collapseRisk === 'HIGH'
  const compatRisk = paceCompat.collapseRisk === 'HIGH'

  if (extremePressure || fastCollapse || (compatRisk && frontRunners >= 2)) {
    const positions = parseFormPositions(runner.form || '')
    const recentFade = positions.length >= 2 && positions[0] > positions[1]
    if (recentFade || extremePressure) {
      return { key: 'PACE_EXCUSE', label: 'Pace Excuse', severity: 'high' }
    }
  }
  return null
}

function detectTrafficTrouble(runner, runners, paceMap) {
  const score = runner.finalScore || runner.score || 0
  const draw = Number(runner.draw || 0)
  const fieldSize = runners.length
  const tags = runner.tags || []
  const humanTags = runner.human?.tags || []
  const paceCompat = runner.paceCompat || {}
  const simulation = runner.simulation || {}

  const wideDraw = fieldSize > 0 && draw > Math.ceil(fieldSize * 0.75)
  const goodQuality = score >= 60
  const isOnePaced = tags.includes('one-paced')

  if (humanTags.length > 0) {
    const troubleTags = humanTags.filter((t) =>
      /blocked|traffi?c|hampered|no.?room|checked|bumped|tight/i.test(t)
    )
    if (troubleTags.length > 0) {
      return { key: 'TRAFFIC_TROUBLE', label: 'Traffic Trouble', severity: 'medium', detail: troubleTags[0] }
    }
  }

  if (goodQuality && wideDraw && !isOnePaced) {
    return { key: 'TRAFFIC_TROUBLE', label: 'Traffic Trouble', severity: 'medium' }
  }

  if (goodQuality && paceCompat.compatibility < 40 && simulation.avgPosition && simulation.avgPosition > 6) {
    return { key: 'TRAFFIC_TROUBLE', label: 'Traffic Trouble', severity: 'medium' }
  }
  return null
}

function detectMoreToGive(runner) {
  const improver = runner.improver || {}
  const tags = runner.tags || []
  const score = runner.finalScore || runner.score || 0
  const age = Number(runner.age || 0)

  const improverScore = improver.score || 0
  const improverFlags = improver.flags || []
  const isOnePaced = tags.includes('one-paced')
  const isGrinder = tags.includes('grinder')

  if (isOnePaced) return null

  const hasLowExposure = improverFlags.includes('LOW EXPOSURE') || improverFlags.includes('LIGHTLY RACED')
  const hasRecentBounce = improverFlags.includes('RECENT BOUNCE RUN')
  const hasPosReplay = improverFlags.includes('POSITIVE REPLAY NOTES') || improverFlags.includes('REPLAY POSITIVE')
  const isYoung = age > 0 && age <= 4

  if (hasRecentBounce && score >= 50) {
    return { key: 'MORE_TO_GIVE', label: 'More to Give', severity: 'info' }
  }
  if (improverScore >= 40 && (hasLowExposure || isYoung) && score >= 40) {
    return { key: 'MORE_TO_GIVE', label: 'More to Give', severity: 'info' }
  }
  if (hasPosReplay && improverScore >= 30 && isYoung) {
    return { key: 'MORE_TO_GIVE', label: 'More to Give', severity: 'info' }
  }
  if (isGrinder && improverScore >= 45) {
    return { key: 'MORE_TO_GIVE', label: 'More to Give', severity: 'info' }
  }
  return null
}

function detectConditionsExcuse(runner, race, paceMap) {
  const paceCompat = runner.paceCompat || {}
  const flags = runner.scenarioFlags?.flags || []
  const tags = runner.tags || []
  const improver = runner.improver || {}
  const score = runner.finalScore || runner.score || 0

  const conditionsFlags = []

  if (paceCompat.compatibility < 40 && score >= 40) {
    const tempo = paceMap.projectedTempo || 'EVEN'
    const style = runner.runningStyle || 'Midfield'
    const detail = `${style} in ${tempo.toLowerCase()} pace — conditions mismatch`
    conditionsFlags.push({ key: 'CONDITIONS_EXCUSE', label: 'Conditions Excuse', severity: 'medium', detail })
  }

  flags.forEach((f) => {
    if (f.flag === 'Class Trap' && f.severity === 'medium') {
      conditionsFlags.push({ key: 'CONDITIONS_EXCUSE', label: 'Conditions Excuse', severity: 'medium', detail: f.description })
    }
    if (f.flag === 'Bounce Risk') {
      conditionsFlags.push({ key: 'CONDITIONS_EXCUSE', label: 'Conditions Excuse', severity: 'low', detail: f.description })
    }
  })

  const tripChange = improver.factors?.tripChange
  if (tripChange && typeof tripChange === 'number' && Math.abs(tripChange) >= 3 && score >= 40) {
    conditionsFlags.push({ key: 'CONDITIONS_EXCUSE', label: 'Conditions Excuse', severity: 'medium', detail: `Significant trip change: ${tripChange > 0 ? '+' : ''}${tripChange}f` })
  }

  return conditionsFlags.length > 0 ? conditionsFlags[0] : null
}

export function computeReplayFlags(runner, race, context) {
  const { paceMap, runners } = context
  const flags = []

  const fastFinisher = detectFastFinisher(runner, paceMap)
  if (fastFinisher) flags.push(fastFinisher)

  const paceExcuse = detectPaceExcuse(runner, paceMap)
  if (paceExcuse) flags.push(paceExcuse)

  const trafficTrouble = detectTrafficTrouble(runner, runners, paceMap)
  if (trafficTrouble) flags.push(trafficTrouble)

  const moreToGive = detectMoreToGive(runner)
  if (moreToGive) flags.push(moreToGive)

  const conditionsExcuse = detectConditionsExcuse(runner, race, paceMap)
  if (conditionsExcuse) flags.push(conditionsExcuse)

  return flags
}
