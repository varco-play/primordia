// node tools/build.js → dist/primordia.html (artifact body) + dist/index.html (standalone, deployable anywhere)
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
let page = src('page.html');
for (const [k, f] of [['/*SIM*/', 'sim.js'], ['/*SEEDS*/', 'seeds.js'], ['/*APP*/', 'app.js']]) page = page.split(k).join(src(f));
const dist = path.join(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'primordia.html'), page);
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="description" content="Primordia: neural organisms evolving live in your browser. No scripts, no fitness function.">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + page + '\n</body>\n</html>\n');
console.log('built', (page.length / 1024).toFixed(1) + ' KB');
