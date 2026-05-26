import fs from 'fs'
import path from 'path'

// =========================================
// CSV -> JSON CONVERTER (Racing Post format v2)
// =========================================
// Columns: date,region,course,course_detail,off,race_name,type,class,pattern,
// rating_band,age_band,sex_rest,dist,dist_f,dist_m,going,surface,ran,num,pos,
// draw,ovr_btn,btn,horse,age,sex,lbs,hg,time,secs,dec,jockey,trainer,prize,
// or,rpr,sire,dam,damsire,owner,comment
// =========================================

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
    current += ch
  }
  result.push(current.trim())
  return result
}

function parseDecimalOdds(input: string): number {
  if (!input) return 0
  const val = parseFloat(input)
  return val > 1 ? val : 0
}

function parseFractionalOdds(input: string): number {
  if (!input) return 0
  if (input.toLowerCase().includes('fav') || input.toLowerCase() === 'bf') return 0
  if (!input.includes('/')) {
    const val = Number(input)
    return val > 1 ? val : 0
  }
  const [top, bottom] = input.split('/')
  const num = Number(top)
  const den = Number(bottom)
  if (!den) return 0
  return num / den + 1
}

function parseFinishingPosition(position: string): number {
  if (!position) return 0
  const parsed = Number(position)
  if (!isNaN(parsed) && parsed > 0) return parsed
  return 0
}

function parseFurlongs(dist: string, distF: string): number {
  if (distF) {
    const val = parseFloat(distF)
    if (!isNaN(val) && val > 0) return val
  }
  if (!dist) return 0
  const m = dist.match(/(\d+)m\s*(\d*)f?\s*(\d*)y?/)
  if (m) {
    const miles = Number(m[1]) || 0
    const furlongs = Number(m[2]) || 0
    const yards = Number(m[3]) || 0
    return Math.round((miles * 8 + furlongs + yards / 220) * 100) / 100
  }
  return parseFloat(dist.replace(/[^0-9.]/g, '')) || 0
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  }
  const match = dateStr.match(/(\d{1,2})-([a-zA-Z]{3})-(\d{2,4})/)
  if (match) {
    const day = match[1].padStart(2, '0')
    const month = months[match[2].toLowerCase()] || '01'
    let year = match[3]
    if (year.length === 2) year = '20' + year
    return `${year}-${month}-${day}`
  }
  return dateStr
}

function normalizeTime(timeStr: string): string {
  if (!timeStr) return '00:00'
  const match = timeStr.match(/(\d{1,2}):(\d{2})/)
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`
  }
  return timeStr
}

function extractRaceType(code: string): string {
  const c = code.toLowerCase()
  if (c === 'h') return 'Hurdle'
  if (c === 'c') return 'Chase'
  if (c === 'b') return 'Bumper'
  if (c === 'f') return 'Flat'
  if (c.includes('hurdle')) return 'Hurdle'
  if (c.includes('chase')) return 'Chase'
  if (c.includes('bumper')) return 'Bumper'
  if (c.includes('flat')) return 'Flat'
  return 'Unknown'
}

// =========================================
// MAIN
// =========================================

const args = process.argv.slice(2)
const inputFile = args[0] || 'historical_races.csv'
const outputFile = args[1] || 'historical_races.json'

const inputPath = path.join(process.cwd(), inputFile)
const outputPath = path.join(process.cwd(), outputFile)

if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`)
  console.error('Usage: npx tsx csv-to-json.ts [input.csv] [output.json]')
  process.exit(1)
}

const rawFile = fs.readFileSync(inputPath, 'utf-8')
const lines = rawFile.split('\n').filter(line => line.trim().length > 0)

// Auto-detect format
const firstCols = parseCsvLine(lines[0])
const isNewFormat = firstCols[0].toLowerCase().includes('date') ||
  (firstCols.length >= 41 && !/^\d+$/.test(firstCols[0]))

let dataLines = lines
if (isNewFormat && firstCols[0].toLowerCase().includes('date')) {
  dataLines = lines.slice(1)
}

const racesMap = new Map<string, any>()
let totalRunners = 0
let skipped = 0

