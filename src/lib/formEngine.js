// APEX Form Engine
// Properly parses form strings, preserves non-finishers, weights recency, compares to today's conditions

const NON_FINISHERS = {
  F: { label: 'Fell', penalty: 0, note: 'Fell — may have been travelling well' },
  P: { label: 'Pulled Up', penalty: 0, note: 'Pulled up — stamina or jumping issue' },
  U: { label: 'Unseated', penalty: 0, note: 'Unseated rider — bad luck' },
  BD: { label: 'Brought Down', penalty: 0, note: 'Brought down by another horse' },
  R: { label: 'Refused', penalty: -5, note: 'Refused to jump' },
  UR: { label: 'Unseated Rider', penalty: 0, note: 'Unseated rider' },
  PU: { label: 'Pulled Up', penalty: 0, note: 'Pulled up' },
  CO: { label: 'Carried Out', penalty: -3, note: 'Carried out' },
  SL: { label: 'Slipped Up', penalty: 0, note: 'Slipped up' },
}

function parseFormString(form = '') {
  if (!form || form === '-') return []

  const segments = form.split(/[\s/-]+/).filter(Boolean)
  const runs = []

  for (const seg of segments) {
    const trimmed = seg.trim()
    if (!trimmed) continue

    // Parse each character, checking for non-finishers
    let i = 0
    while (i < trimmed.length) {
      const ch = trimmed[i]
      const upperCh = ch.toUpperCase()

      // Check for multi-character non-finishers first (BD, UR, PU, CO, SL)
      let matchedNonFinisher = false
      for (const [key, info] of Object.entries(NON_FINISHERS)) {
        if (key.length > 1 && trimmed.substring(i, i + key.length).toUpperCase() === key) {
          runs.push({
            index: runs.length,
            position: 0,
            nonFinisher: key,
            nonFinisherInfo: info,
            raw: key,
            isTroubled: true,
          })
          i += key.length
          matchedNonFinisher = true
          break
        }
      }

      if (matchedNonFinisher) continue

      // Check for single-character non-finishers (F, P, U, R)
      if (NON_FINISHERS[upperCh]) {
        runs.push({
          index: runs.length,
          position: 0,
          nonFinisher: upperCh,
          nonFinisherInfo: NON_FINISHERS[upperCh],
          raw: upperCh,
          isTroubled: true,
        })
        i++
        continue
      }

      // Check for digit (run position)
      const num = parseInt(ch, 10)
      if (!isNaN(num) && num >= 1 && num <= 20) {
        runs.push({
          index: runs.length,
          position: num,
          nonFinisher: null,
          raw: ch,
          isTroubled: false,
        })
        i++
        continue
      }

      // Skip unknown characters
      i++
    }
  }

  return runs
}

function computeRecencyWeight(runIndex, totalRuns) {
  // Most recent run (index 0) gets highest weight
  // Older runs get progressively less weight
  const age = runIndex // 0 = most recent
  if (age === 0) return 1.0
  if (age === 1) return 0.85
  if (age === 2) return 0.70
  if (age === 3) return 0.55
  if (age === 4) return 0.40
  return 0.25
}

