#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — crawl_node_copy.js. SCOPE: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.59. Read the §CRAWL_COPY line and the screenplay after every run.
// ISSUE IT EXPOSES: "would this checkout's schedule break the crawler's simple truths?" — asked of the NODE COPY (cache_4d_run.js played layer), in seconds, with no
//   browser. It is the fast loop only: the node copy is not the product (§Q.56), so the verdict that counts is product_judge.js on the real viewer.
// TRUE BOXES + declared parents come from a product_judge run of the same building (<tag>/<bld>.items.json); the times are this checkout's.
// usage: BLD_DIR=… node scripts/crawl_node_copy.js <tag-with-items> <Building ...>
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), CR = require('./lib/schedule_crawler.js');
const [tag, ...blds] = process.argv.slice(2), DIR = path.join(os.homedir(), '.cache', 'bim4d', 'product', tag);
for (const b of blds) {
  const f = path.join(DIR, b + '.items.json'); if (!fs.existsSync(f)) { console.log('§CRAWL_COPY ' + b + ' INCONCLUSIVE — no ' + f); continue; }
  const { items, parent } = JSON.parse(fs.readFileSync(f, 'utf8'));
  const r = cp.spawnSync('node', [path.join(__dirname, 'cache_4d_run.js'), b], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const CACHE = require('./cache_4d_run.js'), run = CACHE.read(b), L = run ? CACHE.layerOf(run, 'played') : null;
  if (!L) { console.log('§CRAWL_COPY ' + b + ' INCONCLUSIVE — no played layer (' + ((r.stdout || '') + (r.stderr || '')).slice(-300) + ')'); continue; }
  const els = {}; run.els.forEach(e => { els[e.guid] = e; });
  let miss = 0; const it = []; items.forEach(e => { const m = L.map[e.guid], n = els[e.guid]; if (!m || !n) { miss++; return; } it.push(Object.assign({}, e, { s: m.s, e: m.e, cls: n.cls, seq: n.seq, phase: n.phase, storey: n.storey })); });
  const c = CR.crawl(it, parent), t0 = it.reduce((m, e) => Math.min(m, e.s), Infinity), t1 = it.reduce((m, e) => Math.max(m, e.e), -Infinity);
  console.log('§CRAWL_COPY ' + b + ' judged=' + it.length + ' notInCopy=' + miss + ' days=' + ((t1 - t0) / 86400000).toFixed(1) + ' | ' + Object.keys(c.counts).map(k => k + '=' + (c.counts[k] === null ? 'INCONCLUSIVE' : c.counts[k]) + '/' + c.judged[k]).join(' ') + (it.length ? '' : ' — VACUOUS'));
  fs.writeFileSync(path.join(DIR, b + '.copy.screenplay.txt'), c.lines.join('\n') + '\n');
}
