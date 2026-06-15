import fs from 'fs';

let content = fs.readFileSync('./server.js', 'utf-8');

const insertPoint = content.indexOf("app.get('*', (req, res) => {");
if (insertPoint === -1) {
  console.log('Not found');
  process.exit(1);
}

const debugRoute = `
app.get('/api/debug/state', (_req, res) => {
  res.json({
    races: LIVE_STATE.racecards?.length || 0,
    loading: LIVE_STATE.loading,
    updatedAt: LIVE_STATE.updatedAt,
    abandoned: LIVE_STATE.abandoned,
    sampleRace: LIVE_STATE.racecards?.[0]?.course || 'none'
  })
})

`;

const newContent = content.slice(0, insertPoint) + debugRoute + content.slice(insertPoint);
fs.writeFileSync('./server.js', newContent);
console.log('Done');