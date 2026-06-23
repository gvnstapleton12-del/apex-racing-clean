import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
function toFileUrl(p) { return new URL(`file:///${p.replace(/\\/g, '/')}`).href }

const { createPage } = await import(toFileUrl(join(ROOT, 'src', 'lib', 'scrapers', 'browserPool.js')))

const CACHE_DIR = join(ROOT, 'data', 'backtest-cache')

const SL_API = 'https://www.sportinglife.com/api/horse-racing'

let sharedPage = null

async function initBrowser() {
  const context = await createPage()
  sharedPage = await context.newPage()
}

async function closeBrowser() {
  try { if (sharedPage && !sharedPage.isClosed()) await sharedPage.close() } catch {}
  try { if (sharedPage?.context()) await sharedPage.context().close() } catch {}
  sharedPage = null
}

async function fetchRaceData(raceId) {
  const data = await sharedPage.evaluate(async (url) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  }, `${SL_API}/race/${raceId}`)

  const rides = data.rides || []
  const byHorse = {}
  for (const ride of rides) {
    const name = ride.horse?.name || ''
    if (!name) continue
    const prev = ride.horse?.previous_results || []
    byHorse[name.toLowerCase().trim()] = prev.slice(0, 6)
  }
  return byHorse
}

async function backfillDate(dateStr) {
  const cachePath = join(CACHE_DIR, `results-${dateStr}.json`)
  if (!existsSync(cachePath)) return { date: dateStr, skipped: true }

  const races = JSON.parse(readFileSync(cachePath, 'utf8'))
  let patched = 0
  let alreadyHad = 0
  let failed = 0

  for (const race of races) {
    const runners = race.runners || []
    const missingPrev = runners.filter(r => !r.previous_results || r.previous_results.length === 0)
    if (missingPrev.length === 0) {
      alreadyHad += runners.length
      continue
    }

    // Extract SL race ID from race_id format "Course-1234567"
    const parts = (race.race_id || '').split('-')
    const slRaceId = parts[parts.length - 1]
    if (!slRaceId || isNaN(Number(slRaceId))) {
      failed += missingPrev.length
      continue
    }

    try {
      const prevByHorse = await fetchRaceData(slRaceId)

      for (const runner of missingPrev) {
        const name = runner.horse?.toLowerCase().trim()
        if (prevByHorse[name] && prevByHorse[name].length > 0) {
          runner.previous_results = prevByHorse[name]
          patched++
        } else {
          failed++
        }
      }
    } catch (err) {
      console.warn(`  Failed to fetch race ${race.race_id}: ${err.message}`)
      failed += missingPrev.length
    }

    await new Promise(r => setTimeout(r, 300))
  }

  writeFileSync(cachePath, JSON.stringify(races, null, 2))
  return { date: dateStr, patched, alreadyHad, failed, total: runnersCount(races) }
}

function runnersCount(races) {
  return races.reduce((s, r) => s + (r.runners || []).length, 0)
}

async function main() {
  const args = process.argv.slice(2)
  const targetDate = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a))

  console.log('Loading backtest cache files...')
  let dates = readdirSync(CACHE_DIR)
    .filter(f => f.startsWith('results-') && f.endsWith('.json'))
    .map(f => f.replace('results-', '').replace('.json', ''))
    .sort()

  if (targetDate) {
    dates = dates.filter(d => d === targetDate)
    console.log(`Targeting single date: ${targetDate}`)
  }

  console.log(`Found ${dates.length} cache files to backfill`)

  console.log('Launching browser...')
  await initBrowser()
  console.log('Browser ready')

  const results = []
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]
    console.log(`\n[${i + 1}/${dates.length}] ${date}`)
    const res = await backfillDate(date)
    results.push(res)
    if (!res.skipped) {
      console.log(`  Patched: ${res.patched}, Already had: ${res.alreadyHad}, Failed: ${res.failed}, Total: ${res.total}`)
    } else {
      console.log(`  Skipped (no cache file)`)
    }
  }

  await closeBrowser()

  const totalPatched = results.reduce((s, r) => s + (r.patched || 0), 0)
  const totalFailed = results.reduce((s, r) => s + (r.failed || 0), 0)
  const totalAlready = results.reduce((s, r) => s + (r.alreadyHad || 0), 0)
  console.log(`\n=== Summary ===`)
  console.log(`Total patched: ${totalPatched}`)
  console.log(`Total already had: ${totalAlready}`)
  console.log(`Total failed: ${totalFailed}`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
