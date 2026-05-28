// Import Historical CSV Data to Horse Memory Database
// Usage: node scripts/importHorseData.js <csv-file> [csv-file2] ...

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { importMultipleCSVs } from '../src/lib/importHorseCSV.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const csvFiles = process.argv.slice(2)

if (csvFiles.length === 0) {
  console.log('Usage: node scripts/importHorseData.js <file1.csv> [file2.csv] ...')
  console.log('')
  console.log('Example:')
  console.log('  node scripts/importHorseData.js 2025_05_01.csv')
  console.log('  node scripts/importHorseData.js *.csv')
  process.exit(1)
}

console.log('Importing CSV files to horse memory database...')
console.log('Files:', csvFiles)
console.log('')

importMultipleCSVs(csvFiles)
  .then(({ saved, failed }) => {
    console.log('')
    console.log('Import complete!')
    console.log(`  Saved: ${saved}`)
    console.log(`  Failed: ${failed}`)
    console.log('')
    console.log('Database location: data/apex-horses.db')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Import failed:', error.message)
    process.exit(1)
  })
