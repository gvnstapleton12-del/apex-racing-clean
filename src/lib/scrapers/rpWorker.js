#!/usr/bin/env node

/**
 * rpWorker.js — Racing Post data extraction worker
 *
 * Runs rpscrape's racecards.py as a child process, parses the JSON output,
 * and returns horse performance data (RPR, TopSpeed, stats) via IPC.
 *
 * IPC Protocol:
 *   Inbound:  { type: 'scrape', dateStr: 'YYYY-MM-DD' }
 *   Outbound: { type: 'result', data: Record<string, RPData> }
 *   Error:    { type: 'error', error: string }
 *
 * CLI mode: node rpWorker.js <dateStr> <outputJsonFile>
 */

import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const RPSCRAPE_DIR = resolve(__dirname, '../../../../rpscrape')
const RACECARDS_SCRIPT = join(RPSCRAPE_DIR, 'scripts', 'racecards.py')

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s*\(usa\)|\s*\(ire\)|\s*\(fr\)/g, '')
    .trim()
}

function parseRacecardsOutput(dateStr) {
  const outputPath = join(RPSCRAPE_DIR, 'racecards', `${dateStr}.json`)

  if (!existsSync(outputPath)) {
    console.log(`[RP Worker] No racecards file found at ${outputPath}`)
    return {}
  }

  const raw = JSON.parse(readFileSync(outputPath, 'utf8'))
  const dataMap = {}

  for (const [region, courses] of Object.entries(raw)) {
    for (const [course, times] of Object.entries(courses)) {
      for (const [offTime, racecard] of Object.entries(times)) {
        const runners = racecard.runners || []
        for (const runner of runners) {
          const name = runner.name || ''
          const key = normalizeName(name)

          const form = runner.form || ''
          const rpr = runner.rpr || null
          const ts = runner.ts || null

          const stats = runner.stats || {}
          const horseStats = stats.horse || {}
          const courseStats = horseStats.course || {}
          const distStats = horseStats.distance || {}
          const goingStats = horseStats.going || {}

          const formChars = form.split('')
          const wins = formChars.filter(c => c === '1').length
          const runs = formChars.length

          const speedTrend = formChars.slice(0, 5).reverse().map(c => {
            if (c === '1') return 100
            if (c === '2') return 90
            if (c === '3') return 80
            if (c === '4') return 70
            if (c === '5') return 60
            if (c >= '6' && c <= '9') return 50 - (parseInt(c) - 6) * 5
            return 0
          }).filter(v => v > 0)

          dataMap[key] = {
            horseName: name,
            rpr,
            ts,
            form,
            trainer: runner.trainer || null,
            courseWinRate: courseStats.wins ? parseInt(courseStats.wins) : 0,
            courseRuns: courseStats.runs ? parseInt(courseStats.runs) : 0,
            distWinRate: distStats.wins ? parseInt(distStats.wins) : 0,
            distRuns: distStats.runs ? parseInt(distStats.runs) : 0,
            goingWinRate: goingStats.wins ? parseInt(goingStats.wins) : 0,
            goingRuns: goingStats.runs ? parseInt(goingStats.runs) : 0,
            speedTrend,
            formWins: wins,
            formRuns: runs,
          }
        }
      }
    }
  }

  return dataMap
}

function runRacecardsScraper(dateStr) {
  return new Promise((resolve, reject) => {
    console.log(`[RP Worker] Running: python "${RACECARDS_SCRIPT}" --day 1 --region gb`)

    const pythonProcess = spawn('python', [
      RACECARDS_SCRIPT,
      '--day', '1',
      '--region', 'gb'
    ], {
      cwd: join(RPSCRAPE_DIR, 'scripts'),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    pythonProcess.stdout?.on('data', d => {
      stdout += d
      process.stdout.write(`[RP Python] ${d}`)
    })

    pythonProcess.stderr?.on('data', d => {
      stderr += d
      process.stderr.write(`[RP Python] ${d}`)
    })

    const timeout = setTimeout(() => {
      pythonProcess.kill('SIGTERM')
      reject(new Error('rpscrape timeout (5min)'))
    }, 5 * 60 * 1000)

    pythonProcess.on('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0) {
        console.error(`[RP Worker] rpscrape exited with code ${code}`)
        console.error(`[RP Worker] stderr: ${stderr.slice(-500)}`)
        resolve({})
        return
      }

      try {
        const dataMap = parseRacecardsOutput(dateStr)
        console.log(`[RP Worker] Parsed ${Object.keys(dataMap).length} horses from racecards`)
        resolve(dataMap)
      } catch (err) {
        console.error(`[RP Worker] Parse error: ${err.message}`)
        resolve({})
      }
    })

    pythonProcess.on('error', (err) => {
      clearTimeout(timeout)
      console.error(`[RP Worker] Spawn error: ${err.message}`)
      resolve({})
    })
  })
}

// IPC mode
process.on('message', async (msg) => {
  if (msg.type === 'scrape') {
    try {
      console.log(`[RP Worker] Received scrape request for ${msg.dateStr}`)
      const data = await runRacecardsScraper(msg.dateStr)
      process.send({ type: 'result', data })
    } catch (err) {
      process.send({ type: 'error', error: err.message })
    }
    process.exit(0)
  }
})

// CLI mode: node rpWorker.js <dateStr> <outputJsonFile>
if (process.argv.length >= 4) {
  const dateStr = process.argv[2]
  const outputFile = process.argv[3]
  runRacecardsScraper(dateStr).then(data => {
    writeFileSync(outputFile, JSON.stringify(data))
    process.exit(0)
  }).catch(err => {
    console.error(`[RP Worker] CLI error: ${err.message}`)
    process.exit(1)
  })
}
