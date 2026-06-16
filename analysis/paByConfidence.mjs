import { readFileSync, writeFileSync } from 'fs'

const data = JSON.parse(readFileSync('data/backtest-results-current.json', 'utf8'))
console.log(`Loaded ${data.length} runner records\n`)

// ============================================================
// GRID DEFINITION
// ============================================================

const wpBands = [
  { label: '30%+',  min: 30, max: Infinity },
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
// COMPUTE GRID
// ============================================================

const grid = []

for (const wp of wpBands) {
  const row = []
  for (const pa of paBands) {
    const cell = data.filter(r =>
      r.winProb >= wp.min && r.winProb < wp.max &&
      r.personalAffinity >= pa.min && r.personalAffinity < pa.max
    )
    if (cell.length === 0) {
      row.push({ count: 0, wr: 0, avgOdds: 0, avgWinProb: 0, edge: 0, roi: 0 })
      continue
    }
    const winners = cell.filter(r => r.won)
    const wr = winners.length / cell.length * 100
    const avgOdds = cell.reduce((s, r) => s + r.odds, 0) / cell.length
    const avgWinProb = cell.reduce((s, r) => s + r.winProb, 0) / cell.length
    const edge = avgWinProb - wr  // positive = model overestimates, negative = model underestimates
    const roi = cell.reduce((s, r) => s + r.levelPL, 0) / cell.length * 100
    row.push({ count: cell.length, wr, avgOdds, avgWinProb, edge, roi })
  }
  grid.push(row)
}

// ============================================================
// OUTPUT: RAW GRID
// ============================================================

console.log('═══════════════════════════════════════════════════════════════════════')
console.log('  FACTORIZED ERROR CORRECTION SURFACE: winProb × PA')
console.log('  "How wrong is the base model here, and in what direction?"')
console.log('═══════════════════════════════════════════════════════════════════════\n')

// Table header
const colWidth = 14
const labelWidth = 10
const hdr = ' '.repeat(labelWidth) + paBands.map(b => b.label.padStart(colWidth)).join('')
console.log(hdr)
console.log('─'.repeat(hdr.length))

for (let i = 0; i < wpBands.length; i++) {
  const parts = [wpBands[i].label.padStart(labelWidth)]
  for (let j = 0; j < paBands.length; j++) {
    const c = grid[i][j]
    if (c.count === 0) {
      parts.push('—'.padStart(colWidth))
    } else {
      parts.push(`${c.count}n ${c.wr.toFixed(0)}%`.padStart(colWidth))
    }
  }
  console.log(parts.join(''))
}

console.log()
console.log('  Each cell: [count]n [WR%]  (count < 20 = thin sample)\n')

// ============================================================
// OUTPUT: EDGE VS MODEL (error direction)
// ============================================================

console.log('═══════════════════════════════════════════════════════════════════════')
console.log('  EDGE VS MODEL: avg_winProb − actual_WR')
console.log('  Positive = model overestimates  |  Negative = model underestimates')
console.log('═══════════════════════════════════════════════════════════════════════\n')

const hdr2 = ' '.repeat(labelWidth) + paBands.map(b => b.label.padStart(colWidth)).join('')
console.log(hdr2)
console.log('─'.repeat(hdr2.length))

for (let i = 0; i < wpBands.length; i++) {
  const parts = [wpBands[i].label.padStart(labelWidth)]
  for (let j = 0; j < paBands.length; j++) {
    const c = grid[i][j]
    if (c.count === 0) {
      parts.push('—'.padStart(colWidth))
    } else {
      const sign = c.edge > 0 ? '+' : ''
      parts.push(`${sign}${c.edge.toFixed(1)}pp`.padStart(colWidth))
    }
  }
  console.log(parts.join(''))
}

console.log()

// ============================================================
// OUTPUT: ROI GRID
// ============================================================

console.log('═══════════════════════════════════════════════════════════════════════')
console.log('  ROI GRID: level-stakes return per cell')
console.log('═══════════════════════════════════════════════════════════════════════\n')

const hdr3 = ' '.repeat(labelWidth) + paBands.map(b => b.label.padStart(colWidth)).join('')
console.log(hdr3)
console.log('─'.repeat(hdr3.length))

for (let i = 0; i < wpBands.length; i++) {
  const parts = [wpBands[i].label.padStart(labelWidth)]
  for (let j = 0; j < paBands.length; j++) {
    const c = grid[i][j]
    if (c.count === 0) {
      parts.push('—'.padStart(colWidth))
    } else {
      const sign = c.roi > 0 ? '+' : ''
      parts.push(`${sign}${c.roi.toFixed(0)}%`.padStart(colWidth))
    }
  }
  console.log(parts.join(''))
}

console.log()

// ============================================================
// OUTPUT: REGIME CLASSIFICATION
// ============================================================

console.log('═══════════════════════════════════════════════════════════════════════')
console.log('  REGIME CLASSIFICATION')
console.log('  Dead (PA≤0) | Transitional (PA 0-1) | Stable (PA>1)')
console.log('═══════════════════════════════════════════════════════════════════════\n')

const regimes = ['DEAD', 'TRANSITIONAL', 'STABLE']
const regimeLabels = [
  // PA ≤ 0, PA 0-1, PA 1+
  ['DEAD', 'DEAD', 'DEAD'],         // all winProb bands for PA≤0 are dead
]

for (let i = 0; i < wpBands.length; i++) {
  const parts = [wpBands[i].label.padStart(labelWidth)]
  // PA ≤ 0 always DEAD
  const c0 = grid[i][0]
  if (c0.count > 0) {
    parts.push(`DEAD (WR ${c0.wr.toFixed(1)}%, n=${c0.count})`.padStart(colWidth * 2))
  } else {
    parts.push('—'.padStart(colWidth * 2))
  }
  // PA 0-1 = TRANSITIONAL
  const c1 = grid[i][1]
  if (c1.count > 0) {
    parts.push(`TRANS (WR ${c1.wr.toFixed(1)}%, edge ${c1.edge > 0 ? '+' : ''}${c1.edge.toFixed(1)}pp, n=${c1.count})`.padStart(colWidth * 3))
  } else {
    parts.push('—'.padStart(colWidth * 3))
  }
  // PA 1+ = STABLE (show gradient)
  const stableCells = []
  for (let j = 2; j < paBands.length; j++) {
    const c = grid[i][j]
    if (c.count > 0) stableCells.push(c)
  }
  if (stableCells.length > 0) {
    const avgWr = stableCells.reduce((s, c) => s + c.wr * c.count, 0) / stableCells.reduce((s, c) => s + c.count, 0)
    const totalN = stableCells.reduce((s, c) => s + c.count, 0)
    parts.push(`STABLE (WR ${avgWr.toFixed(1)}%, n=${totalN})`.padStart(colWidth * 2))
  }
  console.log(parts.join(''))
}

console.log()

// ============================================================
// OUTPUT: ERROR DIRECTION SUMMARY
// ============================================================

console.log('═══════════════════════════════════════════════════════════════════════')
console.log('  ERROR DIRECTION SUMMARY: Where does the model over/underestimate?')
console.log('═══════════════════════════════════════════════════════════════════════\n')

for (let i = 0; i < wpBands.length; i++) {
  const wpLabel = wpBands[i].label
  const overCells = []  // model overestimates (positive edge)
  const underCells = [] // model underestimates (negative edge)

  for (let j = 0; j < paBands.length; j++) {
    const c = grid[i][j]
    if (c.count < 10) continue
    if (c.edge > 0) overCells.push({ pa: paBands[j].label, edge: c.edge, n: c.count })
    else underCells.push({ pa: paBands[j].label, edge: c.edge, n: c.count })
  }

  console.log(`${wpLabel}:`)
  if (overCells.length > 0) {
    console.log(`  Model OVERESTIMATES:`)
    for (const c of overCells) {
      console.log(`    ${c.pa}: +${c.edge.toFixed(1)}pp (n=${c.n})`)
    }
  }
  if (underCells.length > 0) {
    console.log(`  Model UNDERESTIMATES:`)
    for (const c of underCells) {
      console.log(`    ${c.pa}: ${c.edge.toFixed(1)}pp (n=${c.n})`)
    }
  }
  if (overCells.length === 0 && underCells.length === 0) {
    console.log(`  Insufficient data`)
  }
  console.log()
}

// ============================================================
// OUTPUT: THE FOUR REGIMES (text)
// ============================================================

console.log('═══════════════════════════════════════════════════════════════════════')
console.log('  THE FOUR REGIMES')
console.log('═══════════════════════════════════════════════════════════════════════\n')

// Compute regime aggregates
const regimeData = {
  confirmed: { label: 'CONFIRMED (high winProb + PA>1)', cells: [] },
  overestimate: { label: 'MODEL OVERESTIMATE (high winProb + PA≤0)', cells: [] },
  underestimate: { label: 'MODEL UNDERESTIMATE (low winProb + PA>1)', cells: [] },
  dead: { label: 'DEAD (low winProb + PA≤0)', cells: [] },
}

for (let i = 0; i < wpBands.length; i++) {
  for (let j = 0; j < paBands.length; j++) {
    const c = grid[i][j]
    if (c.count === 0) continue
    const highWp = wpBands[i].min >= 20
    const highPa = paBands[j].min >= 1
    if (highWp && highPa) regimeData.confirmed.cells.push(c)
    else if (highWp && !highPa) regimeData.overestimate.cells.push(c)
    else if (!highWp && highPa) regimeData.underestimate.cells.push(c)
    else regimeData.dead.cells.push(c)
  }
}

for (const [key, r] of Object.entries(regimeData)) {
  if (r.cells.length === 0) continue
  const totalN = r.cells.reduce((s, c) => s + c.count, 0)
  const totalW = r.cells.reduce((s, c) => s + c.wr * c.count, 0)
  const avgWr = totalN > 0 ? totalW / totalN : 0
  const totalPL = r.cells.reduce((s, c) => s + c.roi * c.count, 0)
  const avgRoi = totalN > 0 ? totalPL / totalN : 0
  const avgEdge = r.cells.reduce((s, c) => s + c.edge * c.count, 0) / totalN
  console.log(`${r.label}`)
  console.log(`  n=${totalN}, WR=${avgWr.toFixed(1)}%, ROI=${avgRoi > 0 ? '+' : ''}${avgRoi.toFixed(1)}%, edge=${avgEdge > 0 ? '+' : ''}${avgEdge.toFixed(1)}pp`)
  console.log()
}

// ============================================================
// SAVE GRID AS JSON (for downstream use)
// ============================================================

const output = {
  generated: new Date().toISOString(),
  source: 'backtest-results-current.json',
  totalRecords: data.length,
  winProbBands: wpBands.map(b => b.label),
  paBands: paBands.map(b => b.label),
  grid: grid.map((row, i) => row.map((cell, j) => ({
    wpBand: wpBands[i].label,
    paBand: paBands[j].label,
    ...cell,
    regime: wpBands[i].min >= 20 && paBands[j].min >= 1 ? 'confirmed'
      : wpBands[i].min >= 20 && paBands[j].min < 1 ? 'overestimate'
      : wpBands[i].min < 20 && paBands[j].min >= 1 ? 'underestimate'
      : 'dead',
  }))),
}

writeFileSync('data/pa-confidence-grid.json', JSON.stringify(output, null, 2))
console.log('Grid saved to data/pa-confidence-grid.json')
