import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

const ATR_BASE = 'https://www.attheraces.com'
const RATINGS_CACHE_PATH = resolve('data/atrRatings.json')

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
]

function randomAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function loadRatingsCache() {
  try {
    return JSON.parse(readFileSync(RATINGS_CACHE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveRatingsCache(cache) {
  try {
    mkdirSync(dirname(RATINGS_CACHE_PATH), { recursive: true })
    writeFileSync(RATINGS_CACHE_PATH, JSON.stringify(cache, null, 2))
  } catch (e) {}
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
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium'
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-vulkan',
      '--use-angle=swiftshader',
      '--no-proxy-server',
      '--ignore-certificate-errors',
      '--disable-features=NetworkService,UseSkiaRenderer,Vulkan',
      '--no-zygote',
      '--disable-site-isolation-trials',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-ipc-flooding-protection',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--password-store=basic',
      '--use-mock-keychain',
      '--no-first-run',
      '--hide-scrollbars',
      '--mute-audio',
      '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
      '--disable-accelerated-2d-canvas',
      '--disable-features=NetworkService,Translate,BackForwardCache,AcceptCHFrame,AutoExpandDetailsElement,AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,UseSkiaRenderer,Vulkan',
      '--disable-accelerated-2d-canvas',
    ],
  })
  try {
    const context = await browser.newContext({
      userAgent: randomAgent(),
      viewport: { width: 1920, height: 1080 },
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(3000)
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

export async function fetchAtrRatings(dateStr, races = []) {
  const cache = loadRatingsCache()
  const todayKey = dateStr
  if (cache[todayKey] && Object.keys(cache[todayKey]).length > 0) {
    console.log(`[ATR Ratings] Loaded ${Object.keys(cache[todayKey]).length} cached ratings for ${dateStr}`)
    return cache[todayKey]
  }

  const ratings = {}
  let browser

  const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  const raceUrls = races.map(r => {
    const courseSlug = (r.course || '').toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')
    const dateParts = (r.date || dateStr).split('-')
    const dateFormatted = `${dateParts[2]}-${MONTHS[parseInt(dateParts[1])]}-${dateParts[0]}`
    return `${ATR_BASE}/racecard/${courseSlug}/${dateFormatted}/${(r.off_time || '').replace(':', '')}`
  })

  if (raceUrls.length === 0) {
    console.log(`[ATR Ratings] No race URLs to scrape`)
    return ratings
  }

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium'
  const launchArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-vulkan',
    '--use-angle=swiftshader',
    '--no-proxy-server',
    '--ignore-certificate-errors',
    '--disable-features=NetworkService,UseSkiaRenderer,Vulkan',
    '--no-zygote',
    '--disable-site-isolation-trials',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-ipc-flooding-protection',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--password-store=basic',
    '--use-mock-keychain',
    '--no-first-run',
    '--hide-scrollbars',
    '--mute-audio',
    '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
    '--disable-accelerated-2d-canvas',
    '--disable-features=NetworkService,Translate,BackForwardCache,AcceptCHFrame,AutoExpandDetailsElement,AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,UseSkiaRenderer,Vulkan',
    '--disable-accelerated-2d-canvas',
  ]
  try {
    browser = await chromium.launch({ headless: true, executablePath, args: launchArgs })
    console.log(`[ATR Ratings] Scraping ${raceUrls.length} race pages...`)

    const CONCURRENCY = 2
    for (let i = 0; i < raceUrls.length; i += CONCURRENCY) {
      const batch = raceUrls.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(batch.map(async (url) => {
        const ctx = await browser.newContext({ userAgent: randomAgent(), viewport: { width: 1920, height: 1080 } })
        const pg = await ctx.newPage()
        try {
          await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
          await pg.waitForTimeout(4000)
          const raceRatings = await pg.evaluate(() => {
            const result = {}
            const cells = [...document.querySelectorAll('[class*="card-cell--timeform"]')]
            for (const cell of cells) {
              const text = cell.textContent?.trim()
              if (!text || !/^\d{2,3}$/.test(text)) continue
              const rating = parseInt(text)
              if (rating < 50 || rating > 120) continue
              let parent = cell
              for (let i = 0; i < 20 && parent; i++) {
                const horseLink = parent.querySelector('a[href*="/horse/"]')
                if (horseLink) {
                  const name = horseLink.textContent?.trim()?.replace(/\s+/g, ' ')
                  if (name) result[name] = rating
                  break
                }
                parent = parent.parentElement
              }
            }
            return result
          })
          return raceRatings
        } finally {
          await ctx.close()
        }
      }))
      for (const r of results) {
        if (r.status === 'fulfilled') Object.assign(ratings, r.value)
      }
      if (i + CONCURRENCY < raceUrls.length) await new Promise(r => setTimeout(r, 500))
    }

    console.log(`[ATR Ratings] Scraped ${Object.keys(ratings).length} horse ratings`)
  } catch (err) {
    console.error(`[ATR Ratings] Failed: ${err.message}`)
  } finally {
    if (browser) await browser.close()
  }

  if (Object.keys(ratings).length > 0) {
    cache[todayKey] = ratings
    saveRatingsCache(cache)
  }

  return ratings
}
