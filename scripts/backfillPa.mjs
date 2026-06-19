import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculatePersonalAffinityBonus } from '../src/lib/personalAffinity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CALIBRATION_PATH = path.join(ROOT, 'data', 'calibration.json');
const LEARNING_PATH = path.join(ROOT, 'data', 'learning.json');

function normalizeHorse(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function normalizeCourse(course) {
  return String(course || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function run() {
  console.log('=== PA Backfill Migration ===\n');

  // 1. Load databases
  const calDb = JSON.parse(fs.readFileSync(CALIBRATION_PATH, 'utf8'));
  const learnDb = JSON.parse(fs.readFileSync(LEARNING_PATH, 'utf8'));
  const records = calDb.records || [];
  const races = learnDb.races || [];

  console.log(`Calibration records: ${records.length}`);
  console.log(`Learning races: ${races.length}`);

  // 2. Build lookup index from learning races
  // Key: "date|course|horse" -> runner object with previous_results
  const lookup = new Map();
  for (const race of races) {
    const date = race.date || '';
    const course = race.course || '';
    for (const runner of (race.runners || [])) {
      const key = `${normalizeCourse(course)}|${normalizeHorse(runner.horse)}`;
      lookup.set(key, {
        previous_results: runner.previous_results || [],
        course,
        horse: runner.horse,
        race,
      });
    }
  }
  console.log(`Indexed ${lookup.size} runners from learning races\n`);

  // 3. Backfill PA into calibration records
  let updated = 0;
  let alreadyHad = 0;
  let noMatch = 0;
  let noHistory = 0;

  for (const record of records) {
    // Skip if already has PA
    if (record.personalAffinity != null && typeof record.personalAffinity === 'number') {
      alreadyHad++;
      continue;
    }

    // Find matching runner in learning races
    const horse = record.horse || '';
    const course = record.course || '';
    const date = record.date || '';
    const key = `${normalizeCourse(course)}|${normalizeHorse(horse)}`;
    const match = lookup.get(key);

    if (!match) {
      noMatch++;
      record.personalAffinity = 0;
      continue;
    }

    if (!match.previous_results || match.previous_results.length === 0) {
      noHistory++;
      record.personalAffinity = 0;
      continue;
    }

    // Compute PA using the real engine function
    const race = match.race;
    const distanceF = parseFloat(String(race.distance_f || '').replace(/[^0-9.]/g, '')) || 0;

    const pa = calculatePersonalAffinityBonus(match.previous_results, {
      trackName: course,
      distanceF,
      going: race.going || '',
      draw: 0,
      predictedRunStyle: 'Midfield',
      horseName: horse,
      fieldFRCount: 0,
      pacePressure: 0,
    }, {
      courseMultiplier: 2.5,
      disableGoing: true,
    });

    // Convert to adjustment (same as apexEngine.js:389-391)
    let adjustment = (pa.factor - 1.0) * 100;
    if (adjustment > 0) {
      adjustment = Math.pow(adjustment, 1.5);
    }

    record.personalAffinity = Math.round(adjustment * 10) / 10;
    updated++;
  }

  // 4. Save updated calibration
  fs.writeFileSync(CALIBRATION_PATH, JSON.stringify(calDb, null, 2), 'utf8');

  console.log('=== RESULTS ===');
  console.log(`Updated:     ${updated}`);
  console.log(`Already had: ${alreadyHad}`);
  console.log(`No match:    ${noMatch}`);
  console.log(`No history:  ${noHistory}`);
  console.log(`Total:       ${records.length}`);
  console.log(`\nSaved to: ${CALIBRATION_PATH}`);
}

run();
