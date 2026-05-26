// Racing Post Non-Runner Scraper
// Fetches https://www.racingpost.com/non-runners/ and parses course/going/weather/NR data

import fs from 'fs'
import path from 'path'

const CACHE_FILE = path.join(process.cwd(), 'data', 'non_runners_cache.json')
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function ensureCacheDir() {
  const dir = path.dirname(CACHE_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function loadCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8')
    const data = JSON.parse(raw)
    if (Date.now() - data.fetchedAt < CACHE_TTL) return data
  } catch {}
  return null
}

function saveCache(data) {
  ensureCacheDir()
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2))
}

export async function fetchNonRunners() {
  const cached = loadCache()
  if (cached) return cached.courses

  try {
    const response = await fetch('https://www.racingpost.com/non-runners/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    const html = await response.text()

    // Extract the text content between the main content markers
    // The page renders non-runner data as plain text in the HTML
    const courses = parseNonRunnersPage(html)
    const data = { fetchedAt: Date.now(), courses }
    saveCache(data)
    return courses
  } catch (error) {
    console.error('[NonRunners] Failed to fetch:', error.message)
    return []
  }
}

function parseNonRunnersPage(html) {
  // Strip all HTML tags to get plain text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const courses = []
  const courseNames = [
    'Aintree', 'Ascot', 'Auteuil', 'Ayr', 'Ballinrobe', 'Bath', 'Bellewstown',
    'Beverley', 'Cartmel', 'Catterick', 'Chelmsford City', 'Cheltenham',
    'Chepstow', 'Cork', 'Curragh', 'Doncaster', 'Down Royal', 'Dundalk',
    'Exeter', 'Fairyhouse', 'Fontwell', 'Ffos Las', 'Galway', 'Goodwood',
    'Haydock', 'Hereford', 'Huntingdon', 'Kempton', 'Kelso', 'Leicester',
    'Leopardstown', 'Limerick', 'Lingfield', 'Ludlow', 'Market Rasen',
    'Naas', 'Navan', 'Newbury', 'Newcastle', 'Newmarket', 'Newton Abbot',
    'Nottingham', 'Perth', 'Plumpton', 'Punchestown', 'Redcar', 'Sandown',
    'Santa Anita', 'Sedgefield', 'Southwell', 'Stratford', 'Taunton',
    'Thirsk', 'Thurles', 'Tipperary', 'Tramore', 'Uttoxeter', 'Warwick',
    'Wetherby', 'Wexford', 'Wincanton', 'Windsor', 'Wolverhampton',
    'Yarmouth', 'York', 'Lone Star Park',
  ]

  // Find each course section
  for (const courseName of courseNames) {
    const courseRegex = new RegExp(`\\s${courseName}\\s+GOING:`, 'i')
    const match = text.match(courseRegex)
    if (!match) continue

    const startIdx = match.index + 1 // skip the leading space
    // Find the next course or end of relevant content
    let endIdx = text.length
    for (const other of courseNames) {
      if (other === courseName) continue
      const otherRegex = new RegExp(`\\s${other}\\s+GOING:`, 'i')
      const otherMatch = text.match(otherRegex)
      if (otherMatch && otherMatch.index > startIdx && otherMatch.index < endIdx) {
        endIdx = otherMatch.index
      }
    }
    // Also check for course name at start of text boundary
    for (const other of courseNames) {
      if (other === courseName) continue
      const otherRegex = new RegExp(`\\s${other}\\s+GOING:`, 'i')
      const otherMatch = text.match(otherRegex)
      if (otherMatch && otherMatch.index > startIdx && otherMatch.index < endIdx) {
        endIdx = otherMatch.index
      }
    }

    const section = text.substring(startIdx, endIdx)

    // Parse going
    const goingMatch = section.match(/GOING:\s*(.+?)\s*WEATHER:/i)
    const going = goingMatch ? goingMatch[1].trim() : ''

    // Parse weather
    const weatherMatch = section.match(/WEATHER:\s*(.+?)(?:\s*STALLS:|\s*NON RUNNERS:|\s*[A-Z][a-z]+\s+GOING:|$)/i)
    const weather = weatherMatch ? weatherMatch[1].trim().replace(/&#x27;/g, "'") : ''

    // Parse stalls
    const stallsMatch = section.match(/STALLS:\s*(.+?)(?:\s*NON RUNNERS:|\s*[A-Z][a-z]+\s+GOING:|$)/i)
    const stalls = stallsMatch ? stallsMatch[1].trim().replace(/&#x27;/g, "'").replace(/&amp;/g, '&') : ''

    // Parse non-runners
    const nrMatch = section.match(/NON RUNNERS:\s*(.+?)(?:\s*[A-Z][a-z]+\s+GOING:|$)/i)
    const nonRunners = []
    if (nrMatch) {
      const nrText = nrMatch[1].trim()
      // Parse each line: time Horse(draw) - Horse(draw)
      const lines = nrText.split(/\s+(?=\d{1,2}:\d{2})/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const timeMatch = trimmed.match(/^(\d{1,2}:\d{2})\s*(.+)$/)
        if (!timeMatch) continue
        const time = timeMatch[1]
        const horsesText = timeMatch[2]
        // Parse individual horses: HorseName( draw ) or HorseName(draw)
        const horseRegex = /([^(]+?)\(\s*(\d+)\s*\)/g
        let horseMatch
        while ((horseMatch = horseRegex.exec(horsesText)) !== null) {
          nonRunners.push({
            time,
            horse: horseMatch[1].trim().replace(/&#x27;/g, "'").replace(/^-+\s*/, ''),
            draw: parseInt(horseMatch[2], 10),
          })
        }
      }
    }

    if (going || nonRunners.length > 0) {
      courses.push({
        course: courseName,
        going,
        weather,
        stalls,
        nonRunners,
      })
    }
  }

  return courses
}
