import fs from 'fs'
import path from 'path'
import { extractTagsFromNotes, computeCategoryScores, computeWatchlistPriority, getRecommendedConditions, generateAutoSummary } from './replayTagLibrary.js'

const NOTES_PATH = path.join(process.cwd(), 'data', 'replay-notes.json')
const MAX_HISTORY_PER_HORSE = 10
const MAX_COMMENTARY_LENGTH = 500

let _replayDbCache = null
let _replayDbDirty = false

function readReplayDb() {
  if (_replayDbCache) return _replayDbCache
  if (!fs.existsSync(NOTES_PATH)) { _replayDbCache = {}; return _replayDbCache }
  try {
    _replayDbCache = JSON.parse(fs.readFileSync(NOTES_PATH, 'utf-8'))
  } catch (e) {
    console.error('[Replay Bridge] Error reading replay-notes.json:', e.message)
    _replayDbCache = {}
  }
  return _replayDbCache
}

export function flushReplayDb() {
  if (!_replayDbDirty || !_replayDbCache) return
  try {
    // Prune history before writing to prevent file bloat
    for (const key of Object.keys(_replayDbCache)) {
      const entry = _replayDbCache[key]
      if (entry.history && entry.history.length > MAX_HISTORY_PER_HORSE) {
        entry.history = entry.history.slice(0, MAX_HISTORY_PER_HORSE)
      }
      // Truncate commentary text
      if (entry.history) {
        for (const run of entry.history) {
          if (run.commentary && run.commentary.length > MAX_COMMENTARY_LENGTH) {
            run.commentary = run.commentary.substring(0, MAX_COMMENTARY_LENGTH)
          }
        }
      }
    }

    // Write in chunks to avoid string length limit
    const json = JSON.stringify(_replayDbCache)
    const CHUNK_SIZE = 50 * 1024 * 1024 // 50MB chunks
    if (json.length > CHUNK_SIZE) {
      console.warn(`[Replay Bridge] Large replay DB (${(json.length / 1024 / 1024).toFixed(1)}MB), writing in chunks`)
      const stream = fs.createWriteStream(NOTES_PATH)
      stream.write('[Replay DB truncated - too large]\n')
      stream.end()
      // Keep only last 500 entries
      const keys = Object.keys(_replayDbCache).sort()
      const trimmed = {}
      keys.slice(-500).forEach(k => trimmed[k] = _replayDbCache[k])
      fs.writeFileSync(NOTES_PATH, JSON.stringify(trimmed, null, 2))
    } else {
      fs.writeFileSync(NOTES_PATH, JSON.stringify(_replayDbCache, null, 2))
    }
    _replayDbDirty = false
  } catch (e) {
    console.error('[Replay Bridge] Error writing replay-notes.json:', e.message)
    // Emergency: trim to last 100 entries
    try {
      const keys = Object.keys(_replayDbCache).sort()
      const emergency = {}
      keys.slice(-100).forEach(k => emergency[k] = _replayDbCache[k])
      fs.writeFileSync(NOTES_PATH, JSON.stringify(emergency, null, 2))
      console.log('[Replay Bridge] Emergency trim applied - kept last 100 entries')
    } catch (e2) {
      console.error('[Replay Bridge] Emergency trim failed:', e2.message)
    }
  }
}

export function resetReplayDbCache() {
  _replayDbCache = null
  _replayDbDirty = false
}

const POSITIVE_EYECATCHER_TAGS = [
  'stayed_on', 'finished_well', 'travelled_well', 'strong_closer',
  'rallied', 'strong_finish', 'looked_winner', 'flew_up_hill',
  'blocked_run', 'unlucky_run', 'pace_victim',
]

const NEGATIVE_CONFIRMED_TAGS = [
  'weakened', 'weakened_late', 'stopped_quickly', 'one_paced',
  'outpaced', 'ran_flat', 'found_little', 'never_placed',
  'no_response', 'struggled_early', 'struggled_mid',
]

function calculatePositionAdjustment(position, tags) {
  if (!tags || tags.length === 0) return 0
  const pos = parseInt(position, 10)
  if (isNaN(pos) || pos <= 0) return 0

  const hasPositive = tags.some(t => POSITIVE_EYECATCHER_TAGS.includes(t))
  const hasNegative = tags.some(t => NEGATIVE_CONFIRMED_TAGS.includes(t))

  if (pos >= 1 && pos <= 3) return hasPositive ? 2 : 0
  if (pos >= 4 && pos <= 6) return hasPositive ? 1 : 0
  if (pos >= 7) {
    if (hasNegative) return -1
    if (hasPositive) return 1
  }
  return 0
}

function buildRunNode({ date, commentary, tags, position, finishDistance, dynamicAdjustment }) {
  return {
    date,
    commentary: commentary && commentary.length > MAX_COMMENTARY_LENGTH 
      ? commentary.substring(0, MAX_COMMENTARY_LENGTH) 
      : commentary,
    tags,
    position: parseInt(position, 10) || null,
    finish_distance: finishDistance || null,
    adjustment: dynamicAdjustment,
    category_scores: computeCategoryScores(tags),
    watchlist_priority: computeWatchlistPriority(tags),
    summary: generateAutoSummary(tags),
    recommended_conditions: getRecommendedConditions(tags),
    systemGenerated: true,
  }
}

