// CSV Import Script - Populate Horse Memory Database
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { initHorseDb, createTables } from './horseMemoryDb.js'
import { saveHorseRunsBatch } from './saveHorseRun.js'

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

export async function importCSVToHorseDB(csvPath) {
  console.log('Importing CSV to horse database:', csvPath)
  
  const db = await initHorseDb()
  await createTables(db)
  
  try {
    const fileContent = readFileSync(csvPath, 'utf-8')
    
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
    
    console.log(`Found ${records.length} records in CSV`)
    
    const runs = records.map(row => ({
      horse_name: row.horse || '',
      horse_id: row.horse_id || null,
      race_date: row.date || '',
      course: row.course || '',
      distance: row.dist || '',
      distance_furlongs: parseFurlongs(row.dist_f),
      going: row.going || '',
      or_rating: Number(row.or) || 0,
      rpr_rating: Number(row.rpr) || 0,
      finish_position: Number(row.pos) || 0,
      starting_price: row.sp ? parseFloat(row.sp) : null,
      race_class: row.class || '',
      field_size: Number(row.field_size) || 0,
      trainer: row.trainer || '',
      jockey: row.jockey || '',
    }))
    
    const { saved, failed } = await saveHorseRunsBatch(db, runs)
    
    console.log(`Import complete: ${saved} saved, ${failed} failed`)
    
    return { saved, failed }
  } catch (error) {
    console.error('Import failed:', error.message)
    throw error
  } finally {
    await db.close()
  }
}

export async function importMultipleCSVs(csvPaths) {
  const db = await initHorseDb()
  await createTables(db)
  
  let totalSaved = 0
  let totalFailed = 0
  
  try {
    for (const csvPath of csvPaths) {
      console.log('Processing:', csvPath)
      
      const fileContent = readFileSync(csvPath, 'utf-8')
      
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })
      
      const runs = records.map(row => ({
        horse_name: row.horse || '',
        horse_id: row.horse_id || null,
        race_date: row.date || '',
        course: row.course || '',
        distance: row.dist || '',
        distance_furlongs: parseFurlongs(row.dist_f),
        going: row.going || '',
        or_rating: Number(row.or) || 0,
        rpr_rating: Number(row.rpr) || 0,
        finish_position: Number(row.pos) || 0,
        starting_price: row.sp ? parseFloat(row.sp) : null,
        race_class: row.class || '',
        field_size: Number(row.field_size) || 0,
        trainer: row.trainer || '',
        jockey: row.jockey || '',
      }))
      
      const { saved, failed } = await saveHorseRunsBatch(db, runs)
      totalSaved += saved
      totalFailed += failed
      
      console.log(`  ${saved} saved, ${failed} failed`)
    }
    
    console.log(`\nTotal: ${totalSaved} saved, ${totalFailed} failed`)
    
    return { saved: totalSaved, failed: totalFailed }
  } catch (error) {
    console.error('Batch import failed:', error.message)
    throw error
  } finally {
    await db.close()
  }
}

if (process.argv[1]?.includes('importHorseCSV')) {
  const csvFiles = process.argv.slice(2)
  
  if (csvFiles.length === 0) {
    console.log('Usage: node importHorseCSV.js <file1.csv> [file2.csv] ...')
    process.exit(1)
  }
  
  if (csvFiles.length === 1) {
    importCSVToHorseDB(csvFiles[0])
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
  } else {
    importMultipleCSVs(csvFiles)
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
  }
}
