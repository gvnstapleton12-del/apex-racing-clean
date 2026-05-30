// ATR Results Scraper
// Fetches https://www.attheraces.com/results and parses today's results

import fs from 'fs'
import path from 'path'

const CACHE_FILE = path.join(process.cwd(), 'data', 'atr_results_cache.json')
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function ensureCacheDir() {
  const dir = path.dirname(CACHE_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function loadCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8')
    const data = JSON.parse(raw)
    if (Date.now() - data.fetchedAt < CACHE_TTL) return data.races
  } catch {}
  return null
}

function saveCache(races) {
  ensureCacheDir()
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), races }, null, 2))
}

export async function fetchATRResults() {
  const cached = loadCache()
  if (cached) return cached

  try {
    const response = await fetch('https://www.attheraces.com/results', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    const html = await response.text()
    const races = parseATRResults(html)
    saveCache(races)
    return races
  } catch (error) {
    console.error('[ATR Results] Failed to fetch:', error.message)
    return []
  }
}

function parseATRResults(html) {
  // Strip scripts and styles
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  const races = []
  const courses = extractCourseBlocks(text)

  for (const course of courses) {
    const racesInCourse = extractRacesFromCourse(course)
    races.push(...racesInCourse)
  }

  // Filter to UK/IRE only
  const ukIreCourses = new Set([
    'Aintree', 'Ascot', 'Ayr', 'Bath', 'Bellewstown', 'Beverley',
    'Bangor-on-Dee', 'Brighton', 'Cartmel', 'Carlisle', 'Catterick', 'Chelmsford City', 'Cheltenham',
    'Chepstow', 'Cork', 'Curragh', 'Doncaster', 'Down Royal', 'Dundalk',
    'Exeter', 'Fairyhouse', 'Fakenham', 'Fontwell', 'Ffos Las', 'Goodwood',
    'Great Yarmouth', 'Haydock', 'Hereford', 'Huntingdon', 'Kempton', 'Kelso', 'Kilbeggan', 'Leicester',
    'Leopardstown', 'Limerick', 'Lingfield', 'Ludlow', 'Market Rasen',
    'Musselburgh', 'Naas', 'Navan', 'Newbury', 'Newcastle', 'Newmarket', 'Newton Abbot',
    'Nottingham', 'Perth', 'Plumpton', 'Punchestown', 'Redcar', 'Salisbury', 'Sandown',
    'Sedgefield', 'Southwell', 'Stratford', 'Taunton', 'Thirsk', 'Thurles',
    'Tipperary', 'Tramore', 'Uttoxeter', 'Warwick', 'Wetherby', 'Wexford',
    'Wincanton', 'Windsor', 'Wolverhampton', 'York',
  ])

  const ireCourses = new Set([
    'Bellewstown', 'Cork', 'Curragh', 'Down Royal', 'Dundalk', 'Fairyhouse',
    'Kilbeggan', 'Leopardstown', 'Limerick', 'Naas', 'Navan', 'Punchestown',
    'Thurles', 'Tipperary', 'Tramore', 'Wexford',
  ])

  return races.filter(r => ukIreCourses.has(r.course)).map(r => ({
    ...r,
    region: ireCourses.has(r.course) ? 'IRE' : 'GB',
  }))
}

function extractCourseBlocks(text) {
  const courseNames = [
    'Aintree', 'Ascot', 'Ayr', 'Bath', 'Bellewstown', 'Beverley',
    'Brighton', 'Cartmel', 'Catterick', 'Chelmsford City', 'Cheltenham',
    'Chepstow', 'Cork', 'Curragh', 'Doncaster', 'Down Royal', 'Dundalk',
    'Exeter', 'Fairyhouse', 'Fontwell', 'Ffos Las', 'Goodwood',
    'Haydock', 'Hereford', 'Huntingdon', 'Kempton', 'Kelso', 'Leicester',
    'Leopardstown', 'Limerick', 'Lingfield', 'Ludlow', 'Market Rasen',
    'Naas', 'Navan', 'Newbury', 'Newcastle', 'Newmarket', 'Newton Abbot',
    'Nottingham', 'Perth', 'Plumpton', 'Punchestown', 'Redcar', 'Sandown',
    'Sedgefield', 'Southwell', 'Stratford', 'Taunton', 'Thirsk', 'Thurles',
    'Tipperary', 'Tramore', 'Uttoxeter', 'Warwick', 'Wetherby', 'Wexford',
    'Wincanton', 'Windsor', 'Wolverhampton', 'Yarmouth', 'York',
  ]

  // Find all course matches with their positions
  const matches = []
  for (const courseName of courseNames) {
    const regex = new RegExp(`\\s${courseName}\\s+(Results|Abandoned)`, 'i')
    const match = text.match(regex)
    if (match) {
      matches.push({ course: courseName, index: match.index })
    }
  }

  // Sort by position in text
  matches.sort((a, b) => a.index - b.index)

  // Extract blocks between matches
  const blocks = []
  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index
    const endIdx = i < matches.length - 1 ? matches[i + 1].index : text.length
    blocks.push({
      course: matches[i].course,
      text: text.substring(startIdx, endIdx),
    })
  }

  return blocks
}

