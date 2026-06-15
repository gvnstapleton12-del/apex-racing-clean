import { createPage } from './browserPool.js'

const SL_BASE = 'https://www.sportinglife.com'
const SL_API = 'https://www.sportinglife.com/api/horse-racing'

const UK_IRE_COURSES = new Set([
  'ascot', 'ayr', 'bath', 'beverley', 'brighton', 'cartmel', 'carlisle', 'cheltenham', 'chester', 'catterick', 'chepstow',
  'doncaster', 'down-royal', 'epsom', 'fairyhouse', 'goodwood', 'hamilton', 'haydock', 'hereford', 'hexham', 'huntingdon',
  'kelso', 'kempton', 'leicester', 'lingfield', 'market-rasen', 'newbury', 'newcastle', 'newmarket',
  'newton-abbot', 'northam', 'nottingham', 'plumpton', 'pontefract', 'redcar', 'ripon', 'sandown', 'sedgefield',
  'southwell', 'stratford', 'taunton', 'thirsk', 'uttoxeter', 'wetherby', 'wolverhampton', 'worcester',
  'great-yarmouth', 'yarmouth', 'york', 'ballinrobe', 'curragh', 'dundalk', 'galway', 'killarney',
  'laytown', 'leopardstown', 'listowel', 'naas', 'navan', 'punchestown', 'roscommon', 'sligo',
  'tipperary', 'tramore', 'wexford', 'gowran-park',
  'aintree', 'bangor-on-dee', 'chelmsford-city', 'exeter', 'fakenham', 'ffos-las', 'fontwell-park', 'ludlow', 'musselburgh', 'perth', 'salisbury', 'warwick', 'wincanton', 'windsor',
  'bellewstown', 'clonmel', 'cork', 'downpatrick', 'kilbeggan', 'limerick', 'thurles',
])

function isUkIre(course) {
  const slug = course.toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/\s+/g, '-')
    .replace(/'/g, '')
    .trim()
    .replace(/-downs$/, '')
    .replace(/-park$/, '')
    .replace(/-city$/, '')
    .replace(/-racecourse$/, '')
  return UK_IRE_COURSES.has(slug) || UK_IRE_COURSES.has(slug + '-downs') || UK_IRE_COURSES.has(slug + '-park') || UK_IRE_COURSES.has(slug + '-city')
}

function deriveRaceType(raceName = '') {
  const n = raceName.toLowerCase()
  if (n.includes('chase') || n.includes('steeple')) return 'Chase'
  if (n.includes('hurdle')) return 'Hurdle'
  if (n.includes('nh flat') || n.includes('national hunt flat') || n.includes('bumper')) return 'NH Flat'
  return 'Flat'
}

function parseFractionalOdds(str) {
  if (!str || str === 'SP') return 0
  const match = str.match(/(\d+)\/(\d+)/)
  if (match) return parseFloat((parseInt(match[1]) / parseInt(match[2]) + 1).toFixed(2))
  const num = parseFloat(str)
  return num > 1 ? num : 0
}

async function fetchJson(url) {
  const context = await createPage()
  try {
    const page = await context.newPage()
    const data = await page.evaluate(async (u) => {
      const res = await fetch(u)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    }, url)
    return data
  } finally {
    await context.close()
  }
}

