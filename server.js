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
    CREATE TABLE IF NOT EXISTS drivers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      team TEXT NOT NULL
    )
  `);

  const existingDrivers = await pool.query('SELECT COUNT(*) FROM drivers');

  if (Number(existingDrivers.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO drivers (name, team)
      VALUES
      ('Max Verstappen', 'Red Bull'),
      ('Lando Norris', 'McLaren'),
      ('Lewis Hamilton', 'Ferrari')
    `);
  }
}

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Apex Racing Clean API'
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

app.get('/api/drivers', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM drivers ORDER BY id ASC');

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
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
