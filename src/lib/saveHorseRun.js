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

const GOING_TO_NUM = {
  'firm': 1, 'good to firm': 2, 'good': 3, 'good to soft': 4, 'soft': 5, 'heavy': 6,
  'standard': 3, 'standard to slow': 4, 'standard to fast': 2,
}

function goingToNum(going) {
  if (!going) return 0
  return GOING_TO_NUM[going.toLowerCase().trim()] || 0
}

export function computeWinningAnchor(run, trackProfiles) {
  if (run.finish_position !== 1) return null
  const courseName = (run.course || '').toLowerCase().trim()
  let handedness = 'Unknown'
  if (trackProfiles) {
    for (const [name, profile] of Object.entries(trackProfiles)) {
      if (name.toLowerCase().trim() === courseName) {
        handedness = profile.handedness || 'Unknown'
        break
      }
    }
  }
  return JSON.stringify({
    anchorDate: run.race_date || '',
    orAtWin: run.or_rating || 0,
    fieldSizeAtWin: run.field_size || 0,
    goingNumAtWin: goingToNum(run.going),
    goingAtWin: run.going || '',
    distanceFurlongsAtWin: run.distance_furlongs || parseFurlongs(run.distance),
    raceClassAtWin: run.race_class || '',
    courseTypeAtWin: handedness,
    courseAtWin: run.course || '',
  })
}

export async function saveHorseRun(db, run, trackProfiles) {
  if (!db) {
    console.error('Database not available for saving horse run')
    return false
  }
  
  try {
    const provenZone = computeWinningAnchor(run, trackProfiles)
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
        jockey,
        proven_zone
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      run.jockey || '',
      provenZone
    ])
    
    return true
  } catch (error) {
    console.error('Error saving horse run:', error.message)
    return false
  }
}

export async function savePreviousResults(db, horseName, horseId, previousResults, trackProfiles) {
  if (!db || !Array.isArray(previousResults) || !previousResults.length) return 0
  let saved = 0
  for (const pr of previousResults) {
    if (!pr || !pr.date) continue
    const pos = parseInt(pr.position)
    if (isNaN(pos) || pos < 1) continue
    try {
      const run = {
        horse_name: horseName,
        horse_id: horseId || null,
        race_date: pr.date || '',
        course: pr.course_name || pr.course || '',
        distance: pr.distance || '',
        going: pr.going || pr.going_shortcode || '',
        or_rating: Number(pr.official_rating || pr.or || pr.bha || 0) || 0,
        rpr_rating: Number(pr.rpr || 0) || 0,
        finish_position: pos,
        starting_price: pr.odds || null,
        race_class: pr.race_class || '',
        field_size: pr.runner_count || 0,
        trainer: pr.trainer || '',
        jockey: pr.jockey || '',
      }
      const provenZone = computeWinningAnchor(run, trackProfiles)
      await db.run(`
        INSERT OR IGNORE INTO horse_runs (
          horse_name, horse_id, race_date, course, distance, distance_furlongs,
          going, or_rating, rpr_rating, finish_position, starting_price,
          race_class, field_size, trainer, jockey, proven_zone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        run.horse_name, run.horse_id, run.race_date, run.course,
        run.distance, parseFurlongs(run.distance), run.going,
        run.or_rating, run.rpr_rating, run.finish_position,
        run.starting_price, run.race_class, run.field_size,
        run.trainer, run.jockey, provenZone
      ])
      saved++
    } catch {}
  }
  return saved
}

export async function saveHorseRunsBatch(db, runs, trackProfiles) {
  if (!db || !runs.length) {
    return { saved: 0, failed: 0 }
  }
  
  let saved = 0
  let failed = 0
  
  try {
    await db.exec('BEGIN TRANSACTION')
    
    for (const run of runs) {
      try {
        const provenZone = computeWinningAnchor(run, trackProfiles)
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
            jockey,
            proven_zone
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          run.jockey || '',
          provenZone
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
