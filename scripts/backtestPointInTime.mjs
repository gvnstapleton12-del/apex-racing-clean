// Point-in-Time Backtest
// Rebuilds full engine context chronologically, testing the engine as it actually runs in production.
// Usage: node scripts/backtestPointInTime.mjs [--from 2026-05-21] [--to 2026-06-21] [--pa-gate] [--label mytest]
//
// Prerequisites: Run backfillSweep.mjs first to populate horse_runs, jockey_runs, and backtest-cache.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function toFileUrl(p) { return new URL(`file:///${p.replace(/\\/g, '/')}`).href }
const { runApexEngine } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'apexEngine.js')))
const { initHorseDb, createTables, closeHorseDb } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'horseMemoryDb.js')))
const { loadStaticDatabases, buildPointInTimeContext, attachHorseMemory, buildRPDataMock } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'backtestContextBuilder.js')))

const CACHE_DIR = join(ROOT, 'data', 'backtest-cache')
const MIN_RUNNERS = 5
const KELLY_FRAC = 0.125
const STARTING_BANK = 1000

// Parse CLI args
const args = process.argv.slice(2)
let fromDate = '2026-05-21'
let toDate = '2026-06-21'
let paGate = false
let label = 'point-in-time'
let courseMultiplier = null
let disableGoing = null
let numSimulations = 100

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--from' && args[i + 1]) { fromDate = args[++i]; label = `${label}-${fromDate}` }
  if (args[i] === '--to' && args[i + 1]) { toDate = args[++i] }
  if (args[i] === '--pa-gate') { paGate = true; label = label.includes('pa-gate') ? label : `${label}-pa-gate` }
  if (args[i] === '--label' && args[i + 1]) { label = args[++i] }
  if (args[i] === '--course-mult' && args[i + 1]) { courseMultiplier = parseFloat(args[++i]); label = `${label}-cm${courseMultiplier}` }
  if (args[i] === '--disable-going') { disableGoing = true; label = `${label}-dg` }
  if (args[i] === '--fast') { numSimulations = 5; label = `${label}-fast` }
  if (args[i] === '--sims' && args[i + 1]) { numSimulations = parseInt(args[++i]); label = `${label}-s${numSimulations}` }
  if (args[i] === '--skip-memory') { label = `${label}-nomem` }
}

const SKIP_MEMORY = args.includes('--skip-memory')

const OUTPUT_PATH = join(ROOT, `data/backtest-results-${label}.json`)

function decimalFromOdds(odds) {
  if (!odds || odds <= 0) return 0
  if (typeof odds === 'string') {
    const m = odds.match(/^(\d+)\/(\d+)$/)
    if (m) return 1 + parseInt(m[1]) / parseInt(m[2])
    return parseFloat(odds) || 0
  }
  return odds
}

function kellyStake(p, decimalOdds) {
  const edge = p * (decimalOdds - 1) - (1 - p)
  if (edge <= 0) return 0
  const kelly = edge / (decimalOdds - 1)
  return Math.max(0, KELLY_FRAC * kelly)
}

function isTrueValueSelection(calibratedProb, decimalOdds, fieldSize, hasDenseData, apexScore = 0, raceApexScores = []) {
  const impliedProb = 1 / decimalOdds
  if (calibratedProb < 0.05) return false
  if (raceApexScores.length > 0 && apexScore > 0) {
    const sorted = [...raceApexScores].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    if (apexScore < median || apexScore < 10) return false
  }
  const rawEdge = calibratedProb - impliedProb
  let minRequiredEdge = impliedProb * 0.25
  if (decimalOdds >= 5.0 && decimalOdds <= 11.0) {
    minRequiredEdge = impliedProb * 0.20
  }
  return rawEdge > minRequiredEdge
}

function detectRaceType(race) {
  const name = (race.race_name || '').toLowerCase()
  if (/(hurdle|chase|nh\s*flat|national hunt)/.test(name)) return 'Jumps'
  const runners = race.runners || []
  let hurdleCount = 0, flatCount = 0
  for (const r of runners) {
    for (const pr of (r.previous_results || [])) {
      const rt = (pr.run_type || '').toUpperCase()
      if (rt === 'HURDLE' || rt === 'CHASE' || rt === 'NH_FLAT') hurdleCount++
      else if (rt === 'FLAT') flatCount++
    }
  }
  if (hurdleCount > flatCount) return 'Jumps'
  return 'Flat'
}

