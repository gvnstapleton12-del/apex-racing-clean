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

export function classifyHorseTags(runner, race = null) {
  const formString = String(runner.form || '')
  const positions = parseFormPositions(formString)
  const lastRun = Number(runner.last_run || 0)
  const age = Number(runner.age || 0)
  const weight = Number(runner.lbs || runner.weight_lbs || 0)

  const tags = []

  if (positions.length >= 2) {
    const recent = positions.slice(0, 3)
    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
    const winRate = positions.filter((p) => p <= 1.5).length / positions.length
    const top3Rate = positions.filter((p) => p <= 3.5).length / positions.length
    const improved = recent[recent.length - 1] < recent[0]
    const posSpread = positions.length >= 3 ? Math.max(...positions) - Math.min(...positions) : 0
    const lastPos = positions[0]
    const firstInForm = positions[positions.length - 1]

    if (winRate >= 0.3 || (avgPos <= 2.5 && top3Rate >= 0.5)) {
      tags.push('strong finisher')
    }

    if (improved && lastPos <= 3 && avgPos >= 3) {
      tags.push('strong finisher')
    }

    if (avgPos >= 5 && winRate < 0.15) {
      tags.push('one-paced')
    }

    if (posSpread <= 3 && positions.length >= 3 && top3Rate >= 0.3 && top3Rate <= 0.6) {
      tags.push('one-paced')
    }

    if (avgPos >= 4 && avgPos <= 6 && !improved && posSpread <= 4) {
      if (!tags.includes('one-paced')) tags.push('one-paced')
    }
  }

  if (positions.length >= 2) {
    const recent = positions.slice(0, 3)
    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
    const improved = recent[recent.length - 1] < recent[0]
    const lastPos = positions[0]

    if (lastRun <= 21 && avgPos <= 4) {
      tags.push('fast starter')
    }

    if (lastPos <= 2 && !improved) {
      tags.push('fast starter')
    }
  }

  if (positions.length >= 3) {
    const recent = positions.slice(0, 3)
    const avgPos = recent.reduce((a, b) => a + b, 0) / recent.length
    const posSpread = Math.max(...positions) - Math.min(...positions)
    const improved = recent[recent.length - 1] < recent[0]

    if (avgPos >= 3 && posSpread >= 5 && !improved) {
      tags.push('grinder')
    }

    if (lastRun > 60 && positions.filter((p) => p <= 3).length >= 2) {
      tags.push('grinder')
    }
  }

  if (weight > 0) {
    const runners = race?.runners || []
    const avgWeight = runners.map((r) => Number(r.lbs || 0)).filter((w) => w > 0)
      .reduce((a, b) => a + b, 0) / (runners.map((r) => Number(r.lbs || 0)).filter((w) => w > 0).length || 1)
    if (weight - avgWeight >= 7) {
      tags.push('grinder')
    }
  }

  if (tags.length === 0) {
    tags.push('one-paced')
  }

  const unique = [...new Set(tags)]
  return unique.slice(0, 2)
}

export function evaluatePaceCompatibility(runnerTags, paceMap, distanceF) {
  const isFastStarter = runnerTags.includes('fast starter')
  const isGrinder = runnerTags.includes('grinder')
  const isStrongFinisher = runnerTags.includes('strong finisher')
  const isOnePaced = runnerTags.includes('one-paced')

  let compatibility = 50
  let collapseRisk = 'LOW'

  const fr = paceMap.frontRunners || 0
  const tempo = paceMap.projectedTempo || 'EVEN'

  if (isFastStarter) {
    if (fr === 1 && tempo === 'SLOW') compatibility += 20
    else if (fr === 1) compatibility += 10
    else if (fr >= 3) {
      compatibility -= 15
      if (tempo === 'FAST') collapseRisk = 'HIGH'
      else collapseRisk = 'MEDIUM'
    } else if (fr === 2) {
      compatibility -= 5
      collapseRisk = 'MEDIUM'
    }
  }

  if (isGrinder) {
    if (tempo === 'SLOW') compatibility += 10
    else if (tempo === 'FAST') compatibility -= 5
    if (distanceF >= 10) compatibility += 5
  }

  if (isStrongFinisher) {
    if (tempo === 'FAST' && paceMap.collapseRisk === 'HIGH') {
      compatibility += 20
      collapseRisk = 'LOW'
    } else if (tempo === 'FAST') {
      compatibility += 10
    } else if (tempo === 'SLOW') {
      compatibility -= 10
    }
  }

  if (isOnePaced) {
    if (tempo === 'EVEN') compatibility += 5
    else if (tempo === 'FAST' || tempo === 'SLOW') {
      compatibility -= 8
    }
  }

  if (isFastStarter && isStrongFinisher) {
    compatibility += 10
  }

  if (isGrinder && isStrongFinisher) {
    compatibility += 8
  }

  return {
    compatibility: Math.max(10, Math.min(90, Math.round(compatibility))),
    collapseRisk,
    tags: runnerTags,
  }
}
