// Horse Memory Database - SQLite Setup
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function initHorseDb() {
  const dbPath = join(__dirname, '../../data/apex-horses.db')
  
  return open({
    filename: dbPath,
    driver: sqlite3.Database
  })
}

export async function createTables(db) {
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
      
      or_rating INTEGER,
      rpr_rating INTEGER,
      
      finish_position INTEGER,
      starting_price REAL,
      
      race_class TEXT,
      field_size INTEGER,
      
      trainer TEXT,
      jockey TEXT,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_horse_name 
    ON horse_runs(horse_name)
  `)
  
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_race_date 
    ON horse_runs(race_date)
  `)
  
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_horse_date 
    ON horse_runs(horse_name, race_date)
  `)
}

export async function closeHorseDb(db) {
  if (db) {
    await db.close()
  }
}
