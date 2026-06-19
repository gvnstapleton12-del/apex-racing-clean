import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CALIBRATION_PATH = path.join(ROOT, 'data', 'calibration.json');
const PREDICTIONS_PATH = path.join(ROOT, 'data', 'predictions.json');

function normalize(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function run() {
  console.log('=== PA Backfill v2: Predictions Database ===\n');

  const calDb = JSON.parse(fs.readFileSync(CALIBRATION_PATH, 'utf8'));
  const predsDb = JSON.parse(fs.readFileSync(PREDICTIONS_PATH, 'utf8'));
  const records = calDb.records || [];

  console.log(`Calibration records: ${records.length}`);

  // Build lookup from predictions: "date|course|horse" -> PA adjustment
  const lookup = new Map();
  let totalPreds = 0;
  let predsWithPA = 0;

  for (const [raceId, preds] of Object.entries(predsDb)) {
    if (!Array.isArray(preds)) continue;
    for (const p of preds) {
      totalPreds++;
      const date = p.date || '';
      const course = p.course || '';
      const horse = p.horse || '';
      const key = `${date}|${normalize(course)}|${normalize(horse)}`;
      const pa = p.personalAffinity;
      if (pa != null && typeof pa === 'number' && pa !== 0) {
        lookup.set(key, pa);
        predsWithPA++;
      }
    }
  }

  console.log(`Predictions: ${totalPreds} total, ${predsWithPA} with non-zero PA`);
  console.log(`Lookup entries: ${lookup.size}\n`);

  // Backfill calibration records
  let updated = 0;
  let alreadyHad = 0;
  let matched = 0;

  for (const record of records) {
    // Skip if already has real PA (not 0)
    if (record.personalAffinity != null && typeof record.personalAffinity === 'number' && record.personalAffinity !== 0) {
      alreadyHad++;
      continue;
    }

    const date = record.date || '';
    const course = record.course || '';
    const horse = record.horse || '';
    const key = `${date}|${normalize(course)}|${normalize(horse)}`;
    const pa = lookup.get(key);

    if (pa != null) {
      record.personalAffinity = Math.round(pa * 10) / 10;
      matched++;
      updated++;
    }
    // Leave PA=0 for unmatched records (no better data available)
  }

  // Save
  fs.writeFileSync(CALIBRATION_PATH, JSON.stringify(calDb, null, 2), 'utf8');

  console.log('=== RESULTS ===');
  console.log(`Updated from predictions: ${updated}`);
  console.log(`Already had real PA:      ${alreadyHad}`);
  console.log(`Still PA=0 (unmatched):  ${records.length - updated - alreadyHad}`);
  console.log(`Total:                   ${records.length}`);
  console.log(`\nSaved to: ${CALIBRATION_PATH}`);
}

run();
