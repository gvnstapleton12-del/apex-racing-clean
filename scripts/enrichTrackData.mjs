#!/usr/bin/env node
/**
 * enrichTrackData.mjs
 *
 * Backward-looking data enrichment — lightweight Playwright approach.
 * Loads SL results page via Playwright (reliable TLS), extracts race-level
 * structural fields (going, race_class, distance) from __NEXT_DATA__.
 * Skips per-race API calls — one browser page load per date.
 *
 * Usage:
 *   node scripts/enrichTrackData.mjs --from 2024-08-01 --to 2024-08-31
 *   node scripts/enrichTrackData.mjs --from 2025-06-01 --dry-run
 *   node scripts/enrichTrackData.mjs --from 2025-06-01 --to 2025-06-07 --limit 3
 */

import { chromium } from 'playwright'
import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { parseArgs } from 'util'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DB_PATH = join(__dirname, '../data/apex-horses.db')

const { values } = parseArgs({
  options: {
    from:      { type: 'string', default: '' },
    to:        { type: 'string', default: '' },
    limit:     { type: 'string', default: '999999' },
    delay:     { type: 'string', default: '1200' },
    'dry-run': { type: 'boolean', default: false },
    verbose:   { type: 'boolean', default: false },
  },
})

const FROM_DATE  = values.from || ''
const TO_DATE    = values.to || ''
const LIMIT      = parseInt(values.limit, 10) || 999999
const DELAY_MS   = parseInt(values.delay, 10) || 1200
const DRY_RUN    = values['dry-run']
const VERBOSE    = values.verbose

let totalUpdated = 0
let totalSkipped = 0
let totalErrors  = 0

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── UK/IRE course slugs ─────────────────────────────────────────────────────
const UK_IRE_SLUGS = new Set([
  'ascot','ayr','aintree','bath','beverley','brighton','bangor-on-dee','ballinrobe','bellewstown',
  'cartmel','carlisle','cheltenham','chester','catterick','chepstow','chelmsford-city',
  'clonmel','cork','curragh','doncaster','down-royal','downpatrick','dundalk',
  'epsom','exeter','fairyhouse','fakenham','ffos-las','fontwell',
  'goodwood','galway','gowran-park','hamilton','haydock','hereford','hexham','huntingdon',
  'kelso','kempton','kilkenny','kilbeggan','killarney',
  'leicester','lingfield','laytown','leopardstown','listowel','limerick','ludlow',
  'market-rasen','musselburgh',
  'newbury','newcastle','newmarket','newton-abbot','northam','nottingham',
  'plumpton','pontefract','perth','punchestown',
  'redcar','ripon','roscommon','royal-ascot',
  'sandown','sedgefield','sligo','southwell','stratford','salisbury',
  'taunton','thirsk','thurles','tipperary','tramore',
  'uttoxeter','uttoxeter',
  'wetherby','wolverhampton','worcester','windsor','warwick','wexford','wincanton',
  'great-yarmouth','yarmouth','york',
  'bangor-on-dee','limerick',
])

// ── Course name normalization ────────────────────────────────────────────────
const SL_TO_DB_ALIAS = {
  'epsom-downs': 'epsom',
  'the-curragh': 'curragh',
  'the-down-royal': 'down-royal',
  'down-royal': 'down-royal',
}

function normalizeCourse(raw) {
  let slug = (raw || '')
    .toLowerCase()
    .replace(/^gb\s*\/\s*/, '')   // GB / Wolverhampton → wolverhampton
    .replace(/^ire\s*\/\s*/, '')   // IRE / Dundalk → dundalk
    .replace(/['']/g, '')
    .replace(/\s+/g, '-')
    .replace(/^royal-/, '')     // royal-ascot → ascot (matches SL)
    .replace(/-downs$/, '')     // epsom-downs → epsom
    .replace(/-park$/, '')      // gowran-park → gowran
    .replace(/-down-royal/, 'down-royal')
    .trim()

  if (SL_TO_DB_ALIAS[slug]) slug = SL_TO_DB_ALIAS[slug]
  return slug
}

