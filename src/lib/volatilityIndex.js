function parseFormPositions(form = '') {
  const positions = []
  const segments = form.split(/[\/-]/)
  segments.forEach((seg) => {
    for (const ch of seg) {
      const n = parseInt(ch, 10)
      if (!isNaN(n)) positions.push(n)
    }
  })
  return positions.filter((p) => p > 0)
}

export function volatilityIndex(race) {
  let chaos = 0.5
  const runners = race.runners || []
  const fieldSize = runners.length
  const type = (race.type || race.race_type || '').toLowerCase()
  const going = (race.going || '').toLowerCase()
  const raceClass = race.race_class || ''
  const ageBand = race.age_band || ''
  const pattern = (race.pattern || '').toLowerCase()

  if (type.includes('maiden') || pattern.includes('maiden')) chaos += 0.2
  if (ageBand.includes('2') || ageBand.includes('2yo')) chaos += 0.2

  if (fieldSize >= 16) chaos += 0.15
  else if (fieldSize >= 12) chaos += 0.08
  else if (fieldSize >= 10) chaos += 0.03
  else if (fieldSize <= 5) chaos -= 0.15
  else if (fieldSize <= 7) chaos -= 0.05

  if (going.includes('heavy')) chaos += 0.15
  else if (going.includes('soft')) chaos += 0.08
  else if (going.includes('good') || going.includes('standard')) chaos -= 0.05

  if (raceClass.includes('1') || raceClass.includes('2')) chaos -= 0.1
  if (raceClass.includes('5') || raceClass.includes('6')) chaos += 0.05

  let inconsistentForm = 0
  runners.forEach((r) => {
    const pos = parseFormPositions(r.form || '')
    if (pos.length >= 3) {
      const spread = Math.max(...pos) - Math.min(...pos)
      if (spread > 8) inconsistentForm++
    }
    if (pos.length <= 1) inconsistentForm += 0.5
  })
  chaos += (inconsistentForm / Math.max(1, runners.length)) * 0.15

  let lightlyRaced = runners.filter((r) => {
    const pos = parseFormPositions(r.form || '')
    return pos.length <= 2 && pos.length > 0
  }).length
  chaos += (lightlyRaced / Math.max(1, runners.length)) * 0.1

  return {
    chaos: Math.max(0.1, Math.min(0.9, chaos)),
    label:
      chaos >= 0.65 ? 'HIGH' : chaos >= 0.45 ? 'MEDIUM' : 'LOW',
  }
}