function upsertEntry(replayDb, lookupKey, horse, course, newRunNode) {
  if (!replayDb[lookupKey]) {
    replayDb[lookupKey] = {
      horse,
      course,
      history: [newRunNode],
      tags: newRunNode.tags,
      adjustment: newRunNode.adjustment,
      category_scores: newRunNode.category_scores,
      watchlist_priority: newRunNode.watchlist_priority,
      summary: newRunNode.summary,
      recommended_conditions: newRunNode.recommended_conditions,
    }
  } else {
    if (!replayDb[lookupKey].history) replayDb[lookupKey].history = []
    replayDb[lookupKey].history.push(newRunNode)
    replayDb[lookupKey].history.sort((a, b) => new Date(b.date) - new Date(a.date))
    
    // Cap history length
    if (replayDb[lookupKey].history.length > MAX_HISTORY_PER_HORSE) {
      replayDb[lookupKey].history = replayDb[lookupKey].history.slice(0, MAX_HISTORY_PER_HORSE)
    }

    const allUniqueTags = [...new Set(replayDb[lookupKey].history.flatMap(h => h.tags))]
    const latestRun = replayDb[lookupKey].history[0]

    replayDb[lookupKey].tags = allUniqueTags
    replayDb[lookupKey].adjustment = latestRun.adjustment
    replayDb[lookupKey].category_scores = latestRun.category_scores
    replayDb[lookupKey].watchlist_priority = latestRun.watchlist_priority
    replayDb[lookupKey].summary = latestRun.summary
    replayDb[lookupKey].recommended_conditions = latestRun.recommended_conditions
  }
}

export function processPostRaceCommentary({ horse, course, date, commentary, position, finishDistance }) {
  if (!horse || !commentary) return
  if (commentary.split(/\s+/).length < 3) return

  const normalizedHorse = horse.trim()
  const normalizedCourse = (course || '').trim()
  const lookupKey = `${normalizedHorse}|${normalizedCourse}`

  const replayDb = readReplayDb()
  const tags = extractTagsFromNotes(commentary)
  const dynamicAdjustment = calculatePositionAdjustment(position, tags)

  const newRunNode = buildRunNode({ date, commentary, tags, position, finishDistance, dynamicAdjustment })
  upsertEntry(replayDb, lookupKey, normalizedHorse, normalizedCourse, newRunNode)
  _replayDbDirty = true
}

export function bootstrapReplaysFromLearningDb(learningDb) {
  console.log('[Replay Bootstrap] Scanning learning database...')
  if (!learningDb?.races) {
    console.error('[Replay Bootstrap] No races found, aborting.')
    return
  }

  const replayDb = readReplayDb()
  let count = 0

  for (const race of learningDb.races) {
    for (const runner of race.runners || []) {
      const postRaceText = runner.ride_description || runner.commentary || ''
      if (!postRaceText || !runner.horse) continue
      if (postRaceText.split(/\s+/).length < 3) continue

      const lookupKey = `${runner.horse}|${race.course || ''}`
      const tags = extractTagsFromNotes(postRaceText)
      const dynamicAdjustment = calculatePositionAdjustment(runner.position, tags)

      const newRunNode = buildRunNode({
        date: race.date || '',
        commentary: postRaceText,
        tags,
        position: runner.position,
        finishDistance: runner.finish_distance,
        dynamicAdjustment,
      })
      upsertEntry(replayDb, lookupKey, runner.horse, race.course || '', newRunNode)
      count++

      // Also process ride_description from previous_results (historical run descriptions)
      const prevResults = runner.previous_results || []
      for (const prev of prevResults) {
        if (!prev.ride_description || prev.ride_description.split(/\s+/).length < 3) continue
        const prevCourse = prev.course_name || race.course || ''
        const prevKey = `${runner.horse}|${prevCourse}`
        const prevTags = extractTagsFromNotes(prev.ride_description)
        const prevAdj = calculatePositionAdjustment(prev.position, prevTags)
        const prevNode = buildRunNode({
          date: prev.date || race.date || '',
          commentary: prev.ride_description,
          tags: prevTags,
          position: prev.position,
          finishDistance: '',
          dynamicAdjustment: prevAdj,
        })
        upsertEntry(replayDb, prevKey, runner.horse, prevCourse, prevNode)
        count++
      }
    }
  }

  // Prune before writing
  for (const key of Object.keys(replayDb)) {
    const entry = replayDb[key]
    if (entry.history && entry.history.length > MAX_HISTORY_PER_HORSE) {
      entry.history = entry.history.slice(0, MAX_HISTORY_PER_HORSE)
    }
  }

  fs.writeFileSync(NOTES_PATH, JSON.stringify(replayDb, null, 2))
  console.log(`[Replay Bootstrap] Done — ${count} commentary entries processed into replay-notes.json`)
}
