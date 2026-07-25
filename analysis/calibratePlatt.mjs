#!/usr/bin/env node
// Platt Scaling Calibration Script
// Joins predictions.json (has plattProb, predictedWinProb) with learning.json (outcomes)
// Grid-searches optimal Platt parameters (A, B) that minimize Brier score.
//
// Usage: node analysis/calibratePlatt.mjs

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// --- Load data ---
console.log('Loading predictions.json...')
const predictionsRaw = JSON.parse(readFileSync(join(ROOT, 'data', 'predictions.json'), 'utf8'))
const predictions = []
for (const [raceKey, runners] of Object.entries(predictionsRaw)) {
  for (const r of runners) {
    if (r.plattProb && r.predictedWinProb !== undefined) {
      predictions.push({ ...r, raceKey })
    }
  }
}
console.log(`Predictions with plattProb: ${predictions.length}`)

console.log('Loading learning.json...')
const learningRaw = JSON.parse(readFileSync(join(ROOT, 'data', 'learning.json'), 'utf8'))
const learningMap = new Map()
for (const rec of learningRaw.records) {
  learningMap.set(rec.id, rec)
}
console.log(`Learning records: ${learningMap.size}`)

// --- Join predictions with outcomes ---
const joined = []
for (const pred of predictions) {
  const horse = pred.horse || ''
  const raceKey = pred.raceKey || ''
  const id = `${horse}-${raceKey}`
  const outcome = learningMap.get(id)
  if (outcome && outcome.won !== undefined) {
    joined.push({
      horse,
      raceKey,
      date: pred.date,
      rawProb: pred.predictedWinProb / 100,  // convert from % to 0-1
      currentPlatt: pred.plattProb / 100,            // current Platt output (0-1)
      odds: pred.odds,
      won: outcome.won ? 1 : 0,
      position: outcome.position,
      pa: pred.personalAffinity,
    })
  }
}
console.log(`Joined records with outcomes: ${joined.length}`)

if (joined.length < 50) {
  console.error('ERROR: Not enough joined records for meaningful calibration. Exiting.')
  process.exit(1)
}

// --- Platt transform function ---
function plattTransform(rawProb, A, B) {
  if (rawProb <= 0 || rawProb <= 0.0001) return 0.0001
  if (rawProb >= 0.9999) return 0.9999
  const logit = Math.log(rawProb / (1 - rawProb))
  const calibratedLogit = (A * logit) + B
  return 1 / (1 + Math.exp(-calibratedLogit))
}

// --- Brier Score ---
function brierScore(records, A, B) {
  let sum = 0
  for (const r of records) {
    const calibrated = plattTransform(r.rawProb, A, B)
    const clamped = Math.max(0.001, Math.min(0.999, calibrated))
    sum += Math.pow(clamped - r.won, 2)
  }
  return sum / records.length
}

// --- Log Loss ---
function logLoss(records, A, B) {
  let sum = 0
  for (const r of records) {
    const calibrated = plattTransform(r.rawProb, A, B)
    const clamped = Math.max(0.001, Math.min(0.999, calibrated))
    sum += r.won * Math.log(clamped) + (1 - r.won) * Math.log(1 - clamped)
  }
  return -sum / records.length
}

// --- Grid Search ---
console.log('\n=== Grid Search: Optimal Platt Parameters ===')
console.log('Searching A ∈ [0.3, 2.0] step 0.05, B ∈ [-1.0, 3.0] step 0.1')

let bestBrier = Infinity
let bestA = 1.440
let bestB = 1.321
let bestLogLoss = Infinity

const currentBrier = brierScore(joined, 1.440, 1.321)
const currentLogLoss = logLoss(joined, 1.440, 1.321)
console.log(`\nCurrent (A=1.440, B=1.321): Brier=${currentBrier.toFixed(6)}, LogLoss=${currentLogLoss.toFixed(6)}`)

