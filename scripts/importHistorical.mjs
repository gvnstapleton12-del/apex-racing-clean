#!/usr/bin/env node
/**
 * Historical Data Importer — Public Betfair Promo Directory
 *
 * Fetches daily CSV files from Betfair's free, public promo directory.
 * No login or account required.
 *
 * URL pattern: https://promo.betfair.com/betfairsp/prices/dwbfpricesukwin{DDMMYYYY}.csv
 *
 * CSV columns: event_id, menu_hint, event_name, event_dt, selection_id,
 *   selection_name, win_lose, bsp, ppwap, morningwap, ppmax, ppmin,
 *   ipmax, ipmin, morningtradedvol, pptradedvol, iptradedvol
 *
 * Usage:
 *   node scripts/importHistorical.mjs --from 2021-06-01 --to 2021-06-30
 *   node scripts/importHistorical.mjs --from 2023-01-01 --to 2023-12-31 --dry-run
 *   node scripts/importHistorical.mjs --date 2024-06-15
 *
 * Data inserted into horse_runs table (limited fields from Betfair CSV).
 * For full form data (going, distance, class, draw), use SL scraper for recent dates.
 */

import { mkdir, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DB_PATH = join(ROOT, 'data/apex-horses.db')
const CSV_CACHE_DIR = join(ROOT, 'data/historical')

const BASE_URL = 'https://promo.betfair.com/betfairsp/prices'
const DELAY_MS = 500 // polite delay between requests

// Parse CLI args
const args = process.argv.slice(2)
let fromDate = null
let toDate = null
let singleDate = null
let dryRun = false
let maxDays = Infinity

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--from' && args[i + 1]) fromDate = args[++i]
  if (args[i] === '--to' && args[i + 1]) toDate = args[++i]
  if (args[i] === '--date' && args[i + 1]) singleDate = args[++i]
  if (args[i] === '--dry-run') dryRun = true
  if (args[i] === '--max' && args[i + 1]) maxDays = parseInt(args[++i])
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function formatDate(d) {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return { ddmmmyyyy: `${dd}${mm}${yyyy}`, iso: `${yyyy}-${mm}-${dd}` }
}

function generateDateRange(from, to) {
  const dates = []
  const current = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  while (current <= end) {
    dates.push(formatDate(new Date(current)))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

// Parse CSV line handling quoted fields
function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
    current += ch
  }
  result.push(current.trim())
  return result
}

// Parse event_dt "22-06-2026 20:20" → "2026-06-22"
function parseEventDate(dt) {
  if (!dt) return ''
  const parts = dt.split(' ')[0].split('-')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return ''
}

// Parse event_dt time "22-06-2026 20:20" → "20:20"
function parseEventTime(dt) {
  if (!dt) return ''
  return (dt.split(' ')[1] || '').slice(0, 5)
}

// Extract course from menu_hint "Windsor 22nd Jun" → "Windsor"
function parseCourse(hint) {
  if (!hint) return ''
  // Remove trailing date patterns like "22nd Jun", "22 Jun", "22nd June"
  return hint.replace(/\s+\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*$/i, '').trim()
}

// Extract distance and race type from event_name "5f Hcap" or "1m4f Class Stks"
function parseEventMeta(name) {
  if (!name) return { distance: '', raceType: '', raceClass: '' }
  const distMatch = name.match(/(\d+f|\d+m\d*f?|\d+m)/i)
  const distance = distMatch ? distMatch[1] : ''
  const isHandicap = /hcap|handicap/i.test(name)
  const isNovice = /nov|novice/i.test(name)
  const isMaiden = /mdn|maiden/i.test(name)
  let raceClass = ''
  const classMatch = name.match(/class\s*(\d)/i)
  if (classMatch) raceClass = classMatch[1]
  const raceType = isHandicap ? 'Handicap' : isNovice ? 'Novice' : isMaiden ? 'Maiden' : ''
  return { distance, raceType, raceClass }
}

// Distance string to furlongs
function distanceToFurlongs(dist) {
  if (!dist) return 0
  dist = dist.toLowerCase()
  let total = 0
  const mileMatch = dist.match(/(\d+)\s*m/)
  const furMatch = dist.match(/(\d+)\s*f/)
  if (mileMatch) total += parseInt(mileMatch[1]) * 8
  if (furMatch) total += parseInt(furMatch[1])
  return total
}

async function fetchCsv(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; APEX-Backtest/1.0)' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      if (res.status !== 404) console.log(`  HTTP ${res.status} for ${url}`)
      return null
    }
    const text = await res.text()
    if (!text || text.trim().length < 10) {
      return null
    }
    return text
  } catch (e) {
    console.log(`  Fetch error: ${e.message}`)
    return null
  }
}

