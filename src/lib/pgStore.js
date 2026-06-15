import pg from 'pg'
import { readFileSync, existsSync } from 'fs'

const { Pool } = pg

let pool = null
let connected = false

export function hasPg() {
  return connected && !!pool
}

export async function initPgStore() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.log('[PG] No DATABASE_URL — using file-based storage')
    return false
  }

  try {
    pool = new Pool({ connectionString: url, ssl: url.includes('railway') ? { rejectUnauthorized: false } : false })
    await pool.query('SELECT 1')
    connected = true
    console.log('[PG] Connected to Postgres')

    await pool.query(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    console.log('[PG] kv_store table ready')
    return true
  } catch (err) {
    console.error('[PG] Connection failed:', err.message)
    pool = null
    connected = false
    return false
  }
}

export async function pgLoad(key) {
  if (!hasPg()) return null
  try {
    const { rows } = await pool.query('SELECT data FROM kv_store WHERE key = $1', [key])
    return rows[0]?.data ?? null
  } catch (err) {
    console.error(`[PG] Load failed for ${key}:`, err.message)
    return null
  }
}

export async function pgSave(key, data) {
  if (!hasPg()) return false
  try {
    await pool.query(
      `INSERT INTO kv_store (key, data, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
      [key, JSON.stringify(data)]
    )
    return true
  } catch (err) {
    console.error(`[PG] Save failed for ${key}:`, err.message)
    return false
  }
}

export function getPgPool() {
  return pool
}
