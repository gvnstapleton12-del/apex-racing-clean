import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CACHE_DIR = join(ROOT, 'data', 'backtest-cache')
const PREDICTIONS_PATH = join(ROOT, 'data', 'predictions.json')

if (!existsSync(PREDICTIONS_PATH)) {
  console.error('predictions.json not found')
  process.exit(1)
}

const predictions = JSON.parse(readFileSync(PREDICTIONS_PATH, 'utf8'))

const targetDates = ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21']

const predByCourseDate = {}
for (const [key, runners] of Object.entries(predictions)) {
  if (!Array.isArray(runners)) continue
  const parts = key.split('-')
  const date = parts.slice(2).join('-')
  const course = parts[0]
  if (!targetDates.includes(date)) continue
  const mapKey = `${course}|${date}`
  if (!predByCourseDate[mapKey]) predByCourseDate[mapKey] = {}
  for (const r of runners) {
    const name = (r.horse || '').toLowerCase().trim()
    if (name && r.odds > 0) predByCourseDate[mapKey][name] = r.odds
  }
}

let totalPatched = 0
let totalFailed = 0

for (const date of targetDates) {
  const cachePath = join(CACHE_DIR, `results-${date}.json`)
  if (!existsSync(cachePath)) { console.log(`No cache for ${date}, skipping`); continue }

  const races = JSON.parse(readFileSync(cachePath, 'utf8'))
  let patched = 0
  let failed = 0

  for (const race of races) {
    const mapKey = `${race.course}|${date}`
    const lookup = predByCourseDate[mapKey] || {}
    for (const runner of race.runners) {
      if (runner.odds > 0 && runner.sp > 0) continue
      const name = (runner.horse || '').toLowerCase().trim()
      if (lookup[name]) {
        runner.odds = lookup[name]
        runner.sp = lookup[name]
        patched++
      } else {
        failed++
      }
    }
  }

  writeFileSync(cachePath, JSON.stringify(races, null, 2))
  totalPatched += patched
  totalFailed += failed
  console.log(`${date}: patched ${patched}, missed ${failed}`)
}

console.log(`\nTotal: patched ${totalPatched}, missed ${totalFailed}`)
