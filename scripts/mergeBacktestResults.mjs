// Merge two backtest result files into one
// Usage: node scripts/mergeBacktestResults.mjs <file1> <file2> [outputLabel]

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const file1 = process.argv[2]
const file2 = process.argv[3]
const outputLabel = process.argv[4] || 'merged'

if (!file1 || !file2) {
  console.error('Usage: node mergeBacktestResults.mjs <file1> <file2> [outputLabel]')
  process.exit(1)
}

function loadResult(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  // Handle both array format and { predictions: [...] } format
  if (Array.isArray(raw)) return { meta: {}, overall: {}, valuePicks: {}, topPicks: {}, predictions: raw }
  return raw
}

const a = loadResult(file1)
const b = loadResult(file2)

const predsA = a.predictions || []
const predsB = b.predictions || []

// Deduplicate by raceId + horse (prefer file B if duplicate)
const seen = new Map()
for (const p of predsA) {
  const key = `${p.raceId || p.date + p.course}|${p.horse}`
  seen.set(key, p)
}
for (const p of predsB) {
  const key = `${p.raceId || p.date + p.course}|${p.horse}`
  seen.set(key, p)
}

const all = [...seen.values()]
const n = all.length
const winners = all.filter(p => p.won)
const placed = all.filter(p => p.placed)
const valuePicks = all.filter(p => p.isValueSelection)
const valueWinners = valuePicks.filter(p => p.won)

const totalPL = all.reduce((s, p) => s + p.levelPL, 0)
const wr = (winners.length / n * 100).toFixed(1)
const pr = (placed.length / n * 100).toFixed(1)
const roi = (totalPL / n * 100).toFixed(1)

const valueWR = valuePicks.length > 0 ? (valueWinners.length / valuePicks.length * 100).toFixed(1) : '0.0'
const valuePL = valuePicks.reduce((s, p) => s + p.levelPL, 0)
const valueROI = valuePicks.length > 0 ? (valuePL / valuePicks.length * 100).toFixed(1) : '0.0'

const kellyPL = all.reduce((s, p) => s + (p.kellyPct || 0) * p.levelPL, 0)
const kellyROI = (kellyPL / 1000 * 100).toFixed(1)

const brier = all.reduce((s, p) => {
  const predicted = (p.winProb || 0) / 100
  const actual = p.won ? 1 : 0
  return s + (predicted - actual) ** 2
}, 0) / n

// Top pick per race
const raceTopPicks = {}
for (const p of all) {
  if (!raceTopPicks[p.raceId] || (p.winProb || 0) > (raceTopPicks[p.raceId].winProb || 0)) {
    raceTopPicks[p.raceId] = p
  }
}
const topPicks = Object.values(raceTopPicks)
const topPickWR = topPicks.length > 0 ? (topPicks.filter(p => p.won).length / topPicks.length * 100).toFixed(1) : '0.0'

// Date range
const dates = [...new Set(all.map(p => p.date))].sort()
const dateA = a.meta?.fromDate || ''
const dateB = b.meta?.fromDate || ''
const allDates = [...new Set([...(a.predictions || []).map(p => p.date), ...(b.predictions || []).map(p => p.date)])].sort()

console.log(`=== Merged Backtest ===`)
console.log(`Files: ${file1} + ${file2}`)
console.log(`Dates: ${allDates[0]} to ${allDates[allDates.length - 1]} (${allDates.length} days)`)
console.log(`Predictions: ${predsA.length} + ${predsB.length} = ${n} (${n - predsA.length - predsB.length} deduped)`)
console.log(`\nOverall: ${n} selections, ${winners.length}W / ${placed.length}P`)
console.log(`Win Rate: ${wr}% | Place Rate: ${pr}%`)
console.log(`Level P&L: ${totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)} units | ROI: ${roi}%`)
console.log(`\nValue Picks: ${valuePicks.length}, ${valueWinners.length}W`)
console.log(`Value WR: ${valueWR}% | Value ROI: ${valueROI}%`)
console.log(`Kelly P&L: ${kellyPL >= 0 ? '+' : ''}${kellyPL.toFixed(2)} units | Kelly ROI: ${kellyROI}%`)
console.log(`\nBrier Score: ${brier.toFixed(4)}`)
console.log(`Top Pick WR: ${topPickWR}% (${topPicks.filter(p => p.won).length}/${topPicks.length})`)

