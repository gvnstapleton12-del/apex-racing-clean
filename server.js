import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Apex Racing Clean API'
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    healthy: true
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
