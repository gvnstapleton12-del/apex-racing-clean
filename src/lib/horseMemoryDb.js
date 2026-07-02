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

  await db.exec(`
    CREATE TABLE IF NOT EXISTS shadow_watch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      race_id TEXT NOT NULL,
      course TEXT NOT NULL,
      off_time TEXT,
      race_date TEXT NOT NULL,
      horse_name TEXT NOT NULL,
      horse_id TEXT,
      market_odds REAL NOT NULL,
      model_wp REAL NOT NULL,
      apex_score REAL,
      bet_quality TEXT,
      pa_adj REAL,
      reason_logged TEXT,
      status TEXT DEFAULT 'PENDING',
      finishing_position INTEGER,
      lengths_beaten REAL,
      virtual_pnl REAL DEFAULT 0.00,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_shadow_pending ON shadow_watch_log (status, race_date)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_shadow_date ON shadow_watch_log (race_date)`)
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_shadow_dedup ON shadow_watch_log (race_id, horse_name, race_date)`)
  try { await db.exec(`ALTER TABLE shadow_watch_log ADD COLUMN horse_id TEXT`) } catch (_) {}

  await db.exec(`
    CREATE TABLE IF NOT EXISTS backtest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      race_id TEXT,
      course TEXT,
      race_date TEXT,
      race_type TEXT,
      horse TEXT,
      win_prob REAL,
      odds REAL,
      actual_pos INTEGER,
      won INTEGER,
      placed INTEGER,
      level_pnl REAL,
      kelly_pct REAL,
      is_value INTEGER,
      has_dense INTEGER,
      field_size INTEGER,
      draw INTEGER,
      grade TEXT,
      bet_quality TEXT,
      pa_adjustment REAL,
      apex_score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_bt_label ON backtest_runs (label)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_bt_label_won ON backtest_runs (label, won)`)
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

export async function insertShadowWatch(db, record) {
  if (!db) return false
  try {
    await db.run(`
      INSERT OR IGNORE INTO shadow_watch_log (race_id, course, off_time, race_date, horse_name, horse_id, market_odds, model_wp, apex_score, bet_quality, pa_adj, reason_logged)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      record.race_id, record.course, record.off_time || '', record.race_date,
      record.horse_name, record.horse_id || null, record.market_odds, record.model_wp,
      record.apex_score || 0, record.bet_quality || '', record.pa_adj ?? 0,
      record.reason_logged || '',
    ])
    return true
  } catch (error) {
    console.error('[Shadow Watch] Insert failed:', error.message)
    return false
  }
}

export async function getPendingShadowWatches(db) {
  if (!db) return []
  try {
    return await db.all(`SELECT * FROM shadow_watch_log WHERE status = 'PENDING' ORDER BY race_date DESC, off_time DESC`)
  } catch (error) {
    console.error('[Shadow Watch] Query failed:', error.message)
    return []
  }
}

export async function settleShadowWatch(db, id, position, pnl) {
  if (!db) return false
  try {
    await db.run(`
      UPDATE shadow_watch_log SET status = 'SETTLED', finishing_position = ?, virtual_pnl = ? WHERE id = ?
    `, [position, pnl, id])
    return true
  } catch (error) {
    console.error('[Shadow Watch] Settlement failed:', error.message)
    return false
  }
}

export async function getShadowWatchStats(db, days = 30) {
  if (!db) return { records: [], summary: {} }
  try {
    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString().split('T')[0]
    const records = await db.all(
      `SELECT * FROM shadow_watch_log WHERE race_date >= ? ORDER BY race_date DESC, off_time DESC`, [sinceStr]
    )
    const settled = records.filter(r => r.status === 'SETTLED')
    const pending = records.filter(r => r.status === 'PENDING')
    const wins = settled.filter(r => r.finishing_position === 1).length
    const placed = settled.filter(r => r.finishing_position >= 1 && r.finishing_position <= 3).length
    const totalPnl = settled.reduce((s, r) => s + (r.virtual_pnl || 0), 0)
    const speculative = settled.filter(r => r.bet_quality === 'SPECULATIVE')
    const borderline = settled.filter(r => r.bet_quality === 'BORDERLINE')
    const specWins = speculative.filter(r => r.finishing_position === 1).length
    const bordWins = borderline.filter(r => r.finishing_position === 1).length
    const specPnl = speculative.reduce((s, r) => s + (r.virtual_pnl || 0), 0)
    const bordPnl = borderline.reduce((s, r) => s + (r.virtual_pnl || 0), 0)
    return {
      records,
      summary: {
        total: records.length,
        settled: settled.length,
        pending: pending.length,
        wins,
        placed,
        winRate: settled.length ? ((wins / settled.length) * 100).toFixed(1) : '0.0',
        placeRate: settled.length ? ((placed / settled.length) * 100).toFixed(1) : '0.0',
        totalPnl: Math.round(totalPnl * 100) / 100,
        roi: settled.length ? (((totalPnl / settled.length) * 100)).toFixed(1) : '0.0',
        speculative: { total: speculative.length, wins: specWins, pnl: Math.round(specPnl * 100) / 100, winRate: speculative.length ? ((specWins / speculative.length) * 100).toFixed(1) : '0.0' },
        borderline: { total: borderline.length, wins: bordWins, pnl: Math.round(bordPnl * 100) / 100, winRate: borderline.length ? ((bordWins / borderline.length) * 100).toFixed(1) : '0.0' },
      },
    }
  } catch (error) {
    console.error('[Shadow Watch] Stats query failed:', error.message)
    return { records: [], summary: {} }
  }
}

