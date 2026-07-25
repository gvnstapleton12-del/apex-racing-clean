const MIN_YEAR = 2021

function parseDistF(dist) {
  if (!dist) return 0
  const s = String(dist).toLowerCase()
  if (s.includes('m') && !s.includes('f')) {
    const miles = parseFloat(s) || 0
    return Math.round(miles * 8)
  }
  const f = parseFloat(s.replace(/[^0-9.]/g, '')) || 0
  if (s.includes('m')) return Math.round(f * 8)
  return f
}

function normaliseCourse(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function lookupProfileCourse(profileCourseMap, raceCourse) {
  if (!profileCourseMap || !raceCourse) return null
  const bare = normaliseCourse(raceCourse)
  // Try bare key first (e.g. "carlisle")
  if (profileCourseMap[bare]) return profileCourseMap[bare]
  // Try gb/ prefix (e.g. "gb / carlisle")
  const gbKey = `gb / ${bare}`
  if (profileCourseMap[gbKey]) return profileCourseMap[gbKey]
  // Try ire/ prefix
  const ireKey = `ire / ${bare}`
  if (profileCourseMap[ireKey]) return profileCourseMap[ireKey]
  return null
}

function lookupProfileCD(profileCDMap, raceCourse, distKey) {
  if (!profileCDMap || !raceCourse || !distKey) return null
  const bare = normaliseCourse(raceCourse)
  const candidates = [bare, `gb / ${bare}`, `ire / ${bare}`]
  for (const prefix of candidates) {
    const key = `${prefix}|${distKey}`
    if (profileCDMap[key]) return profileCDMap[key]
  }
  return null
}

function normaliseGoing(g) {
  const s = (g || '').toLowerCase().trim()
  if (s.includes('heavy')) return 'heavy'
  if (s.includes('soft')) return 'soft'
  if (s.includes('good to soft') || s.includes('g/s') || s.includes('gs')) return 'good-to-soft'
  if (s.includes('good to firm') || s.includes('g/f') || s.includes('gf')) return 'good-to-firm'
  if (s.includes('good')) return 'good'
  if (s.includes('firm')) return 'firm'
  return 'good'
}

function isWin(pos) {
  return pos === 1
}

function isPlaced(pos, fieldSize) {
  if (pos <= 0) return false
  if (fieldSize >= 8) return pos <= 3
  if (fieldSize >= 5) return pos <= 2
  return pos <= 1
}

/**
 * Win Pattern Matrix — detects 3 historical winning patterns
 * and returns a score modifier for the 12-term sum.
 *
 * Patterns:
 *   1. Condition Sweet Spot — course, distance, C+D wins
 *   2. Handicap Ceiling — OR/weight envelope from past wins
 *   3. Tactical Environment — running style vs pace shape
 *
 * @param {Object} runner          — runner object with previous_results
 * @param {Object} race            — today's race context
 * @param {Object} paceMap         — generated pace map
 * @param {Object} raceShape       — detected race shape
 * @param {string} runningStyle    — classified running style
 * @param {Object} horseProfile    — career/course/distance stats from horseProfileDb
 * @returns {{ adjustment: number, patterns: Object }}
 */
export function identifyWinPatterns(runner, race, paceMap, raceShape, runningStyle, horseProfile) {
  const prev = Array.isArray(runner.previous_results) ? runner.previous_results : []

  const parsed = prev
    .filter(r => {
      if (!r) return false
      const year = r.date ? new Date(r.date).getFullYear() : 0
      if (year < MIN_YEAR) return false
      const pos = parseInt(r.position)
      return !isNaN(pos) && pos >= 1
    })
    .map(r => ({
      position: parseInt(r.position),
      courseName: r.course_name || '',
      distanceF: parseDistF(r.distance),
      going: r.going || r.going_shortcode || '',
      fieldSize: r.runner_count || 0,
      or: Number(r.bha || r.or || 0) || 0,
      lbs: Number(String(r.lbs || '').replace(/[^0-9.]/g, '')) || 0,
      raceName: r.race_name || '',
    }))

  // If no recent form AND no profile data, nothing to work with
  if (parsed.length === 0 && !horseProfile) {
    return { adjustment: 0, patterns: { conditionSweetSpot: null, handicapCeiling: null, tacticalEnv: null } }
  }

  const todayCourse = normaliseCourse(race.course)
  const todayDist = parseDistF(race.distance_f)
  const todayGoing = normaliseGoing(race.going)
  const todayOr = Number(runner.or || 0) || 0
  const todayLbs = Number(String(runner.lbs || '').replace(/[^0-9.]/g, '')) || 0
  const todayIsHandicap = (race.race_name || '').toLowerCase().includes('handicap') ||
    race.type === 'Handicap' || race.type === 'Hurdle' || race.type === 'Chase'

  // ─── Pattern 1: Condition Sweet Spot ───
  const condPattern = (() => {
    const wins = parsed.filter(r => isWin(r.position))
    const courseRuns = parsed.filter(r => normaliseCourse(r.courseName) === todayCourse)
    const courseWins = wins.filter(r => normaliseCourse(r.courseName) === todayCourse)

    // Distance matching: within 1f tolerance
    const distWins = wins.filter(r => todayDist > 0 && r.distanceF > 0 && Math.abs(r.distanceF - todayDist) <= 1)
    const cdWins = wins.filter(r =>
      normaliseCourse(r.courseName) === todayCourse &&
      todayDist > 0 && r.distanceF > 0 && Math.abs(r.distanceF - todayDist) <= 1
    )

    // Going match: wins on same going type
    const goingWins = wins.filter(r => {
      const rg = normaliseGoing(r.going)
      return rg === todayGoing || (todayGoing === 'good' && (rg === 'good-to-soft' || rg === 'good-to-firm'))
    })

    let adjustment = 0
    let label = ''
    let confidence = 0

    if (cdWins.length > 0) {
      adjustment = 4
      label = `C+D winner (${cdWins.length}x)`
      confidence = Math.min(1.0, 0.5 + cdWins.length * 0.2)
    } else if (courseWins.length > 0) {
      adjustment = 2.5
      label = `Course winner (${courseWins.length}x)`
      confidence = Math.min(0.9, 0.4 + courseWins.length * 0.15)
    } else if (distWins.length > 0) {
      adjustment = 1.5
      label = `Distance winner (${distWins.length}x)`
      confidence = Math.min(0.8, 0.3 + distWins.length * 0.15)
    } else if (courseRuns.length >= 3) {
      // Has run here multiple times but never won — slight negative
      const bestCoursePos = Math.min(...courseRuns.map(r => r.position))
      if (bestCoursePos <= 3) {
        adjustment = 0.5
        label = `Placed at course (${courseRuns.length} runs, best #${bestCoursePos})`
        confidence = 0.4
      } else {
        adjustment = -1
        label = `Course specialist fail (${courseRuns.length} runs, best #${bestCoursePos})`
        confidence = 0.3
      }
    }

    // Going-specific bonus: won on today's going
    if (goingWins.length >= 2 && adjustment < 3) {
      adjustment += 1
      label += label ? ` + going winner (${goingWins.length}x)` : `Going winner (${goingWins.length}x)`
    }

    // Profile enrichment: fills blind spots beyond the 6-result scan
    if (horseProfile && cdWins.length === 0 && courseWins.length === 0 && distWins.length === 0) {
      const profConf = Math.min(0.7, (horseProfile.career?.runs || 0) / ((horseProfile.career?.runs || 0) + 15))

      // Career C+D record
      const distKey = todayDist > 0 ? `${Math.round(todayDist)}f` : null
      const cdRec = horseProfile.courseDistance ? lookupProfileCD(horseProfile.courseDistance, race.course, distKey) : null
      if (cdRec && cdRec.runs >= 1) {
        const cdRate = cdRec.wins / cdRec.runs
        if (cdRate > 0.30) {
          const profAdj = Math.min(3.0, cdRate * 5)
          adjustment += profAdj
          confidence = Math.max(confidence, profConf)
          label += label ? ` + career C+D (${cdRec.wins}/${cdRec.runs})` : `Career C+D (${cdRec.wins}/${cdRec.runs})`
        }
      }

      // Career course record
      const cRec = horseProfile.course ? lookupProfileCourse(horseProfile.course, race.course) : null
      if (cRec && cRec.runs >= 2) {
        const cRate = cRec.wins / cRec.runs
        if (cRate > 0.25) {
          const profAdj = Math.min(1.5, cRate * 4)
          adjustment += profAdj
          confidence = Math.max(confidence, profConf)
          label += label ? ` + career course (${cRec.wins}/${cRec.runs})` : `Career course (${cRec.wins}/${cRec.runs})`
        }
      }

      // Career distance record
      const dRec = horseProfile.distance?.[distKey] || null
      if (dRec && dRec.runs >= 2) {
        const dRate = dRec.wins / dRec.runs
        if (dRate > 0.25) {
          const profAdj = Math.min(1.0, dRate * 3)
          adjustment += profAdj
          confidence = Math.max(confidence, profConf)
          label += label ? ` + career distance (${dRec.wins}/${dRec.runs})` : `Career distance (${dRec.wins}/${dRec.runs})`
        }
      }

      // Cap profile enrichment at +4
      if (adjustment > 4) adjustment = 4
    }

    return { adjustment, label, confidence, cdWins: cdWins.length, courseWins: courseWins.length, distWins: distWins.length, goingWins: goingWins.length }
  })()

  // ─── Pattern 2: Handicap Ceiling ───
  const ceilPattern = (() => {
    const wins = parsed.filter(r => isWin(r.position))
    if (wins.length === 0) {
      return { adjustment: 0, label: 'No wins in history', confidence: 0.2 }
    }

    const winOrs = wins.filter(r => r.or > 0).map(r => r.or)
    const winLbs = wins.filter(r => r.lbs > 0).map(r => r.lbs)
    const maxWinOr = winOrs.length > 0 ? Math.max(...winOrs) : 0
    const maxWinLbs = winLbs.length > 0 ? Math.max(...winLbs) : 0
    const minWinOr = winOrs.length > 0 ? Math.min(...winOrs) : 0

    let adjustment = 0
    let label = ''

    if (!todayIsHandicap) {
      // Non-handicap: OR ceiling matters less
      if (todayOr > 0 && maxWinOr > 0) {
        if (todayOr <= maxWinOr + 5) {
          adjustment = 1
          label = `OR within range (won off ${maxWinOr})`
        } else {
          adjustment = -0.5
          label = `OR above ceiling (won off max ${maxWinOr})`
        }
      }
      return { adjustment, label, confidence: 0.4, maxWinOr, maxWinLbs }
    }

    // Handicap: full ceiling check
    if (todayOr > 0 && maxWinOr > 0) {
      if (todayOr <= maxWinOr) {
        // Today's OR is within or below winning range — sweet spot
        adjustment = 2
        label = `Within winning OR (max ${maxWinOr})`
      } else if (todayOr <= maxWinOr + 5) {
        // Slightly above winning mark
        adjustment = 0.5
        label = `Slightly above winning OR (max ${maxWinOr})`
      } else {
        // Well above winning mark
        adjustment = -2
        label = `Above handicap ceiling (OR ${todayOr} vs max ${maxWinOr})`
      }
    }

    if (todayLbs > 0 && maxWinLbs > 0) {
      if (todayLbs <= maxWinLbs) {
        adjustment += 1
        label += label ? ' + within winning weight' : `Within winning weight (max ${maxWinLbs}lb)`
      } else if (todayLbs > maxWinLbs + 7) {
        adjustment -= 1
        label += label ? ' + above winning weight' : `Above winning weight`
      }
    }

    // Trend: rising OR without wins = handicapper ahead
    if (winOrs.length >= 2) {
      const recentWins = wins.slice(0, 3)
      const recentOrs = recentWins.filter(r => r.or > 0).map(r => r.or)
      if (recentOrs.length >= 2) {
        const trend = recentOrs[0] - recentOrs[recentOrs.length - 1]
        if (trend < -5) {
          adjustment -= 1
          label += label ? ' + OR declining' : 'OR declining trend'
        }
      }
    }

    return { adjustment, label, confidence: 0.5, maxWinOr, maxWinLbs }
  })()

  // ─── Pattern 3: Tactical Environment ───
  const tactPattern = (() => {
    const style = runningStyle || 'Midfield'
    const shape = raceShape?.shape || raceShape?.label || 'Unknown'
    const tempo = paceMap?.projectedTempo || 'Moderate'

    let adjustment = 0
    let label = ''

    const isFrontRunner = style === 'Front Runner'
    const isHoldUp = style === 'Hold Up'
    const isProminent = style === 'Prominent'

    const paceStrong = tempo === 'FAST' || shape === 'STRONG PACE' || shape === 'PACE COLLAPSE'
    const paceWeak = tempo === 'SLOW' || shape === 'LONE LEADER' || shape === 'NO CLEAR LEADER'

    // Check win rate by running style in historical results
    const styleWins = parsed.filter(r => isWin(r.position))
    let styleWinCount = 0
    let styleTotalCount = 0

    // Use historical positions + field size to infer running style tendencies
    // Horses that win from off the pace in strongly-run races are closers
    // Horses that win from the front in weakly-run races are front-runners
    for (const r of parsed) {
      const fd = (r.finishDistance || '').toLowerCase()
      const isCloseWin = isWin(r.position) && (fd.includes('nk') || fd.includes('shd') || fd.includes('hd') || fd.includes('nse') || (!fd && r.position === 1))
      if (isCloseWin) {
        styleWinCount++
      }
      styleTotalCount++
    }

    // Tactical match: front-runner in weak pace = bonus, in strong pace = penalty
    if (isFrontRunner) {
      if (paceWeak) {
        adjustment = 2.5
        label = 'Front runner + weak pace = lone speed'
      } else if (paceStrong) {
        adjustment = -1.5
        label = 'Front runner + strong pace = pressured'
      } else {
        adjustment = 0.5
        label = 'Front runner, moderate pace'
      }
    } else if (isHoldUp) {
      if (paceStrong) {
        adjustment = 2
        label = 'Closer + strong pace = collapse scenario'
      } else if (paceWeak) {
        adjustment = -1
        label = 'Closer + weak pace = too far back'
      } else {
        adjustment = 0.5
        label = 'Hold up, moderate pace'
      }
    } else if (isProminent) {
      // Prominent trackers are pace-flexible
      adjustment = 0.5
      label = `Prominent tracker, ${tempo.toLowerCase()} pace`
    } else {
      adjustment = 0
      label = `${style}, neutral pace match`
    }

    // Field size modifier: front-runners benefit more in small fields
    const fieldSize = Number(race.field_size || 0) || 0
    if (isFrontRunner && fieldSize > 0 && fieldSize <= 6) {
      adjustment += 1
      label += ' + small field bonus'
    }

    return { adjustment, label, confidence: 0.35, style, shape, tempo }
  })()

  // ─── Composite Adjustment ───
  // Weight by confidence to avoid over-counting low-confidence patterns
  const totalConfidence = condPattern.confidence + ceilPattern.confidence + tactPattern.confidence
  const weightedAdjustment = totalConfidence > 0
    ? (condPattern.adjustment * condPattern.confidence +
       ceilPattern.adjustment * ceilPattern.confidence +
       tactPattern.adjustment * tactPattern.confidence) / totalConfidence
    : 0

  // Clamp to ±6 to keep it a modifier, not a dominant signal
  const adjustment = Math.round(Math.max(-6, Math.min(6, weightedAdjustment)) * 10) / 10

  return {
    adjustment,
    patterns: {
      conditionSweetSpot: condPattern,
      handicapCeiling: ceilPattern,
      tacticalEnv: tactPattern,
    },
  }
}
