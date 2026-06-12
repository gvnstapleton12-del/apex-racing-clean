import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'

const CACHE_DIR = './data/backtest-cache'
const LEARNING_PATH = './data/learning.json'
const OUT_PATH = './data/horseProfiles.json'

// ── Load all race results ──
function loadAllRaces() {
  const seen = new Set()
  const races = []

  // 1. Backtest cache files (most recent, take priority)
  if (existsSync(CACHE_DIR)) {
    const files = readdirSync(CACHE_DIR)
      .filter(f => f.startsWith('results-') && f.endsWith('.json'))
      .sort()
    for (const f of files) {
      const data = JSON.parse(readFileSync(`${CACHE_DIR}/${f}`, 'utf8'))
      if (!Array.isArray(data)) continue
      for (const race of data) {
        const id = race.race_id
        if (!id || seen.has(id)) continue
        seen.add(id)
        races.push(race)
      }
    }
  }

  // 2. Learning.json races (fill gaps)
  if (existsSync(LEARNING_PATH)) {
    const learning = JSON.parse(readFileSync(LEARNING_PATH, 'utf8'))
    const learningRaces = learning.races || []
    for (const race of learningRaces) {
      const id = race.race_id
      if (!id || seen.has(id)) continue
      seen.add(id)
      races.push(race)
    }
  }

  return races
}

// ── Build horse profiles ──
function buildHorseProfiles(races) {
  const horses = {}

  function getHorse(name) {
    if (!horses[name]) {
      horses[name] = {
        career: { runs: 0, wins: 0, places: 0 },
        course: {},
        distance: {},
        going: {},
        courseDistance: {},
      }
    }
    return horses[name]
  }

  for (const race of races) {
    const course = race.course || ''
    const distance = race.distance_f || ''
    const going = race.going || ''
    const runners = race.runners || []

    for (const runner of runners) {
      const name = runner.horse
      if (!name) continue

      const pos = Number(runner.position)
      if (isNaN(pos) || pos < 1) continue

      const won = pos === 1
      const placed = pos <= 3

      const horse = getHorse(name)
      horse.career.runs++
      if (won) horse.career.wins++
      if (placed) horse.career.places++

      // Course
      if (course) {
        if (!horse.course[course]) {
          horse.course[course] = { runs: 0, wins: 0, places: 0 }
        }
        horse.course[course].runs++
        if (won) horse.course[course].wins++
        if (placed) horse.course[course].places++
      }

      // Distance
      if (distance) {
        if (!horse.distance[distance]) {
          horse.distance[distance] = { runs: 0, wins: 0, places: 0 }
        }
        horse.distance[distance].runs++
        if (won) horse.distance[distance].wins++
        if (placed) horse.distance[distance].places++
      }

      // Going
      if (going) {
        if (!horse.going[going]) {
          horse.going[going] = { runs: 0, wins: 0, places: 0 }
        }
        horse.going[going].runs++
        if (won) horse.going[going].wins++
        if (placed) horse.going[going].places++
      }

      // Course + Distance
      if (course && distance) {
        const cdKey = `${course}|${distance}`
        if (!horse.courseDistance[cdKey]) {
          horse.courseDistance[cdKey] = { runs: 0, wins: 0, places: 0 }
        }
        horse.courseDistance[cdKey].runs++
        if (won) horse.courseDistance[cdKey].wins++
        if (placed) horse.courseDistance[cdKey].places++
      }
    }
  }

  // ── Enrich with win/place rates and deltas ──
  for (const [name, horse] of Object.entries(horses)) {
    const c = horse.career
    c.winRate = c.runs > 0 ? c.wins / c.runs : 0
    c.placeRate = c.runs > 0 ? c.places / c.runs : 0

    for (const bucket of ['course', 'distance', 'going', 'courseDistance']) {
      for (const [key, stats] of Object.entries(horse[bucket])) {
        stats.winRate = stats.runs > 0 ? stats.wins / stats.runs : 0
        stats.placeRate = stats.runs > 0 ? stats.places / stats.runs : 0
        stats.delta = c.runs > 0 ? stats.winRate - c.winRate : 0
      }
    }
  }

  return horses
}

// ── Main ──
const races = loadAllRaces()
console.log(`Loaded ${races.length} races`)

const profiles = buildHorseProfiles(races)
writeFileSync(OUT_PATH, JSON.stringify(profiles, null, 2))

// Stats
let horseCount = Object.keys(profiles).length
let totalRuns = 0
let horsesWithCourse = 0
let horsesWithCD = 0
for (const h of Object.values(profiles)) {
  totalRuns += h.career.runs
  if (Object.keys(h.course).length > 0) horsesWithCourse++
  if (Object.keys(h.courseDistance).length > 0) horsesWithCD++
}

console.log(`Built ${horseCount} horse profiles`)
console.log(`Total career runs: ${totalRuns}`)
console.log(`Horses with course data: ${horsesWithCourse}`)
console.log(`Horses with course+distance data: ${horsesWithCD}`)
console.log(`Saved to ${OUT_PATH}`)
