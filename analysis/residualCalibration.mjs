import { readFileSync } from 'fs'

const data = JSON.parse(readFileSync('data/backtest-results-current.json', 'utf8'))
console.log(`Loaded ${data.length} runner records\n`)

// ============================================================
// REGIME DEFINITIONS (from PA confidence grid)
// ============================================================

const wpBands = [
  { label: '30%+',   min: 30, max: Infinity },
  { label: '20-30%', min: 20, max: 30 },
  { label: '12-20%', min: 12, max: 20 },
  { label: '6-12%',  min: 6,  max: 12 },
  { label: '<6%',    min: 0,  max: 6 },
]

const paBands = [
  { label: 'PA ≤ 0',     min: -Infinity, max: 0 },
  { label: 'PA 0 to +1', min: 0,         max: 1 },
  { label: 'PA +1 to +3', min: 1,        max: 3 },
  { label: 'PA +3 to +6', min: 3,        max: 6 },
  { label: 'PA +6 to +10', min: 6,       max: 10 },
  { label: 'PA > +10',   min: 10,        max: Infinity },
]

// ============================================================
// STEP 1: Compute per-cell statistics
// ============================================================

const cells = []
for (const wp of wpBands) {
  for (const pa of paBands) {
    const cell = data.filter(r =>
      r.winProb >= wp.min && r.winProb < wp.max &&
      r.personalAffinity >= pa.min && r.personalAffinity < pa.max
    )
    if (cell.length === 0) continue

    const winners = cell.filter(r => r.won)
    const n = cell.length
    const wr = winners.length / n
    const avgWinProb = cell.reduce((s, r) => s + r.winProb, 0) / n / 100  // convert to 0-1
    const rawBrier = cell.reduce((s, r) => s + Math.pow(r.winProb / 100 - (r.won ? 1 : 0), 2), 0) / n

    cells.push({
      wpLabel: wp.label,
      paLabel: pa.label,
      wpMin: wp.min,
      paMin: pa.min,
      n,
      wr,
      avgWinProb,
      rawBrier,
      rawError: avgWinProb - wr,  // positive = overestimate
    })
  }
}

// ============================================================
// STEP 2: Fit optimal PA correction per cell
// ============================================================

// For each cell, find the additive correction that minimizes Brier
// adjusted_prob = winProb/100 + correction
// Brier = mean((adjusted_prob - won)^2)
// Optimal additive correction = wr - avgWinProb (minimizes squared error)
// But we want a MODEL, not per-cell lookup, so we fit a simpler function

// Strategy: fit correction as f(PA) independently of winProb band
// This tests whether PA correction is universal or context-dependent

// Group all runners by PA band
const paCorrections = {}
for (const pa of paBands) {
  const inPa = data.filter(r => r.personalAffinity >= pa.min && r.personalAffinity < pa.max)
  if (inPa.length === 0) continue

  const avgWp = inPa.reduce((s, r) => s + r.winProb, 0) / inPa.length / 100
  const wr = inPa.filter(r => r.won).length / inPa.length
  const optimalCorrection = wr - avgWp  // how much to shift winProb to match actual WR

  // Fit: what additive correction to winProb minimizes Brier?
  // Brute-force search over corrections from -0.5 to +0.5
  let bestCorrection = 0
  let bestBrier = Infinity
  for (let c = -0.5; c <= 0.5; c += 0.001) {
    const brier = inPa.reduce((s, r) => {
      const adj = Math.max(0, Math.min(1, r.winProb / 100 + c))
      return s + Math.pow(adj - (r.won ? 1 : 0), 2)
    }, 0) / inPa.length
    if (brier < bestBrier) {
      bestBrier = brier
      bestCorrection = c
    }
  }

  paCorrections[pa.label] = {
    n: inPa.length,
    wr,
    avgWinProb: avgWp,
    optimalCorrection,
    fittedCorrection: bestCorrection,
    rawBrier: inPa.reduce((s, r) => s + Math.pow(r.winProb / 100 - (r.won ? 1 : 0), 2), 0) / inPa.length,
    correctedBrier: bestBrier,
  }
}

// ============================================================
// STEP 3: Fit context-dependent corrections (winProb × PA)
// ============================================================

const contextCorrections = {}
for (const cell of cells) {
  const cellData = data.filter(r =>
    r.winProb >= cell.wpMin && r.winProb < (cell.wpMin === 30 ? Infinity : cell.wpMin + (cell.wpLabel.includes('20-30') ? 10 : cell.wpLabel.includes('12-20') ? 8 : cell.wpLabel.includes('6-12') ? 6 : 999)) &&
    r.personalAffinity >= cell.paMin && (cell.paMin === 10 ? true : r.personalAffinity < (cell.paMin === -Infinity ? 0 : cell.paMin === 0 ? 1 : cell.paMin === 1 ? 3 : cell.paMin === 3 ? 6 : 10))
  )
  if (cellData.length < 10) continue

  let bestCorrection = 0
  let bestBrier = Infinity
  for (let c = -0.5; c <= 0.5; c += 0.001) {
    const brier = cellData.reduce((s, r) => {
      const adj = Math.max(0, Math.min(1, r.winProb / 100 + c))
      return s + Math.pow(adj - (r.won ? 1 : 0), 2)
    }, 0) / cellData.length
    if (brier < bestBrier) {
      bestBrier = brier
      bestCorrection = c
    }
  }

  const key = `${cell.wpLabel}|${cell.paLabel}`
  contextCorrections[key] = {
    n: cellData.length,
    rawBrier: cell.rawBrier,
    correctedBrier: bestBrier,
    correction: bestCorrection,
  }
}

