// 30-Day Backfill Sweep
// Hits POST /api/results/backfill on the running server for the last N days
// Populates jockey_runs, horse_runs, RPR data, trainer form all at once
//
// Usage: node scripts/backfillSweep.mjs [days] [host]
//   days  — number of days to backfill (default 30)
//   host  — server URL (default http://127.0.0.1:3000)

const days = parseInt(process.argv[2]) || 30
const host = process.argv[3] || 'http://127.0.0.1:3000'

function getDateStr(offset) {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return d.toISOString().slice(0, 10)
}

async function fetchWithTimeout(url, options = {}, timeout = 120000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(id)
    return response
  } catch (error) {
    clearTimeout(id)
    throw error
  }
}

async function postDate(host, date) {
  const resp = await fetchWithTimeout(`${host}/api/results/backfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dates: [date] }),
  }, 120000)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
  return resp.json()
}

async function run() {
  console.log(`=== 30-Day Backfill Sweep ===`)
  console.log(`Target: ${host}/api/results/backfill`)
  console.log(`Days: ${days} (from ${getDateStr(days)} to ${getDateStr(0)})\n`)

  const dates = []
  for (let i = days; i >= 1; i--) {
    dates.push(getDateStr(i))
  }

  const allResults = {}
  let totalRaces = 0
  let errors = 0

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]
    const progress = `[${i + 1}/${dates.length}]`

    let success = false
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`${progress} ${date} (attempt ${attempt}/3)...`)
        const data = await postDate(host, date)
        if (data.results?.[date] != null) {
          const count = data.results[date]
          if (typeof count === 'number') {
            totalRaces += count
            console.log(`${progress} ${date}: ${count} races`)
          } else {
            console.error(`${progress} ${date}: ${count}`)
            errors++
          }
        }
        success = true
        break
      } catch (err) {
        console.error(`${progress} ${date} attempt ${attempt} failed: ${err.message}`)
        if (attempt < 3) {
          const backoff = attempt * 5000
          console.log(`  Retrying in ${backoff / 1000}s...`)
          await new Promise(r => setTimeout(r, backoff))
        }
      }
    }
    if (!success) {
      console.error(`${progress} ${date}: all attempts failed, skipping`)
      errors++
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`Total races scraped: ${totalRaces}`)
  console.log(`Dates processed: ${Object.keys(allResults).length}`)
  console.log(`Errors: ${errors}`)
}

run().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
