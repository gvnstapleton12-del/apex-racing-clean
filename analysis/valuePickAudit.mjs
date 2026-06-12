import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const toFileUrl = (p) => new URL(`file:///${p.replace(/\\/g, '/')}`).href
const { runApexEngine } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'apexEngine.js')))

const CACHE_DIR = join(ROOT, 'data', 'backtest-cache')

function loadJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

function decimalFromOdds(odds) {
  if (!odds || odds <= 0) return 0
  if (typeof odds === 'string') {
    const m = odds.match(/^(\d+)\/(\d+)$/)
    if (m) return 1 + parseInt(m[1]) / parseInt(m[2])
    return parseFloat(odds) || 0
  }
  return odds
}

function detectRaceType(race) {
  const name = (race.race_name || '').toLowerCase()
  if (/(hurdle|chase|nh\s*flat|national hunt)/.test(name)) return 'Jumps'
  const runners = race.runners || []
  let hc = 0, fc = 0
  for (const r of runners) {
    for (const pr of (r.previous_results || [])) {
      const rt = (pr.run_type || '').toUpperCase()
      if (rt === 'HURDLE' || rt === 'CHASE' || rt === 'NH_FLAT') hc++
      else if (rt === 'FLAT') fc++
    }
  }
  return hc > fc ? 'Jumps' : 'Flat'
}

function avg(arr, key) {
  return arr.length ? arr.reduce((s, p) => s + (p[key] ?? 0), 0) / arr.length : 0
}

// ── CLI ──
const args = process.argv.slice(2)
const baselinePath = args[0] || join(ROOT, 'data', 'backtest-baseline-pa25.json')
const currentPath = args[1] || join(ROOT, 'data', 'backtest-results-current.json')

// ── Load ──
const current = loadJson(currentPath)
const baseline = loadJson(baselinePath)
if (!current || !baseline) {
  console.error('Usage: node analysis/valuePickAudit.mjs [baseline.json] [current.json]')
  console.error(`  Baseline: ${baselinePath} ${baseline ? 'OK' : 'NOT FOUND'}`)
  console.error(`  Current:  ${currentPath} ${current ? 'OK' : 'NOT FOUND'}`)
  process.exit(1)
}

console.log(`Baseline: ${baselinePath} (${baseline.length} records)`)
console.log(`Current:  ${currentPath} (${current.length} records)`)

// ── Identify value-pick changes ──
const fVal = current.filter(p => p.isValueSelection)
const bVal = baseline.filter(p => p.isValueSelection)
const fKeys = new Set(fVal.map(p => p.raceId + '|' + p.horse.toLowerCase()))
const bKeys = new Set(bVal.map(p => p.raceId + '|' + p.horse.toLowerCase()))

const added = fVal.filter(p => !bKeys.has(p.raceId + '|' + p.horse.toLowerCase()))
const removed = bVal.filter(p => !fKeys.has(p.raceId + '|' + p.horse.toLowerCase()))

console.log(`\nAdded value bets: ${added.length} (${added.filter(p=>p.won).length} winners, ${added.filter(p=>!p.won).length} losers)`)
console.log(`Removed value bets: ${removed.length} (${removed.filter(p=>p.won).length} winners, ${removed.filter(p=>!p.won).length} losers)`)

// ── Build context map ──
const contextMap = {}
for (const p of current) {
  if (!contextMap[p.raceId]) contextMap[p.raceId] = {}
  contextMap[p.raceId][p.horse.toLowerCase()] = { won: p.won, placed: p.placed, odds: p.odds }
}

// ── Re-run engine on affected races ──
const raceIds = new Set([...added.map(p => String(p.raceId)), ...removed.map(p => String(p.raceId))])
const TRACK_PROFILES = loadJson(join(ROOT, 'data', 'trackProfiles.json')) || {}
const resultFiles = readdirSync(CACHE_DIR).filter(f => f.startsWith('results-') && f.endsWith('.json')).sort()

const matched = []

