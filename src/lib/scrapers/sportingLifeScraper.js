import { createPage } from './browserPool.js'

const SL_BASE = 'https://www.sportinglife.com'
const SL_API = 'https://www.sportinglife.com/api/horse-racing'

// Shared browser page for all API calls — one context reused across all races
let _sharedPage = null
let _sharedContext = null

async function getSharedPage() {
  if (_sharedPage && !_sharedPage.isClosed()) return _sharedPage
  _sharedContext = await createPage()
  _sharedPage = await _sharedContext.newPage()
  return _sharedPage
}

async function closeSharedPage() {
  try { if (_sharedPage && !_sharedPage.isClosed()) await _sharedPage.close() } catch {}
  try { if (_sharedContext) await _sharedContext.close() } catch {}
  _sharedPage = null
  _sharedContext = null
}

async function fetchJson(url) {
  try {
    const page = await getSharedPage()
    const data = await page.evaluate(async (u) => {
      const res = await fetch(u)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    }, url)
    return data
  } catch (err) {
    if (err.message?.includes('crashed') || err.message?.includes('Target') || err.message?.includes('destroyed')) {
      _sharedPage = null
      _sharedContext = null
    }
    throw err
  }
}

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

async function fetchMeetingList(dateStr) {
  try {
    console.log(`[SL] Fetching meeting list via HTTP for ${dateStr}...`)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    const resp = await fetch(`${SL_BASE}/racing/racecards/${dateStr}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
    })
    clearTimeout(timer)
    const html = await resp.text()

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
    if (!nextDataMatch) {
      console.error('[SL] No __NEXT_DATA__ found in page')
      return []
    }

    const nextData = JSON.parse(nextDataMatch[1])
    const rawMeetings = nextData?.props?.pageProps?.meetings || []
    console.log(`[SL] Found ${rawMeetings.length} total meetings in __NEXT_DATA__`)

    const meetings = []
    const abandoned = []
    const seenIds = new Set()

    for (const m of rawMeetings) {
      const ms = m.meeting_summary
      const ref = ms?.meeting_reference
      if (!ref?.id || seenIds.has(ref.id)) continue
      seenIds.add(ref.id)

      const country = ms.course?.country?.short_name || ''
      const isUkIre = ['ENG', 'Wales', 'WLS', 'NIR', 'Eire', 'IRE', 'GB', 'Ireland'].includes(country)
      if (!isUkIre) continue

      const courseName = ms.course?.name || ''
      const raceCount = m.races?.length || 0
      const slug = courseName.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')

      const entry = { id: String(ref.id), date: dateStr, slug, name: courseName }
      const status = (ms.status || '').toUpperCase()

      if (status === 'ABANDONED' || courseName.toLowerCase().includes('abandoned')) {
        console.log(`[SL] Abandoned meeting: ${courseName}`)
        abandoned.push(entry)
      } else {
        console.log(`[SL] Found meeting: "${courseName}" (${raceCount} races, ID: ${ref.id})`)
        meetings.push(entry)
      }
    }

    console.log(`[SL] ${meetings.length} UK/IRE meetings, ${abandoned.length} abandoned`)
    return { meetings, abandoned }
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

    // Close shared browser page — racecards done, free memory for ATR
    await closeSharedPage()

    return { races: allRaces, abandoned }
  } catch (err) {
    console.error(`[SL Racecards] Failed for ${dateStr}:`, err.message)
    await closeSharedPage()
    return []
  }
}

export async function fetchSlResults(dateStr) {
  try {
    console.log(`[SL] Fetching results for ${dateStr}...`)

    const resp = await fetch(`${SL_BASE}/racing/results/${dateStr}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
    })
    const html = await resp.text()

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
    if (!nextDataMatch) {
      console.error('[SL] Results: No __NEXT_DATA__ found')
      return []
    }

    const nextData = JSON.parse(nextDataMatch[1])
    const rawMeetings = nextData?.props?.pageProps?.meetings || []
    console.log(`[SL] Results: Found ${rawMeetings.length} meetings in __NEXT_DATA__`)

    const raceIds = []
    for (const m of rawMeetings) {
      const ms = m.meeting_summary
      const ref = ms?.meeting_reference
      const country = ms.course?.country?.short_name || ''
      const isUkIre = ['ENG', 'Wales', 'WLS', 'NIR', 'Eire', 'IRE', 'GB', 'Ireland'].includes(country)
      if (!isUkIre) continue
      const courseName = ms.course?.name || ''

      for (const race of (m.races || [])) {
        const raceRef = race.race_summary_reference
        if (!raceRef?.id) continue
        raceIds.push({
          id: String(raceRef.id),
          course: courseName,
          raceName: race.name || '',
          offTime: race.off_time || race.time || '',
          going: race.going || '',
          type: race.name?.toLowerCase()?.includes('hurdle') ? 'Hurdle'
            : race.name?.toLowerCase()?.includes('chase') ? 'Chase' : 'Flat',
          raceClass: race.race_class || 0,
          distance: race.distance || '',
        })
      }
    }

    console.log(`[SL] Results: ${raceIds.length} race IDs to fetch via API`)

    const allRaces = []
    for (let i = 0; i < raceIds.length; i++) {
      const race = raceIds[i]
      try {
        const data = await fetchJson(`${SL_API}/race/${race.id}`)
        const rides = data.rides || []
        const finished = rides.filter(r => r.finish_position > 0)
        if (finished.length === 0) continue

        const courseSlug = race.course.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')
        if (!isUkIre(courseSlug)) continue

        allRaces.push({
          race_id: `${race.course}-${race.id}`,
          course: race.course,
          off_time: race.offTime,
          off_dt: race.offTime ? `${dateStr}T${race.offTime}:00` : '',
          date: dateStr,
          region: 'GB',
          race_name: race.raceName,
          type: race.type,
          going: race.going,
          surface: '',
          field_size: finished.length,
          race_class: parseInt(race.raceClass) || 0,
          distance_f: race.distance,
          runners: finished.map(r => {
            const horseName = r.horse?.name || ''
            return {
              horse_id: String(r.horse?.horse_reference?.id || ''),
              horse: horseName,
              atrUrl: `https://www.attheraces.com/search?search=${encodeURIComponent(horseName)}`,
              position: r.finish_position,
              finish_distance: r.finish_distance || '',
              jockey: r.jockey?.name || '',
              trainer: r.trainer?.name || '',
              odds: 0,
              sp: parseFractionalOdds(r.betting?.sp || r.betting?.starting_price),
              draw: r.draw_number || r.cloth_number || 0,
              lbs: r.handicap || '',
              or: Number(r.official_rating || r.horse?.official_rating || 0) || 0,
              rpr: Number(r.rpr || r.horse?.rpr || 0) || 0,
              form: '',
              age: r.horse?.age || 0,
              sex: r.horse?.sex?.type || '',
              commentary: r.commentary || '',
              previous_results: (r.horse?.previous_results || []).slice(0, 6),
            }
          }).sort((a, b) => a.position - b.position),
        })
        if (i < raceIds.length - 1) await new Promise(r => setTimeout(r, 200))
      } catch (err) {
        console.warn(`[SL] Results API failed for ${race.course} ${race.offTime}: ${err.message}`)
      }
    }

    console.log(`[SL] Results: ${allRaces.length}/${raceIds.length} races with results`)
    await closeSharedPage()
    return allRaces
  } catch (err) {
    console.error(`[SL Results] Failed for ${dateStr}:`, err.message)
    await closeSharedPage()
    return []
  }
}
