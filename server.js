import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? {
        rejectUnauthorized: false
      }
    : false
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tips (
      id SERIAL PRIMARY KEY,
      horse TEXT NOT NULL,
      track TEXT NOT NULL,
      race_time TEXT NOT NULL,
      odds TEXT NOT NULL,
      confidence TEXT NOT NULL
    )
  `);

  const existingTips = await pool.query('SELECT COUNT(*) FROM tips');

  if (Number(existingTips.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO tips (horse, track, race_time, odds, confidence)
      VALUES
      ('Midnight Runner', 'Ascot', '15:30', '5/1', 'High'),
      ('Golden Hooves', 'Cheltenham', '14:10', '7/2', 'Medium'),
      ('Storm Charger', 'Aintree', '16:45', '10/1', 'High')
    `);
  }
}

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Horse Racing Tipster API'
  });
});

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');

    res.json({
      healthy: true,
      database: 'connected',
      time: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      healthy: false,
      error: error.message
    });
  }
});

app.get('/api/tips', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tips ORDER BY id ASC');

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.get('/api/racecards', (_req, res) => {
  res.json([
    {
      id: 1,
      course: 'Ascot',
      offTime: '15:30',
      raceName: 'Royal Sprint Handicap',
      runners: 12
    },
    {
      id: 2,
      course: 'Cheltenham',
      offTime: '14:10',
      raceName: 'Festival Chase',
      runners: 9
    }
  ]);
});

app.get('/api/dashboard/summary', (_req, res) => {
  res.json({
    totalTips: 3,
    highConfidence: 2,
    meetingsToday: 5,
    roi: '+18%'
  });
});

app.get('/api/racecards/:id/analysis', (req, res) => {
  res.json({
    raceId: req.params.id,
    topPick: 'Midnight Runner',
    confidence: 'High',
    reasoning: 'Strong recent form and ideal ground conditions.'
  });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
  });
