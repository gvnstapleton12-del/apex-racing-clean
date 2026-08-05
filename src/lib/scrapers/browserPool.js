import { chromium } from 'playwright'
import { execSync } from 'child_process'

let browser = null
let browserPromise = null

const PROXIES = process.env.PROXY_URLS
  ? process.env.PROXY_URLS.split(',').map(p => p.trim()).filter(Boolean)
  : []

function getRandomProxy() {
  if (PROXIES.length === 0) return undefined
  return PROXIES[Math.floor(Math.random() * PROXIES.length)]
}

function killZombieChromium() {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM chromium.exe /T 2>nul', { stdio: 'ignore' })
    } else {
      execSync('pkill -9 -f chromium 2>/dev/null || true', { stdio: 'ignore' })
    }
  } catch (_) {}
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
  if (browser) {
    try {
      if (browser.isConnected()) return browser
    } catch (_) {
      console.log('[BrowserPool] isConnected() threw, forcing relaunch')
      browser = null
    }
  }

  if (browserPromise) {
    return browserPromise
  }

  browserPromise = (async () => {
    const proxy = getRandomProxy()
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined)

    killZombieChromium()
    await new Promise(r => setTimeout(r, 1000))

    try {
      browser = await chromium.launch({
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
          '--use-gl=swiftshader',
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
        ],
        ...(proxy ? { proxy: { server: proxy } } : {}),
      })
    } catch (err) {
      console.error(`[BrowserPool] Launch failed: ${err.message}`)
      browserPromise = null
      killZombieChromium()
      throw err
    }

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
    try {
      await Promise.race([
        browser.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('browser.close() timed out')), 30000)),
      ])
    } catch (e) {
      console.error('[BrowserPool] closeBrowser failed:', e.message)
      killZombieChromium()
    }
    browser = null
    browserPromise = null
  }
}
