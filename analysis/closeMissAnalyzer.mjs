import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const toFileUrl = (p) => new URL(`file:///${p.replace(/\\/g, '/')}`).href
const { runApexEngine } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'apexEngine.js')))
const { buildORHistory } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'classModel.js')))

const CACHE_DIR = join(ROOT, 'data', 'backtest-cache')
const RESULTS_PATH = join(ROOT, 'data', 'backtest-results-current.json')
const TRACKS_PATH = join(ROOT, 'data', 'trackProfiles.json')

const MIN_RUNNERS = 5

function loadJson(p) {
  try {
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch { return null }
}

// ── Load production databases ──
console.log('Loading databases...')
const TRACK_PROFILES = loadJson(TRACKS_PATH) || {}
const TRAINER_FORM_DB_RAW = loadJson(join(ROOT, 'data', 'trainer-form.json')) || {}
const TRAINER_FORM_DB = {}
for (const [k, v] of Object.entries(TRAINER_FORM_DB_RAW)) TRAINER_FORM_DB[k.toLowerCase()] = v
const JOCKEY_FORM_DB_RAW = loadJson(join(ROOT, 'data', 'jockey-form.json')) || {}
const JOCKEY_FORM_DB = {}
for (const [k, v] of Object.entries(JOCKEY_FORM_DB_RAW)) JOCKEY_FORM_DB[k.toLowerCase()] = v
const LEARNING_DB = loadJson(join(ROOT, 'data', 'learning.json')) || {}
const OR_HISTORY = buildORHistory(LEARNING_DB.records || [])
const LEARNING_RACES = LEARNING_DB.races || []
const MULTIPLIER = LEARNING_DB.weights?.multiplier || {}
const GOING_DB = loadJson(join(ROOT, 'data', 'going-database.json')) || {}
const DISTANCE_DB = loadJson(join(ROOT, 'data', 'distance-database.json')) || {}
console.log(`  trainer-form: ${Object.keys(TRAINER_FORM_DB).length} trainers`)
console.log(`  jockey-form: ${Object.keys(JOCKEY_FORM_DB).length} jockeys`)
console.log(`  OR history: ${Object.keys(OR_HISTORY).length} horses`)
console.log(`  goingDb: ${Object.keys(GOING_DB).length} horses`)
console.log(`  distanceDb: ${Object.keys(DISTANCE_DB).length} horses`)
console.log(`  Learning races: ${LEARNING_RACES.length}\n`)

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

// ── Effective weights on qualityAdjustedScore ──
const EFFECTIVE_WEIGHTS = {
  power:            0.150,
  orFit:            0.030,
  rprORGap:         0.020,
  finishing:        0.100,
  staminaBias:      0.090,
  ground:           0.030,
  distance:         0.030,
  paceCompat:       0.155,
  raceShape:        0.200,
  trainerForm:      0.030,
  courseAffinity:   0.0105,
  distanceAffinity: 0.009,
  goingAffinity:    0.0075,
  uncertainty:      0.000,
}

// ── Feature extraction ──
function extractFeature(runner) {
  const hq = runner.horseQuality || {}
  const nc = runner.newComponents || {}
  const cm = runner.classModel || {}
  const pa = runner.personalAffinity || {}
  const unc = runner.features?.uncertainty || {}
  const paBreak = pa.breakdown || {}
  return {
    power:            hq.power ?? 0,
    orFit:            cm.orFitScore ?? 0,
    rprORGap:         cm.rprORGap ?? 0,
    finishing:        hq.finishing?.score ?? 0,
    staminaBias:      hq.staminaBias ?? 0,
    ground:           nc.ground ?? 0,
    distance:         nc.distance ?? 0,
    paceCompat:       runner.paceCompat?.compatibility ?? 0,
    raceShape:        runner.raceShapeSuitability ?? 0,
    trainerForm:      nc.trainerForm ?? 0,
    courseAffinity:   (paBreak.track?.adjustment ?? 0) * 100,
    distanceAffinity: (paBreak.distance?.adjustment ?? 0) * 100,
    goingAffinity:    (paBreak.going?.adjustment ?? 0) * 100,
    personalAffinity: pa.adjustment ?? 0,
    uncertainty:      unc.uncertainty ?? 0,
  }
}

function median(arr) {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ── MAIN ──
async function main() {
  const results = loadJson(RESULTS_PATH)
  if (!results || !Array.isArray(results) || results.length === 0) {
    console.error('No backtest results found. Run backtest_historical.mjs first.')
    process.exit(1)
  }

  const trackData = loadJson(TRACKS_PATH)
  const trackMap = {}
  if (trackData?.tracks) {
    for (const [name, data] of Object.entries(trackData.tracks)) {
      trackMap[name.toLowerCase()] = data.trackCategory || 'unknown'
    }
  }

  // ── Step 1: Identify close misses ──
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  CLOSE MISS ANALYZER')
  console.log('═══════════════════════════════════════════════════════\n')

  console.log('Step 1: Identifying close misses...')

  const raceMap = {}
  for (const r of results) {
    const key = `${r.raceId}||${r.date}||${r.course}`
    if (!raceMap[key]) raceMap[key] = []
    raceMap[key].push(r)
  }

  const closeMisses = []
  for (const [key, runners] of Object.entries(raceMap)) {
    if (runners.length < MIN_RUNNERS) continue

    const sorted = [...runners].sort((a, b) => (b.winProb || 0) - (a.winProb || 0))
    sorted.forEach((r, i) => { r.rank = i + 1 })

    const winner = sorted.find(r => r.won)
    if (!winner || winner.rank === 1) continue

    const pick = sorted[0]
    const scoreGap = (pick.winProb || 0) - (winner.winProb || 0)

    closeMisses.push({
      raceId: pick.raceId,
      course: pick.course,
      date: pick.date,
      raceType: pick.raceType,
      fieldSize: pick.fieldSize,
      pick: {
        horse: pick.horse,
        winProb: pick.winProb,
        odds: pick.odds,
        rank: pick.rank,
      },
      winner: {
        horse: winner.horse,
        winProb: winner.winProb,
        odds: winner.odds,
        rank: winner.rank,
      },
      scoreGap,
      missSize: scoreGap < 3 ? 'tiny' : scoreGap <= 8 ? 'medium' : 'big',
    })
  }

  console.log(`  Found ${closeMisses.length} close misses (winner ranked #2-5)\n`)

  // ── Step 2: Re-run engine on close-miss races ──
  console.log('Step 2: Re-running engine on close-miss races...')

  const cacheFiles = readdirSync(CACHE_DIR)
    .filter(f => f.startsWith('results-') && f.endsWith('.json'))
    .sort()

  const cacheByDate = {}
  for (const f of cacheFiles) {
    const date = f.replace('results-', '').replace('.json', '')
    cacheByDate[date] = loadJson(join(CACHE_DIR, f))
  }

  let processed = 0
  let engineErrors = 0
  let matchFailures = 0

  for (const cm of closeMisses) {
    const cacheData = cacheByDate[cm.date]
    if (!cacheData) { engineErrors++; continue }

    const race = cacheData.find(r =>
      (r.race_id || '') === cm.raceId &&
      (r.course || '') === cm.course
    )
    if (!race) { engineErrors++; continue }

    const runners = (race.runners || []).filter(r => r.horse)
    if (runners.length < MIN_RUNNERS) { engineErrors++; continue }

    const raceType = detectRaceType(race)

    const engineRunners = runners.map(r => ({
      horse: r.horse,
      horse_id: r.horse_id || '',
      odds: decimalFromOdds(r.odds) || 0,
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

    const raceData = {
      course: race.course || '',
      off_time: '',
      date: race.date || '',
      going: race.going || '',
      distance_f: race.distance_f || '',
      race_class: race.race_class || 0,
      type: raceType === 'Jumps' ? 'Hurdle' : 'Flat',
      race_name: race.race_name || '',
      surface: '',
      field_size: runners.length,
    }

    let engineResult
    try {
      engineResult = runApexEngine(engineRunners, raceData, {
        goingDb: GOING_DB,
        distanceDb: DISTANCE_DB,
        trainerForm: TRAINER_FORM_DB,
        jockeyForm: JOCKEY_FORM_DB,
        orHistory: OR_HISTORY,
        races: LEARNING_RACES,
        multiplier: MULTIPLIER,
        trackProfiles: TRACK_PROFILES,
      })
    } catch (err) {
      engineErrors++
      continue
    }

    const preds = engineResult.racecards || []
    const predMap = {}
    for (const p of preds) {
      predMap[(p.horse || '').toLowerCase().trim()] = p
    }

    const pickPred = predMap[cm.pick.horse.toLowerCase().trim()]
    const winnerPred = predMap[cm.winner.horse.toLowerCase().trim()]

    if (!pickPred || !winnerPred) {
      matchFailures++
      continue
    }

    cm.pick.features = extractFeature(pickPred)
    cm.pick.finalScore = pickPred.finalScore || 0
    cm.winner.features = extractFeature(winnerPred)
    cm.winner.finalScore = winnerPred.finalScore || 0
    cm.scoreGap = (pickPred.finalScore || 0) - (winnerPred.finalScore || 0)
    cm.missSize = cm.scoreGap < 3 ? 'tiny' : cm.scoreGap <= 8 ? 'medium' : 'big'

    // Get track category
    const cat = trackMap[cm.course.toLowerCase()] || 'unknown'
    cm.trackCategory = cat
    cm.going = race.going || ''
    cm.raceName = race.race_name || ''

    // Compute feature ranks within this race
    const featureNames = Object.keys(EFFECTIVE_WEIGHTS)
    cm.featureRanks = {}
    for (const fn of featureNames) {
      const vals = preds
        .map(p => ({ horse: p.horse, val: (extractFeature(p))[fn] }))
        .sort((a, b) => b.val - a.val)
      cm.featureRanks[fn] = {
        winnerRank: vals.findIndex(v => v.horse === cm.winner.horse) + 1,
        pickRank: vals.findIndex(v => v.horse === cm.pick.horse) + 1,
        total: vals.length,
      }
    }

    // Simulation: would increasing weight fix this race?
    // currentGap = pickScore - winnerScore (positive = pick is ahead)
    // winnerAdvantage = (winner_value - pick_value) * weight (positive = winner has better feature)
    // If we increase weight, winner gains: newGap = currentGap - winnerAdvantage * multiplier
    const currentGap = cm.scoreGap
    cm.wouldFix = {}
    for (const fn of featureNames) {
      const w = EFFECTIVE_WEIGHTS[fn]
      if (w === 0) { cm.wouldFix[fn] = 0; continue }

      const winnerAdv = ((cm.winner.features[fn] || 0) - (cm.pick.features[fn] || 0)) * w
      let fixedAt = 0
      for (const mult of [1, 2, 3]) {
        if (fixedAt > 0) break
        const newGap = currentGap - winnerAdv * mult
        if (newGap < 0) fixedAt = mult
      }
      cm.wouldFix[fn] = fixedAt
    }

    processed++
  }

  console.log(`  Processed: ${processed}/${closeMisses.length} | Engine errors: ${engineErrors} | Match failures: ${matchFailures}\n`)

  if (processed === 0) {
    console.error('No races processed. Check cache files and engine.')
    process.exit(1)
  }

  const featureNames = Object.keys(EFFECTIVE_WEIGHTS)

  // ══════════════════════════════════════════════════
  // SECTION 1: MISS SIZE DISTRIBUTION
  // ══════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════')
  console.log('SECTION 1: MISS SIZE DISTRIBUTION')
  console.log('═══════════════════════════════════════════════════════\n')

  const missSizes = { tiny: 0, medium: 0, big: 0 }
  for (const cm of closeMisses) missSizes[cm.missSize]++

  const tinyPct = (missSizes.tiny / closeMisses.length * 100).toFixed(1)
  const medPct = (missSizes.medium / closeMisses.length * 100).toFixed(1)
  const bigPct = (missSizes.big / closeMisses.length * 100).toFixed(1)

  console.log(`  Tiny miss  (<3 pts):   ${missSizes.tiny} (${tinyPct}%)  ← calibration issue`)
  console.log(`  Medium miss (3-8 pts): ${missSizes.medium} (${medPct}%)  ← weighting issue`)
  console.log(`  Big miss    (>8 pts):  ${missSizes.big} (${bigPct}%)  ← major error\n`)

  // ══════════════════════════════════════════════════
  // SECTION 2: FEATURE RANK COMPARISON
  // ══════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════')
  console.log('SECTION 2: FEATURE RANK COMPARISON')
  console.log('═══════════════════════════════════════════════════════\n')
  console.log('  What % of winners were ranked #1, top-3, top-5 by each feature alone?')
  console.log('  "Avg Rank Gap" = pickRank - winnerRank (positive = winner ranks higher)\n')

  const rankData = []
  for (const fn of featureNames) {
    let winnerFirst = 0, winnerTop3 = 0, winnerTop5 = 0
    let totalGap = 0
    for (const cm of closeMisses) {
      if (!cm.featureRanks?.[fn]) continue
      const wr = cm.featureRanks[fn].winnerRank
      if (wr === 1) winnerFirst++
      if (wr <= 3) winnerTop3++
      if (wr <= 5) winnerTop5++
      totalGap += cm.featureRanks[fn].pickRank - wr
    }
    const n = closeMisses.length
    rankData.push({
      feature: fn,
      winnerFirst: (winnerFirst / n * 100).toFixed(0),
      winnerTop3: (winnerTop3 / n * 100).toFixed(0),
      winnerTop5: (winnerTop5 / n * 100).toFixed(0),
      avgRankGap: (totalGap / n).toFixed(1),
    })
  }

  rankData.sort((a, b) => parseFloat(b.winnerTop3) - parseFloat(a.winnerTop3))

  console.log('  #  Feature        Winner#1  WinnerTop3  WinnerTop5  AvgRankGap')
  console.log('  ── ────────────── ───────── ─────────── ─────────── ──────────')
  for (let i = 0; i < rankData.length; i++) {
    const r = rankData[i]
    const num = String(i + 1).padStart(2)
    const name = r.feature.padEnd(13)
    console.log(`  ${num} ${name} ${r.winnerFirst.padStart(6)}%  ${r.winnerTop3.padStart(8)}%  ${r.winnerTop5.padStart(8)}%  ${r.avgRankGap.padStart(8)}`)
  }
  console.log()

  // ══════════════════════════════════════════════════
  // SECTION 3: WOULD HAVE FIXED THE RACE
  // ══════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════')
  console.log('SECTION 3: WOULD HAVE FIXED THE RACE')
  console.log('═══════════════════════════════════════════════════════\n')
  console.log('  If we increase this feature\'s weight, how many races get fixed?\n')

  const fixData = []
  for (const fn of featureNames) {
    let fixed1 = 0, fixed2 = 0, fixed3 = 0
    for (const cm of closeMisses) {
      if (cm.wouldFix?.[fn] === 1) fixed1++
      if (cm.wouldFix?.[fn] <= 2 && cm.wouldFix?.[fn] > 0) fixed2++
      if (cm.wouldFix?.[fn] <= 3 && cm.wouldFix?.[fn] > 0) fixed3++
    }
    fixData.push({
      feature: fn,
      fixed1,
      fixed2,
      fixed3,
      notFixable: closeMisses.length - fixed3,
    })
  }

  fixData.sort((a, b) => b.fixed2 - a.fixed2)

  console.log('  Feature         Fixed@1x  Fixed@2x  Fixed@3x  NotFixable')
  console.log('  ─────────────── ───────── ───────── ───────── ──────────')
  for (const f of fixData) {
    const name = f.feature.padEnd(15)
    console.log(`  ${name} ${String(f.fixed1).padStart(8)}  ${String(f.fixed2).padStart(8)}  ${String(f.fixed3).padStart(8)}  ${String(f.notFixable).padStart(9)}`)
  }
  console.log()

  // ══════════════════════════════════════════════════
  // SECTION 4: GLOBAL FEATURE COMPARISON
  // ══════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════')
  console.log('SECTION 4: GLOBAL FEATURE COMPARISON')
  console.log('═══════════════════════════════════════════════════════\n')
  console.log('  Raw value comparison: winner vs #1 pick\n')

  const compareData = []
  for (const fn of featureNames) {
    let winnerBetter = 0, pickBetter = 0, tie = 0
    let totalGap = 0
    const gaps = []
    for (const cm of closeMisses) {
      const wv = cm.winner.features?.[fn] ?? 0
      const pv = cm.pick.features?.[fn] ?? 0
      if (wv > pv) winnerBetter++
      else if (pv > wv) pickBetter++
      else tie++
      totalGap += wv - pv
      gaps.push(wv - pv)
    }
    const n = closeMisses.length
    compareData.push({
      feature: fn,
      winnerBetterPct: (winnerBetter / n * 100).toFixed(0),
      pickBetterPct: (pickBetter / n * 100).toFixed(0),
      tiePct: (tie / n * 100).toFixed(0),
      avgGap: (totalGap / n).toFixed(1),
      medianGap: median(gaps).toFixed(1),
    })
  }

  compareData.sort((a, b) => parseFloat(b.winnerBetterPct) - parseFloat(a.winnerBetterPct))

  console.log('  #  Feature        WinnerBetter  #1Better  Tie   AvgGap  MedianGap')
  console.log('  ── ────────────── ───────────── ───────── ──── ─────── ─────────')
  for (let i = 0; i < compareData.length; i++) {
    const c = compareData[i]
    const num = String(i + 1).padStart(2)
    const name = c.feature.padEnd(13)
    const avgSign = parseFloat(c.avgGap) >= 0 ? '+' : ''
    const medSign = parseFloat(c.medianGap) >= 0 ? '+' : ''
    console.log(`  ${num} ${name} ${c.winnerBetterPct.padStart(9)}%  ${c.pickBetterPct.padStart(7)}%  ${c.tiePct.padStart(3)}%  ${avgSign}${c.avgGap.padStart(6)}  ${medSign}${c.medianGap.padStart(7)}`)
  }
  console.log()

  // ══════════════════════════════════════════════════
  // SECTION 5: WEIGHT-ADJUSTED IMPACT
  // ══════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════')
  console.log('SECTION 5: WEIGHT-ADJUSTED IMPACT')
  console.log('═══════════════════════════════════════════════════════\n')
  console.log('  Feature × effective weight = actual score impact lost\n')

  const impactData = []
  for (const fn of featureNames) {
    const w = EFFECTIVE_WEIGHTS[fn]
    let totalImpact = 0
    for (const cm of closeMisses) {
      const wv = cm.winner.features?.[fn] ?? 0
      const pv = cm.pick.features?.[fn] ?? 0
      totalImpact += (wv - pv) * w
    }
    impactData.push({
      feature: fn,
      avgImpact: (totalImpact / closeMisses.length).toFixed(2),
      weight: w,
    })
  }

  impactData.sort((a, b) => parseFloat(b.avgImpact) - parseFloat(a.avgImpact))

  console.log('  Feature         AvgImpactLost  Weight')
  console.log('  ─────────────── ────────────── ───────')
  for (const d of impactData) {
    const name = d.feature.padEnd(15)
    const sign = parseFloat(d.avgImpact) >= 0 ? '+' : ''
    console.log(`  ${name} ${sign}${d.avgImpact.padStart(12)}  ${d.weight}`)
  }
  console.log()

  // ══════════════════════════════════════════════════
  // SECTION 6: TRACK CATEGORY BREAKDOWN
  // ══════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════')
  console.log('SECTION 6: TRACK CATEGORY BREAKDOWN')
  console.log('═══════════════════════════════════════════════════════\n')

  const categories = ['tactical', 'galloping', 'stamina', 'specialist']
  for (const cat of categories) {
    const catRaces = closeMisses.filter(cm => cm.trackCategory === cat)
    if (catRaces.length === 0) continue

    console.log(`  ${cat.toUpperCase()} (${catRaces.length} races)`)

    // Winner better % for top features
    const feats = ['finishing', 'power', 'paceCompat', 'staminaBias', 'ground', 'raceShape', 'courseAffinity', 'distanceAffinity', 'goingAffinity']
    const parts = []
    for (const fn of feats) {
      let wb = 0
      for (const cm of catRaces) {
        const wv = cm.winner.features?.[fn] ?? 0
        const pv = cm.pick.features?.[fn] ?? 0
        if (wv > pv) wb++
      }
      parts.push(`${fn} ${(wb / catRaces.length * 100).toFixed(0)}%`)
    }
    console.log(`    Winner Better: ${parts.join(', ')}`)

    // Would fix @2x for top features
    const fixParts = []
    for (const fn of feats) {
      let fixed2 = 0
      for (const cm of catRaces) {
        if (cm.wouldFix?.[fn] > 0 && cm.wouldFix?.[fn] <= 2) fixed2++
      }
      fixParts.push(`${fn} ${fixed2}`)
    }
    console.log(`    Would Fix@2x:  ${fixParts.join(', ')}`)
    console.log()
  }

  // ══════════════════════════════════════════════════
  // SECTION 7: ODDS BAND BREAKDOWN
  // ══════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════')
  console.log('SECTION 7: ODDS BAND BREAKDOWN')
  console.log('═══════════════════════════════════════════════════════\n')

  const oddsBands = [
    { label: '2/1–5/1', min: 2, max: 6 },
    { label: '6/1–10/1', min: 6, max: 11 },
    { label: '11/1–20/1', min: 11, max: 21 },
    { label: '20/1+', min: 21, max: Infinity },
  ]

  for (const band of oddsBands) {
    const bandRaces = closeMisses.filter(cm =>
      cm.winner.odds >= band.min && cm.winner.odds < band.max
    )
    if (bandRaces.length === 0) continue

    console.log(`  ${band.label} (${bandRaces.length} races)`)

    const feats = ['finishing', 'power', 'paceCompat', 'staminaBias', 'ground', 'courseAffinity', 'distanceAffinity', 'goingAffinity']
    const parts = []
    for (const fn of feats) {
      let wb = 0
      for (const cm of bandRaces) {
        const wv = cm.winner.features?.[fn] ?? 0
        const pv = cm.pick.features?.[fn] ?? 0
        if (wv > pv) wb++
      }
      parts.push(`${fn} ${(wb / bandRaces.length * 100).toFixed(0)}%`)
    }
    console.log(`    Winner Better: ${parts.join(', ')}`)
    console.log()
  }

  // ══════════════════════════════════════════════════
  // SECTION 8: CONDITION PIVOTS
  // ══════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════')
  console.log('SECTION 8: CONDITION PIVOTS')
  console.log('═══════════════════════════════════════════════════════\n')

  const pivots = [
    { label: 'Handicaps only', filter: cm => /handicap/i.test(cm.raceName) },
    { label: 'Non-handicaps', filter: cm => !/handicap/i.test(cm.raceName) },
    { label: 'Heavy ground', filter: cm => /heavy|hvy/i.test(cm.going) },
    { label: 'Soft ground', filter: cm => /soft|sft/i.test(cm.going) },
    { label: 'Good ground', filter: cm => /good|gd/i.test(cm.going) && !/soft|heavy/i.test(cm.going) },
    { label: '12+ runners', filter: cm => cm.fieldSize >= 12 },
    { label: 'Small fields (<8)', filter: cm => cm.fieldSize < 8 },
  ]

  for (const pivot of pivots) {
    const filtered = closeMisses.filter(pivot.filter)
    if (filtered.length < 5) continue

    const feats = ['finishing', 'power', 'paceCompat', 'staminaBias', 'ground', 'courseAffinity', 'distanceAffinity', 'goingAffinity']
    const parts = []
    for (const fn of feats) {
      let wb = 0
      for (const cm of filtered) {
        const wv = cm.winner.features?.[fn] ?? 0
        const pv = cm.pick.features?.[fn] ?? 0
        if (wv > pv) wb++
      }
      parts.push(`${fn} ${(wb / filtered.length * 100).toFixed(0)}%`)
    }
    console.log(`  ${pivot.label} (${filtered.length} races): ${parts.join(', ')}`)
  }
  console.log()

  // ══════════════════════════════════════════════════
  // SECTION 9: TOP 20 BIGGEST LOSSES
  // ══════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════')
  console.log('SECTION 9: TOP 20 BIGGEST LOSSES')
  console.log('═══════════════════════════════════════════════════════\n')
  console.log('  Individual races where model missed most badly\n')

  const top20 = [...closeMisses]
    .sort((a, b) => Math.abs(b.scoreGap) - Math.abs(a.scoreGap))
    .slice(0, 20)

  for (let i = 0; i < top20.length; i++) {
    const cm = top20[i]
    const gapSign = cm.scoreGap >= 0 ? '+' : ''
    console.log(`  ${String(i + 1).padStart(2)}. ${cm.course} ${cm.date} | ${cm.raceName}`)
    console.log(`      Pick: ${cm.pick.horse} (score ${cm.pick.finalScore}) | Winner: ${cm.winner.horse} (score ${cm.winner.finalScore}) | Gap: ${gapSign}${cm.scoreGap.toFixed(1)}`)

    // Feature diffs where winner beat pick
    const diffs = []
    for (const fn of featureNames) {
      const wv = cm.winner.features?.[fn] ?? 0
      const pv = cm.pick.features?.[fn] ?? 0
      const diff = wv - pv
      if (Math.abs(diff) > 1) {
        diffs.push(`${fn} ${diff > 0 ? '+' : ''}${diff.toFixed(0)}`)
      }
    }
    if (diffs.length > 0) {
      console.log(`      Winner beat pick: ${diffs.join(', ')}`)
    }
    console.log()
  }

  // ══════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════')
  console.log('SUMMARY: TOP 3 WEAKNESSES')
  console.log('═══════════════════════════════════════════════════════\n')

  const topWeaknesses = fixData.slice(0, 3)
  for (let i = 0; i < topWeaknesses.length; i++) {
    const w = topWeaknesses[i]
    const comp = compareData.find(c => c.feature === w.feature)
    console.log(`  ${i + 1}. ${w.feature}:`)
    console.log(`     Winner better ${comp?.winnerBetterPct || '?'}% of the time`)
    console.log(`     Could fix ${w.fixed2} races at 2x weight, ${w.fixed3} at 3x weight`)
    console.log()
  }

  const negSignal = impactData.filter(d => parseFloat(d.avgImpact) < 0)
  if (negSignal.length > 0) {
    console.log('  NEGATIVE SIGNALS (over-rewarded):')
    for (const d of negSignal) {
      console.log(`     ${d.feature}: winner had LOWER value ${compareData.find(c => c.feature === d.feature)?.pickBetterPct || '?'}% of the time (impact: ${d.avgImpact})`)
    }
    console.log()
  }

  console.log('═══════════════════════════════════════════════════════')
  console.log(`  Processed: ${processed} | Errors: ${engineErrors} | Match failures: ${matchFailures}`)
  console.log('═══════════════════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
