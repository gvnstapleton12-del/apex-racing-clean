import fs from 'fs'
import path from 'path'
import { bootstrapReplaysFromLearningDb } from '../src/lib/replayBridge.js'

const LEARNING_DB_PATH = path.join(process.cwd(), 'data', 'learning.json')

console.log('=====================================================')
console.log('  APEX Intelligence: Standalone Replay Bootstrapper')
console.log('=====================================================')

if (!fs.existsSync(LEARNING_DB_PATH)) {
  console.error(`Execution Failed: Missing ${LEARNING_DB_PATH}`)
  process.exit(1)
}

try {
  console.log('Reading historical learning-database.json...')
  const rawData = fs.readFileSync(LEARNING_DB_PATH, 'utf-8')
  const learningDb = JSON.parse(rawData)

  if (!learningDb.races || learningDb.races.length === 0) {
    console.warn('Warning: database contains no races.')
    process.exit(0)
  }

  console.log(`Ingested ${learningDb.races.length} historical races.`)
  console.time('Bootstrap Duration')

  bootstrapReplaysFromLearningDb(learningDb)

  console.timeEnd('Bootstrap Duration')
  console.log('Verify output in data/replay-notes.json')
  console.log('=====================================================')
} catch (error) {
  console.error('Fatal error:', error.message)
  process.exit(1)
}
