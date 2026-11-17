// Headless evolution: node tools/evolve.js [ticks] [seed] [--bake]
const fs = require('fs'), path = require('path');
const P = require('../src/sim.js');
const TICKS = +process.argv[2] || 100000, SEED = +process.argv[3] || 7, BAKE = process.argv.includes('--bake');
const sim = new P.Sim({ seed: SEED });
sim.init(null, 130);
const t0 = Date.now(); let last = { ...sim.stats };
for (let i = 1; i <= TICKS; i++) {
  sim.step();
  if (i % 10000 === 0) {
    const h = sim.history[sim.history.length - 1], s = sim.stats;
    const hh=sim.history.slice(-250); const cavg=(hh.reduce((a,x)=>a+x.carn,0)/hh.length).toFixed(1), cmax=Math.max(...hh.map(x=>x.carn));
    const top = sim.living.slice().sort((a, b) => b.count - a.count).slice(0, 4).map(x => `${x.name}(${x.count},d${x.proto[2].toFixed(2)})`).join(' ');
    console.log(`t=${i} pop=${h.n} sp=${sim.living.length} diet=${h.diet.toFixed(2)} carn=${h.carn}(avg${cavg},max${cmax}) rw=${s.rewires||0} size=${h.size.toFixed(2)} spd=${h.speed.toFixed(2)} rng=${h.range.toFixed(2)} plants=${h.plants} gen=${s.maxGen} b+${s.births - last.births} kills+${s.kills - last.kills} starv+${s.starved - last.starved} aged+${s.aged - last.aged} imm+${s.immigrants - last.immigrants} | ${top}`);
    last = { ...s };
  }
}
console.log(`ms/tick=${((Date.now() - t0) / TICKS).toFixed(3)} events=${sim.events.length} speciesEver=${sim.nsp}`);
console.log(sim.events.slice(-8).map(e => e.type + ':' + e.name).join(', '));
if (BAKE) {
  const gs = sim.topGenomes(28).map(P.encodeGenome);
  fs.writeFileSync(path.join(__dirname, '../src/seeds.js'), '/* evolved headless: ' + TICKS + ' ticks, seed ' + SEED + ' */\nPRIM_SEEDS=' + JSON.stringify(gs) + ';\n');
  console.log('baked', gs.length, 'genomes');
}
