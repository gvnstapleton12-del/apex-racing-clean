// Historical Condition Database
// Stores per-runner historical runs with conditions for cross-referencing

import fs from 'fs'
import path from 'path'

const DB_FILE = path.join(process.cwd(), 'data', 'condition_db.json')

function ensureFile() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ horses: {} }, null, 2))
  }
}

function loadDB() {
  ensureFile()
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
  } catch {
    return { horses: {} }
  }
}

function saveDB(data) {
  const dir = path.dirname(DB_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2))
}

function normalizeGoing(going) {
  if (!going) return 'unknown'
  const g = going.toLowerCase().trim()
  if (g.includes('heavy')) return 'heavy'
  if (g.includes('soft')) return 'soft'
  if (g.includes('good to soft')) return 'good_to_soft'
  if (g.includes('good to firm')) return 'good_to_firm'
  if (g.includes('good')) return 'good'
  if (g.includes('firm')) return 'firm'
  if (g.includes('standard')) return 'standard'
  if (g.includes('slow')) return 'slow'
  return 'unknown'
}

function normalizeDistance(distF) {
  if (!distF || isNaN(distF)) return 'unknown'
  const d = parseFloat(distF)
  if (d <= 5) return 'sprint'        // <= 5f
  if (d <= 7) return 'short_mile'    // 5-7f
  if (d <= 9) return 'mile'          // ~1m
  if (d <= 12) return 'middle'       // 1m-1.5m
  if (d <= 16) return 'long'         // 1.5m-2m
  return 'stayer'                    // > 2m
}

function normalizeClass(raceClass) {
  if (!raceClass) return 'unknown'
  const c = String(raceClass).toLowerCase().replace('class ', '')
  const num = parseInt(c, 10)
  if (num >= 1 && num <= 6) return `class_${num}`
  return 'unknown'
}

export function recordRun(race) {
  const db = loadDB()
  const going = normalizeGoing(race.going)
  const dist = normalizeDistance(race.distanceFurlongs)
  const cls = normalizeClass(race.raceClass)

  for (const runner of race.runners) {
    const horseId = runner.horse?.toLowerCase().replace(/\s+/g, '_')
    if (!horseId) continue

    if (!db.horses[horseId]) {
      db.horses[horseId] = {
        name: runner.horse,
        runs: [],
        wins: [],
        places: [],
        stats: { total: 0, wins: 0, places: 0 },
        conditions: {
          going: {},
          distance: {},
          class: {},
          weight: {},
        },
      }
    }

    const horse = db.horses[horseId]
    const position = runner.position || 0
    const fieldSize = race.runners.length

    const run = {
      date: race.date,
      course: race.course,
      going,
      distance: dist,
      class: cls,
      position,
      fieldSize,
      or: runner.or || 0,
      rpr: runner.rpr || 0,
      weight: runner.weight || '',
      odds: runner.odds || 0,
      comments: runner.comments || '',
    }

    horse.runs.push(run)
    horse.stats.total++

    // Record going performance
    if (!horse.conditions.going[going]) {
      horse.conditions.going[going] = { runs: 0, wins: 0, places: 0, avgPos: 0, positions: [] }
    }
    horse.conditions.going[going].runs++
    horse.conditions.going[going].positions.push(position)

    // Record distance performance
    if (!horse.conditions.distance[dist]) {
      horse.conditions.distance[dist] = { runs: 0, wins: 0, places: 0, avgPos: 0, positions: [] }
    }
    horse.conditions.distance[dist].runs++
    horse.conditions.distance[dist].positions.push(position)

    // Record class performance
    if (!horse.conditions.class[cls]) {
      horse.conditions.class[cls] = { runs: 0, wins: 0, places: 0, avgPos: 0, positions: [] }
    }
    horse.conditions.class[cls].runs++
    horse.conditions.class[cls].positions.push(position)

    // Record weight performance (bucketed)
    const weightBucket = runner.weight ? runner.weight.replace(/\s+/g, '') : 'unknown'
    if (!horse.conditions.weight[weightBucket]) {
      horse.conditions.weight[weightBucket] = { runs: 0, wins: 0, places: 0, avgPos: 0, positions: [] }
    }
    horse.conditions.weight[weightBucket].runs++
    horse.conditions.weight[weightBucket].positions.push(position)

    // Wins and places
    if (position === 1) {
      horse.wins.push(run)
      horse.stats.wins++
      horse.conditions.going[going].wins++
      horse.conditions.distance[dist].wins++
      horse.conditions.class[cls].wins++
      horse.conditions.weight[weightBucket].wins++
    } else if (position >= 2 && position <= 3) {
      horse.places.push(run)
      horse.stats.places++
      horse.conditions.going[going].places++
      horse.conditions.distance[dist].places++
      horse.conditions.class[cls].places++
      horse.conditions.weight[weightBucket].places++
    }
  }

  saveDB(db)
  return db
}

export function getHorseProfile(horseName) {
  const db = loadDB()
  const horseId = horseName.toLowerCase().replace(/\s+/g, '_')
  return db.horses[horseId] || null
}

