import { readFileSync, writeFileSync } from 'fs'

const historical = JSON.parse(readFileSync('data/historical.json', 'utf8'))
const learning = JSON.parse(readFileSync('data/learning.json', 'utf8'))

// Build result map from learning DB
const resultMap = {}
for (const race of (learning.races || [])) {
  if (!race.runners) continue
  for (const r of race.runners) {
    const key = `${race.course}|${race.off_time}|${race.date}|${(r.horse || '').toLowerCase()}`
    resultMap[key] = r.position
  }
}

// Convert historical records to predictions format
const predictions = {}
let seeded = 0
let matched = 0

for (const rec of historical.records) {
  const raceKey = `${rec.course}-${rec.off_time}-${rec.date}`
  if (!predictions[raceKey]) predictions[raceKey] = []

  predictions[raceKey].push({
    date: rec.date,
    race: `${rec.course} ${rec.off_time}`,
    course: rec.course,
    offTime: rec.off_time,
    horse: rec.horse,
    trainer: rec.trainer || '',
    odds: rec.odds || 0,
    confidence: rec.finalScore,
    estimatedWinProbability: rec.winProb || 0,
    predictedWinProb: rec.winProb || 0,
    predictedPlaceProb: rec.placeProb || 0,
    impliedProbability: rec.valueEdge != null && rec.odds ? 1 / rec.odds : 0,
    valueEdge: rec.valueEdge || 0,
    completeness: 1,
    grade: rec.grade || '',
    betQuality: rec.betQuality || '',
    personalAffinity: null,
    going: rec.going || '',
    breakdown: null,
    timestamp: rec.timestamp,
  })
  seeded++

  const key = `${rec.course}|${rec.off_time}|${rec.date}|${(rec.horse || '').toLowerCase()}`
  if (resultMap[key] !== undefined) matched++
}

writeFileSync('data/predictions.json', JSON.stringify(predictions, null, 2))
console.log(`Seeded ${seeded} predictions from ${Object.keys(predictions).length} races`)
console.log(`Matched ${matched} against learning DB results`)
