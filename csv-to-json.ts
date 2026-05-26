import fs from 'fs'
import path from 'path'

// =========================================
// CSV -> JSON CONVERTER
// =========================================
// Cleans Racing Post CSV into structured JSON
// Run once: npx tsx csv-to-json.ts
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

function parseFractionalOdds(input: string): number {
  if (!input) return 0
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

function parseFurlongs(dist: string): number {
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

function parseFormString(form: string): number[] {
  if (!form) return []
  const entries = form.split(/[-–]/).filter(Boolean)
  const positions: number[] = []
  for (const entry of entries) {
    const pos = parseInt(entry, 10)
    if (isNaN(pos)) continue
    if (pos > 20) continue
    if (pos === 0) continue
    positions.push(pos)
  }
  return positions
}

function extractRaceType(code: string): string {
  const c = code.toLowerCase()
  if (c === 'h') return 'Hurdle'
  if (c === 'c') return 'Chase'
  if (c === 'b') return 'Bumper'
  if (c === 'f') return 'Flat'
  return 'Unknown'
}

// =========================================
// MAIN
// =========================================

const inputPath = path.join(process.cwd(), 'historical_races.csv')
const outputPath = path.join(process.cwd(), 'historical_races.json')

const rawFile = fs.readFileSync(inputPath, 'utf-8')
const lines = rawFile.split('\n').filter(line => line.trim().length > 0)

const racesMap = new Map<string, any>()
let totalRunners = 0
let skipped = 0

for (const line of lines) {
  const cols = parseCsvLine(line)

  try {
    const raceId = cols[0]
    const course = cols[1]
    const date = cols[2]
    const time = cols[3]
    const raceName = cols[4]
    const typeCode = cols[5]
    const going = cols[12]
    const distance = cols[10]
    const fieldSize = Number(cols[9]) || 0

    const position = parseFinishingPosition(cols[16])
    const horse = cols[20]
    const oddsFrac = cols[37]
    const oddsDecimal = parseFractionalOdds(oddsFrac)
    const or = Number(cols[26]) || 0
    const draw = Number(cols[9]) || 0
    const trainer = cols[29]
    const jockey = cols[30]
    const formRaw = cols[34] || ''
    const daysSinceLastRun = Number(cols[35]) || 0
    const comments = cols[33] || ''

    if (!horse) { skipped++; continue }

    const formPositions = parseFormString(formRaw)

    if (!racesMap.has(raceId)) {
      racesMap.set(raceId, {
        raceId,
        course,
        date: normalizeDate(date),
        time,
        raceName,
        raceType: extractRaceType(typeCode),
        going,
        distance,
        distanceFurlongs: parseFurlongs(distance),
        fieldSize,
        runners: []
      })
    }

    racesMap.get(raceId).runners.push({
      horse,
      position,
      odds: oddsDecimal,
      oddsFractional: oddsFrac,
      or,
      draw,
      trainer,
      jockey,
      formRaw,
      formPositions,
      daysSinceLastRun,
      comments
    })

    totalRunners++
  } catch {
    skipped++
  }
}

const races = Array.from(racesMap.values())

const output = {
  generatedAt: new Date().toISOString(),
  totalRaces: races.length,
  totalRunners,
  skippedRows: skipped,
  races
}

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))

console.log(`Converted ${races.length} races, ${totalRunners} runners (${skipped} skipped)`)
console.log(`Output: ${outputPath}`)