// ── Fetch race-level data from SL results page ───────────────────────────────
async function fetchRaceLevelData(page, dateStr, retries = 2) {
  const url = `https://www.sportinglife.com/racing/results/${dateStr}`

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      break
    } catch (err) {
      if (attempt < retries) {
        console.log(`    ↻ ${dateStr} — retry ${attempt + 1}/${retries} (${err.message.split('\n')[0]})`)
        await sleep(3000)
      } else {
        throw err
      }
    }
  }

  const nextData = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__')
    return el ? JSON.parse(el.textContent) : null
  })

  if (!nextData) return []

  const rawMeetings = nextData?.props?.pageProps?.meetings
  let meetings
  if (Array.isArray(rawMeetings)) {
    meetings = rawMeetings
  } else {
    const ppKeys = Object.keys(nextData?.props?.pageProps || {})
    console.log(`  ✗ ${dateStr} — meetings type: ${typeof rawMeetings}, pageProps keys: [${ppKeys.join(', ')}]`)
    meetings = rawMeetings?.edges?.map(e => e.node)
      || rawMeetings?.nodes
      || rawMeetings?.data
      || rawMeetings?.items
      || (Array.isArray(rawMeetings?.results) ? rawMeetings.results : null)
      || []
  }
  const races = []

  for (const meeting of meetings) {
    const ms = meeting.meeting_summary
    const courseName = ms?.course?.name || ''
    const country = ms?.course?.country?.short_name || ''
    const slug = normalizeCourse(courseName)

    const isUkIre = ['ENG','Wales','WLS','NIR','Eire','IRE','GB','Ireland','SCO','Scotland','Scot','Wale'].includes(country)
      || UK_IRE_SLUGS.has(slug)
    if (!isUkIre) continue

    for (const race of (meeting.races || [])) {
      races.push({
        course: courseName,
        courseSlug: slug,
        going: race.going || '',
        race_class: race.race_class || 0,
        distance: race.distance || '',
        race_name: race.name || '',
        off_time: race.off_time || race.time || '',
      })
    }
  }
  return races
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║   APEX Track Data Enrichment             ║')
  console.log('╚══════════════════════════════════════════╝')

  if (!FROM_DATE) {
    console.error('\nUsage: node scripts/enrichTrackData.mjs --from YYYY-MM-DD --to YYYY-MM-DD')
    console.error('  --from       Start date (required)')
    console.error('  --to         End date (default: same as from)')
    console.error('  --limit      Max dates to process (default: unlimited)')
    console.error('  --delay      Ms between dates (default: 1200)')
    console.error('  --dry-run    Show what would be updated without writing')
    console.error('  --verbose    Show per-row details')
    process.exit(1)
  }

  const toDate = TO_DATE || FROM_DATE

  // Build date list
  const dates = []
  const cur = new Date(FROM_DATE + 'T00:00:00Z')
  const end = new Date(toDate + 'T00:00:00Z')
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  const dateSlice = dates.slice(0, LIMIT)

  console.log(`  Range: ${dateSlice[0]} → ${dateSlice[dateSlice.length - 1]} (${dateSlice.length} dates)`)
  console.log(`  Delay: ${DELAY_MS}ms | Dry run: ${DRY_RUN}\n`)

  // Open DB
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database })
  await db.exec('PRAGMA journal_mode=WAL')
  await db.exec('PRAGMA synchronous=NORMAL')

  // Launch browser
  console.log('[Enrich] Launching Chromium...')
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', '--no-proxy-server', '--ignore-certificate-errors',
      '--disable-features=NetworkService', '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
  })
  const page = await browser.newPage()
  console.log('[Enrich] Browser ready\n')

  // Count before
  const before = await db.get(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN going != '' AND going IS NOT NULL THEN 1 ELSE 0 END) as has_going,
      SUM(CASE WHEN race_class != '' AND race_class IS NOT NULL THEN 1 ELSE 0 END) as has_class,
      SUM(CASE WHEN distance != '' AND distance IS NOT NULL THEN 1 ELSE 0 END) as has_distance
    FROM horse_runs WHERE race_date BETWEEN ? AND ?
  `, [dateSlice[0], dateSlice[dateSlice.length - 1]])
  console.log(`  Before: ${before.total} rows | Going: ${before.has_going} | Class: ${before.has_class} | Distance: ${before.has_distance}\n`)

  // ── Process each date ──────────────────────────────────────────────────
  for (let di = 0; di < dateSlice.length; di++) {
    const date = dateSlice[di]

    let races
    try {
      races = await fetchRaceLevelData(page, date)
    } catch (err) {
      console.log(`  ✗ ${date} — SL fetch failed: ${err.message}`)
      totalErrors++
      await sleep(DELAY_MS)
      continue
    }

    if (races.length === 0) {
      console.log(`  · ${date} — no UK/IRE races from SL`)
      totalSkipped++
      await sleep(DELAY_MS)
      continue
    }

    // Build course→race lookup
    const raceByCourse = {}
    for (const race of races) {
      raceByCourse[normalizeCourse(race.course)] = race
    }

    // Find DB rows needing enrichment
    const rows = await db.all(`
      SELECT id, horse_name, course, going, race_class, distance
      FROM horse_runs
      WHERE race_date = ?
        AND (going = '' OR going IS NULL
             OR race_class = '' OR race_class IS NULL
             OR distance = '' OR distance IS NULL)
    `, [date])

    if (rows.length === 0) {
      console.log(`  · ${date} — ${races.length} races, all rows already enriched`)
      totalSkipped++
      await sleep(DELAY_MS)
      continue
    }

    let dateUpdated = 0
    let dateMatched = 0

    for (const row of rows) {
      const courseKey = normalizeCourse(row.course)
      const race = raceByCourse[courseKey]
      if (!race) {
        if (VERBOSE) console.log(`    ✗ ${row.horse_name} (${row.course}) — no SL match`)
        continue
      }
      dateMatched++

      const sets = []
      const params = []

      if ((!row.going || row.going === '') && race.going) {
        sets.push('going = ?'); params.push(race.going)
      }
      if ((!row.race_class || row.race_class === '') && race.race_class) {
        sets.push('race_class = ?'); params.push(String(race.race_class))
      }
      if ((!row.distance || row.distance === '') && race.distance) {
        sets.push('distance = ?'); params.push(race.distance)
        const fMatch = String(race.distance).match(/^(\d+)/)
        if (fMatch) {
          const raw = parseInt(fMatch[1], 10)
          const furlongs = String(race.distance).includes('f') ? raw : raw * 8
          sets.push('distance_furlongs = ?'); params.push(furlongs)
        }
      }

      if (sets.length === 0) continue

      params.push(row.id)
      if (DRY_RUN) {
        if (VERBOSE) console.log(`    ${row.horse_name} (${row.course}) — ${sets.map(s => s.replace(' = ?','')).join(', ')}`)
      } else {
        await db.run(`UPDATE horse_runs SET ${sets.join(', ')} WHERE id = ?`, params)
      }
      dateUpdated++
      totalUpdated++
    }

    console.log(`  ${dateUpdated > 0 ? '✓' : '·'} ${date} — ${races.length} races, ${dateMatched} matched, ${dateUpdated}/${rows.length} rows updated`)
    await sleep(DELAY_MS)
  }

  // Close browser
  await browser.close()

  // After summary
  const after = await db.get(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN going != '' AND going IS NOT NULL THEN 1 ELSE 0 END) as has_going,
      SUM(CASE WHEN race_class != '' AND race_class IS NOT NULL THEN 1 ELSE 0 END) as has_class,
      SUM(CASE WHEN distance != '' AND distance IS NOT NULL THEN 1 ELSE 0 END) as has_distance
    FROM horse_runs WHERE race_date BETWEEN ? AND ?
  `, [dateSlice[0], dateSlice[dateSlice.length - 1]])

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║   Enrichment Complete                    ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log(`  Dates processed: ${dateSlice.length}`)
  console.log(`  Rows updated:    ${totalUpdated}`)
  console.log(`  Dates skipped:   ${totalSkipped}`)
  console.log(`  Errors:          ${totalErrors}`)
  const pct = (v, t) => t > 0 ? ((v / t) * 100).toFixed(1) : '0.0'
  console.log(`\n  Coverage after:`)
  console.log(`    Going:    ${after.has_going}/${after.total} (${pct(after.has_going, after.total)}%)`)
  console.log(`    Class:    ${after.has_class}/${after.total} (${pct(after.has_class, after.total)}%)`)
  console.log(`    Distance: ${after.has_distance}/${after.total} (${pct(after.has_distance, after.total)}%)`)
  if (DRY_RUN) console.log('\n  ⚠ DRY RUN — no data was written')

  await db.close()
}

main().catch(err => {
  console.error('[Enrich] Fatal:', err)
  process.exit(1)
})
