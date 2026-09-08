#!/usr/bin/env node
// WITNESS — storey_walkable_card: §37.1 — every storey-reveal card carries the storey's WALKABLE area and the figure is the
// raster's own. Spec: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §37.1.
// ISSUE THIS PROVES OR DISPROVES: A.storeyRevealStatsFor(storey).walk === ftRasterArea(storey_walkable_raster row) for every
// rastered storey; a storey without a raster reports null and the card omits the clause (never 0); the card text produced by
// A.storeyRevealStatCardAt inside the reveal window contains "walkable N m²". Red control: a walk value shifted.
// Command: node viewer/tests/witness_storey_walkable_card.js --db Hospital_silent_local --dur 195.79 [--port 8610]
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(__dirname, '..', '..'), PORT = +arg('port', 8610), DB = arg('db', 'Hospital_silent_local'), DUR = +arg('dur', 195.79);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { try { const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html'); if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§STOREY_REVEAL_STATS|PAGEERROR|§LOAD_FAIL/.test(t)) console.log('  ' + t.slice(0, 220)); });
  p.on('pageerror', e => console.log('  PAGEERROR ' + e.message));
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${DB}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.evaluate(async () => { try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.storeyRevealStatsFor, { timeout: 300000 });
  await p.waitForFunction(() => window.APP.db && window.APP.activeBuilding, { timeout: 600000, polling: 1000 });
  const out = await p.evaluate((dur) => {
    const A = window.APP, R = { rows: [] };
    try {
      const FM = window.FlythruMaths, SR = window.StoreyRaster;
      const wr = A.dbQuery('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster') || [];
      wr.forEach(r => { const area = FM.ftRasterArea(SR.fromRow(r)); const st = A.storeyRevealStatsFor(r[0]); R.rows.push({ storey: r[0], rasterArea: +area.toFixed(2), walk: st.walk == null ? null : +st.walk.toFixed(2) }); });
      const lv = A.dbQuery("SELECT DISTINCT name FROM spatial_structure WHERE type='IfcBuildingStorey'") || [];
      lv.forEach(v => { if (!R.rows.find(x => x.storey === v[0])) { const st = A.storeyRevealStatsFor(v[0]); R.rows.push({ storey: v[0], rasterArea: null, walk: st.walk == null ? null : +st.walk.toFixed(2) }); } });
      // the bake plans with the STORED override (flags included); the storey reveal is gated on plan.storeyReveal.on
      try { A.cinemaPathPlan(60); } catch (e) {}
      const ov0 = (A._getCinemaPathEdit && A._getCinemaPathEdit()) || null;
      const plan = A.cinemaPathPlan(dur, ov0 ? Object.assign({}, ov0, { storeyReveal: true }) : undefined); R.cards = []; R.planHasReveal = !!(plan && plan.storeyReveal && plan.storeyReveal.on);
      if (A.storeyRevealStatCardAt && plan && plan.beats) { for (let u = plan.beats.rise - 0.026; u < plan.beats.rise; u += 0.003) { const c = A.storeyRevealStatCardAt(plan, u); if (c && c.card) R.cards.push({ u: +u.toFixed(4), label: c.card.label, sub: c.card.sub || '' }); } }
    } catch (e) { R.err = e.message + ' @ ' + (e.stack || '').split('\n')[1]; }
    return R;
  }, DUR);
  await b.close(); server.close();
  if (out.err) { console.log('§WITNESS_STOREY_WALKABLE_CARD INCONCLUSIVE — ' + out.err); process.exit(1); }
  console.log('§WITNESS_STOREY_WALKABLE_CARD db=' + DB + ' planHasReveal=' + out.planHasReveal + ' cards=' + (out.cards || []).length + ' rows=' + JSON.stringify(out.rows) );
  (out.cards || []).forEach(c => console.log('§WITNESS_STOREY_WALKABLE_CARD_TEXT u=' + c.u + ' ' + c.label + ' | ' + c.sub));
  const cardsFor = {}; (out.cards || []).forEach(c => { const st = c.label.replace(/^doors · /, ''); cardsFor[st] = c.sub; });
  Witness('storey_walkable_card')
    .population(() => out.rows)
    .schema({ type: 'object', required: ['storey'], properties: { storey: { type: 'string' }, rasterArea: { type: ['number', 'null'] }, walk: { type: ['number', 'null'] } } })
    .invariant('walk equals the raster\'s own area for every rastered storey', rs => rs.filter(r => r.rasterArea != null).every(r => r.walk != null && Math.abs(r.walk - r.rasterArea) < 0.01))
    .invariant('a storey without a raster reports null, never 0', rs => rs.filter(r => r.rasterArea == null).every(r => r.walk == null))
    .invariant('every card shown in the reveal window carries "walkable N m²" for a rastered storey', () => Object.keys(cardsFor).length > 0 && Object.keys(cardsFor).every(st => { const row = out.rows.find(r => r.storey === st); return !row || row.rasterArea == null ? !/walkable/.test(cardsFor[st]) : new RegExp('walkable ' + Math.round(row.rasterArea).toLocaleString('en-US') + ' m²').test(cardsFor[st]); }))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); const q = c.find(r => r.rasterArea != null); if (q) q.walk = q.walk + 1; return c; })
    .run();
})().catch(e => { console.error('WITNESS FAILED ' + e.message); try { server.close(); } catch (e2) {} process.exit(1); });
