import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(process.cwd())
const PRED_PATH = join(ROOT, 'data', 'predictions.json')
const PICKS_PATH = join(ROOT, 'data', 'daily-picks.json')

const predDb = JSON.parse(readFileSync(PRED_PATH, 'utf8'))
const picksDb = JSON.parse(readFileSync(PICKS_PATH, 'utf8'))

function placedPositions(fieldSize) {
  return fieldSize <= 4 ? Math.min(fieldSize, 2) : 3
}

// ATR results for June 20, 2026 — map of "Course-HH:MM" -> { winner, first3: [horse, horse, horse], fieldSize }
const RESULTS_20 = {
  'Royal Ascot-14:30': { winner: 'Orthodox', first3: ['Orthodox', 'El Floridita', 'Mussab'], fieldSize: 21 },
  'Royal Ascot-15:05': { winner: 'Giavellotto', first3: ['Giavellotto', 'Kalpana', 'Goliath'], fieldSize: 12 },
  'Royal Ascot-15:40': { winner: 'Almeraq', first3: ['Almeraq', 'Satono Reve', 'Joliestar'], fieldSize: 18 },
  'Royal Ascot-16:20': { winner: 'Thesecretadversary', first3: ['Thesecretadversary', 'Take Charge Star', 'Morris Dancer'], fieldSize: 16 },
  'Royal Ascot-17:00': { winner: 'Double Rush', first3: ['Double Rush', 'Completely Random', "Soldier's Tree"], fieldSize: 27 },
  'Royal Ascot-17:35': { winner: 'Lost Boys', first3: ['Lost Boys', 'Amadeus Mozart', 'Perisher'], fieldSize: 16 },
  'Royal Ascot-18:10': { winner: 'Illinois', first3: ['Illinois', 'French Master', 'Mr Hollywood'], fieldSize: 13 },
  'Doncaster-17:48': { winner: 'Cash Cove', first3: ['Cash Cove', 'Coral Cove', 'China In Your Hand'], fieldSize: 13 },
  'Doncaster-18:20': { winner: 'Seven Sisters', first3: ['Seven Sisters'], fieldSize: 4 },
  'Doncaster-18:55': { winner: 'Toastmaster', first3: ['Toastmaster', 'Flight Control', 'Three Non Blondes'], fieldSize: 13 },
  'Doncaster-19:30': { winner: 'Leadman', first3: ['Leadman', 'Goldmoyne', 'Master Richard'], fieldSize: 11 },
  'Doncaster-20:00': { winner: 'Sugar Baby', first3: ['Sugar Baby', 'Another Investment', 'Ran Amok'], fieldSize: 9 },
  'Doncaster-20:30': { winner: 'Pleasant Man', first3: ['Pleasant Man', 'Opera Wave'], fieldSize: 6 },
  'Doncaster-21:00': { winner: 'Central Command', first3: ['Central Command', 'My Ballyquinn'], fieldSize: 5 },
  'Ayr-13:48': { winner: 'Thebesthasyetocome', first3: ['Thebesthasyetocome', 'Maximus Meridius'], fieldSize: 6 },
  'Ayr-14:18': { winner: 'King Of The Jungle', first3: ['King Of The Jungle', 'Great Profit', 'Ski Angel'], fieldSize: 8 },
  'Ayr-14:53': { winner: 'Square Necker', first3: ['Square Necker', 'Ashnak', 'Divine Knight'], fieldSize: 12 },
  'Ayr-15:28': { winner: 'Lope Y Linda', first3: ['Lope Y Linda', 'Ridgemaster', 'Monhammer'], fieldSize: 8 },
  'Ayr-16:08': { winner: 'Argentine Tango', first3: ['Argentine Tango', 'Coconut Cove', 'Beautiful Diamond'], fieldSize: 15 },
  'Ayr-16:48': { winner: 'Circle Of Trust', first3: ['Circle Of Trust', 'Milford Grange', "Ellie's De Vega"], fieldSize: 8 },
  'Ayr-17:23': { winner: 'Novamay', first3: ['Novamay', 'Parisiac', 'Abduction'], fieldSize: 14 },
  'Newmarket (July Course)-13:24': { winner: 'King Of Charm', first3: ['King Of Charm', 'Born A Rebel', 'Timely Affair'], fieldSize: 11 },
  'Newmarket (July Course)-14:00': { winner: 'Al Hudaiba', first3: ['Al Hudaiba', 'Down To You Kid'], fieldSize: 5 },
  'Newmarket (July Course)-14:36': { winner: 'Alfaraz', first3: ['Alfaraz', 'Moreedd'], fieldSize: 5 },
  'Newmarket (July Course)-15:11': { winner: 'Sea Cookie', first3: ['Sea Cookie', 'Valley Ofthe Kings', 'Goldwork'], fieldSize: 9 },
  'Newmarket (July Course)-15:47': { winner: 'Sixpack', first3: ['Sixpack', 'Dojin'], fieldSize: 5 },
  'Newmarket (July Course)-16:27': { winner: 'Spacewoman', first3: ['Spacewoman', 'Mortubo', 'Startled Lady'], fieldSize: 9 },
  'Newmarket (July Course)-17:07': { winner: 'Quantum Power', first3: ['Quantum Power', 'Good Earth'], fieldSize: 7 },
  'Nottingham-17:55': { winner: 'Cyrano De Bergerac', first3: ['Cyrano De Bergerac'], fieldSize: 3 },
  'Nottingham-18:35': { winner: 'Leadenhall', first3: ['Leadenhall', 'Ramli'], fieldSize: 5 },
  'Nottingham-19:10': { winner: "Bella's Path", first3: ["Bella's Path", 'Spoken Truth'], fieldSize: 6 },
  'Nottingham-19:45': { winner: 'Paradise Walk', first3: ['Paradise Walk', 'Secret Mistral'], fieldSize: 6 },
  'Nottingham-20:15': { winner: 'Ingleby Archie', first3: ['Ingleby Archie', 'Cairdeas'], fieldSize: 5 },
  'Nottingham-20:45': { winner: 'Astracornus', first3: ['Astracornus', 'Kalokalo'], fieldSize: 5 },
  'Redcar-13:42': { winner: 'Furturra', first3: ['Furturra', 'Callisterra', 'Harley'], fieldSize: 9 },
  'Redcar-14:12': { winner: 'Quillan', first3: ['Quillan', 'Undercover Affair'], fieldSize: 6 },
  'Redcar-14:47': { winner: 'Stitching Wheel', first3: ['Stitching Wheel', 'Tazaman'], fieldSize: 7 },
  'Redcar-15:22': { winner: "Schrodinger's Cat", first3: ["Schrodinger's Cat", 'Lebron Power'], fieldSize: 6 },
  'Redcar-16:00': { winner: "I'm Next", first3: ["I'm Next", 'American Bay', 'Spring Is Sprung'], fieldSize: 9 },
  'Redcar-16:40': { winner: 'Hares Bredth', first3: ['Hares Bredth', 'Oasis Cover', 'Muddy Nora'], fieldSize: 10 },
  'Redcar-17:18': { winner: 'Yafaarr', first3: ['Yafaarr', 'Poppeye', 'Volenti'], fieldSize: 12 },
  'Down Royal-14:06': { winner: 'Charm Of Venice', first3: ['Charm Of Venice', 'Vauntingly', 'Camelot Queen'], fieldSize: 10 },
  'Down Royal-14:41': { winner: 'Teologia', first3: ['Teologia', 'Espritroyale', 'Hassaniya'], fieldSize: 10 },
  'Down Royal-15:16': { winner: 'Albatala', first3: ['Albatala', "Cleopatra's Needle", "Simpson's Paradox"], fieldSize: 12 },
  'Down Royal-15:53': { winner: 'Chica Guerrera', first3: ['Chica Guerrera', 'Apercu', 'Lady Lilac'], fieldSize: 9 },
  'Down Royal-16:33': { winner: 'Madbadanddangerous', first3: ['Madbadanddangerous', 'Pierre Grosse', 'Bay Of Stars'], fieldSize: 9 },
  'Down Royal-17:13': { winner: 'Deluca Chop', first3: ['Deluca Chop', 'Folly Beach', 'Royal Alliance'], fieldSize: 14 },
  'Down Royal-17:43': { winner: 'Counting Coup', first3: ['Counting Coup', 'Daddy Long Legs', 'Duvessa'], fieldSize: 9 },
}