export function matchConditions(horseName, todayGoing, todayDistF, todayClass, todayWeight) {
  const profile = getHorseProfile(horseName)
  if (!profile || profile.stats.total === 0) {
    return {
      goingMatch: null,
      distanceMatch: null,
      classMatch: null,
      weightMatch: null,
      overallScore: 50,
      hasHistory: false,
      summary: 'No historical data',
    }
  }

  const going = normalizeGoing(todayGoing)
  const dist = normalizeDistance(todayDistF)
  const cls = normalizeClass(todayClass)
  const weightBucket = todayWeight ? todayWeight.replace(/\s+/g, '') : 'unknown'

  const positives = []
  const negatives = []
  let score = 50

  // Going match
  const goingData = profile.conditions.going[going]
  let goingMatch = null
  if (goingData && goingData.runs > 0) {
    const winRate = goingData.wins / goingData.runs
    const placeRate = (goingData.wins + goingData.places) / goingData.runs
    const avgPos = goingData.positions.reduce((a, b) => a + b, 0) / goingData.positions.length
    goingMatch = { runs: goingData.runs, wins: goingData.wins, places: goingData.places, winRate, placeRate, avgPos }
    if (winRate >= 0.3) { score += 15; positives.push(`Strong on ${going.replace(/_/g, ' ')} (${goingData.wins}/${goingData.runs})`) }
    else if (winRate >= 0.15) { score += 8; positives.push(`Proven on ${going.replace(/_/g, ' ')} (${goingData.wins}/${goingData.runs})`) }
    else if (placeRate >= 0.4) { score += 5; positives.push(`Places on ${going.replace(/_/g, ' ')}`) }
    else { score -= 5; negatives.push(`Poor record on ${going.replace(/_/g, ' ')}`) }
  } else {
    negatives.push(`No record on ${going.replace(/_/g, ' ')}`)
  }

  // Distance match
  const distData = profile.conditions.distance[dist]
  let distanceMatch = null
  if (distData && distData.runs > 0) {
    const winRate = distData.wins / distData.runs
    const placeRate = (distData.wins + distData.places) / distData.runs
    const avgPos = distData.positions.reduce((a, b) => a + b, 0) / distData.positions.length
    distanceMatch = { runs: distData.runs, wins: distData.wins, places: distData.places, winRate, placeRate, avgPos }
    if (winRate >= 0.3) { score += 15; positives.push(`Strong at ${dist} (${distData.wins}/${distData.runs})`) }
    else if (winRate >= 0.15) { score += 8; positives.push(`Proven at ${dist} (${distData.wins}/${distData.runs})`) }
    else if (placeRate >= 0.4) { score += 5; positives.push(`Places at ${dist}`) }
    else { score -= 5; negatives.push(`Poor at ${dist}`) }
  } else {
    negatives.push(`No record at ${dist}`)
  }

  // Class match
  const classData = profile.conditions.class[cls]
  let classMatch = null
  if (classData && classData.runs > 0) {
    const winRate = classData.wins / classData.runs
    const placeRate = (classData.wins + classData.places) / classData.runs
    const avgPos = classData.positions.reduce((a, b) => a + b, 0) / classData.positions.length
    classMatch = { runs: classData.runs, wins: classData.wins, places: classData.places, winRate, placeRate, avgPos }
    if (winRate >= 0.3) { score += 10; positives.push(`Strong in ${cls} (${classData.wins}/${classData.runs})`) }
    else if (winRate >= 0.15) { score += 5; positives.push(`Proven in ${cls}`) }
    else { score -= 3; negatives.push(`Struggles in ${cls}`) }
  } else {
    negatives.push(`No record in ${cls}`)
  }

  // Weight match
  const weightData = profile.conditions.weight[weightBucket]
  let weightMatch = null
  if (weightData && weightData.runs > 0) {
    const winRate = weightData.wins / weightData.runs
    const placeRate = (weightData.wins + weightData.places) / weightData.runs
    const avgPos = weightData.positions.reduce((a, b) => a + b, 0) / weightData.positions.length
    weightMatch = { runs: weightData.runs, wins: weightData.wins, places: weightData.places, winRate, placeRate, avgPos }
    if (winRate >= 0.3) { score += 10; positives.push(`Wins at this weight`) }
    else if (placeRate >= 0.4) { score += 5; positives.push(`Places at this weight`) }
    else { score -= 3; negatives.push(`Poor at this weight`) }
  }

  const overallScore = Math.max(0, Math.min(100, score))

  return {
    goingMatch,
    distanceMatch,
    classMatch,
    weightMatch,
    overallScore,
    hasHistory: true,
    summary: positives.length > negatives.length
      ? positives.join('. ')
      : negatives.join('. '),
    positives,
    negatives,
    stats: profile.stats,
  }
}

export function getConditionDBStats() {
  const db = loadDB()
  const horseCount = Object.keys(db.horses).length
  const totalRuns = Object.values(db.horses).reduce((sum, h) => sum + h.stats.total, 0)
  const totalWins = Object.values(db.horses).reduce((sum, h) => sum + h.stats.wins, 0)
  return { horseCount, totalRuns, totalWins }
}
