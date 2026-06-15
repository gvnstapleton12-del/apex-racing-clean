import fs from 'fs';

const content = fs.readFileSync('./server.js', 'utf-8');
const idx = content.indexOf("app.get('*',");
console.log("catch-all at:", idx);
if (idx > 0) console.log(content.slice(idx-50, idx+100));