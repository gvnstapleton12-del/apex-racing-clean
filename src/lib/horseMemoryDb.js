// Horse Memory Database - SQLite Setup
// Gracefully handles missing native sqlite3 bindings (e.g. cross-platform deployment)
let sqlite3, open

try {
  const sqlite3Module = await import('sqlite3')
  const sqliteModule = await import('sqlite')
  sqlite3 = sqlite3Module.default
  open = sqliteModule.open
} catch {
  console.warn('[Horse Memory] sqlite3 native bindings not found — horse memory disabled')
}

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function initHorseDb() {
  if (!open) return null
  const dbPath = join(__dirname, '../../data/apex-horses.db')
  return open({
    filename: dbPath,
    driver: sqlite3.Database
  })
}

export async function createTables(db) {
  if (!db) return
  await db.exec(`PRAGMA journal_mode=WAL`)
  await db.exec(`PRAGMA synchronous=NORMAL`)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS horse_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      horse_name TEXT NOT NULL,
      horse_id TEXT,
      race_date TEXT NOT NULL,
      course TEXT,
      distance TEXT,
      distance_furlongs REAL,
      going TEXT,
      race_class TEXT,
      field_size INTEGER,
      finish_position INTEGER,
      sp_odds REAL,
      starting_price REAL,
      weight_carried TEXT,
      jockey TEXT,
      trainer TEXT,
      official_rating INTEGER,
      or_rating INTEGER,
      rpr_rating REAL,
      speed_figure REAL,
      pace_score REAL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_horse_name ON horse_runs(horse_name)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_horse_runs_date ON horse_runs(horse_name, race_date DESC)`)
  // Add missing columns for existing databases
  try { await db.exec(`ALTER TABLE horse_runs ADD COLUMN or_rating INTEGER`) } catch (_) {}
  try { await db.exec(`ALTER TABLE horse_runs ADD COLUMN rpr_rating REAL`) } catch (_) {}
  try { await db.exec(`ALTER TABLE horse_runs ADD COLUMN starting_price REAL`) } catch (_) {}
  try { await db.exec(`ALTER TABLE horse_runs ADD COLUMN proven_zone TEXT`) } catch (_) {}

  await db.exec(`
    CREATE TABLE IF NOT EXISTS jockey_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jockey_name TEXT NOT NULL,
      course TEXT,
      race_date TEXT,
      finish_position INTEGER,
      field_size INTEGER,
      sp_odds REAL,
      race_class TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_jockey_name ON jockey_runs(jockey_name)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_jockey_date ON jockey_runs(jockey_name, race_date DESC)`)
  // Standalone date indexes for backtest context builder sliding-window queries
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_horse_runs_race_date ON horse_runs(race_date)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_jockey_runs_race_date ON jockey_runs(race_date)`)
}

export async function saveJockeyRun(db, run) {
  if (!db || !run.jockey) return false
  try {
    await db.run(`
      INSERT INTO jockey_runs (jockey_name, course, race_date, finish_position, field_size, sp_odds, race_class)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      run.jockey,
      run.course || '',
      run.race_date || '',
      run.finish_position || 0,
      run.field_size || 0,
      run.sp_odds || null,
      run.race_class || '',
    ])
    return true
  } catch (error) {
    console.error('[Jockey Memory] Failed to save run:', error.message)
    return false
  }
}

export async function saveJockeyRunsBatch(db, runs) {
  if (!db || !runs.length) return { saved: 0, failed: 0 }
  let saved = 0
  let failed = 0
  try {
    await db.exec('BEGIN TRANSACTION')
    for (const run of runs) {
      if (!run.jockey) { failed++; continue }
      try {
        await db.run(`
          INSERT INTO jockey_runs (jockey_name, course, race_date, finish_position, field_size, sp_odds, race_class)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          run.jockey, run.course || '', run.race_date || '',
          run.finish_position || 0, run.field_size || 0,
          run.sp_odds || null, run.race_class || '',
        ])
        saved++
      } catch { failed++ }
    }
    await db.exec('COMMIT')
    return { saved, failed }
  } catch {
    await db.exec('ROLLBACK')
    return { saved: 0, failed: runs.length }
  }
}