// File types: UK Win + Ireland Win only (horse racing)
const FILE_TYPES = [
  { key: 'uk', prefix: 'dwbfpricesukwin', label: 'UK Win' },
  { key: 'ire', prefix: 'dwbfpricesirewin', label: 'Ireland Win' },
]

async function processCsvContent(csvContent, dateStr, stats) {
  const lines = csvContent.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const records = []
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''))

  // Build column index map
  const colIdx = {}
  headers.forEach((h, i) => { colIdx[h] = i })

  for (let i = 1; i < lines.length; i++) {
    try {
      const cols = parseCsvLine(lines[i])
      if (cols.length < 6) continue

      const menuHint = cols[colIdx.menu_hint] || ''
      const eventName = cols[colIdx.event_name] || ''
      const eventDt = cols[colIdx.event_dt] || ''
      const horseName = cols[colIdx.selection_name] || ''
      const winLose = parseInt(cols[colIdx.win_lose]) || 0
      const bsp = parseFloat(cols[colIdx.bsp]) || 0

      if (!horseName || !menuHint) continue

      const raceDate = parseEventDate(eventDt) || dateStr
      const raceTime = parseEventTime(eventDt)
      const course = parseCourse(menuHint)
      const { distance, raceType, raceClass } = parseEventMeta(eventName)
      const eventId = cols[colIdx.event_id] || ''

      // Group by race (event_id + date)
      const raceKey = `${eventId}|${raceDate}`
      if (!stats.raceMap[raceKey]) {
        stats.raceMap[raceKey] = { course, date: raceDate, time: raceTime, eventName, runners: 0, eventId }
      }
      stats.raceMap[raceKey].runners++

      records.push({
        horse_name: horseName,
        course,
        race_date: raceDate,
        race_time: raceTime,
        distance,
        distance_furlongs: distanceToFurlongs(distance),
        race_type: raceType,
        race_class: raceClass,
        position: winLose === 1 ? 1 : 0, // Only know winner vs loser from Betfair CSV
        won: winLose === 1,
        sp_odds: bsp,
        event_id: eventId,
        field_size: 0, // Will be filled after grouping
      })

      stats.totalRows++
      if (winLose === 1) stats.wins++
    } catch {
      stats.parseErrors++
    }
  }

  // Fill field_size per race
  for (const raceKey of Object.keys(stats.raceMap)) {
    const race = stats.raceMap[raceKey]
    for (const rec of records) {
      if (rec.event_id === race.eventId && rec.race_date === race.date) {
        rec.field_size = race.runners
      }
    }
  }

  return records
}

async function bulkInsert(db, records) {
  let saved = 0
  let errors = 0
  await db.exec('BEGIN TRANSACTION')
  for (const r of records) {
    try {
      await db.run(`
        INSERT OR IGNORE INTO horse_runs
        (horse_name, horse_id, race_date, course, distance, distance_furlongs, going, race_class, field_size, finish_position, starting_price, trainer, jockey, or_rating, rpr_rating)
        VALUES (?, '', ?, ?, ?, ?, '', ?, ?, ?, ?, '', '', 0, 0)
      `, [
        r.horse_name, r.race_date, r.course, r.distance, r.distance_furlongs,
        r.race_class, r.field_size, r.position, r.sp_odds,
      ])
      saved++
    } catch (e) {
      errors++
      if (errors <= 3) console.log(`  Insert error: ${e.message}`)
    }
  }
  await db.exec('COMMIT')
  if (errors > 0 && errors === records.length) console.log(`  All ${errors} inserts failed — check schema`)
  return saved
}

