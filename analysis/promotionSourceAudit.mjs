import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'

const RESULTS_PATH = './data/backtest-results-current.json'
const CACHE_DIR = './data/backtest-cache'
const PROFILES_PATH = './data/horseProfiles.json'
const OUT_PATH = './analysis/promotion-source-audit.json'

// ── Load ──
const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'))
const profiles = JSON.parse(readFileSync(PROFILES_PATH, 'utf8'))

const cacheFiles = readdirSync(CACHE_DIR)
  .filter(f => f.startsWith('results-') && f.endsWith('.json'))
  .sort()

// ── Build race lookup by raceId ──
const raceLookup = {}
for (const f of cacheFiles) {
  const races = JSON.parse(readFileSync(`${CACHE_DIR}/${f}`, 'utf8'))
  if (!Array.isArray(races)) continue
  for (const race of races) {
    if (race.race_id) raceLookup[race.race_id] = race
  }
}

// ── Build race map from results ──
const raceMap = {}
for (const r of results) {
  const key = `${r.raceId}||${r.date}||${r.course}`
  if (!raceMap[key]) raceMap[key] = []
  raceMap[key].push(r)
}

// ── Identify close misses ──
const closeMisses = []
for (const [key, runners] of Object.entries(raceMap)) {
  if (runners.length < 5) continue
  const sorted = [...runners].sort((a, b) => (b.winProb || 0) - (a.winProb || 0))
  sorted.forEach((r, i) => { r.rank = i + 1 })
  const winner = sorted.find(r => r.won)
  if (!winner || winner.rank === 1) continue
  closeMisses.push({
    raceId: winner.raceId,
    course: winner.course,
    date: winner.date,
    pick: { horse: sorted[0].horse, rank: 1, winProb: sorted[0].winProb },
    winner: { horse: winner.horse, rank: winner.rank, winProb: winner.winProb },
  })
}

console.log(`Found ${closeMisses.length} close misses`)

// ── Analyse promotions ──
function safeRate(profile, bucket, key) {
  const b = profile?.[bucket]?.[key]
  return b ? { runs: b.runs, wins: b.wins, winRate: b.winRate, delta: b.delta } : null
}

function getCareer(profile) {
  return profile?.career ? { runs: profile.career.runs, wins: profile.career.wins, winRate: profile.career.winRate } : null
}

const promotions = []
let noProfile = 0

for (const cm of closeMisses) {
  const race = raceLookup[cm.raceId]
  if (!race) continue

  const course = race.course || ''
  const distance = race.distance_f || ''
  const going = race.going || ''
  const cdKey = `${course}|${distance}`

  const winnerProfile = profiles[cm.winner.horse]
  const pickProfile = profiles[cm.pick.horse]

  if (!winnerProfile) { noProfile++; continue }
  if (!pickProfile) { noProfile++; continue }

  const winnerCareer = getCareer(winnerProfile)
  const pickCareer = getCareer(pickProfile)
  const winnerCourse = safeRate(winnerProfile, 'course', course)
  const pickCourse = safeRate(pickProfile, 'course', course)
  const winnerDistance = safeRate(winnerProfile, 'distance', distance)
  const pickDistance = safeRate(pickProfile, 'distance', distance)
  const winnerGoing = safeRate(winnerProfile, 'going', going)
  const pickGoing = safeRate(pickProfile, 'going', going)
  const winnerCD = safeRate(winnerProfile, 'courseDistance', cdKey)
  const pickCD = safeRate(pickProfile, 'courseDistance', cdKey)

  // Compare deltas
  const courseDelta = (winnerCourse?.delta ?? 0) - (pickCourse?.delta ?? 0)
  const distanceDelta = (winnerDistance?.delta ?? 0) - (pickDistance?.delta ?? 0)
  const goingDelta = (winnerGoing?.delta ?? 0) - (pickGoing?.delta ?? 0)
  const cdDelta = (winnerCD?.delta ?? 0) - (pickCD?.delta ?? 0)
  const careerDelta = (winnerCareer?.winRate ?? 0) - (pickCareer?.winRate ?? 0)

  // Determine which specialist dimension most favoured the winner
  // Positive delta = winner benefits more than pick
  const deltas = [
    { component: 'career', delta: careerDelta },
    { component: 'course', delta: courseDelta },
    { component: 'distance', delta: distanceDelta },
    { component: 'going', delta: goingDelta },
    { component: 'courseDistance', delta: cdDelta },
  ]

  // Find the biggest positive delta contributor for the winner
  const sorted = [...deltas].sort((a, b) => b.delta - a.delta)
  const primaryDriver = sorted[0]

  promotions.push({
    raceId: cm.raceId,
    course,
    winner: cm.winner.horse,
    pick: cm.pick.horse,
    winnerCareer,
    pickCareer,
    specialistDeltas: {
      course: courseDelta,
      distance: distanceDelta,
      going: goingDelta,
      courseDistance: cdDelta,
      career: careerDelta,
    },
    primaryDriver: primaryDriver.delta > 0 ? primaryDriver.component : 'none (pick favoured)',
    raw: {
      winner: {
        career: winnerCareer,
        course: winnerCourse,
        distance: winnerDistance,
        going: winnerGoing,
        cd: winnerCD,
      },
      pick: {
        career: pickCareer,
        course: pickCourse,
        distance: pickDistance,
        going: pickGoing,
        cd: pickCD,
      },
    },
  })
}