// Identity (no Platt): A=1, B=0
const identityBrier = brierScore(joined, 1.0, 0.0)
const identityLogLoss = logLoss(joined, 1.0, 0.0)
console.log(`Identity (A=1.000, B=0.000): Brier=${identityBrier.toFixed(6)}, LogLoss=${identityLogLoss.toFixed(6)}`)

const results = []
let checked = 0
for (let A = 0.30; A <= 2.00; A += 0.05) {
  for (let B = -1.0; B <= 3.0; B += 0.10) {
    const brier = brierScore(joined, A, B)
    const ll = logLoss(joined, A, B)
    results.push({ A: Math.round(A * 1000) / 1000, B: Math.round(B * 100) / 100, brier, logLoss: ll })
    if (brier < bestBrier) {
      bestBrier = brier
      bestA = A
      bestB = B
      bestLogLoss = ll
    }
    checked++
  }
}
console.log(`Checked ${checked} parameter combinations.`)

console.log(`\n=== BEST PARAMETERS ===`)
console.log(`A = ${Math.round(bestA * 1000) / 1000}`)
console.log(`B = ${Math.round(bestB * 100) / 100}`)
console.log(`Brier Score: ${bestBrier.toFixed(6)} (current: ${currentBrier.toFixed(6)}, improvement: ${((1 - bestBrier / currentBrier) * 100).toFixed(2)}%)`)
console.log(`Log Loss:    ${bestLogLoss.toFixed(6)} (current: ${currentLogLoss.toFixed(6)}, improvement: ${((1 - bestLogLoss / currentLogLoss) * 100).toFixed(2)}%)`)

// --- Calibration Buckets ---
function calibrationBuckets(records, A, B, numBuckets = 10) {
  const buckets = Array.from({ length: numBuckets }, () => ({ total: 0, won: 0, avgPred: 0 }))
  for (const r of records) {
    const calibrated = plattTransform(r.rawProb, A, B)
    const bucketIdx = Math.min(Math.floor(calibrated * numBuckets), numBuckets - 1)
    buckets[bucketIdx].total++
    buckets[bucketIdx].won += r.won
    buckets[bucketIdx].avgPred += calibrated
  }
  return buckets.map((b, i) => ({
    bucket: `${((i) / numBuckets * 100).toFixed(0)}-${((i + 1) / numBuckets * 100).toFixed(0)}%`,
    count: b.total,
    predicted: b.total > 0 ? (b.avgPred / b.total) : 0,
    actual: b.total > 0 ? (b.won / b.total) : 0,
    gap: b.total > 0 ? Math.abs((b.avgPred / b.total) - (b.won / b.total)) : 0,
  }))
}

console.log('\n=== CALIBRATION BUCKETS (Current) ===')
const currentBuckets = calibrationBuckets(joined, 1.440, 1.321)
console.log('Bucket'.padEnd(12), 'Count'.padEnd(8), 'Pred%'.padEnd(8), 'Actual%'.padEnd(8), 'Gap'.padEnd(8))
for (const b of currentBuckets) {
  if (b.count > 0) {
    console.log(`${b.bucket.padEnd(12)}${String(b.count).padEnd(8)}${(b.predicted * 100).toFixed(1).padEnd(8)}${(b.actual * 100).toFixed(1).padEnd(8)}${(b.gap * 100).toFixed(1).padEnd(8)}`)
  }
}

console.log('\n=== CALIBRATION BUCKETS (Optimal) ===')
const optimalBuckets = calibrationBuckets(joined, bestA, bestB)
console.log('Bucket'.padEnd(12), 'Count'.padEnd(8), 'Pred%'.padEnd(8), 'Actual%'.padEnd(8), 'Gap'.padEnd(8))
for (const b of optimalBuckets) {
  if (b.count > 0) {
    console.log(`${b.bucket.padEnd(12)}${String(b.count).padEnd(8)}${(b.predicted * 100).toFixed(1).padEnd(8)}${(b.actual * 100).toFixed(1).padEnd(8)}${(b.gap * 100).toFixed(1).padEnd(8)}`)
  }
}

