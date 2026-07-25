/**
 * ATR Ratings Worker — runs in a separate child_process
 * Receives date + race data via IPC, returns ratings via IPC
 * Isolates Playwright from the main server event loop
 */
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
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined)
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
      return await fetchAtrWithPlaywright(url)
    }
    throw err
  }
}

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

async function scrapeRatings(dateStr, races) {
  const cache = loadRatingsCache()
  const todayKey = dateStr
  if (cache[todayKey] && Object.keys(cache[todayKey]).length > 0) {
    console.log(`[ATR Worker] Loaded ${Object.keys(cache[todayKey]).length} cached ratings for ${dateStr}`)
    return cache[todayKey]
  }

  const ratings = {}

  const raceUrls = races.map(r => {
    const courseSlug = (r.course || '').toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')
    const dateParts = (r.date || dateStr).split('-')
    const dateFormatted = `${dateParts[2]}-${MONTHS[parseInt(dateParts[1])]}-${dateParts[0]}`
    return `${ATR_BASE}/racecard/${courseSlug}/${dateFormatted}/${(r.off_time || '').replace(':', '')}`
  })

  if (raceUrls.length === 0) {
    console.log('[ATR Worker] No race URLs to scrape')
    return ratings
  }

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined)
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

  let browser
  try {
    browser = await chromium.launch({ headless: true, executablePath, args: launchArgs })
    console.log(`[ATR Worker] Scraping ${raceUrls.length} race pages...`)

    let ctx = await browser.newContext({ userAgent: randomAgent(), viewport: { width: 1920, height: 1080 } })
    let pg = await ctx.newPage()
    await pg.route('**/*', (route) => {
      const type = route.request().resourceType()
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) return route.abort()
      return route.continue()
    })

    const scrapeRace = async (url) => {
      await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await pg.waitForTimeout(Math.floor(Math.random() * 1500) + 500)
      return pg.evaluate(() => {
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
    }

    const freshContext = async () => {
      try { await ctx.close().catch(() => {}) } catch {}
      ctx = await browser.newContext({ userAgent: randomAgent(), viewport: { width: 1920, height: 1080 } })
      pg = await ctx.newPage()
      await pg.route('**/*', (route) => {
        const type = route.request().resourceType()
        if (['image', 'media', 'font', 'stylesheet'].includes(type)) return route.abort()
        return route.continue()
      })
    }

    for (let i = 0; i < raceUrls.length; i++) {
      const url = raceUrls[i]
      try {
        const raceRatings = await scrapeRace(url)
        Object.assign(ratings, raceRatings)
        if (i < raceUrls.length - 1) await new Promise(r => setTimeout(r, 800))
      } catch (err) {
        console.warn(`[ATR Worker] Failed race ${i + 1}/${raceUrls.length}: ${err.message}`)
        if (err.message?.includes('crashed') || err.message?.includes('Target') || err.message?.includes('destroyed')) {
          console.warn('[ATR Worker] Page crashed, recreating context...')
          await freshContext()
        }
      }
    }
    await ctx.close().catch(() => {})

    console.log(`[ATR Worker] Scraped ${Object.keys(ratings).length} horse ratings`)
  } catch (err) {
    console.error(`[ATR Worker] Failed: ${err.message}`)
  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  if (Object.keys(ratings).length > 0) {
    cache[todayKey] = ratings
    saveRatingsCache(cache)
  }

  return ratings
}

// IPC mode: receive { dateStr, races } from parent, send back ratings
process.on('message', async (msg) => {
  if (msg.type === 'scrape') {
    try {
      console.log(`[ATR Worker] Received scrape request for ${msg.dateStr} (${msg.races.length} races)`)
      const ratings = await scrapeRatings(msg.dateStr, msg.races)
      process.send({ type: 'result', ratings })
    } catch (err) {
      process.send({ type: 'error', error: err.message })
    }
    process.exit(0)
  }
})

// CLI mode: node atrWorker.js <dateStr> <racesJsonFile>
if (process.argv.length >= 4) {
  const dateStr = process.argv[2]
  const racesFile = process.argv[3]
  try {
    const races = JSON.parse(readFileSync(racesFile, 'utf8'))
    scrapeRatings(dateStr, races).then(ratings => {
      writeFileSync(racesFile + '.result', JSON.stringify(ratings))
      process.exit(0)
    })
  } catch (err) {
    console.error(`[ATR Worker] CLI error: ${err.message}`)
    process.exit(1)
  }
}
