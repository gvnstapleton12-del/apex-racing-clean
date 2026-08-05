export function evaluatePaceCompatibility(earlyPaceScore, raceShape, distanceF, fieldSize) {
  const score = earlyPaceScore || 50
  const leaders = raceShape?.leaders ?? 0
  const collapseProb = raceShape?.collapseProb ?? 0
  const tempo = raceShape?.tempo || 'EVEN'

  let compatibility = 50
  let collapseRisk = 'LOW'

  if (score >= 72) {
    if (leaders === 1) compatibility = 75
    else if (leaders === 2) compatibility = 60
    else if (leaders >= 3) {
      compatibility = 35
      collapseRisk = leaders >= 4 ? 'HIGH' : 'MEDIUM'
    }
    if (tempo === 'FAST') { compatibility -= 10; collapseRisk = 'HIGH' }
  } else if (score >= 56) {
    if (leaders <= 1) compatibility = 60
    else if (leaders === 2) compatibility = 55
    else { compatibility = 45; collapseRisk = 'MEDIUM' }
    if (tempo === 'FAST') compatibility -= 5
    if (collapseProb >= 50) { compatibility += 5; collapseRisk = 'MEDIUM' }
  } else if (score <= 35) {
    if (collapseProb >= 50) {
      compatibility = 75
      collapseRisk = 'LOW'
    } else if (tempo === 'FAST') {
      compatibility = 65
    } else if (tempo === 'SLOW') {
      compatibility = 30
    }
    if (distanceF >= 10) compatibility += 5
  } else {
    if (tempo === 'EVEN') compatibility = 55
    else if (tempo === 'FAST') compatibility = 55
    else compatibility = 45
  }

  if (fieldSize >= 14 && score >= 72) compatibility -= 5
  if (fieldSize <= 6 && score >= 72) compatibility += 5

  return {
    compatibility: Math.max(10, Math.min(90, Math.round(compatibility))),
    collapseRisk,
    earlyPaceScore: score,
  }
}