// ============================================================
// OUTPUT
// ============================================================

// 1. Raw model Brier
const rawBrier = data.reduce((s, r) => s + Math.pow(r.winProb / 100 - (r.won ? 1 : 0), 2), 0) / data.length
const rawLogLoss = data.reduce((s, r) => {
  const p = Math.max(0.001, Math.min(0.999, r.winProb / 100))
  return s - ((r.won ? 1 : 0) * Math.log(p) + (1 - (r.won ? 1 : 0)) * Math.log(1 - p))
}, 0) / data.length

console.log('═══════════════════════════════════════════════════════════════════════')
console.log('  RESIDUAL CALIBRATION TEST')
console.log('  Does PA improve total calibration, or just reshuffle error?')
console.log('═══════════════════════════════════════════════════════════════════════\n')

console.log(`BASELINE (no PA correction):`)
console.log(`  Brier:  ${rawBrier.toFixed(6)}`)
console.log(`  LogLoss: ${rawLogLoss.toFixed(6)}`)
console.log(`  n:      ${data.length}`)
console.log()

// 2. PA-only correction (universal)
console.log('═══════════════════════════════════════════════════════════════════════')
console.log('  PA-ONLY CORRECTION (universal, no winProb context)')
console.log('═══════════════════════════════════════════════════════════════════════\n')

let universalCorrectedBrier = 0
let universalCorrectedLogLoss = 0
let totalN = 0

for (const [paLabel, corr] of Object.entries(paCorrections)) {
  const sign = corr.fittedCorrection > 0 ? '+' : ''
  console.log(`${paLabel.padEnd(16)} n=${String(corr.n).padStart(5)}  WR ${(corr.wr * 100).toFixed(1)}%  avgWinProb ${(corr.avgWinProb * 100).toFixed(1)}%  correction=${sign}${(corr.fittedCorrection * 100).toFixed(1)}pp  rawBrier=${corr.rawBrier.toFixed(6)}  corrBrier=${corr.correctedBrier.toFixed(6)}  Δ=${((corr.rawBrier - corr.correctedBrier) * 10000).toFixed(2)}e-4`)

  universalCorrectedBrier += corr.correctedBrier * corr.n
  universalCorrectedLogLoss += corr.n * data.filter(r =>
    corr.fittedCorrection !== undefined &&
    r.personalAffinity >= (paLabel.includes('≤ 0') ? -Infinity : paLabel.includes('0 to +1') ? 0 : paLabel.includes('+1 to +3') ? 1 : paLabel.includes('+3 to +6') ? 3 : paLabel.includes('+6 to +10') ? 6 : 10) &&
    r.personalAffinity < (paLabel.includes('≤ 0') ? 0 : paLabel.includes('0 to +1') ? 1 : paLabel.includes('+1 to +3') ? 3 : paLabel.includes('+3 to +6') ? 6 : paLabel.includes('+6 to +10') ? 10 : Infinity)
  ).reduce((s, r) => {
    const adj = Math.max(0.001, Math.min(0.999, r.winProb / 100 + corr.fittedCorrection))
    return s - ((r.won ? 1 : 0) * Math.log(adj) + (1 - (r.won ? 1 : 0)) * Math.log(1 - adj))
  }, 0) / corr.n * corr.n
  totalN += corr.n
}

universalCorrectedBrier /= totalN
universalCorrectedLogLoss /= totalN

console.log()
console.log(`Universal PA-corrected Brier: ${universalCorrectedBrier.toFixed(6)} (Δ from raw: ${((rawBrier - universalCorrectedBrier) * 10000).toFixed(2)}e-4)`)
console.log(`Improvement: ${((1 - universalCorrectedBrier / rawBrier) * 100).toFixed(2)}%`)
console.log()

// 3. Context-dependent corrections (winProb × PA)
console.log('═══════════════════════════════════════════════════════════════════════')
console.log('  CONTEXT-DEPENDENT CORRECTIONS (winProb × PA)')
console.log('═══════════════════════════════════════════════════════════════════════\n')

let contextCorrectedBrier = 0
let contextN = 0
for (const [key, corr] of Object.entries(contextCorrections)) {
  const sign = corr.correction > 0 ? '+' : ''
  const improvement = ((corr.rawBrier - corr.correctedBrier) * 10000).toFixed(2)
  console.log(`${key.padEnd(25)} n=${String(corr.n).padStart(5)}  raw=${corr.rawBrier.toFixed(6)}  corr=${corr.correctedBrier.toFixed(6)}  Δ=${improvement}e-4  correction=${sign}${(corr.correction * 100).toFixed(1)}pp`)
  contextCorrectedBrier += corr.correctedBrier * corr.n
  contextN += corr.n
}

