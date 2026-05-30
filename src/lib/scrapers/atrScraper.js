import { chromium } from 'playwright'

const ATR_BASE = 'https://www.attheraces.com'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
]

function randomAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

async function fetchAtr(url, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': randomAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

async function fetchAtrWithPlaywright(url) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      userAgent: randomAgent(),
      viewport: { width: 1920, height: 1080 },
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForTimeout(5000)
    const html = await page.content()
    return html
  } finally {
    await browser.close()
  }
}

async function fetchAtrSafe(url) {
  try {
    return await fetchAtr(url)
  } catch (err) {
    if (err.message.includes('403') || err.message.includes('401')) {
      console.log(`[ATR] Fetch blocked (${err.message}), falling back to Playwright...`)
      return await fetchAtrWithPlaywright(url)
    }
    throw err
  }
}

function parseFractionalOdds(str) {
  if (!str) return 0
  const match = str.match(/(\d+)\/(\d+)/)
  if (match) return parseInt(match[1]) / parseInt(match[2]) + 1
  const num = parseFloat(str)
  return num > 1 ? num : 0
}

function extractResultsFromHtml(html, dateStr) {
  const races = []
  const raceBlocks = [...html.matchAll(/<div[^>]*class="[^"]*racecard[^"]*"[^>]*>/gi)]

  for (const block of raceBlocks) {
    const blockStart = block.index
    const blockEnd = Math.min(html.length, blockStart + 30000)
    const blockHtml = html.substring(blockStart, blockEnd)

    const courseMatch = blockHtml.match(/<h[23][^>]*class="[^"]*course[^"]*"[^>]*>([^<]+)<\/h[23]>/i)
    if (!courseMatch) continue

    const course = courseMatch[1].trim()
    const timeMatch = blockHtml.match(/<span[^>]*class="[^"]*time[^"]*"[^>]*>(\d{2}:\d{2})<\/span>/i)
    const offTime = timeMatch ? timeMatch[1] : null

    const runners = []
    const runnerRows = [...blockHtml.matchAll(/<tr[^>]*class="[^"]*runner[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)]

    for (const row of runnerRows) {
      const rowHtml = row[1]
      const posMatch = rowHtml.match(/<td[^>]*class="[^"]*position[^"]*"[^>]*>(\d+)<\/td>/i)
      const horseMatch = rowHtml.match(/<a[^>]*href="[^"]*\/horse\/[^"]*"[^>]*>([^<]+)<\/a>/i)
      const spMatch = rowHtml.match(/<td[^>]*class="[^"]*sp[^"]*"[^>]*>([^<]+)<\/td>/i)

      if (horseMatch) {
        runners.push({
          horse: horseMatch[1].trim(),
          position: posMatch ? parseInt(posMatch[1]) : 0,
          sp: spMatch ? parseFractionalOdds(spMatch[1].trim()) : 0,
        })
      }
    }

    if (runners.length > 0) {
      const region = course.toLowerCase().includes('(ire)') || course.toLowerCase().includes('down royal') || course.toLowerCase().includes('curragh') || course.toLowerCase().includes('leopardstown') ? 'IRE' : 'GB'
      races.push({
        course,
        off_time: offTime,
        date: dateStr,
        region,
        runners,
      })
    }
  }

  return races
}

export async function fetchAtrResults(dateStr) {
  try {
    const html = await fetchAtrSafe(`${ATR_BASE}/results/${dateStr}`)
    return extractResultsFromHtml(html, dateStr)
  } catch (err) {
    console.error(`[ATR Results] Failed for ${dateStr}:`, err.message)
    return []
  }
}

export async function fetchAtrRacecards(dateStr) {
  try {
    const html = await fetchAtrSafe(`${ATR_BASE}/racecard/${dateStr}`)
    return extractResultsFromHtml(html, dateStr)
  } catch (err) {
    console.error(`[ATR Racecards] Failed for ${dateStr}:`, err.message)
    return []
  }
}
