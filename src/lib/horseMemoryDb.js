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
}

export async function closeHorseDb(db) {
  if (db) await db.close()
}
