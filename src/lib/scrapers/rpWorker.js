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

import { execFile } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const RP_DIRECT_SCRIPT = join(__dirname, '../../../scripts/rpDirect.js')

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s*\(usa\)|\s*\(ire\)|\s*\(fr\)/g, '')
    .trim()
}

function parseRacecardsOutput(dateStr) {
  const outputPath = join(__dirname, '../../../data/rp-cache', `${dateStr}.json`)

  if (!existsSync(outputPath)) {
    console.log(`[RP Worker] No racecards file found at ${outputPath}`)
    return {}
  }

  const raw = JSON.parse(readFileSync(outputPath, 'utf8'))

  if (!raw || typeof raw !== 'object') return {}

  const dataMap = {}

  for (const [key, runner] of Object.entries(raw)) {
    const form = runner.form || ''
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
      horseName: runner.name || '',
      rpr: runner.rpr || null,
      ts: runner.ts || null,
      form,
      trainer: runner.trainer || null,
      courseWinRate: 0,
      courseRuns: 0,
      distWinRate: 0,
      distRuns: 0,
      goingWinRate: 0,
      goingRuns: 0,
      speedTrend,
      formWins: wins,
      formRuns: runs,
    }
  }

  return dataMap
}

function runRacecardsScraper(dateStr) {
  return new Promise((resolve, reject) => {
    const cacheDir = join(__dirname, '../../../data/rp-cache')
    const outputFile = join(cacheDir, `${dateStr}.json`)

    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }

    console.log(`[RP Worker] Running: node "${RP_DIRECT_SCRIPT}" ${dateStr} ${outputFile}`)

    // Use 'node' from PATH instead of process.execPath (which may be wrong in pm2)
    const nodePath = process.env.NODE_PATH || 'node'
    const nodeProcess = execFile(nodePath, [
      RP_DIRECT_SCRIPT,
      dateStr,
      outputFile
    ], {
      cwd: dirname(RP_DIRECT_SCRIPT),
      maxBuffer: 10 * 1024 * 1024
    })

    let stdout = ''
    let stderr = ''

    nodeProcess.stdout?.on('data', d => {
      stdout += d
      process.stdout.write(`[RP Direct] ${d}`)
    })

    nodeProcess.stderr?.on('data', d => {
      stderr += d
      process.stderr.write(`[RP Direct] ${d}`)
    })

    const timeout = setTimeout(() => {
      nodeProcess.kill('SIGTERM')
      reject(new Error('rpDirect timeout (5min)'))
    }, 5 * 60 * 1000)

    nodeProcess.on('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0) {
        console.error(`[RP Worker] rpDirect exited with code ${code}`)
        console.error(`[RP Worker] stderr: ${stderr.slice(-500)}`)
        resolve({})
        return
      }

      try {
        const dataMap = parseRacecardsOutput(dateStr)
        console.log(`[RP Worker] Parsed ${Object.keys(dataMap).length} horses from RP Direct`)
        resolve(dataMap)
      } catch (err) {
        console.error(`[RP Worker] Parse error: ${err.message}`)
        resolve({})
      }
    })

    nodeProcess.on('error', (err) => {
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