async function main() {
  let dates = []
  if (singleDate) {
    dates = [formatDate(new Date(singleDate))]
  } else if (fromDate && toDate) {
    dates = generateDateRange(fromDate, toDate)
  } else {
    // Default: last 30 days (UTC-safe)
    const now = new Date()
    const to = now.toISOString().slice(0, 10)
    const fromObj = new Date(now)
    fromObj.setUTCDate(fromObj.getUTCDate() - 30)
    const from = fromObj.toISOString().slice(0, 10)
    dates = generateDateRange(from, to)
  }

  dates = dates.slice(0, maxDays)
  console.log(`[Import] Processing ${dates.length} dates from ${dates[0]?.iso} to ${dates[dates.length - 1]?.iso}`)
  if (dryRun) console.log('[Import] DRY RUN — no data will be written')

  await mkdir(CSV_CACHE_DIR, { recursive: true })

  const db = await open({ filename: DB_PATH, driver: sqlite3.Database })
  await db.exec('PRAGMA journal_mode=WAL')
  await db.exec('PRAGMA synchronous=NORMAL')

  const stats = { totalRows: 0, wins: 0, parseErrors: 0, raceMap: {}, daysProcessed: 0, daysFailed: 0 }
  const startTime = Date.now()

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i]
    let dayTotal = 0
    const fileResults = []

    for (const ft of FILE_TYPES) {
      const url = `${BASE_URL}/${ft.prefix}${d.ddmmmyyyy}.csv`
      const cachePath = join(CSV_CACHE_DIR, `betfair-${ft.key}-${d.iso}.csv`)

      // Try cache first
      let csvContent = null
      try {
        const { readFile } = await import('fs/promises')
        csvContent = await readFile(cachePath, 'utf8')
      } catch {}

      // Fetch if not cached
      if (!csvContent) {
        csvContent = await fetchCsv(url)
        if (csvContent) {
          await writeFile(cachePath, csvContent)
        }
        await sleep(DELAY_MS)
      }

      if (!csvContent) continue

      const records = await processCsvContent(csvContent, d.iso, stats)
      if (records.length > 0) {
        dayTotal += records.length
        if (!dryRun) {
          const saved = await bulkInsert(db, records)
          fileResults.push(`${ft.label}: ${saved}`)
        } else {
          fileResults.push(`${ft.label}: ${records.length} (dry run)`)
        }
      }
    }

    stats.daysProcessed++
    const status = dayTotal > 0 ? `\u2713 ${dayTotal} records` : '\u2014 no racing'
    const detail = fileResults.length > 0 ? ` (${fileResults.join(', ')})` : ''
    process.stdout.write(`\r[Import] [${i + 1}/${dates.length}] ${d.iso}: ${status}${detail}          \n`)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n\n[Import] Complete in ${elapsed}s`)
  console.log(`[Import] Days processed: ${stats.daysProcessed}, failed: ${stats.daysFailed}`)
  console.log(`[Import] Total rows: ${stats.totalRows}`)
  console.log(`[Import] Winners: ${stats.wins} (${stats.totalRows ? ((stats.wins / stats.totalRows) * 100).toFixed(1) : 0}%)`)
  console.log(`[Import] Unique races: ${Object.keys(stats.raceMap).length}`)
  console.log(`[Import] Parse errors: ${stats.parseErrors}`)

  // Show DB stats
  const range = await db.get('SELECT MIN(race_date) as earliest, MAX(race_date) as latest, COUNT(*) as total FROM horse_runs')
  console.log(`[Import] DB range: ${range.earliest} to ${range.latest} (${range.total} total horse runs)`)

  await db.close()
  console.log(`\n[Import] Done! Restart server to pick up new data.`)
  console.log(`[Import] NOTE: Betfair CSV provides SP odds + win/lose only.`)
  console.log(`[Import] For full form (going, distance, class, draw, jockey, trainer, OR/RPR),`)
  console.log(`[Import] run the SL scraper for recent dates or supplement with another source.`)
}

main().catch(e => {
  console.error('[Import] Fatal error:', e.message)
  process.exit(1)
})