contextCorrectedBrier /= contextN

console.log()
console.log(`Context-corrected Brier: ${contextCorrectedBrier.toFixed(6)} (Δ from raw: ${((rawBrier - contextCorrectedBrier) * 10000).toFixed(2)}e-4)`)
console.log(`Improvement: ${((1 - contextCorrectedBrier / rawBrier) * 100).toFixed(2)}%`)
console.log()

// 4. Per-cell calibration (3-state regime)
console.log('═══════════════════════════════════════════════════════════════════════')
console.log('  PER-CELL CALIBRATION (3-state regime)')
console.log('  Dead (PA≤0) | Transitional (PA 0-1) | Stable (PA>1)')
console.log('═══════════════════════════════════════════════════════════════════════\n')

const regimes = [
  { label: 'DEAD',        paMin: -Infinity, paMax: 0 },
  { label: 'TRANSITIONAL', paMin: 0,        paMax: 1 },
  { label: 'STABLE',       paMin: 1,        paMax: Infinity },
]

for (const regime of regimes) {
  const inRegime = data.filter(r => r.personalAffinity >= regime.paMin && r.personalAffinity < regime.paMax)
  if (inRegime.length === 0) continue

  const n = inRegime.length
  const wr = inRegime.filter(r => r.won).length / n
  const avgWp = inRegime.reduce((s, r) => s + r.winProb, 0) / n / 100
  const rawB = inRegime.reduce((s, r) => s + Math.pow(r.winProb / 100 - (r.won ? 1 : 0), 2), 0) / n

  // Optimal correction for this regime
  let bestC = 0
  let bestB = Infinity
  for (let c = -0.5; c <= 0.5; c += 0.001) {
    const b = inRegime.reduce((s, r) => {
      const adj = Math.max(0, Math.min(1, r.winProb / 100 + c))
      return s + Math.pow(adj - (r.won ? 1 : 0), 2)
    }, 0) / n
    if (b < bestB) { bestB = b; bestC = c }
  }

  const sign = bestC > 0 ? '+' : ''
  console.log(`${regime.label.padEnd(14)} n=${String(n).padStart(5)}  WR ${(wr * 100).toFixed(1)}%  avgWinProb ${(avgWp * 100).toFixed(1)}%  rawBrier=${rawB.toFixed(6)}  corrBrier=${bestB.toFixed(6)}  optimal=${sign}${(bestC * 100).toFixed(1)}pp  error=${((avgWp - wr) * 100).toFixed(1)}pp`)
}

console.log()

// 5. VERDICT
console.log('═══════════════════════════════════════════════════════════════════════')
console.log('  VERDICT')
console.log('═══════════════════════════════════════════════════════════════════════\n')

const universalImprovement = (1 - universalCorrectedBrier / rawBrier) * 100
const contextImprovement = (1 - contextCorrectedBrier / rawBrier) * 100

if (universalImprovement > 10) {
  console.log(`UNIVERSAL PA CORRECTION: +${universalImprovement.toFixed(1)}% Brier improvement`)
  console.log(`→ PA adds genuine calibration value independent of winProb context`)
} else if (universalImprovement > 3) {
  console.log(`UNIVERSAL PA CORRECTION: +${universalImprovement.toFixed(1)}% Brier improvement (modest)`)
  console.log(`→ PA adds some calibration value, but mostly context-dependent`)
} else {
  console.log(`UNIVERSAL PA CORRECTION: +${universalImprovement.toFixed(1)}% Brier improvement (negligible)`)
  console.log(`→ PA value is entirely context-dependent`)
}

console.log()

if (contextImprovement > universalImprovement * 2) {
  console.log(`CONTEXT CORRECTION: +${contextImprovement.toFixed(1)}% Brier improvement`)
  console.log(`→ PA correction is strongly context-dependent (winProb×PA interaction)`)
} else if (contextImprovement > universalImprovement) {
  console.log(`CONTEXT CORRECTION: +${contextImprovement.toFixed(1)}% Brier improvement (marginal over universal)`)
  console.log(`→ Some context dependence, but universal correction captures most value`)
} else {
  console.log(`CONTEXT CORRECTION: +${contextImprovement.toFixed(1)}% Brier improvement`)
  console.log(`→ Universal PA correction is sufficient`)
}

console.log()
console.log(`INTERPRETATION:`)
if (contextImprovement > 15) {
  console.log(`PA is a strong nonlinear error modulator — correction varies significantly by winProb band.`)
  console.log(`This is NOT a simple additive offset. PA encodes regime membership.`)
} else if (contextImprovement > 5) {
  console.log(`PA adds meaningful calibration, with some context dependence.`)
} else {
  console.log(`PA correction is mostly a universal offset — limited context interaction.`)
}