// June 19 results (from earlier matching)
const RESULTS_19 = {}

function norm(n) { return (n || '').toLowerCase().replace(/[^a-z0-9]/g, '') }

function matchResult(dateStr, course, offTime, horse, fieldSize) {
  const results = dateStr === '2026-06-20' ? RESULTS_20 : null
  if (!results) return { result: null, position: null }

  const key = `${course}-${offTime}`
  const race = results[key]
  if (!race) return { result: null, position: null }

  const nHorse = norm(horse)

  // Check first3
  const pos = race.first3.findIndex(h => norm(h) === nHorse)
  if (pos === 0) return { result: 'won', position: 1 }
  if (pos > 0) return { result: 'placed', position: pos + 1 }
  if (norm(race.winner) === nHorse) return { result: 'won', position: 1 }

  // Race exists in results — horse ran but finished outside places
  return { result: 'lost', position: fieldSize || 0 }
}

function rebuildPicks(dateStr) {
  const results = dateStr === '2026-06-20' ? RESULTS_20 : null
  const datePreds = {}

  for (const [key, val] of Object.entries(predDb)) {
    if (!key.includes(dateStr) || !Array.isArray(val)) continue
    // Extract course and offTime from key: "Course-HH:MM-YYYY-MM-DD"
    const parts = key.split('-')
    const offTime = parts.slice(-4, -3)[0]  // e.g. "14:30"
    const course = parts.slice(0, -4).join('-')
    datePreds[`${course}-${offTime}`] = val
  }

  const picks = []

  for (const [raceKey, runners] of Object.entries(datePreds)) {
    const offTime2 = raceKey.substring(raceKey.lastIndexOf('-') + 1)
    const course2 = raceKey.substring(0, raceKey.lastIndexOf('-'))

    // Sort by confidence, prefer bettable
    const sorted = runners.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    const bettable = sorted.filter(r => r.betQuality && r.betQuality !== 'NO BET')
    const top = bettable.length > 0 ? bettable[0] : sorted[0]

    if (!top) continue

    const odds = top.odds || 0
    const winProb = (top.estimatedWinProbability || top.predictedWinProbability || 0) / 100
    const valueEdge = odds > 0 ? (winProb * odds) - 1 : 0
    const fairOdds = winProb > 0 ? 1 / winProb : 100
    const probConfidence = (top.confidence || 0) / 100
    const fieldSize = runners.length
    const kellyStake = probConfidence * Math.max(valueEdge, 0) * 0.25

    // Derive betType
    let betType = 'SPEC'
    if (winProb >= 0.10 && odds >= 2.0) {
      if (odds <= 3.0 && winProb >= 0.30) betType = 'PLACE'
      else if (valueEdge > 0.05) betType = 'WIN'
      else if (odds <= 3.0) betType = 'PLACE'
      else betType = 'SPEC'
    }
    // PA modifier
    const paAdj = top.personalAffinity || 0
    if (paAdj < 2 && betType === 'WIN') betType = 'PLACE'
    if (paAdj <= 0 && betType === 'PLACE') betType = 'SPEC'
    if (paAdj >= 5 && betType === 'SPEC') betType = 'WIN'
    if (paAdj >= 5 && betType === 'PLACE') betType = 'WIN'

    const { result, position } = matchResult(dateStr, course2, offTime2, top.horse, fieldSize)

    picks.push({
      horse: top.horse,
      course: course2,
      offTime: offTime2,
      raceName: top.race || '',
      score: top.confidence || 0,
      grade: top.grade || '',
      winProb: Math.round(winProb * 10000) / 10000,
      fairOdds,
      probConfidence: probConfidence * 100,
      odds,
      valueEdge,
      kellyStake,
      betType,
      personalAffinity: top.personalAffinity != null ? { adjustment: top.personalAffinity } : null,
      betQuality: top.betQuality || null,
      marketMovement: null,
      result,
      position,
      fieldSize,
    })
  }

  // Sort by score descending (same as getHomeSelections)
  picks.sort((a, b) => (b.score || 0) - (a.score || 0))

  // Calculate stats
  const stats = {
    won: picks.filter(p => p.result === 'won').length,
    placed: picks.filter(p => p.result === 'placed').length,
    lost: picks.filter(p => p.result === 'lost').length,
    nr: picks.filter(p => p.result === 'nr').length,
    pending: picks.filter(p => p.result === null).length,
  }

  return { picks, stats }
}