function getDateRange(from, to) {
  const dates = []
  const d = new Date(from)
  const end = new Date(to)
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

async function main() {
  console.log(`=== Point-in-Time Backtest ===`)
  console.log(`Range: ${fromDate} to ${toDate}`)
  console.log(`PA Gate: ${paGate}`)
  console.log(`Simulations: ${numSimulations}`)
  console.log(`Label: ${label}\n`)

  // 1. Load static databases
  console.log('Loading static databases...')
  const staticDbs = loadStaticDatabases()
  console.log(`  Track profiles: ${Object.keys(staticDbs.trackProfiles).length} tracks`)
  console.log(`  Horse profiles: ${Object.keys(staticDbs.horseProfileDb).length} profiles`)
  console.log(`  Learning records: ${(staticDbs.learningData.records || []).length}`)

  // 2. Open SQLite
  console.log('\nOpening horse memory database...')
  const db = await initHorseDb()
  if (db) await createTables(db)
  console.log(`  DB: ${db ? 'connected' : 'NOT AVAILABLE (horse memory disabled)'}`)

  // 3. Discover backtest-cache files
  const dates = getDateRange(fromDate, toDate)
  const availableFiles = existsSync(CACHE_DIR) ? readdirSync(CACHE_DIR).filter(f => f.startsWith('results-') && f.endsWith('.json')) : []
  const availableDates = new Set(availableFiles.map(f => f.replace('results-', '').replace('.json', '')))
  const validDates = dates.filter(d => availableDates.has(d))

  console.log(`\nRequested: ${dates.length} dates, Available in cache: ${validDates.length}`)
  if (validDates.length === 0) {
    console.log('No backtest-cache files found. Run backfillSweep.mjs first.')
    if (db) await closeHorseDb(db)
    return
  }

  // 4. Run backtest chronologically
  const allPredictions = []
  let totalRaces = 0
  let skippedSmallField = 0
  let noPrevRaces = 0
  let debugCount = 0
  const debugLines = []
  const startTime = Date.now()

  for (let i = 0; i < validDates.length; i++) {
    const date = validDates[i]
    const cachePath = join(CACHE_DIR, `results-${date}.json`)
    console.log(`\n[${i + 1}/${validDates.length}] ${date}`)

    // Load race data
    let races
    try {
      races = JSON.parse(readFileSync(cachePath, 'utf8'))
    } catch (err) {
      console.log(`  Failed to load cache: ${err.message}`)
      continue
    }

    // Build point-in-time context for this date
    // Use the NEXT date as the boundary (so today's runs are visible to tomorrow's backtest)
    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + 1)
    const nextDateStr = nextDate.toISOString().slice(0, 10)

    let context
    try {
      context = await buildPointInTimeContext(db, nextDateStr, staticDbs)
    } catch (err) {
      console.log(`  Context build failed: ${err.message}`)
      continue
    }

    let dayRaces = 0
    let daySelections = 0
    const dayStart = Date.now()

    for (const race of races) {
      const runners = race.runners || []
      if (runners.length < MIN_RUNNERS) { skippedSmallField++; continue }

      const noPrev = runners.filter(r => !r.previous_results || r.previous_results.length === 0)
      if (noPrev.length === runners.length) { noPrevRaces++ }

      dayRaces++
      totalRaces++

      // Build engine runners
      const engineRunners = runners.map(r => ({
        horse: r.horse,
        horse_id: r.horse_id || '',
        odds: decimalFromOdds(r.sp) || decimalFromOdds(r.odds) || 0,
        or: r.or || 0,
        rpr: r.rpr || 0,
        draw: r.draw || 0,
        jockey: r.jockey || '',
        trainer: r.trainer || '',
        form: r.form || '',
        age: r.age || 0,
        sex: r.sex || '',
        lbs: r.lbs || '',
        last_run: r.last_run || 0,
        previous_results: r.previous_results || [],
        runningStyle: null,
        marketMovement: 'UNKNOWN',
        headgear: { items: [], firstTimeItems: [] },
        weight: '',
      }))

      // Attach horse memory (point-in-time) — skip in fast mode for speed
      if (db && !SKIP_MEMORY) {
        await attachHorseMemory(db, engineRunners, {
          date: date,
          going: race.going || '',
          distance_furlongs: race.distance_f || '',
          race_class: race.race_class || 0,
          course: race.course || '',
          field_size: runners.length,
        }, context)
      }

      // Build race object
      const raceData = {
        course: race.course || '',
        off_time: '',
        date: date,
        going: race.going || '',
        distance_f: race.distance_f || '',
        race_class: race.race_class || 0,
        type: detectRaceType(race) === 'Jumps' ? 'Hurdle' : 'Flat',
        race_name: race.race_name || '',
        surface: '',
        field_size: runners.length,
      }

      // Run engine with full point-in-time context
      let engineResult
      try {
        engineResult = runApexEngine(engineRunners, raceData, {
          ...context,
          numSimulations,
          rpDataMap: buildRPDataMock(race),
          ...(courseMultiplier !== null && { courseMultiplier }),
          ...(disableGoing !== null && { disableGoing }),
        })
      } catch (err) {
        console.warn(`  [ERR] ${race.course}: ${err.message}`)
        continue
      }

      const predictions = engineResult.racecards || []
      const resultMap = {}
      runners.forEach(r => { resultMap[r.horse.toLowerCase().trim()] = r })
      const raceApexScores = predictions.map(p => p.finalScore || p.apexScore || 0).filter(s => s > 0)

      for (const pred of predictions) {
        const hn = (pred.horse || '').toLowerCase().trim()
        const result = resultMap[hn]
        if (!result) continue

        const winProb = pred.winProb || 0
        const plattProb = pred.plattProb || winProb
        const decimalOdds = decimalFromOdds(result.sp) || decimalFromOdds(result.odds) || 0
        if (decimalOdds < 2.0) continue
        const actualPos = result.position
        const won = actualPos === 1
        const placed = actualPos >= 1 && actualPos <= 3
        const levelPL = won ? (decimalOdds - 1) : -1

        const hasDenseData = (result.previous_results || []).length >= 5
        const p = plattProb / 100
        const pDisplay = winProb / 100
        const apexScore = pred.finalScore || pred.apexScore || 0
        let isValueSelection = isTrueValueSelection(p, decimalOdds, runners.length, hasDenseData, apexScore, raceApexScores)

        if (debugCount < 30) {
          const implied = ((1 / decimalOdds) * 100).toFixed(1)
          const inSweetSpot = decimalOdds >= 5.0 && decimalOdds <= 11.0
          const reqEdgePct = (inSweetSpot ? 0.20 : 0.25)
          const rawEdgePct = ((p - 1 / decimalOdds) * 100).toFixed(2)
          const minEdgePct = ((1 / decimalOdds) * reqEdgePct * 100).toFixed(2)
          const passProbGate = p >= 0.05 ? 'Y' : 'N'
          const sortedApex = [...raceApexScores].sort((a, b) => a - b)
          const mid = Math.floor(sortedApex.length / 2)
          const raceMedian = sortedApex.length % 2 !== 0 ? sortedApex[mid] : (sortedApex[mid - 1] + sortedApex[mid]) / 2
          const passApexGate = (apexScore > 0 && apexScore >= raceMedian && apexScore >= 10) ? 'Y' : 'N'
          const passEdgeGate = (p - 1 / decimalOdds) > (1 / decimalOdds) * reqEdgePct ? 'Y' : 'N'
          const prevCount = (result.previous_results || []).length
          debugLines.push(
            `${(pred.horse||'').padEnd(22)} | odds=${decimalOdds.toFixed(1).padStart(4)} | platt=${(p*100).toFixed(1).padStart(5)}% | impl=${implied.padStart(5)}% | edge=${rawEdgePct.padStart(6)}% vs req=${minEdgePct.padStart(5)}% | pg=${passProbGate} ap=${passApexGate} eg=${passEdgeGate} | apex=${String(apexScore).padStart(4)} med=${raceMedian.toFixed(0).padStart(3)} | prev=${prevCount} | ${won ? 'WIN' : isValueSelection ? 'VALUE' : 'skip'}`
          )
          debugCount++
        }

        // PA gate
        const paAdj = pred.personalAffinity?.adjustment ?? 0
        if (paGate && paAdj <= 0) isValueSelection = false

        const kellyPct = isValueSelection ? kellyStake(p, decimalOdds) : 0

        allPredictions.push({
          raceId: race.race_id || '',
          course: race.course || '',
          date,
          raceType: detectRaceType(race),
          horse: pred.horse || '',
          winProb,
          rawBayesianProb: pred.rawBayesianProb ?? null,
          plattProb: pred.plattProb ?? null,
          odds: decimalOdds,
          actualPos,
          won,
          placed,
          levelPL,
          kellyPct,
          isValueSelection,
          hasDenseData,
          fieldSize: runners.length,
          draw: result.draw || 0,
          grade: pred.selectionQuality?.grade || '',
          betQuality: pred.betQuality || '',
          personalAffinity: paAdj,
          engineLabel: pred.engineLabel || null,
          triggerReason: pred.triggerReason || null,
        })
        daySelections++
      }
    }
    console.log(`  ${dayRaces} races, ${daySelections} selections (${((Date.now() - dayStart) / 1000).toFixed(1)}s)`)
  }

  // 5. Compute metrics
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n=== Results (${elapsed}s) ===`)
  console.log(`Total races: ${totalRaces}, Skipped: ${skippedSmallField} small field, ${noPrevRaces} ran without previous_results`)

  if (debugLines.length > 0) {
    console.log('\n--- Value Gate Debug (first 30 runners) ---')
    console.log('horse                 | odds  platt  winP   impl   edge    reqEdge  pg ap eg apex prev  result')
    debugLines.forEach(l => console.log(l))
  }

  const n = allPredictions.length
  if (n === 0) {
    console.log('No predictions generated.')
    writeFileSync(OUTPUT_PATH, JSON.stringify([], null, 2))
    if (db) await closeHorseDb(db)
    return
  }

  const winners = allPredictions.filter(p => p.won)
  const placed = allPredictions.filter(p => p.placed)
  const valuePicks = allPredictions.filter(p => p.isValueSelection)
  const valueWinners = valuePicks.filter(p => p.won)

  const wr = (winners.length / n * 100).toFixed(1)
  const pr = (placed.length / n * 100).toFixed(1)
  const totalPL = allPredictions.reduce((s, p) => s + p.levelPL, 0)
  const roi = (totalPL / n * 100).toFixed(1)

  console.log(`\nOverall: ${n} selections, ${winners.length}W / ${placed.length}P`)
  console.log(`Win Rate: ${wr}% | Place Rate: ${pr}%`)
  console.log(`Level P&L: ${totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)} units | ROI: ${roi}%`)

  // Value picks
  const valueWR = valuePicks.length > 0 ? (valueWinners.length / valuePicks.length * 100).toFixed(1) : '0.0'
  const valuePL = valuePicks.reduce((s, p) => s + p.levelPL, 0)
  const valueROI = valuePicks.length > 0 ? (valuePL / valuePicks.length * 100).toFixed(1) : '0.0'
  console.log(`\nValue Picks: ${valuePicks.length}, ${valueWinners.length}W`)
  console.log(`Value WR: ${valueWR}% | Value ROI: ${valueROI}%`)

  // Kelly ROI
  const kellyPL = allPredictions.reduce((s, p) => s + p.kellyPct * p.levelPL, 0)
  const kellyROI = (kellyPL / STARTING_BANK * 100).toFixed(1)
  console.log(`Kelly P&L: ${kellyPL >= 0 ? '+' : ''}${kellyPL.toFixed(2)} units | Kelly ROI: ${kellyROI}%`)

  // PA gate comparison
  if (paGate) {
    const paPositive = allPredictions.filter(p => p.personalAffinity > 0)
    const paNegative = allPredictions.filter(p => p.personalAffinity <= 0)
    console.log(`\nPA Gate Analysis:`)
    console.log(`  PA > 0: ${paPositive.length} picks, ${paPositive.filter(p => p.won).length}W (${paPositive.length > 0 ? (paPositive.filter(p => p.won).length / paPositive.length * 100).toFixed(1) : 0}% WR)`)
    console.log(`  PA ≤ 0: ${paNegative.length} picks, ${paNegative.filter(p => p.won).length}W (${paNegative.length > 0 ? (paNegative.filter(p => p.won).length / paNegative.length * 100).toFixed(1) : 0}% WR)`)
  }

  // Engine label breakdown (dual-mode engine)
  const labelGroups = {}
  for (const p of allPredictions) {
    const label = p.engineLabel || 'NO_LABEL'
    if (!labelGroups[label]) labelGroups[label] = { total: 0, wins: 0, placed: 0, pl: 0, picks: [] }
    labelGroups[label].total++
    if (p.won) labelGroups[label].wins++
    if (p.placed) labelGroups[label].placed++
    labelGroups[label].pl += p.levelPL
    labelGroups[label].picks.push(p)
  }
  console.log(`\n--- Engine Label Breakdown ---`)
  for (const [label, g] of Object.entries(labelGroups).sort((a, b) => b[1].total - a[1].total)) {
    const wr = g.total > 0 ? (g.wins / g.total * 100).toFixed(1) : '0.0'
    const roi = g.total > 0 ? (g.pl / g.total * 100).toFixed(1) : '0.0'
    console.log(`  ${label.padEnd(20)} ${String(g.total).padStart(4)} picks, ${String(g.wins).padStart(3)}W/${String(g.placed).padStart(2)}P, WR ${wr}%, ROI ${roi}%`)
  }

  // OUTLIER trigger breakdown
  const outlierPicks = allPredictions.filter(p => p.engineLabel === 'OUTLIER')
  if (outlierPicks.length > 0) {
    const triggerGroups = {}
    for (const p of outlierPicks) {
      const reason = p.triggerReason || 'unknown'
      if (!triggerGroups[reason]) triggerGroups[reason] = { total: 0, wins: 0 }
      triggerGroups[reason].total++
      if (p.won) triggerGroups[reason].wins++
    }
    console.log(`\n--- OUTLIER Trigger Breakdown ---`)
    for (const [reason, g] of Object.entries(triggerGroups).sort((a, b) => b[1].total - a[1].total)) {
      const wr = g.total > 0 ? (g.wins / g.total * 100).toFixed(1) : '0.0'
      console.log(`  ${reason.padEnd(35)} ${String(g.total).padStart(3)} picks, ${String(g.wins).padStart(2)}W, WR ${wr}%`)
    }
  }

  // Brier score
  const brier = allPredictions.reduce((s, p) => {
    const predicted = p.winProb / 100
    const actual = p.won ? 1 : 0
    return s + (predicted - actual) ** 2
  }, 0) / n
  console.log(`\nBrier Score: ${brier.toFixed(4)} (lower is better, <0.25 is decent)`)

  // Top pick per race
  const raceTopPicks = {}
  for (const p of allPredictions) {
    if (!raceTopPicks[p.raceId] || p.winProb > raceTopPicks[p.raceId].winProb) {
      raceTopPicks[p.raceId] = p
    }
  }
  const topPicks = Object.values(raceTopPicks)
  const topPickWR = topPicks.length > 0 ? (topPicks.filter(p => p.won).length / topPicks.length * 100).toFixed(1) : '0.0'
  console.log(`Top Pick WR: ${topPickWR}% (${topPicks.filter(p => p.won).length}/${topPicks.length})`)

  // Odds band breakdown
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
    const picks = allPredictions.filter(p => p.odds >= b.min && p.odds < b.max)
    if (picks.length === 0) continue
    const w = picks.filter(p => p.won).length
    const pl = picks.reduce((s, p) => s + p.levelPL, 0)
    console.log(`  ${b.label}: ${picks.length} picks, ${w}W (${(w / picks.length * 100).toFixed(1)}% WR), ROI: ${(pl / picks.length * 100).toFixed(1)}%`)
  }

  // Calibration buckets
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
    const picks = allPredictions.filter(p => p.winProb >= b.min && p.winProb < b.max)
    if (picks.length === 0) continue
    const w = picks.filter(p => p.won).length
    const avgPred = (picks.reduce((s, p) => s + p.winProb, 0) / picks.length).toFixed(1)
    const actualWR = (w / picks.length * 100).toFixed(1)
    const error = (avgPred - actualWR).toFixed(1)
    console.log(`  ${b.label}: n=${picks.length}, avgPred=${avgPred}%, actual=${actualWR}%, error=${error}pp`)
  }

  // Write output
  const output = {
    meta: {
      label,
      fromDate,
      toDate,
      paGate,
      courseMultiplier,
      disableGoing,
      totalRaces,
      totalSelections: n,
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
    engineLabelSummary: labelGroups,
    predictions: allPredictions,
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2))
  console.log(`\nOutput: ${OUTPUT_PATH}`)

  if (db) await closeHorseDb(db)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