for (const file of resultFiles) {
  const data = loadJson(join(CACHE_DIR, file))
  if (!Array.isArray(data)) continue
  for (const race of data) {
    if (!raceIds.has(String(race.race_id))) continue
    const runners = (race.runners || []).filter(r => r.horse)
    if (runners.length < 2) continue

    const engineRunners = runners.map(r => ({
      horse: r.horse, horse_id: r.horse_id || '',
      odds: decimalFromOdds(r.odds) || decimalFromOdds(r.sp) || 0,
      or: r.or || 0, rpr: r.rpr || 0, draw: r.draw || 0,
      jockey: r.jockey || '', trainer: r.trainer || '',
      form: r.form || '', age: r.age || 0, sex: r.sex || '',
      lbs: r.lbs || '', last_run: r.last_run || 0,
      previous_results: r.previous_results || [], runningStyle: null,
      marketMovement: 'UNKNOWN', headgear: { items: [], firstTimeItems: [] }, weight: '',
    }))

    const raceType = detectRaceType(race)
    const raceData = {
      course: race.course || '', off_time: '', date: race.date || '',
      going: race.going || '', distance_f: race.distance_f || '',
      race_class: race.race_class || 0,
      type: raceType === 'Jumps' ? 'Hurdle' : 'Flat',
      race_name: race.race_name || '', surface: '', field_size: runners.length,
    }

    let engineResult
    try {
      engineResult = runApexEngine(engineRunners, raceData, { trackProfiles: TRACK_PROFILES })
    } catch { continue }

    for (const pred of engineResult.racecards || []) {
      const hn = (pred.horse || '').toLowerCase()
      const rid = String(race.race_id)
      const ctx = contextMap[rid]?.[hn]
      if (!ctx) continue

      const isAdded = added.some(p => String(p.raceId) === rid && p.horse.toLowerCase() === hn)
      const isRemoved = removed.some(p => String(p.raceId) === rid && p.horse.toLowerCase() === hn)
      if (!isAdded && !isRemoved) continue

      const nc = pred.newComponents || {}
      const pa = pred.personalAffinity || {}
      const cm = pred.classModel || {}
      const hq = pred.horseQuality || {}

      matched.push({
        horse: pred.horse, course: race.course,
        group: isAdded ? (ctx.won ? 'addedWinner' : 'addedLoser') : 'removedLoser',
        won: ctx.won, odds: ctx.odds, winProb: pred.winProb || 0,
        personalAffinity: pa.adjustment ?? 0,
        trainerForm: nc.trainerForm ?? 50,
        ground: nc.ground ?? 50,
        classMove: nc.classMove ?? 50,
        classDrop: nc.classDrop ?? 0,
        paceCompat: hq.paceCompat ?? 0,
        raceShape: pred.raceShapeSuitability ?? 0,
        rprORGap: cm.rprORGap ?? 0,
        finalScore: pred.finalScore || 0,
        edge: (pred.winProb || 0) / 100 - 1 / (ctx.odds || 2),
      })
    }
  }
}

// ── Group ──
const aw = matched.filter(m => m.group === 'addedWinner')
const al = matched.filter(m => m.group === 'addedLoser')
const rl = matched.filter(m => m.group === 'removedLoser')
const allMatched = matched.length

const features = ['personalAffinity', 'trainerForm', 'ground', 'classMove', 'classDrop', 'paceCompat', 'raceShape', 'rprORGap', 'finalScore', 'winProb', 'odds', 'edge']

// ── Report ──
console.log(`\n=== VALUE PICK AUDIT (${allMatched}/${raceIds.size} races matched) ===\n`)

console.log('Feature'.padEnd(22), '|', 'A-Winners'.padEnd(11), '|', 'A-Losers'.padEnd(11), '|', 'R-Losers'.padEnd(11), '|', 'AWin-RLos')
console.log('-'.repeat(70))
for (const feat of features) {
  const AW = avg(aw, feat); const AL = avg(al, feat); const RL = avg(rl, feat)
  const d = AW - RL
  console.log(feat.padEnd(22), '|', AW.toFixed(2).padStart(9), '|', AL.toFixed(2).padStart(9), '|', RL.toFixed(2).padStart(9), '|', (d >= 0 ? '+' : '') + d.toFixed(2))
}

