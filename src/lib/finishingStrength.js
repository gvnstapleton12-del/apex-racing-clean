// APEX v4 — Finishing Strength Engine
// Detects "stayed on", "travelled well", "rallied", "flew up"
// Critical for jumps racing and stayers

import { analyzeForm } from './formEngine.js'

const FINISHING_KEYWORDS = {
  strong: [
    'stayed on', 'stayed on well', 'finished well', 'rallied', 'flew up',
    'flew home', 'strong finish', 'strongest late', 'late headway',
    'kept on well', 'ran on well', 'finished strongly', 'stayed on strongly',
    'ran on strongly', 'finished best', 'strongest finisher', 'finished well under pressure',
  ],
  efficiency: [
    'travelled well', 'travelling well', 'cruising', 'on bridle', 'going strongly',
    'moving well', 'travelled smoothly', 'travelled comfortably', 'never troubled',
    'in control', 'smooth travel', 'effortless', 'easy pickings',
  ],
  stamina: [
    'stayed on', 'stayed on well', 'strong finish', 'stamina edge', 'strong stayer',
    'stayed on strongly', 'finished well', 'kept on', 'kept on well',
    'ran on', 'ran on well', 'stayed on under pressure', 'finished under pressure',
  ],
  negative: [
    'weakened', 'no extra', 'emptied', 'one paced', 'tired', 'faded',
    'stopped', 'ran out of steam', 'no further impression', 'held on',
    'just held on', 'hanging on', 'struggled', 'laboured',
  ],
}

export function computeFinishingStrength(runner) {
  const comments = (runner.comments || '').toLowerCase()
  const formAnalysis = analyzeForm(runner)
  const positions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)

  let score = 50
  const flags = []

  // Check comments for keywords
  const strongMatches = FINISHING_KEYWORDS.strong.filter(kw => comments.includes(kw))
  const efficiencyMatches = FINISHING_KEYWORDS.efficiency.filter(kw => comments.includes(kw))
  const staminaMatches = FINISHING_KEYWORDS.stamina.filter(kw => comments.includes(kw))
  const negativeMatches = FINISHING_KEYWORDS.negative.filter(kw => comments.includes(kw))

  if (strongMatches.length >= 2) {
    score += 20
    flags.push('STRONG FINISHER')
  } else if (strongMatches.length === 1) {
    score += 12
    flags.push('GOOD FINISHER')
  }

  if (efficiencyMatches.length >= 2) {
    score += 15
    flags.push('EFFICIENT TRAVELLER')
  } else if (efficiencyMatches.length === 1) {
    score += 10
    flags.push('TRAVELLED WELL')
  }

  if (staminaMatches.length >= 2) {
    score += 15
    flags.push('STAMINA EDGE')
  } else if (staminaMatches.length === 1) {
    score += 8
    flags.push('STAYING TYPE')
  }

  if (negativeMatches.length >= 2) {
    score -= 15
    flags.push('WEAK FINISHER')
  } else if (negativeMatches.length === 1) {
    score -= 8
    flags.push('POOR FINISHER')
  }

  // Check form for late improvement
  if (positions.length >= 3) {
    const recent = positions.slice(0, 3)
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length
    const older = positions.slice(3)
    const avgOlder = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : avgRecent

    if (avgRecent < avgOlder - 1.5) {
      score += 10
      flags.push('IMPROVING LATE')
    }

    const lastPos = positions[0]
    const prevPos = positions[1]
    if (lastPos <= 3 && prevPos >= 5) {
      score += 8
      flags.push('LATE IMPROVER')
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    flags,
    strongMatches,
    efficiencyMatches,
    staminaMatches,
    negativeMatches,
  }
}

export function computeStaminaBias(runner, race) {
  const distanceF = parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0
  const going = (race.going || '').toLowerCase()
  const type = (race.type || race.race_type || '').toLowerCase()
  const formAnalysis = analyzeForm(runner, race)
  const positions = formAnalysis.runs.filter(r => !r.nonFinisher).map(r => r.position)

  let score = 50

  // Staying races reward stamina
  if (distanceF >= 14) {
    score += 10
    if (type.includes('hurdle') || type.includes('chase')) {
      score += 10
    }
  }

  // Soft/heavy ground rewards stamina
  if (going.includes('heavy') || going.includes('soft')) {
    score += 8
  }

  // Check form for stamina indicators
  if (positions.length >= 3) {
    const recent = positions.slice(0, 3)
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length
    const older = positions.slice(3)
    const avgOlder = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : avgRecent

    if (avgRecent < avgOlder - 1) {
      score += 10
    }

    const wins = positions.filter(p => p === 1).length
    const winRate = wins / positions.length
    if (winRate >= 0.3 && distanceF >= 12) {
      score += 10
    }
  }

  return Math.max(0, Math.min(100, score))
}
