export function classifyRunningStyle(runner) {
  const form = runner.form || ''
  const odds = parseFloat(runner.odds || 0)

  if (form.includes('1') && odds < 5) {
    return 'Front Runner'
  }

  if (form.includes('2')) {
    return 'Stalker'
  }

  if (form.includes('0')) {
    return 'Closer'
  }

  return 'Midfield'
}

export function generatePaceMap(runners = []) {
  const pace = {
    frontRunners: 0,
    stalkers: 0,
    closers: 0,
    midfield: 0,
    projectedTempo: 'EVEN',
    collapseRisk: 'LOW'
  }

  runners.forEach((runner) => {
    const style = classifyRunningStyle(runner)

    if (style === 'Front Runner') {
      pace.frontRunners += 1
    }

    if (style === 'Stalker') {
      pace.stalkers += 1
    }

    if (style === 'Closer') {
      pace.closers += 1
    }

    if (style === 'Midfield') {
      pace.midfield += 1
    }
  })

  if (pace.frontRunners >= 4) {
    pace.projectedTempo = 'FAST'
    pace.collapseRisk = 'HIGH'
  }

  if (pace.frontRunners <= 1) {
    pace.projectedTempo = 'SLOW'
    pace.collapseRisk = 'LOW'
  }

  return pace
}