console.log(`Analysed ${promotions.length} promotions (${noProfile} skipped, no profile)`)

// ── Aggregate ──
// Count primary drivers
const driverCounts = {}
let winnerBetterCareer = 0
let winnerBetterCourse = 0
let winnerBetterDistance = 0
let winnerBetterGoing = 0
let winnerBetterCD = 0

for (const p of promotions) {
  const d = p.specialistDeltas
  driverCounts[p.primaryDriver] = (driverCounts[p.primaryDriver] || 0) + 1
  if (d.career > 0) winnerBetterCareer++
  if (d.course > 0) winnerBetterCourse++
  if (d.distance > 0) winnerBetterDistance++
  if (d.going > 0) winnerBetterGoing++
  if (d.courseDistance > 0) winnerBetterCD++
}

// Average deltas
const avgDeltas = {}
for (const key of ['career', 'course', 'distance', 'going', 'courseDistance']) {
  const vals = promotions.map(p => p.specialistDeltas[key])
  avgDeltas[key] = {
    avg: vals.reduce((s, v) => s + v, 0) / vals.length,
    median: [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)],
    winnerBetter: key === 'career' ? winnerBetterCareer :
      key === 'course' ? winnerBetterCourse :
      key === 'distance' ? winnerBetterDistance :
      key === 'going' ? winnerBetterGoing :
      winnerBetterCD,
    winnerBetterPct: Math.round((key === 'career' ? winnerBetterCareer :
      key === 'course' ? winnerBetterCourse :
      key === 'distance' ? winnerBetterDistance :
      key === 'going' ? winnerBetterGoing :
      winnerBetterCD) / promotions.length * 100),
  }
}

// ── Output ──
console.log('\n═══════════════════════════════════════════════════════')
console.log('  PROMOTION SOURCE AUDIT')
console.log('═══════════════════════════════════════════════════════\n')

console.log('  Component         Avg Delta  Median    Winner+   %')
console.log('  ───────────────── ───────── ───────── ──────── ────')
for (const [key, stats] of Object.entries(avgDeltas)) {
  const sign = stats.avg >= 0 ? '+' : ''
  console.log(`  ${key.padEnd(16)} ${sign}${stats.avg.toFixed(3).padStart(8)} ${sign}${stats.median.toFixed(3).padStart(7)}  ${String(stats.winnerBetter).padStart(5)}/${String(promotions.length).padStart(3)}  ${stats.winnerBetterPct}%`)
}

console.log('\n  PRIMARY DRIVER COUNTS:')
const sortedDrivers = Object.entries(driverCounts)
  .sort((a, b) => b[1] - a[1])
for (const [driver, count] of sortedDrivers) {
  const pct = Math.round(count / promotions.length * 100)
  console.log(`  ${driver.padEnd(18)} ${String(count).padStart(4)}/${promotions.length} (${pct}%)`)
}

console.log(`\n  Total promotions: ${promotions.length}`)
console.log(`  Skipped (no profile): ${noProfile}`)

// Save
writeFileSync(OUT_PATH, JSON.stringify({
  summary: {
    totalPromotions: promotions.length,
    skippedNoProfile: noProfile,
    driverCounts,
    avgDeltas,
  },
  promotions: promotions.map(p => ({
    raceId: p.raceId,
    course: p.course,
    winner: p.winner,
    pick: p.pick,
    primaryDriver: p.primaryDriver,
    deltas: p.specialistDeltas,
  })),
}, null, 2))

console.log(`\n  Saved to ${OUT_PATH}`)
