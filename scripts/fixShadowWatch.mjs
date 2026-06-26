// One-time fix: dedup shadow_watch_log and settle pending records
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = join(__dirname, '../data/apex-horses.db')

const db = await open({ filename: dbPath, driver: sqlite3.Database })
await db.exec('PRAGMA journal_mode=WAL')

// 1. Count before
const before = await db.get('SELECT COUNT(*) as cnt FROM shadow_watch_log')
console.log(`Before: ${before.cnt} records`)

// 2. Delete duplicates — keep only the latest per (race_id, horse_name, race_date)
await db.exec(`
  DELETE FROM shadow_watch_log WHERE id NOT IN (
    SELECT MAX(id) FROM shadow_watch_log GROUP BY race_id, horse_name, race_date
  )
`)
const afterDedup = await db.get('SELECT COUNT(*) as cnt FROM shadow_watch_log')
console.log(`After dedup: ${afterDedup.cnt} records`)

// 3. Fix race_id format — update any records that still have bare numeric IDs
await db.exec(`
  UPDATE shadow_watch_log SET race_id = course || '-' || off_time || '-' || race_date
  WHERE race_id NOT LIKE '%-%-%' OR LENGTH(race_id) < 10
`)
const fixed = await db.run('SELECT changes() as cnt')
console.log(`Race IDs fixed format`)

// 4. Settle pending records against learning database results
const learningData = JSON.parse(await import('fs').then(fs => fs.readFileSync(join(__dirname, '../data/learning.json'), 'utf8')))
const races = learningData.races || []

const pending = await db.all("SELECT * FROM shadow_watch_log WHERE status = 'PENDING'")
console.log(`Pending records to settle: ${pending.length}`)

let settled = 0
for (const watch of pending) {
  // Find matching race by course + date + horse name (off_time differs between live and results)
  const race = races.find(r => {
    const rCourse = (r.course || '').toLowerCase()
    const wCourse = (watch.course || '').toLowerCase()
    if (rCourse !== wCourse || r.date !== watch.race_date) return false
    return (r.runners || []).some(runner => (runner.horse || '').toLowerCase() === (watch.horse_name || '').toLowerCase())
  })

  if (!race) continue

  // Find matching runner by horse name
  const runner = (race.runners || []).find(r => (r.horse || '').toLowerCase() === (watch.horse_name || '').toLowerCase())
  if (!runner || !runner.position || runner.position <= 0) continue

  const position = runner.position
  const pnl = position === 1 ? (watch.market_odds - 1) : -1

  await db.run(
    'UPDATE shadow_watch_log SET status = ?, finishing_position = ?, virtual_pnl = ? WHERE id = ?',
    ['SETTLED', position, pnl, watch.id]
  )
  settled++
}

console.log(`Settled: ${settled} records`)

// 5. Final count
const final = await db.all('SELECT status, COUNT(*) as cnt FROM shadow_watch_log GROUP BY status')
console.log('Final status:', final)

await db.close()
console.log('Done!')
