import { readFileSync, writeFileSync } from 'fs'

const DATA_PATH = './analysis/component-delta-audit.json'
const OUT_PATH = './analysis/interaction-trace.json'

const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
const promotions = raw.promotions || []
const COUNT = promotions.length

console.log(`Loaded ${COUNT} promotions\n`)

const KEYS = ['personalAffinity', 'trainerForm', 'ground', 'rprORGap']

// ── Single-feature positivity ──
console.log('SINGLE-FEATURE POSITIVITY RATE:')
for (const k of KEYS) {
  const n = promotions.filter(p => (p.deltas[k] || 0) > 0).length
  console.log(`  ${k.padEnd(20)} ${String(n).padStart(4)}/${COUNT} (${Math.round(n/COUNT*100)}%)`)
}

// ── Joint patterns ──
const patterns = [
  ['personalAffinity + trainerForm + ground', ['personalAffinity','trainerForm','ground']],
  ['personalAffinity + trainerForm + rprORGap', ['personalAffinity','trainerForm','rprORGap']],
  ['personalAffinity + ground + rprORGap', ['personalAffinity','ground','rprORGap']],
  ['trainerForm + ground + rprORGap', ['trainerForm','ground','rprORGap']],
  ['personalAffinity + trainerForm', ['personalAffinity','trainerForm']],
  ['personalAffinity + ground', ['personalAffinity','ground']],
  ['personalAffinity + rprORGap', ['personalAffinity','rprORGap']],
  ['trainerForm + ground', ['trainerForm','ground']],
  ['ALL FOUR', ['personalAffinity','trainerForm','ground','rprORGap']],
]

console.log('\nJOINT PATTERNS (all positive simultaneously):')
for (const [label, keys] of patterns) {
  const n = promotions.filter(p => keys.every(k => (p.deltas[k] || 0) > 0)).length
  console.log(`  ${label.padEnd(42)} ${String(n).padStart(4)}/${COUNT} (${Math.round(n/COUNT*100)}%)`)
}

for (const n of [0, 1, 2, 3, 4]) {
  const label = n === 0 ? 'NONE of the four' : `EXACTLY ${n}`
  const count = promotions.filter(p => KEYS.filter(k => (p.deltas[k] || 0) > 0).length === n).length
  console.log(`  ${label.padEnd(42)} ${String(count).padStart(4)}/${COUNT} (${Math.round(count/COUNT*100)}%)`)
}

// ── Primary driver × also-positive ──
const driverCounts = {}
for (const p of promotions) {
  const d = p.primaryDriver || 'unknown'
  driverCounts[d] = (driverCounts[d] || 0) + 1
}

console.log('\nPRIMARY DRIVER → ALSO-POSITIVE SECONDARY SIGNALS:')
for (const [driver, count] of Object.entries(driverCounts)) {
  const subset = promotions.filter(p => (p.primaryDriver || '') === driver)
  const parts = KEYS.filter(k => subset.some(p => (p.deltas[k] || 0) > 0))
    .map(k => {
      const n = subset.filter(p => (p.deltas[k] || 0) > 0).length
      return `${k}=${n}/${count} (${Math.round(n/count*100)}%)`
    })
  console.log(`  ${driver.padEnd(18)} ${count} proms → ${parts.join(', ')}`)
}

// ── Avg contribution when positive / when negative ──
console.log('\nAVERAGE DELTA WHEN POSITIVE vs WHEN NEGATIVE:')
for (const k of KEYS) {
  const pos = promotions.filter(p => (p.deltas[k] || 0) > 0)
  const avgPos = pos.length > 0 ? pos.reduce((s, p) => s + (p.deltas[k] || 0), 0) / pos.length : 0
  const neg = promotions.filter(p => (p.deltas[k] || 0) < 0)
  const avgNeg = neg.length > 0 ? neg.reduce((s, p) => s + (p.deltas[k] || 0), 0) / neg.length : 0
  console.log(`  ${k.padEnd(20)} when +: ${avgPos.toFixed(2)} (n=${pos.length})  when −: ${avgNeg.toFixed(2)} (n=${neg.length})`)
}

// ── Key interaction finding ──
const bothPAandTF = promotions.filter(p => (p.deltas.personalAffinity||0) > 0 && (p.deltas.trainerForm||0) > 0)
console.log(`\nKEY: personalAffinity + trainerForm BOTH positive: ${bothPAandTF.length}/${COUNT} (${Math.round(bothPAandTF.length/COUNT*100)}%)`)
console.log(`  + ground also positive: ${bothPAandTF.filter(p => (p.deltas.ground||0) > 0).length}/${bothPAandTF.length}`)
console.log(`  + rprORGap also positive: ${bothPAandTF.filter(p => (p.deltas.rprORGap||0) > 0).length}/${bothPAandTF.length}`)
console.log(`  ALL THREE (PA+TF+ground): ${promotions.filter(p => (p.deltas.personalAffinity||0)>0 && (p.deltas.trainerForm||0)>0 && (p.deltas.ground||0)>0).length}/${COUNT}`)
console.log(`  ALL FOUR: ${promotions.filter(p => (p.deltas.personalAffinity||0)>0 && (p.deltas.trainerForm||0)>0 && (p.deltas.ground||0)>0 && (p.deltas.rprORGap||0)>0).length}/${COUNT}`)

// ── Save ──
writeFileSync(OUT_PATH, JSON.stringify({
  singleFeature: Object.fromEntries(KEYS.map(k => [k, { positive: promotions.filter(p => (p.deltas[k]||0)>0).length, total: COUNT }])),
  jointPatterns: patterns.map(([label, keys]) => ({ label, keys, count: promotions.filter(p => keys.every(k => (p.deltas[k]||0)>0)).length, total: COUNT })),
  driverCounts,
}, null, 2))

console.log(`\nSaved to ${OUT_PATH}`)
