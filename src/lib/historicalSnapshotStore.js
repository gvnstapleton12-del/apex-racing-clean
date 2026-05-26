// Historical Snapshot Store
// Stores immutable engine signal trees for replay + learning

import fs from 'fs'
import path from 'path'

const SNAPSHOTS_FILE = path.join(process.cwd(), 'data', 'historical_snapshots.json')

function ensureFile() {
  if (!fs.existsSync(SNAPSHOTS_FILE)) {
    fs.writeFileSync(SNAPSHOTS_FILE, JSON.stringify({ runners: [] }, null, 2))
  }
}

function loadSnapshots() {
  ensureFile()
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOTS_FILE, 'utf8'))
  } catch {
    return { runners: [] }
  }
}

function saveSnapshots(data) {
  const dir = path.dirname(SNAPSHOTS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SNAPSHOTS_FILE, JSON.stringify(data, null, 2))
}

export function storeRunnerSnapshot(snapshot) {
  const data = loadSnapshots()
  data.runners.push({
    id: snapshot.runId || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    raceId: snapshot.raceId,
    horseId: snapshot.horseId,
    horseName: snapshot.horseName,
    generatedAt: snapshot.timestamp || new Date().toISOString(),
    signalSnapshot: snapshot.signals,
    scoreSnapshot: snapshot.scores,
    commentarySnapshot: snapshot.commentary,
    finalScore: snapshot.scores?.finalScore || 0,
    verdict: snapshot.commentary?.verdict || 'NO BET',
  })
  saveSnapshots(data)
  return data.runners[data.runners.length - 1].id
}

export function getSnapshotsByRace(raceId) {
  const data = loadSnapshots()
  return data.runners.filter(r => r.raceId === raceId)
}

export function getSnapshotsByHorse(horseId) {
  const data = loadSnapshots()
  return data.runners.filter(r => r.horseId === horseId)
}

export function getSnapshotsByVerdict(verdict) {
  const data = loadSnapshots()
  return data.runners.filter(r => r.verdict === verdict)
}

export function getSnapshotsByDateRange(start, end) {
  const data = loadSnapshots()
  return data.runners.filter(r => {
    const d = new Date(r.generatedAt)
    return d >= new Date(start) && d <= new Date(end)
  })
}

export function getSnapshotStats() {
  const data = loadSnapshots()
  const verdicts = {}
  const scores = []
  data.runners.forEach(r => {
    verdicts[r.verdict] = (verdicts[r.verdict] || 0) + 1
    scores.push(r.finalScore)
  })
  return {
    total: data.runners.length,
    verdicts,
    avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    maxScore: scores.length > 0 ? Math.max(...scores) : 0,
    minScore: scores.length > 0 ? Math.min(...scores) : 0,
  }
}

export function deleteAllSnapshots() {
  saveSnapshots({ runners: [] })
}
