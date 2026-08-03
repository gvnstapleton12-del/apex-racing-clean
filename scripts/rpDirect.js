#!/usr/bin/env node

/**
 * rpDirect.js — Direct Racing Post API scraper (replaces rpscrape racecards.py)
 *
 * Fetches runner data (RPR, form, TopSpeed, trainer) directly from RP APIs.
 * No HTML scraping, no __NEXT_DATA__ dependency.
 *
 * Usage: node rpDirect.js <date> <outputJsonFile>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BASE = 'https://www.racingpost.com'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Referer': 'https://www.racingpost.com/racecards',
}

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s*\(usa\)|\s*\(ire\)|\s*\(fr\)/g, '')
    .trim()
}

async function fetchJSON(url) {
  try {
    const resp = await fetch(url, { headers: HEADERS })
    if (!resp.ok) return null
    return await resp.json()
  } catch (e) {
    return null
  }
}

async function getMeetings(date) {
  const data = await fetchJSON(`${BASE}/api/racing/meetings/?date=${date}`)
  if (!data?.meetings) return []
  return data.meetings.filter(m => {
    const code = (m.venueCountryCode || '').toLowerCase()
    return code === 'gb' || code === 'ire'
  })
}

async function getRunners(raceId) {
  const data = await fetchJSON(`${BASE}/profile/horse/data/cardrunners/${raceId}.json`)
  if (!data?.runners) return []
  return Object.values(data.runners)
}

function extractRunnerData(runner) {
  const form = (runner.figuresCalculated || [])
    .map(f => f.formFigure)
    .reverse()
    .join('')

  return {
    name: runner.horseName || '',
    rpr: runner.rpPostmark || null,
    ts: runner.rpTopspeed || null,
    form,
    trainer: runner.trainerStylename || null,
  }
}

async function main() {
  const date = process.argv[2]
  const outputFile = process.argv[3]

  if (!date || !outputFile) {
    console.error('Usage: node rpDirect.js <date> <outputFile>')
    process.exit(1)
  }

  console.log(`[RP Direct] Fetching meetings for ${date}...`)
  const meetings = await getMeetings(date)
  console.log(`[RP Direct] Found ${meetings.length} UK/IRE meetings`)

  const dataMap = {}
  let totalRunners = 0
  let totalRaces = 0

  for (const meeting of meetings) {
    const course = meeting.courseName || meeting.courseKey || 'Unknown'
    console.log(`[RP Direct] ${course}: ${meeting.races?.length || 0} races`)

    for (const race of (meeting.races || [])) {
      const raceId = race.raceId
      if (!raceId) continue

      const runners = await getRunners(raceId)
      totalRaces++

      for (const runner of runners) {
        const data = extractRunnerData(runner)
        if (data.name) {
          dataMap[normalizeName(data.name)] = data
          totalRunners++
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200))
    }
  }

  console.log(`[RP Direct] Done: ${totalRunners} runners from ${totalRaces} races`)

  const outputDir = dirname(outputFile)
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }
  writeFileSync(outputFile, JSON.stringify(dataMap))
  console.log(`[RP Direct] Written to ${outputFile}`)
}

main().catch(err => {
  console.error(`[RP Direct] Fatal: ${err.message}`)
  process.exit(1)
})
