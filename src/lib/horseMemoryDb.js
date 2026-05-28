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
      weight_carried TEXT,
      jockey TEXT,
      trainer TEXT,
      official_rating INTEGER,
      speed_figure REAL,
      pace_score REAL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

export async function closeHorseDb(db) {
  if (db) await db.close()
}