async function fetchMeetingList(dateStr) {
  try {
    const context = await createPage()
    try {
      const page = await context.newPage()
      await page.goto(`${SL_BASE}/racing/racecards/${dateStr}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(3000)

      const UK_IRE_KEYWORDS = [
        'ascot', 'ayr', 'bath', 'beverley', 'brighton', 'cartmel', 'carlisle', 'cheltenham', 'chester', 'catterick', 'chepstow',
        'doncaster', 'down royal', 'epsom', 'fairyhouse', 'goodwood', 'hamilton', 'haydock', 'hereford', 'hexham', 'huntingdon',
        'kelso', 'kempton', 'leicester', 'lingfield', 'market rasen', 'newbury', 'newcastle', 'newmarket',
        'newton abbot', 'northam', 'nottingham', 'plumpton', 'pontefract', 'redcar', 'ripon', 'sandown', 'sedgefield',
        'southwell', 'stratford', 'taunton', 'thirsk', 'uttoxeter', 'wetherby', 'wolverhampton', 'worcester',
        'great yarmouth', 'yarmouth', 'york', 'ballinrobe', 'curragh', 'dundalk', 'galway', 'killarney',
        'laytown', 'leopardstown', 'listowel', 'naas', 'navan', 'punchestown', 'roscommon', 'sligo',
        'tipperary', 'tramore', 'wexford', 'gowran park',
        'aintree', 'bangor-on-dee', 'chelmsford city', 'exeter', 'fakenham', 'ffos las', 'fontwell park', 'ludlow', 'musselburgh', 'perth', 'salisbury', 'warwick', 'wincanton', 'windsor',
        'bellewstown', 'clonmel', 'cork', 'downpatrick', 'kilbeggan', 'limerick', 'thurles',
      ]

      // Single evaluate: click each UK/IRE tab with async delays, collect all fast-cards links
      const allData = await page.evaluate(async (ukIreKeywords) => {
        const sleep = ms => new Promise(r => setTimeout(r, ms))
        const tabSelector = 'span[id].NewGenericTabs__Tab-sc-bbf7998f-2, span[id].NewGenericTabs__ActiveTab-sc-bbf7998f-3'
        const tabs = Array.from(document.querySelectorAll(tabSelector))

        const ukIreTabs = tabs.filter(t => {
          const name = t.textContent.trim().toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim()
          return ukIreKeywords.some(k => name.includes(k))
        })

        // Click each tab and wait for content to render
        for (const tab of ukIreTabs) {
          try { tab.click() } catch {}
          await sleep(1500)
        }

        // Now collect all fast-cards links
        const allLinks = document.querySelectorAll('a[href*="/racing/fast-cards/"]')
        const meetings = []
        const abandoned = []
        const seen = new Set()
        for (const link of allLinks) {
          const href = link.getAttribute('href')
          const match = href.match(/\/racing\/fast-cards\/(\d+)\/(\d{4}-\d{2}-\d{2})\/([^/]+)/)
          if (!match) continue
          const key = match[1]
          if (seen.has(key)) continue
          seen.add(key)
          const entry = { id: match[1], date: match[2], slug: match[3], name: link.textContent.trim() }
          if (entry.name.toLowerCase().includes('abandoned') || entry.name.toLowerCase().includes('(off)')) {
            abandoned.push(entry)
          } else {
            meetings.push(entry)
          }
        }

        return { tabCount: ukIreTabs.length, meetings, abandoned }
      }, UK_IRE_KEYWORDS)

      console.log(`[SL] ${allData.tabCount} UK/IRE tabs → ${allData.meetings.length} meetings, ${allData.abandoned.length} abandoned`)
      allData.meetings.forEach(m => console.log(`[SL] Found meeting: "${m.name}" (slug: ${m.slug})`))
      allData.abandoned.forEach(m => console.log(`[SL] Abandoned meeting: ${m.name}`))

      return { meetings: allData.meetings, abandoned: allData.abandoned }
    } finally {
      await context.close()
    }
  } catch (err) {
    console.error(`[SL] Failed to fetch meeting list: ${err.message}`)
    return []
  }
}

function isBst(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')
  const year = d.getUTCFullYear()
  const bstStart = new Date(Date.UTC(year, 2, 31))
  bstStart.setUTCDate(bstStart.getUTCDate() - bstStart.getUTCDay())
  bstStart.setUTCHours(1, 0, 0, 0)
  const bstEnd = new Date(Date.UTC(year, 9, 31))
  bstEnd.setUTCDate(bstEnd.getUTCDate() - bstEnd.getUTCDay())
  bstEnd.setUTCHours(1, 0, 0, 0)
  return d >= bstStart && d < bstEnd
}

function gmtToBstTime(timeStr) {
  if (!timeStr) return timeStr
  const [, h, m] = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/) || []
  if (h == null) return timeStr
  const newH = parseInt(h, 10) + 1
  return `${String(newH).padStart(2, '0')}:${m}`
}

function resolveNewmarketCourse(baseName, raceDate) {
  const n = (baseName || '').toLowerCase().trim()
  // If API already provides a specific course name, trust it
  if (n.includes('july')) return 'Newmarket (July Course)'
  if (n.includes('rowley')) return 'Newmarket (Rowley Mile)'
  if (n === 'newmarket' && raceDate) {
    const month = new Date(raceDate).getMonth()
    // July Course operates June (5) through August (7)
    if (month >= 5 && month <= 7) {
      console.log(`[SL] Resolved Newmarket -> Newmarket (July Course) for ${raceDate}`)
      return 'Newmarket (July Course)'
    }
    return 'Newmarket (Rowley Mile)'
  }
  return baseName
}

export async function fetchMeetingRaces(meetingId) {
  try {
    const data = await fetchJson(`${SL_API}/meeting/${meetingId}`)
    const meeting = data.meeting_summary
    const races = data.races || []

    console.log(`[SL] Meeting ${meetingId} status: ${meeting?.status || meeting?.meeting_status || 'none'}, course: ${meeting?.course_name || 'unknown'}`)

    // Skip abandoned meetings (case-insensitive)
    const status = (meeting?.status || meeting?.meeting_status || '').toUpperCase()
    if (status === 'ABANDONED') {
      console.log(`[SL] Skipping abandoned meeting: ${meeting.course_name || meetingId}`)
      return []
    }

    return races.map(race => {
      const isUk = isUkIre(race.course_name)
      const localTime = isUk && race.date && isBst(race.date) ? gmtToBstTime(race.time) : race.time
      const offDt = race.date && localTime ? `${race.date}T${localTime}:00` : null
      const course = resolveNewmarketCourse(race.course_name, race.date)
      return {
        race_id: String(race.race_summary_reference.id),
        course,
        off_time: localTime,
        off_dt: offDt,
        date: race.date,
        region: isUk ? 'GB' : 'IRE',
        race_name: race.name,
        type: deriveRaceType(race.name),
        going: race.going || meeting.going || '',
        surface: meeting.surface_summary || '',
        field_size: race.ride_count || 0,
        race_class: parseInt(race.race_class) || 0,
        distance_f: race.distance || '',
        runners: [],
        _apiUrl: `${SL_API}/race/${race.race_summary_reference.id}`,
      }
    })
  } catch (err) {
    console.error(`[SL] Failed to fetch meeting ${meetingId}: ${err.message}`)
    return []
  }
}

async function fetchRaceRunners(raceId) {
  try {
    const data = await fetchJson(`${SL_API}/race/${raceId}`)
    const rides = data.rides || []

    return rides
      .filter(ride => {
        const status = (ride.ride_status || '').toUpperCase()
        if (status === 'NONRUNNER' || status === 'NON_RUNNER' || status === 'WITHDRAWN') {
          console.log(`[SL] Filtering non-runner: ${ride.horse?.name || 'Unknown'} (status: ${status})`)
          return false
        }
        return true
      })
      .map((ride, i) => {
      const horseName = ride.horse?.name || ''
      const lastRunDays = ride.horse?.last_run_days || ride.horse?.days_since_last_run || ride.horse?.formsummary?.days_since || ride.days_since || 0
      const lastRunDate = ride.horse?.last_run_date || ride.horse?.last_ran || ride.horse?.formsummary?.last_run_date || ''
      let lastRun = Number(lastRunDays || 0)
      if (!lastRun && lastRunDate) {
        try {
          const diff = Date.now() - new Date(lastRunDate).getTime()
          lastRun = Math.round(diff / 86400000)
        } catch (e) {}
      }
      return {
      horse_id: String(ride.horse?.horse_reference?.id || ''),
      horse: horseName,
      atrUrl: `https://www.attheraces.com/search?search=${encodeURIComponent(horseName)}`,
      position: ride.finish_position || 0,
      finish_distance: ride.finish_distance || '',
      jockey: ride.jockey?.name || '',
      trainer: ride.trainer?.name || '',
      odds: parseFractionalOdds(ride.betting?.current_odds),
      sp: parseFractionalOdds(ride.betting?.sp || ride.betting?.starting_price),
      draw: ride.draw_number || ride.cloth_number || 0,
      lbs: ride.handicap || '',
      or: Number(ride.official_rating || ride.horse?.official_rating || 0) || 0,
      rpr: Number(ride.rpr || ride.horse?.rpr || 0) || 0,
      bha_trend: (() => {
        const or = Number(ride.official_rating || 0) || 0
        const prev = ride.horse?.previous_results || []
        const lastBha = Number(prev[0]?.bha || 0) || 0
        return or > 0 && lastBha > 0 ? or - lastBha : 0
      })(),
      form: ride.horse?.formsummary?.display_text || '',
      age: ride.horse?.age || 0,
      sex: ride.horse?.sex?.type || '',
      last_run: lastRun,
      commentary: ride.commentary || '',
      headgear: (() => {
        const hg = ride.horse?.headgear || ride.headgear || []
        if (!Array.isArray(hg)) return { items: [], firstTimeItems: [] }
        const items = hg.map(h => (typeof h === 'string' ? h : h.type || h.name || '')).filter(Boolean)
        const firstTimeItems = hg.filter(h => h && h.first_time).map(h => h.type || h.name || '').filter(Boolean)
        return { items, firstTimeItems }
      })(),
      previous_results: (ride.horse?.previous_results || []).slice(0, 6),
      race_history_stats: ride.race_history_stats || null,
      horse_lifetime_stats: ride.horse_lifetime_stats || null,
      insights: ride.insights || null,
      bet_movements: ride.bet_movements || null,
    }
    })
  } catch (err) {
    console.error(`[SL] Failed to fetch race ${raceId}: ${err.message}`)
    return []
  }
}