// Odds bands
const bands = [
  { label: 'Evens or shorter', min: 0, max: 2.0 },
  { label: '2/1 - 3/1', min: 2.0, max: 4.0 },
  { label: '4/1 - 6/1', min: 4.0, max: 7.0 },
  { label: '7/1 - 10/1', min: 7.0, max: 11.0 },
  { label: '11/1 - 20/1', min: 11.0, max: 21.0 },
  { label: '20/1+', min: 21.0, max: 999 },
]
console.log('\nOdds Band Breakdown:')
for (const b of bands) {
  const picks = all.filter(p => p.odds >= b.min && p.odds < b.max)
  if (picks.length === 0) continue
  const w = picks.filter(p => p.won).length
  const pl = picks.reduce((s, p) => s + p.levelPL, 0)
  console.log(`  ${b.label}: ${picks.length} picks, ${w}W (${(w / picks.length * 100).toFixed(1)}% WR), ROI: ${(pl / picks.length * 100).toFixed(1)}%`)
}

// Calibration
const buckets = [
  { label: '0-5%', min: 0, max: 5 },
  { label: '5-10%', min: 5, max: 10 },
  { label: '10-15%', min: 10, max: 15 },
  { label: '15-20%', min: 15, max: 20 },
  { label: '20-30%', min: 20, max: 30 },
  { label: '30-40%', min: 30, max: 40 },
  { label: '40%+', min: 40, max: 100 },
]
console.log('\nCalibration:')
for (const b of buckets) {
  const picks = all.filter(p => p.winProb >= b.min && p.winProb < b.max)
  if (picks.length === 0) continue
  const w = picks.filter(p => p.won).length
  const avgPred = (picks.reduce((s, p) => s + p.winProb, 0) / picks.length).toFixed(1)
  const actualWR = (w / picks.length * 100).toFixed(1)
  const error = (avgPred - actualWR).toFixed(1)
  console.log(`  ${b.label}: n=${picks.length}, avgPred=${avgPred}%, actual=${actualWR}%, error=${error}pp`)
}

const totalRaces = new Set(all.map(p => p.raceId)).size

const output = {
  meta: {
    label: outputLabel,
    fromDate: allDates[0],
    toDate: allDates[allDates.length - 1],
    paGate: a.meta?.paGate || false,
    courseMultiplier: a.meta?.courseMultiplier || null,
    disableGoing: a.meta?.disableGoing || null,
    totalRaces,
    totalSelections: n,
    mergedFrom: [file1, file2],
    timestamp: new Date().toISOString(),
  },
  overall: {
    wins: winners.length,
    placed: placed.length,
    total: n,
    winRate: parseFloat(wr),
    placeRate: parseFloat(pr),
    totalPL: Math.round(totalPL * 100) / 100,
    roi: parseFloat(roi),
    brier: Math.round(brier * 10000) / 10000,
    kellyPL: Math.round(kellyPL * 100) / 100,
    kellyROI: parseFloat(kellyROI),
  },
  valuePicks: {
    total: valuePicks.length,
    wins: valueWinners.length,
    winRate: parseFloat(valueWR),
    totalPL: Math.round(valuePL * 100) / 100,
    roi: parseFloat(valueROI),
  },
  topPicks: {
    total: topPicks.length,
    wins: topPicks.filter(p => p.won).length,
    winRate: parseFloat(topPickWR),
  },
  predictions: all,
}

const outPath = join(ROOT, `data/backtest-results-${outputLabel}.json`)
writeFileSync(outPath, JSON.stringify(output, null, 2))
console.log(`\nOutput: ${outPath}`)