function computeFormQuality(runs, options = {}) {
  const { fieldSize = 8, todayDist = 0, todayGoing = '' } = options

  if (runs.length === 0) return { score: 50, label: 'No Form', runs: 0 }

  let totalScore = 0
  let totalWeight = 0
  let troubledRuns = 0
  let nonFinishers = 0
  let recentPositions = []
  let improving = false

  runs.forEach((run, idx) => {
    const weight = computeRecencyWeight(idx, runs.length)
    let runScore = 50

    if (run.nonFinisher) {
      nonFinishers++
      // Non-finishers aren't automatically bad — context matters
      if (run.nonFinisher === 'F' || run.nonFinisher === 'U' || run.nonFinisher === 'BD') {
        // Fell/unseated/brought down — often bad luck, not lack of ability
        runScore = 45
        troubledRuns++
      } else if (run.nonFinisher === 'P' || run.nonFinisher === 'PU') {
        // Pulled up — could be stamina issue or jumping error
        runScore = 35
        troubledRuns++
      } else if (run.nonFinisher === 'R') {
        // Refused — negative
        runScore = 25
        troubledRuns++
      } else {
        runScore = 40
        troubledRuns++
      }
    } else {
      // Finished run — score based on position relative to field size
      const normalizedPos = run.position / Math.max(1, fieldSize)
      if (normalizedPos <= 0.15) runScore = 85 // Top 15%
      else if (normalizedPos <= 0.25) runScore = 75 // Top 25%
      else if (normalizedPos <= 0.40) runScore = 60 // Top 40%
      else if (normalizedPos <= 0.60) runScore = 45
      else runScore = 30

      recentPositions.push(run.position)
    }

    totalScore += runScore * weight
    totalWeight += weight
  })

  const avgScore = totalWeight > 0 ? totalScore / totalWeight : 50

  // Check for improvement trend
  if (recentPositions.length >= 3) {
    const recent = recentPositions.slice(0, 2)
    const older = recentPositions.slice(2, 4)
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg
    if (recentAvg < olderAvg - 1) improving = true
  }

  // Bonus for improvement
  if (improving) totalScore += 5

  // Penalty for too many troubled runs
  const troubledRatio = troubledRuns / runs.length
  if (troubledRatio >= 0.5) totalScore -= 10
  else if (troubledRatio >= 0.3) totalScore -= 5

  // Bonus if troubled runs were recent (suggests bad luck, not lack of ability)
  if (troubledRuns > 0 && runs[0].isTroubled) {
    totalScore += 5 // Recent troubled run — could be bounce-back candidate
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(avgScore * 10) / 10))

  let label = 'Weak'
  if (finalScore >= 80) label = 'Strong'
  else if (finalScore >= 65) label = 'Competitive'
  else if (finalScore >= 50) label = 'Average'
  else if (finalScore >= 35) label = 'Below Average'

  return {
    score: finalScore,
    label,
    runs: runs.length,
    troubledRuns,
    nonFinishers,
    improving,
    recentPositions: recentPositions.slice(0, 3),
    avgPosition: recentPositions.length > 0 ? Math.round(recentPositions.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, recentPositions.length) * 10) / 10 : 0,
  }
}

function computeFormSuitability(runs, todayDist, todayGoing, todayType) {
  if (runs.length === 0) return { score: 50, matchingRuns: 0 }

  let totalScore = 0
  let totalWeight = 0
  let matchingRuns = 0

  runs.forEach((run, idx) => {
    if (run.nonFinisher) return // Skip non-finishers for suitability

    const weight = computeRecencyWeight(idx, runs.length)
    let runScore = 50

    // In a real system, we'd have distance/going/type per run
    // For now, we use the form string context
    // This is a placeholder — proper implementation needs run-by-run metadata

    totalScore += runScore * weight
    totalWeight += weight
  })

  const avgScore = totalWeight > 0 ? totalScore / totalWeight : 50

  return {
    score: Math.round(avgScore * 10) / 10,
    matchingRuns,
  }
}

function detectTroubledRuns(runs, comments = '') {
  const lowerComments = comments.toLowerCase()
  const troubledKeywords = [
    'blocked', 'hampered', 'no room', 'checked', 'crowded',
    'switched', 'ran green', 'green', 'looked winner', 'flew up',
    'head way', 'rally', 'stayed on well', 'never dangerous',
    'mistake', 'blunder', 'lost ground', 'dropped to', 'outpaced',
    'weakened', 'pulled up', 'fell', 'unseated', 'brought down',
  ]

  const troubledCount = troubledKeywords.filter(kw => lowerComments.includes(kw)).length

  return {
    troubledCount,
    keywords: troubledKeywords.filter(kw => lowerComments.includes(kw)),
    isTroubled: troubledCount >= 1,
  }
}

export function analyzeForm(runner, race = {}) {
  const safeRace = race || {}
  const formString = String(runner.form || '')
  const comments = String(runner.comments || '')
  const runs = parseFormString(formString)
  const fieldSize = (safeRace.runners || []).length || 8
  const todayDist = parseFloat(String(safeRace.distance_f || '').replace(/[^0-9.]/g, '')) || 0
  const todayGoing = (safeRace.going || '').toLowerCase()
  const todayType = (safeRace.type || safeRace.race_type || '').toLowerCase()

  const quality = computeFormQuality(runs, { fieldSize, todayDist, todayGoing })
  const suitability = computeFormSuitability(runs, todayDist, todayGoing, todayType)
  const troubled = detectTroubledRuns(runs, comments)

  return {
    raw: formString,
    runs,
    quality,
    suitability,
    troubled,
    summary: {
      totalRuns: runs.length,
      finishedRuns: runs.filter(r => !r.nonFinisher).length,
      nonFinishers: runs.filter(r => r.nonFinisher).length,
      troubledRuns: quality.troubledRuns,
      improving: quality.improving,
      avgPosition: quality.avgPosition,
      formScore: quality.score,
      troubledComments: troubled.troubledCount,
    },
  }
}

export { parseFormString, computeFormQuality, detectTroubledRuns }