async function fetchResultRunners(race) {
  try {
    const courseSlug = (race.course || '').toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')
    const raceNameSlug = (race.race_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const url = `${SL_BASE}/racing/results/${race.date}/${courseSlug}/${race.race_id}/${raceNameSlug}`

    console.log(`[SL] Scraping result page: ${url}`)

    const context = await createPage()
    try {
      const page = await context.newPage()

      let responseData = null
      page.on('response', async (response) => {
        const reqUrl = response.url()
        if (reqUrl.includes('/api/horse-racing/race/') && response.status() === 200) {
          try {
            responseData = await response.json()
          } catch (e) {}
        }
      })

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(5000)

      if (responseData?.rides) {
        console.log(`[SL] Got ${responseData.rides.length} rides from API response`)
        const runners = responseData.rides
          .filter(ride => ride.finish_position > 0)
          .map((ride) => {
            const horseName = ride.horse?.name || ''
            return {
              horse_id: String(ride.horse?.horse_reference?.id || ''),
              horse: horseName,
              atrUrl: `https://www.attheraces.com/search?search=${encodeURIComponent(horseName)}`,
              position: ride.finish_position,
              finish_distance: ride.finish_distance || '',
              jockey: ride.jockey?.name || '',
              trainer: ride.trainer?.name || '',
              odds: 0,
              sp: parseFractionalOdds(ride.betting?.sp || ride.betting?.starting_price),
              draw: ride.draw_number || ride.cloth_number || 0,
              lbs: ride.handicap || '',
              form: '',
              age: ride.horse?.age || 0,
              sex: ride.horse?.sex?.type || '',
              commentary: ride.commentary || '',
            }
          })
          .sort((a, b) => a.position - b.position)
        console.log(`[SL] Extracted ${runners.length} runners from API`)
        return runners
      }

      console.log(`[SL] No API response captured, falling back to HTML scrape`)

      const runners = await page.evaluate(() => {
        const nextData = document.querySelector('#__NEXT_DATA__')
        if (nextData) {
          try {
            const data = JSON.parse(nextData.textContent)
            const raceData = data.props?.pageProps?.race || data.props?.pageProps?.result
            if (raceData?.rides) {
              return raceData.rides
                .filter(ride => ride.finish_position > 0)
                .map((ride) => {
                  const horseName = ride.horse?.name || ''
                  return {
                    horse_id: '',
                    horse: horseName,
                    atrUrl: '',
                    position: ride.finish_position,
                    finish_distance: ride.finish_distance || '',
                    jockey: ride.jockey?.name || '',
                    trainer: ride.trainer?.name || '',
                    odds: 0,
                    sp: 0,
                    draw: 0,
                    lbs: '',
                    form: '',
                    age: 0,
                    sex: '',
                    commentary: '',
                  }
                })
                .sort((a, b) => a.position - b.position)
            }
          } catch (e) {}
        }
        return []
      })

      console.log(`[SL] Scraped ${runners.length} runners from HTML`)
      return runners
    } finally {
      await context.close()
    }
  } catch (err) {
    console.error(`[SL] Failed to scrape result ${race.race_id}: ${err.message}`)
    return []
  }
}

async function fetchResultsMeetingList(dateStr) {
  try {
    const html = await (async () => {
      const context = await createPage()
      try {
        const page = await context.newPage()
        await page.goto(`${SL_BASE}/racing/results/${dateStr}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForTimeout(2000)
        return await page.content()
      } finally {
        await context.close()
      }
    })()

    const meetingRegex = /<a[^>]*href="\/racing\/meeting\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/(\d+)"[^>]*>([^<]+)<\/a>/gi
    const meetings = [...html.matchAll(meetingRegex)]

    return meetings
      .filter(m => isUkIre(m[2]))
      .map(m => ({ id: m[3], date: m[1], slug: m[2], name: m[4] }))
  } catch (err) {
    console.error(`[SL] Failed to fetch results meeting list: ${err.message}`)
    return []
  }
}

export async function fetchSlRacecards(dateStr) {
  try {
    console.log(`[SL] Fetching racecards for ${dateStr}...`)
    console.time('[SL] fetchMeetingList')
    const result = await fetchMeetingList(dateStr)
    console.timeEnd('[SL] fetchMeetingList')
    const meetings = result?.meetings || result || []
    const abandoned = result?.abandoned || []

    console.log(`[SL] Found ${meetings.length} UK/IRE meetings, ${abandoned.length} abandoned`)

    const allRaces = []

    console.time('[SL] fetchMeetingRaces')
    for (const meeting of meetings) {
      console.log(`[SL] Fetching ${meeting.name}...`)
      const races = await fetchMeetingRaces(meeting.id)
      console.log(`[SL] ${meeting.name}: ${races.length} races`)
      allRaces.push(...races)
      await new Promise(r => setTimeout(r, 500))
    }
    console.timeEnd('[SL] fetchMeetingRaces')

    console.log(`[SL] Total ${allRaces.length} UK/IRE races`)

    // Fetch runners for ALL races — parallel batches of 3 (reduced for memory)
    const CONCURRENCY = 3
    let runnerCount = 0
    console.time('[SL] fetchAllRunners')
    for (let i = 0; i < allRaces.length; i += CONCURRENCY) {
      const batch = allRaces.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        batch.map(race =>
          race._apiUrl
            ? fetchRaceRunners(race.race_id).then(runners => {
                console.log(`[SL] Fetched ${race.course} ${race.off_time} (${runners.length} runners)`)
                return runners
              })
            : Promise.resolve([])
        )
      )
      results.forEach((runners, j) => { allRaces[i + j].runners = runners })
      runnerCount += results.reduce((s, r) => s + r.length, 0)
      // Brief pause between batches to avoid rate limiting
      const mem = process.memoryUsage()
      console.log(`[SL] Runner batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(allRaces.length / CONCURRENCY)} | RSS: ${Math.round(mem.rss/1024/1024)}MB`)
      await new Promise(r => setTimeout(r, 500))
    }
    console.timeEnd('[SL] fetchAllRunners')

    return { races: allRaces, abandoned }
  } catch (err) {
    console.error(`[SL Racecards] Failed for ${dateStr}:`, err.message)
    return []
  }
}

export async function fetchSlResults(dateStr) {
  try {
    console.log(`[SL] Fetching results for ${dateStr}...`)
    
    const context = await createPage()
    try {
      const page = await context.newPage()
      await page.goto(`${SL_BASE}/racing/results/${dateStr}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(2000)

      // Dismiss cookie consent if present
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Allow All'))
        if (btn) btn.click()
      })
      await page.waitForTimeout(1000)

      const raceLinks = await page.evaluate(() => {
        const resultLinks = document.querySelectorAll('a[href*="/racing/results/"]')
        const cardLinks = document.querySelectorAll('a[href*="/racing/racecards/"]')
        const allLinks = [...resultLinks, ...cardLinks]
        return Array.from(allLinks).map(link => ({
          url: link.href,
          title: link.textContent.trim()
        })).filter(link => link.url && link.title)
      })

      // Filter to only individual race pages (not list pages like /racing/results/yesterday)
      const individualLinks = raceLinks.filter(link => {
        const url = link.url
        // Must have a course slug (more than just date in path)
        const matches = url.match(/\/racing\/(?:racecards|results)\/\d{4}-\d{2}-\d{2}\/([^/]+)\/(?:racecard\/)?(\d+)/)
        return matches !== null
      })

      // Deduplicate by numeric race ID (same race can appear as both /results/ and /racecards/ link)
      const uniqueLinks = individualLinks.filter((link, idx, arr) => {
        const idMatch = link.url.match(/(\d+)\/[^/]+$/)
        const raceId = idMatch ? idMatch[1] : link.url
        return arr.findIndex(l => {
          const m = l.url.match(/(\d+)\/[^/]+$/)
          return m ? m[1] === raceId : l.url === link.url
        }) === idx
      })

      console.log(`[SL] Found ${uniqueLinks.length} individual race links for ${dateStr}`)

      // Close listing page; reuse context for parallel race scraping
      await page.close()

      const allRaces = []
      const CONCURRENCY = 2

      async function scrapeRace(race) {
        const racePage = await context.newPage()
        try {
          await racePage.goto(race.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await racePage.waitForTimeout(2000)

          const isRaceFinished = await racePage.evaluate(() => {
            const headerText = document.querySelector('[class*="RaceHeader__"], [class*="HeaderSummary__"]')?.textContent || ''
            const bodyText = document.body.textContent || ''
            return headerText.toLowerCase().includes('weighed in') || 
                   headerText.toLowerCase().includes('result') ||
                   bodyText.toLowerCase().includes('weighed in')
          })

          if (!isRaceFinished) return null

          const finalResults = await racePage.evaluate(() => {
            const results = []
            const seenHorses = new Set()

            const horseLinks = document.querySelectorAll('a[href*="/horse/"]')
            
            for (const horseLink of horseLinks) {
              const horseName = horseLink.textContent.trim()
              if (!horseName || seenHorses.has(horseName)) continue
              seenHorses.add(horseName)

              const container = horseLink.closest('[class*="ResultRunner__StyledRow"]')
              if (!container) continue

              const detailRow = container.nextElementSibling

              let oddsRaw = 'SP'
              const oddsSpan = container.querySelector('[class*="BetLink"] span')
              if (oddsSpan) {
                const t = oddsSpan.textContent.trim()
                if (/^\d+\/\d+f?$/.test(t) || /^\d+\/\d+$/.test(t)) oddsRaw = t
              }
              if (oddsRaw === 'SP') {
                const allText = container.querySelectorAll('*')
                for (let j = allText.length - 1; j >= 0; j--) {
                  const t = allText[j].textContent.trim()
                  if (/^\d+\/\d+f?$/.test(t) || /^\d+\/\d+$/.test(t)) {
                    oddsRaw = t
                    break
                  }
                }
              }

              let jockeyName = ''
              let trainerName = ''

              if (detailRow) {
                const personNames = detailRow.querySelectorAll('[class*="StyledPersonName"]')
                if (personNames.length >= 1) trainerName = personNames[0].textContent.trim()
                if (personNames.length >= 2) jockeyName = personNames[1].textContent.trim()
              }

              results.push({
                position: `${results.length + 1}`,
                horse: horseName,
                jockey: jockeyName,
                trainer: trainerName,
                rawOdds: oddsRaw
              })
            }

            return results
          })
          
          const courseMatch = race.url.match(/\/racing\/(?:racecards|results)\/\d{4}-\d{2}-\d{2}\/([^/]+)/)
          const course = courseMatch ? courseMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''
          
          const raceIdMatch = race.url.match(/\/(\d+)\/[^/]+$/)
          const raceId = raceIdMatch ? raceIdMatch[1] : ''
          
          const offTime = (race.title || '').match(/^(\d{2}:\d{2})/)?.[1] || ''
          
          if (finalResults.length === 0 || !isUkIre(course)) return null

          return {
            race_id: `${course}-${raceId}`,
            course,
            off_time: offTime,
            off_dt: offTime ? `${dateStr}T${offTime}:00` : '',
            date: dateStr,
            region: 'GB',
            race_name: race.title,
            type: race.title.toLowerCase().includes('hurdle') ? 'Hurdle' : race.title.toLowerCase().includes('chase') ? 'Chase' : 'Flat',
            going: '',
            surface: '',
            field_size: finalResults.length,
            race_class: 0,
            distance_f: '',
            runners: finalResults.map(r => ({
              horse_id: '',
              horse: r.horse,
              atrUrl: `https://www.attheraces.com/search?search=${encodeURIComponent(r.horse)}`,
              position: parseInt(r.position) || 0,
              jockey: r.jockey,
              trainer: r.trainer,
              odds: 0,
              sp: parseFractionalOdds(r.rawOdds),
              draw: 0,
              lbs: '',
              form: '',
              age: 0,
              sex: '',
              commentary: '',
            })).sort((a, b) => a.position - b.position),
          }
        } finally {
          await racePage.close()
        }
      }

      for (let i = 0; i < uniqueLinks.length; i += CONCURRENCY) {
        const batch = uniqueLinks.slice(i, i + CONCURRENCY)
        const batchResults = await Promise.all(batch.map(scrapeRace))
        for (const r of batchResults) {
          if (r) allRaces.push(r)
        }
        const mem = process.memoryUsage()
        console.log(`[SL] Results batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(uniqueLinks.length / CONCURRENCY)}: ${batchResults.filter(Boolean).length}/${batch.length} races scraped | RSS: ${Math.round(mem.rss/1024/1024)}MB`)
        // Pause between batches to let memory recover
        await new Promise(r => setTimeout(r, 1000))
      }

      console.log(`[SL] Found ${allRaces.length} races with results`)
      return allRaces
    } finally {
      await context.close()
    }
  } catch (err) {
    console.error(`[SL Results] Failed for ${dateStr}:`, err.message)
    return []
  }
}
