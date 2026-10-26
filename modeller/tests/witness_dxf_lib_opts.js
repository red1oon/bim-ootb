#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-LIB-OPTS (prompts/DXF2BIM_FOUNDATION_LANE.md §D85). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: in the page, the OCI library loader judged the set WITHOUT the page's settings (no registry in the browser module), so it never fetched the type
// the §D73 size tie binds (DUPLEX_CASEMENT), and the gate, judging WITH the settings, refused our own marked Duplex: 12 GAP:lod400_not_in_subset, though the library holds the type.
//   LO1 no local subset, the OCI library: the marked Duplex's gate qualifies, 0 GAP:lod400_not_in_subset, and the loader's families include DUPLEX_CASEMENT.
//   LO2 the loader judged what the gate judges: its last trial run's blocking count (`§DXF-LIB ... trial_blocking=`) = the gate's.
//   LO0 no page errors.
// Falsifier: the code before §D85 fails LO1 (families=7, 12 blocking). Needs the network: OCI unreachable -> MISSING input (ENV), never a PASS.
// Set: the marked Duplex written from the Duplex model db (prompts/film_dxf2bim_yellow_sets.js; db = argv[2] or ~/.cache/dxf2bim/db/DXARC.db, §D79).
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_lib_opts.js [DXARC.db]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), DB = process.argv[2] || path.join(os.homedir(), '.cache', 'dxf2bim', 'db', 'DXARC.db');
const OCI = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/dxf2bim/library/latest.json';
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
(async () => {
  if (!fs.existsSync(DB)) { console.log('MISSING input: ' + DB + ' (node modeller/tools/witness_dbs.js builds it)'); process.exit(2); }
  try { const r = await fetch(OCI); if (!r.ok) throw new Error('HTTP ' + r.status); } catch (e) { console.log('MISSING input: the OCI library (' + OCI + ': ' + e.message + ')'); process.exit(2); }
  if (fs.existsSync(path.join(ROOT, 'modeller', 'dxf2bim', 'local', 'library_subset_duplex.json'))) { console.log('MISSING input: a local library subset is present (modeller/dxf2bim/local/): this witness judges the OCI path'); process.exit(2); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'libopts-'));
  const r = cp.spawnSync('node', [path.join(ROOT, 'prompts', 'film_dxf2bim_yellow_sets.js'), DB, tmp], { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_PATH: path.join(process.env.HOME, 'bim-compiler', 'node_modules') }) });
  console.log('  sets: ' + ((r.stdout || '').match(/§FILM_SETS.*/) || ['rc=' + r.status])[0].replace(/ out=\S+/, ''));
  const dir = path.join(tmp, 'marked'), files = fs.readdirSync(dir).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(dir, f));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [], lib = [], gate = [];
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 });
    pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/^§DXF-LIB/.test(t)) { lib.push(t); console.log('  ' + t.slice(0, 300)); } if (/gate ok=/.test(t)) gate.push(t); });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.verdict && window.DxfMetaEditor && !window.DxfMetaEditor.state.busy', { timeout: 240000 }); await sleep(3000);
    const g = await pg.evaluate(() => { const g = window.DxfImportUI.state.gate, b = (g.verdict && g.verdict.blocking) || []; return { ok: g.ok, blocking: b.length, nis: b.filter(x => x.code === 'GAP:lod400_not_in_subset').length, counts: g.verdict && g.verdict.counts }; });
    const L = lib.filter(t => /source=oci/.test(t)).pop() || '', fam = (/family_ids=(\S*)/.exec(L) || [, ''])[1].split(',').filter(Boolean), tb = (/trial_blocking=(\d+)/.exec(L) || [])[1];
    ok('LO1 the marked Duplex qualifies on the OCI library; DUPLEX_CASEMENT is fetched', !!L && g.ok && g.nis === 0 && fam.indexOf('DUPLEX_CASEMENT') >= 0, 'gate ok=' + g.ok + ' blocking=' + g.blocking + ' not_in_subset=' + g.nis + ' families=' + fam.length + ' [' + fam.join(',') + '] counts=' + JSON.stringify(g.counts));
    ok('LO2 the loader judged what the gate judges (trial blocking = gate blocking)', tb !== undefined && Number(tb) === g.blocking, 'trial_blocking=' + tb + ' gate_blocking=' + g.blocking);
    ok('LO0 no page errors', errs.length === 0, 'errors=' + errs.length);
  } catch (e) { ok('LO run', false, 'threw ' + String(e && e.stack || e).slice(0, 300)); }
  await br.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log('§W-LIB-OPTS ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
})();