// Rebuild June 20
console.log('Rebuilding June 20 picks...')
const j20 = rebuildPicks('2026-06-20')
picksDb['2026-06-20'] = j20
console.log(`  ${j20.picks.length} picks, stats: ${JSON.stringify(j20.stats)}`)
j20.picks.forEach(p => console.log(`  ${p.horse.padEnd(22)} ${p.course.padEnd(28)} ${p.betType.padEnd(6)} PA:${String(p.personalAffinity?.adjustment ?? '-').padEnd(6)} ${p.betQuality || '-'} ${p.result || 'pending'}`))

// Backfill June 19 diagnostics
console.log('\nBackfilling June 19 picks...')
if (picksDb['2026-06-19']) {
  const j19 = picksDb['2026-06-19']
  for (const pick of j19.picks) {
    if (pick.winProb != null) continue // already has diagnostics

    // Find matching prediction
    for (const [key, val] of Object.entries(predDb)) {
      if (!key.includes('2026-06-19') || !Array.isArray(val)) continue
      const match = val.find(r =>
        norm(r.horse) === norm(pick.horse) && norm(r.course) === norm(pick.course)
      )
      if (match) {
        const odds = match.odds || pick.odds || 0
        const winProb = (match.estimatedWinProbability || 0) / 100
        const valueEdge = odds > 0 ? (winProb * odds) - 1 : 0
        const fairOdds = winProb > 0 ? 1 / winProb : 100
        const probConfidence = (match.confidence || 0) / 100

        pick.winProb = Math.round(winProb * 10000) / 10000
        pick.valueEdge = valueEdge
        pick.fairOdds = fairOdds
        pick.probConfidence = probConfidence * 100
        pick.kellyStake = probConfidence * Math.max(valueEdge, 0) * 0.25
        pick.personalAffinity = match.personalAffinity != null ? { adjustment: match.personalAffinity } : null
        pick.betQuality = match.betQuality || null

        // Derive betType
        let bt = 'SPEC'
        if (winProb >= 0.10 && odds >= 2.0) {
          if (odds <= 3.0 && winProb >= 0.30) bt = 'PLACE'
          else if (valueEdge > 0.05) bt = 'WIN'
          else if (odds <= 3.0) bt = 'PLACE'
        }
        const pa = match.personalAffinity || 0
        if (pa < 2 && bt === 'WIN') bt = 'PLACE'
        if (pa <= 0 && bt === 'PLACE') bt = 'SPEC'
        if (pa >= 5 && bt === 'SPEC') bt = 'WIN'
        if (pa >= 5 && bt === 'PLACE') bt = 'WIN'
        pick.betType = bt

        console.log(`  ${pick.horse.padEnd(22)} PA:${String(match.personalAffinity).padEnd(6)} ${match.betQuality}`)
        break
      }
    }
  }
  console.log(`  ${j19.picks.length} picks updated`)
}

writeFileSync(PICKS_PATH, JSON.stringify(picksDb, null, 2))
console.log(`\nSaved to ${PICKS_PATH}`)

// POST to running server if available (prevents server overwriting with stale PG data)
const SERVER_URL = 'http://localhost:3000'
async function postToServer() {
  try {
    const check = await fetch(`${SERVER_URL}/api/daily-picks`, { signal: AbortSignal.timeout(2000) })
    if (!check.ok) { console.log('Server not responding, skipping POST'); return }
  } catch { console.log('Server not reachable, skipping POST'); return }

  for (const date of ['2026-06-20', '2026-06-19']) {
    if (!picksDb[date]) continue
    const res = await fetch(`${SERVER_URL}/api/daily-picks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, picks: picksDb[date].picks, force: true }),
    })
    const data = await res.json()
    console.log(`POST ${date}: ${data.count} picks saved`)
  }
}
await postToServer()
