import { createPage } from './browserPool.js'

const SL_BASE = 'https://www.sportinglife.com'
const SL_API = 'https://www.sportinglife.com/api/horse-racing'

const UK_IRE_COURSES = new Set([
  'ascot', 'ayr', 'bath', 'beverley', 'brighton', 'cartmel', 'carlisle', 'cheltenham', 'chester', 'catterick', 'chepstow',
  'doncaster', 'down-royal', 'epsom', 'fairyhouse', 'goodwood', 'hamilton', 'haydock', 'hereford', 'hexham', 'huntingdon',
  'kelso', 'kempton', 'leicester', 'lingfield', 'market-rasen', 'newbury', 'newcastle', 'newmarket',
  'newton-abbot', 'northam', 'nottingham', 'plumpton', 'pontefret', 'redcar', 'ripon', 'sandown', 'sedgefield',
  'southwell', 'stratford', 'taunton', 'thirsk', 'uttoxeter', 'wetherby', 'wolverhampton', 'worcester',
  'yarmouth', 'york', 'ballinrobe', 'curragh', 'dundalk', 'galway', 'killarney', 'kilkenny',
  'laytown', 'leopardstown', 'listowel', 'naas', 'navan', 'punchestown', 'roscommon', 'sligo',
  'tipperary', 'tramore', 'wexford',
])

function isUkIre(course) {
  const slug = course.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')
  return UK_IRE_COURSES.has(slug)
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
      await page.goto(`${SL_BASE}/racing/racecards/${dateStr}`, { waitUntil: 'networkidle0', timeout: 60000 })

      // Extract all meeting tab names from the tab navigation
      const allTabNames = await page.evaluate(() => {
        const tabs = document.querySelectorAll('span[id].NewGenericTabs__Tab-sc-bbf7998f-2, span[id].NewGenericTabs__ActiveTab-sc-bbf7998f-3')
        return Array.from(tabs).map(t => t.textContent.trim())
      })

      // Filter for UK/IRE meetings
      const ukIreTabs = allTabNames.filter(name => isUkIre(name))
      if (ukIreTabs.length === 0) return []

      const meetings = []
      const abandoned = []
      const seenSlugs = new Set()

      for (const name of ukIreTabs) {
        const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')
        if (seenSlugs.has(slug)) continue
        seenSlugs.add(slug)

        try {
          // Click the tab to make this meeting active
          await page.evaluate((tabName) => {
            const tab = document.querySelector(`span[id="${tabName}"]`)
            if (tab) tab.click()
          }, name)

          // Wait for the meeting section to render
          await page.waitForTimeout(2000)

          // Extract meeting info from the fast-cards link
          const meetingInfo = await page.evaluate(() => {
            const link = document.querySelector('a[href*="/racing/fast-cards/"]')
            if (!link) return null
            const href = link.getAttribute('href')
            const match = href.match(/\/racing\/fast-cards\/(\d+)\/(\d{4}-\d{2}-\d{2})\/([^/]+)/)
            if (!match) return null
            return { id: match[1], date: match[2], slug: match[3], name: link.textContent.trim() }
          })

          if (meetingInfo) {
            console.log(`[SL] Found meeting: "${meetingInfo.name}" (slug: ${meetingInfo.slug})`)
            // Check if meeting name indicates abandoned status
            if (meetingInfo.name.toLowerCase().includes('abandoned') || meetingInfo.name.toLowerCase().includes('(off)')) {
              console.log(`[SL] Abandoned meeting: ${meetingInfo.name}`)
              abandoned.push(meetingInfo)
            } else {
              meetings.push(meetingInfo)
            }
          }
        } catch (err) {
          console.error(`[SL] Failed to extract meeting "${name}": ${err.message}`)
        }
      }

      return { meetings, abandoned }
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
      return {
        race_id: String(race.race_summary_reference.id),
        course: race.course_name,
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
    const rides = (data.rides || []).filter(
      (ride) => !ride.ride_status || ride.ride_status === 'RUNNER'
    )

    return rides.map((ride, i) => {
      const horseName = ride.horse?.name || ''
      return {
      horse_id: String(ride.horse?.horse_reference?.id || ''),
      horse: horseName,
      atrUrl: `https://www.attheraces.com/search?search=${encodeURIComponent(horseName)}`,
      position: ride.finish_position || 0,
      jockey: ride.jockey?.name || '',
      trainer: ride.trainer?.name || '',
      odds: parseFractionalOdds(ride.betting?.current_odds),
      draw: ride.draw_number || ride.cloth_number || 0,
      lbs: ride.handicap || '',
      form: ride.horse?.formsummary?.display_text || '',
      age: ride.horse?.age || 0,
      sex: ride.horse?.sex?.type || '',
      commentary: ride.commentary || '',
    }
    })
  } catch (err) {
    console.error(`[SL] Failed to fetch race ${raceId}: ${err.message}`)
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
    const meetings = await fetchMeetingList(dateStr)
    console.log(`[SL] Found ${meetings.length} UK/IRE meetings`)

    const allRaces = []

    for (const meeting of meetings) {
      console.log(`[SL] Fetching ${meeting.name}...`)
      const races = await fetchMeetingRaces(meeting.id)
      console.log(`[SL] ${meeting.name}: ${races.length} races`)
      allRaces.push(...races)
      await new Promise(r => setTimeout(r, 500))
    }

    console.log(`[SL] Total ${allRaces.length} UK/IRE races`)

    // Fetch runners for ALL races
    for (let i = 0; i < allRaces.length; i++) {
      if (allRaces[i]._apiUrl) {
        console.log(`[SL] Fetching runners ${i + 1}/${allRaces.length}: ${allRaces[i].course} ${allRaces[i].off_time}...`)
        allRaces[i].runners = await fetchRaceRunners(allRaces[i].race_id)
        await new Promise(r => setTimeout(r, 500))
      }
    }

    return allRaces
  } catch (err) {
    console.error(`[SL Racecards] Failed for ${dateStr}:`, err.message)
    return []
  }
}

export async function fetchSlResults(dateStr) {
  try {
    console.log(`[SL] Fetching results for ${dateStr}...`)
    const meetings = await fetchResultsMeetingList(dateStr)
    console.log(`[SL] Found ${meetings.length} UK/IRE meetings with results`)

    const allRaces = []

    for (const meeting of meetings) {
      console.log(`[SL] Fetching results for ${meeting.name}...`)
      const races = await fetchMeetingRaces(meeting.id)
      console.log(`[SL] ${meeting.name}: ${races.length} races`)
      allRaces.push(...races)
      await new Promise(r => setTimeout(r, 500))
    }

    console.log(`[SL] Total ${allRaces.length} UK/IRE races with results`)

    // Fetch runners with positions for ALL races
    for (let i = 0; i < allRaces.length; i++) {
      if (allRaces[i]._apiUrl) {
        console.log(`[SL] Fetching results ${i + 1}/${allRaces.length}: ${allRaces[i].course} ${allRaces[i].off_time}...`)
        allRaces[i].runners = await fetchRaceRunners(allRaces[i].race_id)
        console.log(`[SL] Got ${allRaces[i].runners.length} runners with positions`)
        await new Promise(r => setTimeout(r, 500))
      }
    }

    return allRaces
  } catch (err) {
    console.error(`[SL Results] Failed for ${dateStr}:`, err.message)
    return []
  }
}
