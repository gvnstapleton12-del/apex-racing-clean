import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

process.env.APEX_DIAGNOSTIC = '1'

const __dirname = dirname(fileURLToPath(import.meta.url))

const toFileUrl = (p) => new URL(`file:///${p.replace(/\\/g, '/')}`).href
const { runApexEngine } = await import(toFileUrl(join(__dirname, 'src', 'lib', 'apexEngine.js')))
const { normalizeGoingString } = await import(toFileUrl(join(__dirname, 'src', 'lib', 'normalizeGoing.js')))
const { recordAffinityPrediction, verifyAffinityResult } = await import(toFileUrl(join(__dirname, 'src', 'lib', 'personalAffinity.js')))

const PREDICTIONS_PATH = join(__dirname, 'data', 'predictions.json')

console.log('--- Integration Verification Sequence ---')

// Step 1: Pre-race racecard
const mockRaceId = 'test_race_2026_999'
const sampleRacecard = {
  race_id: mockRaceId,
  course: 'Chester',
  going: 'Good to Firm',
  distance_f: '5f',
  distance: '5f',
  race_class: 'Class 2 Handicap',
  off_time: '14:00',
  date: '2026-06-08',
}

const runners = [
  {
    horse: 'APEX WARRIOR',
    or: 95,
    rpr: 106,
    running_style: 'Front Runner',
    draw: 2,
    odds: 3,
    trainer: 'K Burke',
    jockey: 'C Lee',
  },
  {
    horse: 'SLOPPY TRACER',
    or: 92,
    rpr: 90,
    running_style: 'Midfield',
    draw: 9,
    odds: 5,
    trainer: 'R Varian',
    jockey: 'D Egan',
  },
]

console.log('\nStep 1: Simulating Pre-Race Evaluation with Platt Calibration...')
const engineResult = runApexEngine(runners, sampleRacecard, {})
const engineOutput = engineResult.racecards || []

engineOutput.forEach((r, i) => {
  console.log(`  -> ${r.horse} | Bayesian raw: N/A | Calibrated Win Prob: ${r.winProb?.toFixed(1)}%`)
})

// Step 2: Store predictions
const predictionsLog = [{
  race_id: mockRaceId,
  going: sampleRacecard.going,
  runners: engineOutput.map(r => ({ horse: r.horse, winProb: r.winProb })),
}]
writeFileSync(PREDICTIONS_PATH, JSON.stringify(predictionsLog, null, 2))
console.log('\nStep 2: Predictions stored with going:', sampleRacecard.going)

// Step 3: Record affinity predictions pre-race
engineOutput.forEach((r) => {
  recordAffinityPrediction(r.horse, sampleRacecard, {
    runningStyle: r.runningStyle,
    personalAffinity: r.personalAffinity || { factor: 1.0, confidence: 0, breakdown: null },
    winProb: r.winProb || 0,
    finalScore: r.finalScore || 0,
    odds: r.odds || 0,
    rpr: r.rpr || 0,
  })
})

// Step 4: Simulate ATR result delivery (no going field)
const sampleAtrResult = {
  race_id: mockRaceId,
  course_name: 'Chester',
  distance: '5f',
  runners: [
    { horse_name: 'APEX WARRIOR', position: 1, odds: '3/1' },
    { horse_name: 'SLOPPY TRACER', position: 2, odds: '5/1' },
  ],
}

console.log('\nStep 3: Executing Result Reconciliation & Going Backfill...')
const backfilledGoing = normalizeGoingString(sampleRacecard.going)
console.log('  -> Backfilled going:', backfilledGoing)

// Step 5: Verify affinity results
sampleAtrResult.runners.forEach((runner) => {
  const raceKey = `${sampleRacecard.course}|${sampleRacecard.off_time || ''}|${sampleRacecard.date || ''}`
  const result = verifyAffinityResult(runner.horse_name, raceKey, runner.position, '0.5', runner.horse_name === 'APEX WARRIOR' ? 'Front Runner' : 'Midfield')
  console.log(`  -> ${runner.horse_name}: pos=${runner.position}, verified=${result ? 'yes' : 'pending'}`)
})

// Step 6: Read back affinity store
const AFFINITY_PATH = join(__dirname, 'data', 'personalAffinity.json')
if (!existsSync(AFFINITY_PATH)) {
  console.log('\nERROR: personalAffinity.json not found')
  process.exit(1)
}
const finalizedStore = JSON.parse(readFileSync(AFFINITY_PATH, 'utf8'))
console.log('\nStep 4: Database State:')
console.log('  -> Total horses:', Object.keys(finalizedStore.horses || {}).length)
const apexWarrior = finalizedStore.horses?.['apex warrior']
if (apexWarrior) {
  console.log('  -> Apex Warrior courses:', JSON.stringify(apexWarrior.affinityProfiles?.track?.courses || {}))
}

console.log('\n--- Integration Complete ---')
