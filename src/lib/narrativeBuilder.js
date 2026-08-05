// Narrative Builder
// Auto-generates commentary FROM engine signals
// No handcrafted comments — purely derived from data

export function buildNarrative(signals, scores, runner, race) {
  const positives = []
  const negatives = []
  const summaryParts = []

  // --- FORM ANALYSIS ---
  const form = signals.formEngine?.formPositions || []
  if (form.length >= 3) {
    const recent = form.slice(0, 3)
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length
    const older = form.slice(3)
    const avgOlder = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : avgRecent

    if (avgRecent < avgOlder - 1) {
      positives.push('Improving form trajectory')
    }
    if (form[0] === 1) {
      positives.push('Last-start winner')
    }
    if (form.filter(p => p <= 3).length >= 2) {
      positives.push('Multiple recent placings')
    }
    if (form.filter(p => p >= 8).length >= 2) {
      negatives.push('Recent poor finishes')
    }
  }

  // --- PACE ANALYSIS ---
  const pace = signals.paceEngine
  if (pace) {
    if (pace.runningStyle === 'Front Runner' && pace.pacePressure < 0.4) {
      positives.push('Clear pace scenario suits front-running style')
    }
    if (pace.runningStyle === 'Hold Up' && pace.pacePressure > 0.7) {
      positives.push('Expected fast pace suits hold-up style')
    }
    if (pace.pacePressure > 0.8) {
      negatives.push('Extreme pace pressure increases volatility')
    }
  }

  // --- COMPONENT SCORES ---
  const comps = signals.componentScores || {}
  if (comps.pace >= 70) positives.push('Strong pace compatibility')
  if (comps.pace <= 35) negatives.push('Poor pace compatibility')
  if (comps.ground >= 70) positives.push('Proven on today\'s going')
  if (comps.ground <= 35) negatives.push('Unproven on today\'s going')
  if (comps.distance >= 70) positives.push('Distance specialist')
  if (comps.distance <= 35) negatives.push('Distance concern')
  if (comps.trainerForm >= 75) positives.push('Trainer in strong form')
  if (comps.trainerForm <= 30) negatives.push('Trainer struggling')
  if (comps.jockeyCourseSR >= 70) positives.push('Jockey/course combination strong')

  // --- HIDDEN IMPROVER ---
  const hidden = signals.hiddenImprover || {}
  if (hidden.classDrop) positives.push('Dropping in class — potential bounce back')
  if (hidden.tripStepUp) positives.push('Stepping up in trip — stamina test suits')
  if (hidden.secondRunAfterLayoff) positives.push('Second run after layoff — fitness improving')
  if (hidden.trainerHiddenUpside) positives.push('Trainer pattern suggests hidden upside')

  // --- STABLE INTENT ---
  const stable = signals.stableIntent || {}
  if (stable.equipmentChange) {
    if (stable.equipmentChange.includes('first time')) {
      positives.push(`First-time ${stable.equipmentChange} — trainer intent`)
    } else {
      positives.push(`Equipment change: ${stable.equipmentChange}`)
    }
  }

  // --- FINISHING STRENGTH ---
  const finish = signals.finishingStrength || {}
  if (finish.stayedOn) positives.push('Strong staying profile')
  if (finish.weakened) negatives.push('Tendency to weaken late')
  if (finish.staminaBias > 0.6) positives.push('Stamina bias favours this runner')

  // --- MARKET SIGNALS ---
  const market = scores.marketAdjustment || 0
  if (market > 3) positives.push('Market support — price shortening')
  if (market < -3) negatives.push('Market drift — price lengthening')

  // --- VOLATILITY ---
  const vol = scores.volatilityAdjustment || 1
  if (vol < 0.7) negatives.push('High volatility race — unpredictable outcome')
  if (vol > 1.1) positives.push('Low volatility race — predictable pattern')

  // --- FIELD SIZE ---
  const fieldSize = race.runners?.length || 0
  if (fieldSize <= 5) negatives.push('Small field — limited pace dynamics')
  if (fieldSize >= 16) negatives.push('Large field — increased traffic risk')

  // --- BUILD SUMMARY ---
  if (positives.length >= 3 && negatives.length === 0) {
    summaryParts.push('Strong profile across multiple metrics')
  } else if (positives.length > negatives.length) {
    summaryParts.push(`${positives.length} positive signals vs ${negatives.length} negative`)
  } else if (negatives.length > positives.length) {
    summaryParts.push(`${negatives.length} concerns outweigh ${positives.length} positives`)
  } else {
    summaryParts.push('Mixed signals — no clear edge')
  }

  if (market < -3) summaryParts.push('market weakness reduces confidence')
  if (vol < 0.7) summaryParts.push('race volatility increases uncertainty')

  const summary = summaryParts.join('. ') + '.'

  // --- VERDICT ---
  const finalScore = scores.finalScore || 50
  let verdict = 'NO BET'
  if (finalScore >= 70 && negatives.length === 0) verdict = 'STRONG BET'
  else if (finalScore >= 60 && negatives.length <= 1) verdict = 'BET'
  else if (finalScore >= 50 && positives.length > negatives.length) verdict = 'VALUE'
  else if (finalScore >= 40) verdict = 'PLACE'
  else if (finalScore < 30) verdict = 'AVOID'

  return {
    summary: summary.charAt(0).toUpperCase() + summary.slice(1),
    positives,
    negatives,
    verdict,
  }
}
