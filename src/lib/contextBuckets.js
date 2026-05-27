function parseFurlongs(distanceF) {
  if (!distanceF) return 0
  if (typeof distanceF === 'number') return distanceF
  const m = String(distanceF).match(/(\d+)m\s*(\d*)f?\s*(\d*)y?/)
  if (m) {
    const miles = Number(m[1]) || 0
    const furlongs = Number(m[2]) || 0
    const yards = Number(m[3]) || 0
    return miles * 8 + furlongs + yards / 220
  }
  return parseFloat(String(distanceF).replace(/[^0-9.]/g, '')) || 0
}

function distanceBand(distanceF) {
  const f = parseFurlongs(distanceF)
  if (f <= 0) return 'unknown'
  if (f <= 6) return 'sprint'
  if (f <= 9) return 'mile'
  if (f <= 11) return 'middle'
  return 'staying'
}

function goingCategory(going) {
  const g = (going || '').toLowerCase()
  if (g.includes('heavy')) return 'heavy'
  if (g.includes('soft') || g.includes('yielding')) return 'soft'
  if (g.includes('good')) return 'good'
  if (g.includes('firm')) return 'firm'
  if (g.includes('standard') || g.includes('slow')) return 'aw_standard'
  return 'unknown'
}

function raceType(pattern, raceClass, ageBand) {
  const p = (pattern || '').toLowerCase()
  const c = String(raceClass || '').toLowerCase()
  const a = (ageBand || '').toLowerCase()

  if (p.includes('maiden') || p.includes('novice') || a.includes('2yo')) return 'maiden_novice'
  if (c.includes('handicap') || p.includes('handicap')) return 'handicap'
  if (p.includes('hurdle')) return 'hurdle'
  if (p.includes('chase') || p.includes('steeple')) return 'chase'
  if (p.includes('group') || p.includes('grade')) return 'group'
  return 'conditions'
}

function fieldCategory(fieldSize) {
  if (fieldSize <= 6) return 'small'
  if (fieldSize <= 10) return 'medium'
  if (fieldSize <= 14) return 'large'
  return 'very_large'
}

function courseRegion(course) {
  const ukCourses = [
    'ayr', 'ascot', 'cheltenham', 'newmarket', 'york', 'doncaster',
    'goodwood', 'kempton', 'lingfield', 'wolverhampton', 'southwell',
    'chelmsford', 'newcastle', 'chester', 'haydock', 'newbury',
    'sandown', 'leicester', 'nottingham', 'ripon', 'thirsk',
    'catterick', 'redcar', 'beverley', 'pontefract', 'windsor',
    'bath', 'salisbury', 'yarmouth', 'folkestone', 'plumpton',
    'worcester', 'uttoxeter', 'hexham', 'cartmel', 'market rasen',
    'sedgefield', 'huntingdon', 'folkestone', 'bangor', 'fakenham',
  ]
  const ireCourses = [
    'leopardstown', 'curragh', 'galway', 'punchestown', 'fairyhouse',
    'naas', 'navan', 'down royal', 'ballinrobe', 'killarney',
    'listowel', 'cork', 'limerick', 'tipperary', 'thurles',
    'wexford', 'clonmel', 'tramore', 'waterford', 'sligo',
    'bellewstown', 'roscommon', 'downpatrick', 'kilbeggan',
  ]
  const c = (course || '').toLowerCase()
  if (ireCourses.some((ic) => c.includes(ic))) return 'ireland'
  if (ukCourses.some((uc) => c.includes(uc))) return 'uk'
  if (c.includes('longchamp') || c.includes('chantilly') || c.includes('deauville') || c.includes('maisons')) return 'france'
  return 'other'
}

function courseSlug(course) {
  return (course || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 10)
}

export function bucketKey(race) {
  const surface = (race.surface || 'turf').toLowerCase() === 'all weather' ? 'aw' : 'turf'
  const dist = distanceBand(race.distance_f)
  const going = goingCategory(race.going)
  const type = raceType(race.pattern, race.race_class, race.age_band)
  const field = fieldCategory((race.runners || []).length)
  const region = courseRegion(race.course)
  const course = courseSlug(race.course)

  return `${surface}_${dist}_${going}_${type}_${field}_${region}_${course}`
}

export function bucketComponents(race) {
  return {
    surface: (race.surface || 'turf').toLowerCase() === 'all weather' ? 'aw' : 'turf',
    distance: distanceBand(race.distance_f),
    going: goingCategory(race.going),
    type: raceType(race.pattern, race.race_class, race.age_band),
    field: fieldCategory((race.runners || []).length),
    region: courseRegion(race.course),
    course: (race.course || '').toLowerCase(),
  }
}

const DEFAULT_BUCKET_WEIGHTS = {
  power: 0.60,
  pace: 0.15,
  human: 0.10,
  market: 0.05,
  trainer: 0.10,
}

export function getBucketWeights(bucketDb, bucket, fallback = DEFAULT_BUCKET_WEIGHTS) {
  const bucketData = bucketDb?.[bucket]
  if (!bucketData || !bucketData.predictions || bucketData.predictions < 20) {
    return fallback
  }

  const { layerImportance } = bucketData
  if (!layerImportance) return fallback

  const total = layerImportance.power + layerImportance.pace + layerImportance.human + layerImportance.market + layerImportance.trainer
  if (total <= 0) return fallback

  return {
    power: layerImportance.power / total,
    pace: layerImportance.pace / total,
    human: layerImportance.human / total,
    market: layerImportance.market / total,
    trainer: layerImportance.trainer / total,
  }
}

export function updateBucketLearning(bucketDb, bucket, predictions, actualResults) {
  if (!bucketDb[bucket]) {
    bucketDb[bucket] = {
      predictions: 0,
      winners: 0,
      placed: 0,
      layerImportance: { ...DEFAULT_BUCKET_WEIGHTS },
      lastUpdated: null,
    }
  }

  const bucketData = bucketDb[bucket]
  bucketData.predictions += predictions.length
  bucketData.lastUpdated = new Date().toISOString()

  predictions.forEach((pred, i) => {
    const result = actualResults[i]
    if (!result) return

    if (result.position === 1) {
      bucketData.winners++
      bucketData.layerImportance.power += pred.powerScore > 50 ? 0.5 : -0.2
      bucketData.layerImportance.pace += pred.paceScore > 5 ? 0.3 : -0.1
      bucketData.layerImportance.human += pred.humanScore > 0 ? 0.2 : 0
      bucketData.layerImportance.market += pred.marketAdj > 0 ? 0.1 : 0
      bucketData.layerImportance.trainer += pred.trainerRtf > 20 ? 0.3 : 0
    }

    if (result.position >= 2 && result.position <= 4) {
      bucketData.placed++
      bucketData.layerImportance.power += pred.powerScore > 40 ? 0.2 : -0.1
      bucketData.layerImportance.pace += pred.paceScore > 0 ? 0.1 : 0
      bucketData.layerImportance.trainer += pred.trainerRtf > 15 ? 0.1 : 0
    }
  })

  Object.keys(bucketData.layerImportance).forEach((key) => {
    bucketData.layerImportance[key] = Math.max(0.05, bucketData.layerImportance[key])
  })

  return bucketData
}
