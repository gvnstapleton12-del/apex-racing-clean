import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'data')

function loadJson(p) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null }
  catch { return null }
}

const baseline = loadJson(join(DATA_DIR, 'backtest-results-course-x2.5-no-going.json'))
const x3 = loadJson(join(DATA_DIR, 'backtest-results-current.json'))

if (!baseline || !x3) {
  console.error('Missing backtest output files')
  process.exit(1)
}

// Specialist tracks from the audit
const SPECIALIST = ['Chester', 'Windsor', 'Goodwood', 'Beverley', 'Epsom', 'Dundalk', 'Brighton', 'Pontefract']

function buildRaceMap(data) {
  const map = {}
  for (const r of data) {
    const key = `${r.date}||${r.course}||${r.raceId}`
    if (!map[key]) map[key] = []
    map[key].push(r)
  }
  return map
}

const baseMap = buildRaceMap(baseline)
const x3Map = buildRaceMap(x3)

// ── SECTION 1: Overall rank shift ──
console.log('═══════════════════════════════════════════════════════')
console.log('  COURSE AFFINITY RANK-SHIFT ANALYSIS')
console.log('  Global ×2.5 vs Per-Category (Tact ×3.0 / Spec ×3.0 / Stamina ×2.5 / Gallop ×2.0)')
console.log('═══════════════════════════════════════════════════════\n')

let totalRaces = 0
let improved = 0
let worsened = 0
let unchanged = 0
let promotedToTop = 0
let winnerRankBase = {}
let winnerRankX3 = {}

for (const [key, baseRunners] of Object.entries(baseMap)) {
  const x3Runners = x3Map[key]
  if (!x3Runners) continue

  const baseSorted = [...baseRunners].sort((a, b) => (b.winProb || 0) - (a.winProb || 0))
  const x3Sorted = [...x3Runners].sort((a, b) => (b.winProb || 0) - (a.winProb || 0))

  baseSorted.forEach((r, i) => { r.rank = i + 1 })
  x3Sorted.forEach((r, i) => { r.rank = i + 1 })

  const baseWinner = baseSorted.find(r => r.won)
  const x3Winner = x3Sorted.find(r => r.won)
  if (!baseWinner || !x3Winner) continue

  totalRaces++
  const br = baseWinner.rank
  const xr = x3Winner.rank

  winnerRankBase[br] = (winnerRankBase[br] || 0) + 1
  winnerRankX3[xr] = (winnerRankX3[xr] || 0) + 1

  if (xr < br) { improved++; if (xr === 1) promotedToTop++ }
  else if (xr > br) worsened++
  else unchanged++
}

console.log('  OVERALL RANK SHIFTS')
console.log('  ─────────────────────────────────────────────')
console.log(`  Total races:            ${totalRaces}`)
console.log(`  Winner promoted:        ${improved} (${(improved/totalRaces*100).toFixed(1)}%)`)
console.log(`  Winner dropped:         ${worsened} (${(worsened/totalRaces*100).toFixed(1)}%)`)
console.log(`  Unchanged:              ${unchanged} (${(unchanged/totalRaces*100).toFixed(1)}%)`)
console.log(`  Promoted to #1:         ${promotedToTop}`)
console.log()

console.log('  WINNER RANK DISTRIBUTION')
console.log('  ─────────────────────────────────────────────')
console.log('  Rank    Baseline    ×3.0      Shift')
for (let r = 1; r <= 5; r++) {
  const b = winnerRankBase[r] || 0
  const x = winnerRankX3[r] || 0
  const diff = x - b
  const sign = diff > 0 ? '+' : ''
  console.log(`  #${r}      ${String(b).padStart(5)}      ${String(x).padStart(5)}    ${sign}${diff}`)
}
console.log()

// ── SECTION 2: Specialist tracks ──
console.log('═══════════════════════════════════════════════════════')
console.log('  SPECIALIST TRACK RANK SHIFTS')
console.log('═══════════════════════════════════════════════════════\n')