export async function getJockeyForm(db, jockeyName) {
  if (!db || !jockeyName) return null
  try {
    const rows = await db.all(
      `SELECT course, finish_position, field_size, race_date FROM jockey_runs
       WHERE jockey_name = ? ORDER BY race_date DESC LIMIT 200`, [jockeyName]
    )
    if (!rows.length) return null
    const overall = { runs: 0, wins: 0, places: 0 }
    const byCourse = {}
    for (const r of rows) {
      if (!r.finish_position) continue
      overall.runs++
      if (r.finish_position === 1) overall.wins++
      if (r.finish_position <= (r.field_size >= 16 ? 4 : r.field_size >= 8 ? 3 : r.field_size >= 5 ? 2 : 1)) overall.places++
      const c = (r.course || '').toLowerCase()
      if (c) {
        if (!byCourse[c]) byCourse[c] = { runs: 0, wins: 0 }
        byCourse[c].runs++
        if (r.finish_position === 1) byCourse[c].wins++
      }
    }
    return { overall, byCourse, totalRows: rows.length }
  } catch (error) {
    console.error('[Jockey Memory] Query failed:', error.message)
    return null
  }
}

export async function closeHorseDb(db) {
  if (db) await db.close()
}

export async function getTrainerFormSince(db, sinceDate) {
  if (!db) return {}
  try {
    const rows = await db.all(
      `SELECT trainer, course, finish_position, field_size FROM horse_runs
       WHERE race_date >= ? AND race_date < date(?) AND trainer != ''
       ORDER BY race_date DESC`, [sinceDate, sinceDate]
    )
    const form = {}
    for (const r of rows) {
      const t = r.trainer
      if (!form[t]) form[t] = { runs: 0, wins: 0, places: 0 }
      form[t].runs++
      if (r.finish_position === 1) form[t].wins++
      const placed = r.field_size >= 16 ? 4 : r.field_size >= 8 ? 3 : r.field_size >= 5 ? 2 : 1
      if (r.finish_position > 0 && r.finish_position <= placed) form[t].places++
    }
    for (const t of Object.keys(form)) {
      form[t].winRate = form[t].runs > 0 ? Math.round((form[t].wins / form[t].runs) * 100 * 10) / 10 : 0
      form[t].placeRate = form[t].runs > 0 ? Math.round((form[t].places / form[t].runs) * 100 * 10) / 10 : 0
    }
    return form
  } catch (error) {
    console.error('[Jockey Memory] getTrainerFormSince failed:', error.message)
    return {}
  }
}

export async function getJockeyFormSince(db, sinceDate) {
  if (!db) return {}
  try {
    const rows = await db.all(
      `SELECT jockey_name, course, finish_position, field_size FROM jockey_runs
       WHERE race_date >= ? AND race_date < date(?) AND jockey_name != ''
       ORDER BY race_date DESC`, [sinceDate, sinceDate]
    )
    const form = {}
    for (const r of rows) {
      const j = r.jockey_name
      if (!form[j]) form[j] = { runs: 0, wins: 0, places: 0, byCourse: {} }
      form[j].runs++
      if (r.finish_position === 1) form[j].wins++
      const placed = r.field_size >= 16 ? 4 : r.field_size >= 8 ? 3 : r.field_size >= 5 ? 2 : 1
      if (r.finish_position > 0 && r.finish_position <= placed) form[j].places++
      const c = (r.course || '').toLowerCase()
      if (c) {
        if (!form[j].byCourse[c]) form[j].byCourse[c] = { runs: 0, wins: 0 }
        form[j].byCourse[c].runs++
        if (r.finish_position === 1) form[j].byCourse[c].wins++
      }
    }
    for (const j of Object.keys(form)) {
      form[j].winRate = form[j].runs > 0 ? Math.round((form[j].wins / form[j].runs) * 100 * 10) / 10 : 0
      form[j].placeRate = form[j].runs > 0 ? Math.round((form[j].places / form[j].runs) * 100 * 10) / 10 : 0
      for (const c of Object.keys(form[j].byCourse)) {
        const cr = form[j].byCourse[c]
        cr.winRate = cr.runs > 0 ? Math.round((cr.wins / cr.runs) * 100 * 10) / 10 : 0
      }
    }
    return form
  } catch (error) {
    console.error('[Jockey Memory] getJockeyFormSince failed:', error.message)
    return {}
  }
}
