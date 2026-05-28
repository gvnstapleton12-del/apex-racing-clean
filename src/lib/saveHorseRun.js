// Save Horse Run to Database

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

export async function saveHorseRun(db, run) {
  if (!db) {
    console.error('Database not available for saving horse run')
    return false
  }
  
  try {
    await db.run(`
      INSERT INTO horse_runs (
        horse_name,
        horse_id,
        race_date,
        course,
        distance,
        distance_furlongs,
        going,
        or_rating,
        rpr_rating,
        finish_position,
        starting_price,
        race_class,
        field_size,
        trainer,
        jockey
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      run.horse_name || '',
      run.horse_id || null,
      run.race_date || '',
      run.course || '',
      run.distance || '',
      run.distance_furlongs || parseFurlongs(run.distance),
      run.going || '',
      run.or_rating || 0,
      run.rpr_rating || 0,
      run.finish_position || 0,
      run.starting_price || null,
      run.race_class || '',
      run.field_size || 0,
      run.trainer || '',
      run.jockey || ''
    ])
    
    return true
  } catch (error) {
    console.error('Error saving horse run:', error.message)
    return false
  }
}

export async function saveHorseRunsBatch(db, runs) {
  if (!db || !runs.length) {
    return { saved: 0, failed: 0 }
  }
  
  let saved = 0
  let failed = 0
  
  try {
    await db.exec('BEGIN TRANSACTION')
    
    for (const run of runs) {
      try {
        await db.run(`
          INSERT INTO horse_runs (
            horse_name,
            horse_id,
            race_date,
            course,
            distance,
            distance_furlongs,
            going,
            or_rating,
            rpr_rating,
            finish_position,
            starting_price,
            race_class,
            field_size,
            trainer,
            jockey
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          run.horse_name || '',
          run.horse_id || null,
          run.race_date || '',
          run.course || '',
          run.distance || '',
          run.distance_furlongs || parseFurlongs(run.distance),
          run.going || '',
          run.or_rating || 0,
          run.rpr_rating || 0,
          run.finish_position || 0,
          run.starting_price || null,
          run.race_class || '',
          run.field_size || 0,
          run.trainer || '',
          run.jockey || ''
        ])
        saved++
      } catch (err) {
        failed++
        console.error('Failed to save run:', run.horse_name, err.message)
      }
    }
    
    await db.exec('COMMIT')
    
    return { saved, failed }
  } catch (error) {
    await db.exec('ROLLBACK')
    console.error('Batch save failed:', error.message)
    return { saved: 0, failed: runs.length }
  }
}
