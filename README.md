# Primordia

Neural organisms evolving live in the browser. Every creature is steered by its own
recurrent neural network (34 senses → 14 neurons → 6 actions, 566 weights) plus 12 body
genes. There is no fitness function: creatures that find energy reproduce, with mutation.
Grazing, hunting, fleeing and speciation all emerge.

- `src/sim.js` — simulation core (no DOM; also runs in Node)
- `src/app.js` — canvas renderer, camera director, live brain view, narrator
- `src/seeds.js` — 28 genomes evolved headless for 220,000 ticks
- `tools/evolve.js` — headless evolution: `node tools/evolve.js 220000 11 --bake`
- `tools/build.js` — `node tools/build.js` → `dist/index.html` (standalone, zero dependencies)

Deploy: upload `dist/index.html` to any static host (GitHub Pages, Vercel).
