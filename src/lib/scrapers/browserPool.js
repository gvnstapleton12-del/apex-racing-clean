import { chromium } from 'playwright'

let browser = null
let browserPromise = null

const PROXIES = process.env.PROXY_URLS
  ? process.env.PROXY_URLS.split(',').map(p => p.trim()).filter(Boolean)
  : []

function getRandomProxy() {
  if (PROXIES.length === 0) return undefined
  return PROXIES[Math.floor(Math.random() * PROXIES.length)]
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
]

function randomAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

export async function getBrowser() {
  if (browser && browser.isConnected()) {
    return browser
  }

  if (browserPromise) {
    return browserPromise
  }

  browserPromise = (async () => {
    const proxy = getRandomProxy()
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      ...(proxy ? { proxy: { server: proxy } } : {}),
    })

    browser.on('disconnected', () => {
      console.log('[BrowserPool] Browser disconnected, will relaunch on next request')
      browser = null
      browserPromise = null
    })

    console.log(`[BrowserPool] Browser launched${proxy ? ' with proxy' : ''}`)
    browserPromise = null
    return browser
  })()

  return browserPromise
}

export async function createPage() {
  const br = await getBrowser()
  const context = await br.newContext({
    userAgent: randomAgent(),
    viewport: { width: 1920, height: 1080 },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    window.chrome = { runtime: {} }
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
    Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en', 'en-US'] })
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
  })

  return context
}

export async function closeBrowser() {
  if (browser) {
    await browser.close()
    browser = null
    browserPromise = null
  }
}