function extractRacesFromCourse(block) {
  const { course, text } = block
  const races = []

  // Check if abandoned
  if (/\bAbandoned\b/i.test(text.substring(0, 200))) {
    return []
  }

  // Find race blocks: number + time + race name
  const raceRegex = /(\d+)\s+(\d{1,2}:\d{2})\s*[-–]\s*(.+?)(?=\s+\(Class|\s+\d+YO|\s*\d+YO|\s*Abandoned|$)/g
  let raceMatch

  while ((raceMatch = raceRegex.exec(text)) !== null) {
    const raceNum = parseInt(raceMatch[1], 10)
    const time = raceMatch[2]
    const raceName = raceMatch[3].trim()

    // Find the race section - look for 1st/2nd/3rd or finishing positions
    const sectionStart = raceMatch.index
    const nextRaceMatch = text.substring(sectionStart + 100).match(/\d+\s+\d{1,2}:\d{2}\s*[-–]/)
    const sectionEnd = nextRaceMatch ? sectionStart + 100 + nextRaceMatch.index : text.length
    const section = text.substring(sectionStart, sectionEnd)

    const runners = extractRunners(section)
    const raceInfo = extractRaceInfo(section)
    const nonRunners = extractNonRunners(section)

    if (runners.length > 0) {
      races.push({
        course,
        date: new Date().toISOString().split('T')[0],
        off_time: time,
        race_name: raceName,
        raceNum,
        runners,
        nonRunners,
        ...raceInfo,
      })
    }
  }

  return races
}

function extractRunners(section) {
  const runners = []

  // Pattern: 1st (draw) HorseName odds
  const positionRegex = /(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th)\s*\((\d+)\)\s*([A-Za-z][A-Za-z\s&.'-]+?)\s+(\d+\/\d+|\d+|\d+Fav|Fav|JFav|EFav)\s*/g

  let posMatch
  while ((posMatch = positionRegex.exec(section)) !== null) {
    const position = parsePosition(posMatch[1])
    const draw = parseInt(posMatch[2], 10)
    const horse = posMatch[3].trim()
    const odds = parseFractionalOdds(posMatch[4])

    runners.push({
      horse,
      position,
      draw,
      odds,
    })
  }

  // Also try to find additional runners mentioned as "F: 4th (9) HorseName odds"
  const fallbackRegex = /F:\s*(\d+)(?:st|nd|rd|th)\s*\((\d+)\)\s*([A-Za-z][A-Za-z\s&.'-]+?)\s+(\d+\/\d+|\d+|\d+Fav|Fav|JFav|EFav)\s*/g
  let fbMatch
  while ((fbMatch = fallbackRegex.exec(section)) !== null) {
    const position = parseInt(fbMatch[1], 10)
    const draw = parseInt(fbMatch[2], 10)
    const horse = fbMatch[3].trim()
    const odds = parseFractionalOdds(fbMatch[4])

    if (!runners.find(r => r.horse === horse)) {
      runners.push({ horse, position, draw, odds })
    }
  }

  return runners
}

function extractRaceInfo(section) {
  const info = {}

  // Winning jockey
  const jockeyMatch = section.match(/Winning jockey\s*:\s*([A-Za-z][A-Za-z\s.'-]+?)(?:\s*Winning trainer|\s*Runners)/i)
  if (jockeyMatch) info.winningJockey = jockeyMatch[1].trim()

  // Winning trainer
  const trainerMatch = section.match(/Winning trainer\s*:\s*([A-Za-z][A-Za-z\s.'-]+?)(?:\s*Runners|\s*Off Time)/i)
  if (trainerMatch) info.winningTrainer = trainerMatch[1].trim()

  // Runners count
  const runnersMatch = section.match(/Runners:\s*(\d+)\s*ran/i)
  if (runnersMatch) info.fieldSize = parseInt(runnersMatch[1], 10)

  // Off time
  const offTimeMatch = section.match(/Off Time:\s*(\d{2}:\d{2}:\d{2})/i)
  if (offTimeMatch) info.offTime = offTimeMatch[1]

  // Winning time
  const winTimeMatch = section.match(/Winning Time:\s*(.+)/i)
  if (winTimeMatch) info.winningTime = winTimeMatch[1].trim()

  // Class
  const classMatch = section.match(/\(Class\s*(\d)\)/i)
  if (classMatch) info.raceClass = classMatch[1]

  // Distance
  const distMatch = section.match(/(\d+m\s*\d*f?)/i)
  if (distMatch) info.distance = distMatch[1].trim()

  return info
}

function extractNonRunners(section) {
  const nrMatch = section.match(/Non-runners:\s*(.+?)(?:\s*Off Time|\s*$)/i)
  if (!nrMatch) return []

  const nrText = nrMatch[1].trim()
  const draws = nrText.match(/\((\d+)\)/g)
  return draws ? draws.map(d => parseInt(d.replace(/[()]/g, ''), 10)) : []
}

function parsePosition(pos) {
  const map = {
    '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
    '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10,
    '11th': 11, '12th': 12,
  }
  return map[pos] || 0
}

function parseFractionalOdds(odds) {
  if (!odds) return 0
  if (odds.toLowerCase().includes('fav')) return 0
  if (!odds.includes('/')) {
    const val = parseFloat(odds)
    return val > 1 ? val : 0
  }
  const [top, bottom] = odds.split('/')
  const num = parseFloat(top)
  const den = parseFloat(bottom)
  if (!den) return 0
  return num / den + 1
}