export async function insertBacktestRuns(db, label, predictions) {
  if (!db || !predictions.length) return { saved: 0 }
  let saved = 0
  try {
    await db.exec('BEGIN TRANSACTION')
    for (const p of predictions) {
      await db.run(`
        INSERT INTO backtest_runs (label, race_id, course, race_date, race_type, horse, win_prob, odds, actual_pos, won, placed, level_pnl, kelly_pct, is_value, has_dense, field_size, draw, grade, bet_quality, pa_adjustment, apex_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        label, p.raceId || '', p.course || '', p.date || '', p.raceType || '', p.horse || '',
        p.winProb || 0, p.odds || 0, p.actualPos || 0, p.won ? 1 : 0, p.placed ? 1 : 0,
        p.levelPL || 0, p.kellyPct || 0, p.isValueSelection ? 1 : 0, p.hasDenseData ? 1 : 0,
        p.fieldSize || 0, p.draw || 0, p.grade || '', p.betQuality || '', p.personalAffinity || 0,
        p.apexScore || 0,
      ])
      saved++
    }
    await db.exec('COMMIT')
    console.log(`[Backtest] Inserted ${saved} runs for label "${label}"`)
    return { saved }
  } catch (error) {
    await db.exec('ROLLBACK')
    console.error('[Backtest] Batch insert failed:', error.message)
    return { saved: 0 }
  }
}

export async function getBacktestLabels(db) {
  if (!db) return []
  try {
    return await db.all(`
      SELECT label, COUNT(*) as total, SUM(won) as wins, SUM(placed) as placed,
             ROUND(SUM(level_pnl) / COUNT(*) * 100, 1) as roi,
             MIN(race_date) as fromDate, MAX(race_date) as toDate,
             MIN(created_at) as runAt
      FROM backtest_runs GROUP BY label ORDER BY MIN(created_at) DESC
    `)
  } catch (error) {
    console.error('[Backtest] Labels query failed:', error.message)
    return []
  }
}

export async function getBacktestSummary(db, label) {
  if (!db || !label) return null
  try {
    const all = await db.all(`SELECT * FROM backtest_runs WHERE label = ?`, [label])
    if (!all.length) return null
    const total = all.length
    const wins = all.filter(r => r.won).length
    const placed = all.filter(r => r.placed).length
    const valueRuns = all.filter(r => r.is_value)
    const vWins = valueRuns.filter(r => r.won).length
    const totalPnl = all.reduce((s, r) => s + (r.level_pnl || 0), 0)
    const vPnl = valueRuns.reduce((s, r) => s + (r.level_pnl || 0), 0)

    const paBands = [
      { label: 'ELITE', min: 5, max: Infinity },
      { label: 'TARGET', min: 2, max: 5 },
      { label: 'VALUE', min: 0, max: 2 },
      { label: 'NEGATIVE', min: -Infinity, max: 0 },
    ]
    const byPa = paBands.map(b => {
      const runs = all.filter(r => r.pa_adjustment >= b.min && r.pa_adjustment < b.max)
      const w = runs.filter(r => r.won).length
      const pnl = runs.reduce((s, r) => s + (r.level_pnl || 0), 0)
      return { band: b.label, total: runs.length, wins: w, wr: runs.length ? ((w / runs.length) * 100).toFixed(1) : '0.0', roi: runs.length ? ((pnl / runs.length) * 100).toFixed(1) : '0.0' }
    })

    const oddsBands = [
      { label: '2-3', min: 2, max: 3 },
      { label: '3-5', min: 3, max: 5 },
      { label: '5-8', min: 5, max: 8 },
      { label: '8-12', min: 8, max: 12 },
      { label: '12-20', min: 12, max: 20 },
      { label: '20+', min: 20, max: Infinity },
    ]
    const byOdds = oddsBands.map(b => {
      const runs = all.filter(r => r.odds >= b.min && r.odds < b.max)
      const w = runs.filter(r => r.won).length
      const pnl = runs.reduce((s, r) => s + (r.level_pnl || 0), 0)
      return { band: b.label, total: runs.length, wins: w, wr: runs.length ? ((w / runs.length) * 100).toFixed(1) : '0.0', roi: runs.length ? ((pnl / runs.length) * 100).toFixed(1) : '0.0' }
    })

    return {
      overall: { total, wins, placed, wr: ((wins / total) * 100).toFixed(1), roi: ((totalPnl / total) * 100).toFixed(1), pnl: Math.round(totalPnl * 100) / 100 },
      value: { total: valueRuns.length, wins: vWins, wr: valueRuns.length ? ((vWins / valueRuns.length) * 100).toFixed(1) : '0.0', roi: valueRuns.length ? ((vPnl / valueRuns.length) * 100).toFixed(1) : '0.0', pnl: Math.round(vPnl * 100) / 100 },
      byPa,
      byOdds,
    }
  } catch (error) {
    console.error('[Backtest] Summary query failed:', error.message)
    return null
  }
}

export async function deleteBacktestLabel(db, label) {
  if (!db || !label) return false
  try {
    await db.run(`DELETE FROM backtest_runs WHERE label = ?`, [label])
    return true
  } catch (error) {
    console.error('[Backtest] Delete failed:', error.message)
    return false
  }
}

export async function bulkInsertHorseRuns(db, runs) {
  if (!db || !runs.length) return { saved: 0, failed: 0 }
  let saved = 0
  let failed = 0
  try {
    await db.exec('BEGIN TRANSACTION')
    for (const r of runs) {
      try {
        await db.run(`
          INSERT OR IGNORE INTO horse_runs (horse_name, horse_id, race_date, course, distance, distance_furlongs, going, race_class, field_size, finish_position, sp_odds, starting_price, weight_carried, jockey, trainer, official_rating, or_rating, rpr_rating, speed_figure, pace_score)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          r.horse_name || '', r.horse_id || '', r.race_date || '', r.course || '',
          r.distance || '', r.distance_furlongs || 0, r.going || '', r.race_class || '',
          r.field_size || 0, r.finish_position || 0, r.sp_odds || 0, r.starting_price || 0,
          r.weight_carried || '', r.jockey || '', r.trainer || '',
          r.official_rating || 0, r.or_rating || r.official_rating || 0,
          r.rpr_rating || 0, r.speed_figure || 0, r.pace_score || 0,
        ])
        saved++
      } catch { failed++ }
    }
    await db.exec('COMMIT')
    console.log(`[Import] horse_runs: ${saved} saved, ${failed} failed`)
    return { saved, failed }
  } catch {
    await db.exec('ROLLBACK')
    return { saved: 0, failed: runs.length }
  }
}

export async function bulkInsertJockeyRuns(db, runs) {
  if (!db || !runs.length) return { saved: 0, failed: 0 }
  let saved = 0
  let failed = 0
  try {
    await db.exec('BEGIN TRANSACTION')
    for (const r of runs) {
      try {
        await db.run(`
          INSERT OR IGNORE INTO jockey_runs (jockey_name, course, race_date, finish_position, field_size, sp_odds, race_class)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          r.jockey_name || '', r.course || '', r.race_date || '',
          r.finish_position || 0, r.field_size || 0, r.sp_odds || 0, r.race_class || '',
        ])
        saved++
      } catch { failed++ }
    }
    await db.exec('COMMIT')
    console.log(`[Import] jockey_runs: ${saved} saved, ${failed} failed`)
    return { saved, failed }
  } catch {
    await db.exec('ROLLBACK')
    return { saved: 0, failed: runs.length }
  }
}

export async function getHorseRunDateRange(db) {
  if (!db) return null
  try {
    const row = await db.get('SELECT MIN(race_date) as earliest, MAX(race_date) as latest, COUNT(*) as total FROM horse_runs')
    return row
  } catch (error) {
    console.error('[Import] Date range query failed:', error.message)
    return null
  }
}