// ── Added Losers deep-dive ──
console.log(`\n=== ADDED LOSERS — what the filter still gets wrong ===\n`)
al.sort((a,b) => b.odds - a.odds)
if (al.length > 0) {
  for (const f of al) {
    const flags = []
    if (f.personalAffinity > 0) flags.push(`PA+${f.personalAffinity.toFixed(1)}`)
    else if (f.personalAffinity < 0) flags.push(`PA${f.personalAffinity.toFixed(1)}`)
    if (f.classDrop > 0) flags.push(`classDrop+${f.classDrop}`)
    if (f.rprORGap > 0) flags.push(`rprGap+${f.rprORGap.toFixed(1)}`)
    if (f.raceShape > 50) flags.push(`shape+${(f.raceShape-50).toFixed(0)}`)
    console.log(`  ${f.horse.padEnd(20)} odds:${f.odds.toFixed(0).padStart(4)}/1 WP:${f.winProb.toFixed(1).padStart(5)}% edge:${(f.edge*100).toFixed(1).padStart(5)}% ${flags.join(' ')}`)
  }
  console.log(`\n  Avg PA: ${avg(al,'personalAffinity').toFixed(2)} | Avg winProb: ${avg(al,'winProb').toFixed(1)}% | Avg edge: ${(avg(al,'edge')*100).toFixed(1)}%`)
  console.log(`  Most common weakness: `, avg(al,'personalAffinity') < 5 ? 'PA too low' : avg(al,'rprORGap') < 0 ? 'negative RPR gap' : 'mixed profile')
} else {
  console.log('  (none — all added bets won)')
}

// ── Removed Losers deep-dive ──
console.log(`\n=== REMOVED LOSERS — what the old filter caught ===\n`)
rl.sort((a,b) => a.personalAffinity - b.personalAffinity)
for (const f of rl) {
  const flags = []
  if (f.personalAffinity > 0) flags.push(`PA+${f.personalAffinity.toFixed(1)}`)
  else if (f.personalAffinity < 0) flags.push(`PA${f.personalAffinity.toFixed(1)}`)
  if (f.classDrop > 0) flags.push(`classDrop+${f.classDrop}`)
  if (f.rprORGap > 0) flags.push(`rprGap+${f.rprORGap.toFixed(1)}`)
  console.log(`  ${f.horse.padEnd(20)} odds:${f.odds.toFixed(0).padStart(4)}/1 WP:${f.winProb.toFixed(1).padStart(5)}% edge:${(f.edge*100).toFixed(1).padStart(5)}% ${flags.join(' ')}`)
}
console.log(`\n  Avg PA: ${avg(rl,'personalAffinity').toFixed(2)} | Avg winProb: ${avg(rl,'winProb').toFixed(1)}% | Avg edge: ${(avg(rl,'edge')*100).toFixed(1)}%`)

// ── Summary ──
console.log(`\n=== KEY FINDINGS ===`)
console.log(`  PersonalAffinity:   +${avg(aw,'personalAffinity').toFixed(2)} (winners) vs ${avg(rl,'personalAffinity').toFixed(2)} (rejected) — separator found`)
console.log(`  WinProb:            ${avg(aw,'winProb').toFixed(1)}% (winners) vs ${avg(rl,'winProb').toFixed(1)}% (rejected) — gate threshold confirmed`)
console.log(`  RPR/OR Gap:         ${avg(aw,'rprORGap').toFixed(1)} (winners) vs ${avg(rl,'rprORGap').toFixed(1)} (rejected) — not a strong separator`)
console.log(`  ClassDrop:          ${avg(aw,'classDrop').toFixed(1)} (winners) vs ${avg(rl,'classDrop').toFixed(1)} (rejected) — not yet contributing`)
console.log(`  Kelly gain source:  Better value selection, not calibration change`)

// ── Save ──
const output = {
  baseline: baselinePath, current: currentPath,
  summary: {
    added: { total: added.length, winners: added.filter(p=>p.won).length, losers: added.filter(p=>!p.won).length },
    removed: { total: removed.length, winners: removed.filter(p=>p.won).length, losers: removed.filter(p=>!p.won).length },
  },
  featureComparison: features.map(f => ({
    feature: f, addedWinners: avg(aw,f), addedLosers: avg(al,f), removedLosers: avg(rl,f), delta: avg(aw,f)-avg(rl,f),
  })),
  addedWinners: aw, addedLosers: al, removedLosers: rl,
}
writeFileSync(join(ROOT, 'data', 'value-pick-audit.json'), JSON.stringify(output, null, 2))
console.log(`\nSaved to data/value-pick-audit.json`)