for (const track of SPECIALIST) {
  let trackImproved = 0
  let trackWorsened = 0
  let trackTotal = 0
  let trackPromoted = 0
  let trackRankBase = {}
  let trackRankX3 = {}

  for (const [key, baseRunners] of Object.entries(baseMap)) {
    if (!key.includes(track)) continue
    const x3Runners = x3Map[key]
    if (!x3Runners) continue

    const baseSorted = [...baseRunners].sort((a, b) => (b.winProb || 0) - (a.winProb || 0))
    const x3Sorted = [...x3Runners].sort((a, b) => (b.winProb || 0) - (a.winProb || 0))

    baseSorted.forEach((r, i) => { r.rank = i + 1 })
    x3Sorted.forEach((r, i) => { r.rank = i + 1 })

    const baseWinner = baseSorted.find(r => r.won)
    const x3Winner = x3Sorted.find(r => r.won)
    if (!baseWinner || !x3Winner) continue

    trackTotal++
    const br = baseWinner.rank
    const xr = x3Winner.rank

    trackRankBase[br] = (trackRankBase[br] || 0) + 1
    trackRankX3[xr] = (trackRankX3[xr] || 0) + 1

    if (xr < br) { trackImproved++; if (xr === 1) trackPromoted++ }
    else if (xr > br) trackWorsened++
  }

  if (trackTotal === 0) continue

  const baseWR1 = trackRankBase[1] || 0
  const x3WR1 = trackRankX3[1] || 0
  const delta = x3WR1 - baseWR1

  console.log(`  ${track} (${trackTotal} races)`)
  console.log(`    Winner #1:  ${baseWR1} → ${x3WR1} (${delta >= 0 ? '+' : ''}${delta})`)
  console.log(`    Promoted:   ${trackImproved} | Dropped: ${trackWorsened} | To #1: ${trackPromoted}`)
  const parts = []
  for (let r = 1; r <= 5; r++) {
    const b = trackRankBase[r] || 0
    const x = trackRankX3[r] || 0
    if (b > 0 || x > 0) parts.push(`#${r}:${b}→${x}`)
  }
  console.log(`    Ranks:      ${parts.join('  ')}`)
  console.log()
}

// ── SECTION 3: Biggest individual rank improvements ──
console.log('═══════════════════════════════════════════════════════')
console.log('  TOP 20 BIGGEST RANK IMPROVEMENTS')
console.log('═══════════════════════════════════════════════════════\n')

const shifts = []
for (const [key, baseRunners] of Object.entries(baseMap)) {
  const x3Runners = x3Map[key]
  if (!x3Runners) continue

  const baseSorted = [...baseRunners].sort((a, b) => (b.winProb || 0) - (a.winProb || 0))
  const x3Sorted = [...x3Runners].sort((a, b) => (b.winProb || 0) - (a.winProb || 0))

  baseSorted.forEach((r, i) => { r.rank = i + 1 })
  x3Sorted.forEach((r, i) => { r.rank = i + 1 })

  const baseWinner = baseSorted.find(r => r.won)
  const x3Winner = x3Sorted.find(r => r.won)
  if (!baseWinner || !x3Winner) continue

  const shift = baseWinner.rank - x3Winner.rank
  if (shift > 0) {
    shifts.push({
      date: baseWinner.date,
      course: baseWinner.course,
      horse: baseWinner.horse,
      baseRank: baseWinner.rank,
      x3Rank: x3Winner.rank,
      shift,
      baseScore: baseWinner.winProb?.toFixed(1),
      x3Score: x3Winner.winProb?.toFixed(1),
    })
  }
}

shifts.sort((a, b) => b.shift - a.shift)
for (const s of shifts.slice(0, 20)) {
  console.log(`  ${s.date} ${s.course} | ${s.horse}`)
  console.log(`    Rank: #${s.baseRank} → #${s.x3Rank} (↑${s.shift}) | Score: ${s.baseScore} → ${s.x3Score}`)
}

console.log()
console.log('═══════════════════════════════════════════════════════')
console.log('  DONE')
console.log('═══════════════════════════════════════════════════════')
