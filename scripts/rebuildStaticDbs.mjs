#!/usr/bin/env node
/**
 * Rebuild Static Databases from horse_runs SQLite
 *
 * Reads the 632K+ horse_runs from apex-horses.db and rebuilds:
 *   - data/going-database.json
 *   - data/distance-database.json
 *   - data/horseProfiles.json
 *
 * Usage:
 *   node scripts/rebuildStaticDbs.mjs
 *   node scripts/rebuildStaticDbs.mjs --dry-run
 */

import { writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DB_PATH = join(ROOT, 'data/apex-horses.db')
const dryRun = process.argv.includes('--dry-run')

// Going shortcode → full name mapping
const GOING_MAP = {
  'F': 'Firm', 'FM': 'Firm', 'Y': 'Good to Firm', 'GY': 'Good to Firm',
  'GD': 'Good', 'G': 'Good', 'GS': 'Good to Soft', 'S': 'Soft',
  'SH': 'Soft', 'SO': 'Soft', 'HV': 'Heavy', 'HE': 'Heavy',
  'ST': 'Standard', 'STD': 'Standard', 'AW': 'All Weather',
  'SLO': 'Slow', 'YLD': 'Yielding', 'HDY': 'Heavy',
}

function normalizeGoing(going) {
  if (!going) return ''
  const trimmed = going.trim()
  // Extract shortcode from parenthetical if present, e.g. "Good (Good to Firm in places)" → check first word
  const firstWord = trimmed.split(/\s/)[0].toUpperCase()
  if (GOING_MAP[firstWord]) return GOING_MAP[firstWord]
  // Try full string match
  const upper = trimmed.toUpperCase()
  if (upper.includes('HEAVY')) return 'Heavy'
  if (upper.includes('SOFT')) return 'Soft'
  if (upper.includes('GOOD TO SOFT') || upper.includes('GOOD-TO-SOFT') || upper.includes('GS')) return 'Good to Soft'
  if (upper.includes('GOOD TO FIRM') || upper.includes('GOOD-TO-FIRM') || upper.includes('GY')) return 'Good to Firm'
  if (upper.includes('GOOD')) return 'Good'
  if (upper.includes('FIRM')) return 'Firm'
  if (upper.includes('STANDARD')) return 'Standard'
  if (upper.includes('SLOW')) return 'Slow'
  return trimmed
}

function getSurface(going) {
  if (!going) return 'unknown'
  const g = going.toLowerCase()
  if (g.includes('standard') || g.includes('all weather') || g.includes('aw')) return 'AW'
  return 'turf'
}

async function buildGoingDb(db) {
  console.log('[Rebuild] Building going-database.json...')
  const rows = await db.all(`
    SELECT horse_name, going, finish_position, field_size
    FROM horse_runs WHERE going != '' AND horse_name != ''
  `)
  console.log(`[Rebuild]   ${rows.length} rows with going data`)

  const goingDb = {}
  for (const r of rows) {
    const hid = r.horse_name
    const going = normalizeGoing(r.going)
    const surface = getSurface(r.going)
    const won = r.finish_position === 1
    const placed = r.finish_position >= 1 && r.finish_position <= (r.field_size >= 16 ? 4 : r.field_size >= 8 ? 3 : 2)

    if (!goingDb[hid]) goingDb[hid] = { byGoing: {}, bySurface: {} }

    if (going) {
      if (!goingDb[hid].byGoing[going]) goingDb[hid].byGoing[going] = { runs: 0, wins: 0, places: 0 }
      goingDb[hid].byGoing[going].runs++
      if (won) goingDb[hid].byGoing[going].wins++
      if (placed) goingDb[hid].byGoing[going].places++
    }

    if (!goingDb[hid].bySurface[surface]) goingDb[hid].bySurface[surface] = { runs: 0, wins: 0, places: 0 }
    goingDb[hid].bySurface[surface].runs++
    if (won) goingDb[hid].bySurface[surface].wins++
    if (placed) goingDb[hid].bySurface[surface].places++
  }

  const horses = Object.keys(goingDb).length
  console.log(`[Rebuild]   ${horses} horses with going profiles`)
  return goingDb
}

async function buildDistanceDb(db) {
  console.log('[Rebuild] Building distance-database.json...')
  const rows = await db.all(`
    SELECT horse_name, distance_furlongs, finish_position, race_date
    FROM horse_runs WHERE distance_furlongs > 0 AND horse_name != ''
    ORDER BY race_date
  `)
  console.log(`[Rebuild]   ${rows.length} rows with distance data`)

  const distanceDb = {}
  for (const r of rows) {
    const hid = r.horse_name
    if (!distanceDb[hid]) distanceDb[hid] = { lastDistance: 0, performances: [] }
    distanceDb[hid].lastDistance = r.distance_furlongs
    distanceDb[hid].performances.push({
      distance: r.distance_furlongs,
      won: r.finish_position === 1,
      placed: r.finish_position >= 1 && r.finish_position <= 3,
      date: r.race_date,
    })
  }

  const horses = Object.keys(distanceDb).length
  console.log(`[Rebuild]   ${horses} horses with distance profiles`)
  return distanceDb
}

async function buildHorseProfiles(db) {
  console.log('[Rebuild] Building horseProfiles.json...')
  const rows = await db.all(`
    SELECT horse_name, course, distance, going, finish_position, field_size, race_date
    FROM horse_runs WHERE horse_name != ''
    ORDER BY race_date
  `)
  console.log(`[Rebuild]   ${rows.length} rows for profiles`)

  const profiles = {}
  for (const r of rows) {
    const name = r.horse_name
    if (!profiles[name]) {
      profiles[name] = {
        career: { runs: 0, wins: 0, places: 0, winRate: 0, placeRate: 0 },
        course: {},
        distance: {},
        going: {},
        courseDistance: {},
      }
    }
    const p = profiles[name]
    const won = r.finish_position === 1
    const placed = r.finish_position >= 1 && r.finish_position <= (r.field_size >= 16 ? 4 : r.field_size >= 8 ? 3 : 2)

    // Career
    p.career.runs++
    if (won) p.career.wins++
    if (placed) p.career.places++

    // By course
    const course = (r.course || '').toLowerCase()
    if (course) {
      if (!p.course[course]) p.course[course] = { runs: 0, wins: 0, places: 0 }
      p.course[course].runs++
      if (won) p.course[course].wins++
      if (placed) p.course[course].places++
    }

    // By distance
    const dist = r.distance || ''
    if (dist) {
      if (!p.distance[dist]) p.distance[dist] = { runs: 0, wins: 0, places: 0 }
      p.distance[dist].runs++
      if (won) p.distance[dist].wins++
      if (placed) p.distance[dist].places++
    }

    // By going
    const going = normalizeGoing(r.going)
    if (going) {
      if (!p.going[going]) p.going[going] = { runs: 0, wins: 0, places: 0 }
      p.going[going].runs++
      if (won) p.going[going].wins++
      if (placed) p.going[going].places++
    }

    // By course+distance
    if (course && dist) {
      const cdKey = `${course}|${dist}`
      if (!p.courseDistance[cdKey]) p.courseDistance[cdKey] = { runs: 0, wins: 0, places: 0 }
      p.courseDistance[cdKey].runs++
      if (won) p.courseDistance[cdKey].wins++
      if (placed) p.courseDistance[cdKey].places++
    }
  }

  // Compute rates
  for (const name of Object.keys(profiles)) {
    const p = profiles[name]
    p.career.winRate = p.career.runs > 0 ? Math.round((p.career.wins / p.career.runs) * 1000) / 10 : 0
    p.career.placeRate = p.career.runs > 0 ? Math.round((p.career.places / p.career.runs) * 1000) / 10 : 0
    for (const section of ['course', 'distance', 'going', 'courseDistance']) {
      for (const key of Object.keys(p[section])) {
        const s = p[section][key]
        s.winRate = s.runs > 0 ? Math.round((s.wins / s.runs) * 1000) / 10 : 0
        s.placeRate = s.runs > 0 ? Math.round((s.places / s.runs) * 1000) / 10 : 0
      }
    }
  }

  const horses = Object.keys(profiles).length
  console.log(`[Rebuild]   ${horses} horse profiles`)
  return profiles
}

async function main() {
  if (dryRun) console.log('[Rebuild] DRY RUN — no files will be written')

  const db = await open({ filename: DB_PATH, driver: sqlite3.Database })
  const range = await db.get('SELECT COUNT(*) as total, MIN(race_date) as earliest, MAX(race_date) as latest FROM horse_runs')
  console.log(`[Rebuild] DB: ${range.total} horse runs, ${range.earliest} to ${range.latest}`)

  const startTime = Date.now()

  const goingDb = await buildGoingDb(db)
  const distanceDb = await buildDistanceDb(db)
  const horseProfiles = await buildHorseProfiles(db)

  await db.close()

  if (!dryRun) {
    const goingPath = join(ROOT, 'data/going-database.json')
    const distPath = join(ROOT, 'data/distance-database.json')
    const profilePath = join(ROOT, 'data/horseProfiles.json')

    // Write to temp files first, then rename (avoids file-lock issues with dev server)
    const { rename } = await import('fs/promises')
    for (const [content, target] of [
      [JSON.stringify(goingDb, null, 2), goingPath],
      [JSON.stringify(distanceDb, null, 2), distPath],
      [JSON.stringify(horseProfiles, null, 2), profilePath],
    ]) {
      const tmpPath = target + '.tmp'
      await writeFile(tmpPath, content)
      try {
        await rename(tmpPath, target)
      } catch {
        // If rename fails (file locked), copy content over
        const { copyFile } = await import('fs/promises')
        await copyFile(tmpPath, target)
      }
    }

    const goingSize = (Buffer.byteLength(JSON.stringify(goingDb)) / 1024 / 1024).toFixed(1)
    const distSize = (Buffer.byteLength(JSON.stringify(distanceDb)) / 1024 / 1024).toFixed(1)
    const profileSize = (Buffer.byteLength(JSON.stringify(horseProfiles)) / 1024 / 1024).toFixed(1)

    console.log(`\n[Rebuild] Written files:`)
    console.log(`  going-database.json: ${goingSize} MB`)
    console.log(`  distance-database.json: ${distSize} MB`)
    console.log(`  horseProfiles.json: ${profileSize} MB`)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n[Rebuild] Complete in ${elapsed}s`)
  console.log(`[Rebuild] Restart server to pick up new databases.`)
}

main().catch(e => {
  console.error('[Rebuild] Fatal error:', e.message)
  process.exit(1)
})