// --- Win probability distribution comparison ---
function probDistribution(records, A, B) {
  const bands = { veryLow: 0, low: 0, medium: 0, medHigh: 0, high: 0 }
  for (const r of records) {
    const cal = plattTransform(r.rawProb, A, B)
    if (cal < 0.06) bands.veryLow++
    else if (cal < 0.12) bands.low++
    else if (cal < 0.20) bands.medium++
    else if (cal < 0.30) bands.medHigh++
    else bands.high++
  }
  return bands
}

console.log('\n=== WIN PROBABILITY DISTRIBUTION ===')
const currentDist = probDistribution(joined, 1.440, 1.321)
const optimalDist = probDistribution(joined, bestA, bestB)
const rawDist = probDistribution(joined, 1.0, 0.0)  // identity = raw probs

console.log('Band'.padEnd(12), 'Raw(A=1,B=0)'.padEnd(14), 'Current(1.44,1.32)'.padEnd(20), `Optimal(${Math.round(bestA*1000)/1000},${Math.round(bestB*100)/100})`.padEnd(20))
console.log(`${'Very Low'.padEnd(12)}${String(rawDist.veryLow).padEnd(14)}${String(currentDist.veryLow).padEnd(20)}${String(optimalDist.veryLow).padEnd(20)}`)
console.log(`${'Low'.padEnd(12)}${String(rawDist.low).padEnd(14)}${String(currentDist.low).padEnd(20)}${String(optimalDist.low).padEnd(20)}`)
console.log(`${'Medium'.padEnd(12)}${String(rawDist.medium).padEnd(14)}${String(currentDist.medium).padEnd(20)}${String(optimalDist.medium).padEnd(20)}`)
console.log(`${'Med-High'.padEnd(12)}${String(rawDist.medHigh).padEnd(14)}${String(currentDist.medHigh).padEnd(20)}${String(optimalDist.medHigh).padEnd(20)}`)
console.log(`${'High'.padEnd(12)}${String(rawDist.high).padEnd(14)}${String(currentDist.high).padEnd(20)}${String(optimalDist.high).padEnd(20)}`)

// --- Top 10 best parameter combos ---
results.sort((a, b) => a.brier - b.brier)
console.log('\n=== TOP 10 PARAMETER COMBOS (by Brier) ===')
console.log('A'.padEnd(8), 'B'.padEnd(8), 'Brier'.padEnd(12), 'LogLoss'.padEnd(12), 'BrierΔ vs Current'.padEnd(20))
for (const r of results.slice(0, 10)) {
  const delta = ((1 - r.brier / currentBrier) * 100).toFixed(2)
  console.log(`${String(r.A).padEnd(8)}${String(r.B).padEnd(8)}${r.brier.toFixed(6).padEnd(12)}${r.logLoss.toFixed(6).padEnd(12)}${(delta + '%').padEnd(20)}`)
}

// --- Save results ---
const output = {
  timestamp: new Date().toISOString(),
  recordsUsed: joined.length,
  current: { A: 1.440, B: 1.321, brier: currentBrier, logLoss: currentLogLoss },
  identity: { A: 1.0, B: 0.0, brier: identityBrier, logLoss: identityLogLoss },
  optimal: { A: Math.round(bestA * 1000) / 1000, B: Math.round(bestB * 100) / 100, brier: bestBrier, logLoss: bestLogLoss },
  top10: results.slice(0, 10),
  currentBuckets,
  optimalBuckets,
  distribution: { raw: rawDist, current: currentDist, optimal: optimalDist },
}

writeFileSync(join(ROOT, 'data', 'platt-calibration-results.json'), JSON.stringify(output, null, 2))
console.log(`\nSaved: data/platt-calibration-results.json`)