for (const line of dataLines) {
  const cols = parseCsvLine(line)

  try {
    let date: string, course: string, time: string, raceName: string, typeCode: string
    let raceClass: string, going: string, distance: string, distF: string, fieldSize: number
    let position: number, horse: string, oddsDecimal: number, or: number, draw: number
    let trainer: string, jockey: string, comments: string, rpr: number, age: number
    let weight: string, headgear: string, sire: string, dam: string, owner: string

    if (isNewFormat) {
      // New format: date,region,course,course_detail,off,race_name,type,class,...
      date = normalizeDate(cols[0])
      course = cols[2]
      time = normalizeTime(cols[4])
      raceName = cols[5]
      typeCode = cols[6]
      raceClass = cols[7]
      going = cols[15]
      distance = cols[12]
      distF = cols[13]
      fieldSize = Number(cols[17]) || 0
      position = parseFinishingPosition(cols[19])
      horse = cols[23]
      oddsDecimal = parseDecimalOdds(cols[30])
      or = Number(cols[34]) || 0
      draw = Number(cols[20]) || 0
      trainer = cols[32]
      jockey = cols[31]
      comments = cols[40] || ''
      rpr = Number(cols[35]) || 0
      age = Number(cols[24]) || 0
      weight = cols[26] || ''
      headgear = cols[27] || ''
      sire = cols[36] || ''
      dam = cols[37] || ''
      owner = cols[39] || ''
    } else {
      // Old Racing Post format (39 cols):
      // 0:raceId 1:course 2:date 3:time 4:raceName 5:type 6:class 7:ageBand 8:? 9:fieldSize
      // 10:distance 11:? 12:going 13:? 14:winTime 15:? 16:position 17:? 18:btn 19:draw
      // 20:horse 21:age 22:weight 23:? 24:lbs 25:? 26:? 27:? 28:? 29:trainer 30:jockey
      // 31:prize 32:or 33:comments 34:form 35:days 36:? 37:oddsFrac 38:?
      date = normalizeDate(cols[2])
      course = cols[1]
      time = normalizeTime(cols[3])
      raceName = cols[4]
      typeCode = cols[5]
      raceClass = cols[6]
      going = cols[12]
      distance = cols[10]
      distF = ''
      fieldSize = Number(cols[9]) || 0
      position = parseFinishingPosition(cols[16])
      horse = cols[20]
      oddsDecimal = parseFractionalOdds(cols[37])
      or = Number(cols[32]) || 0
      draw = Number(cols[19]) || 0
      trainer = cols[29]
      jockey = cols[30]
      comments = cols[33] || ''
      rpr = 0
      age = Number(cols[21]) || 0
      weight = cols[22] || ''
      headgear = ''
      sire = ''
      dam = ''
      owner = ''
    }

    if (!horse) { skipped++; continue }

    // Build race ID from date + course + time
    const raceId = `${date}_${course.toLowerCase().replace(/\s+/g, '_')}_${time.replace(/:/g, '')}`

    if (!racesMap.has(raceId)) {
      racesMap.set(raceId, {
        raceId,
        course,
        date,
        time,
        raceName,
        raceType: extractRaceType(typeCode),
        raceClass,
        going,
        distance,
        distanceFurlongs: parseFurlongs(distance, distF),
        fieldSize,
        runners: []
      })
    }

    racesMap.get(raceId).runners.push({
      horse,
      position,
      odds: oddsDecimal,
      or,
      draw,
      trainer,
      jockey,
      formRaw: '',
      formPositions: [],
      daysSinceLastRun: 0,
      comments,
      rpr,
      age,
      weight,
      headgear,
      sire,
      dam,
      owner,
    })

    totalRunners++
  } catch {
    skipped++
  }
}

const races = Array.from(racesMap.values())

const output = {
  generatedAt: new Date().toISOString(),
  sourceFile: inputFile,
  totalRaces: races.length,
  totalRunners,
  skippedRows: skipped,
  races
}

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))

console.log(`Converted ${races.length} races, ${totalRunners} runners (${skipped} skipped)`)
console.log(`Output: ${outputPath}`)
