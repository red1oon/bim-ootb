#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-PILL-KEYS (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.7). Scope: the key the Viewer prints for a tool (viewer/panels.js `key:`, shown as a chip in the F1 help and the drawers) against what the keyboard
// does (viewer/scene.js `_shortcuts`). READ THE LOG: exit code alone is not evidence.
// Issue it proves/disproves: "the help tells the user to press S for Sanity and S takes a screenshot" — five keyed pills had a key that was not theirs (Sanity s, Egress e, Earthworks u, Roadworks k: no handler or another tool's; Role View r: shared with Road report).
//   K1 STATIC — over EVERY keyed pill (N read from panels.js): no two pills share a plain key; each key has a handler; the handler is the pill's own tool (an A._pillRun('<id>') handler, or it shares a called tool name with the pill's fn, or the
//               pill's fn defers to _shortcuts[key]). Modifier/function keys (Alt+Z, F1 ...) have their own listeners and are listed, not judged. RED CONTROL: the same sources with Sanity back on `s`, Role View on `r` and the `e` handler
//               removed must be flagged (other-tool, clash, missing) — or K1 proves nothing.
//   K2 LIVE   — (default; --no-page to skip) real Viewer + Duplex headless on the CPU: y opens Structural Sanity, e opens Egress, d changes the Role View, u / k each call toggleEarthworksPanel / toggleRoadworksPanel; s still calls
//               A.screenshot once and r still runs the room cycle (unchanged).
//   K3 AUDIT  — the page's own §PILLKEY_AUDIT line (InputReg.checkPillKeys) says missing=0 clash=0 other-tool=0, and no page error.
// usage: NODE_PATH=~/bim-ootb/node_modules:~/bim-compiler/node_modules node viewer/tests/witness_pill_keys.js [--no-page]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const { Witness } = require(path.join(ROOT, 'witness_kit', 'contract.js'));
const log = console.log; let fails = 0; const ck = (id, ok, msg) => { log((ok ? '§PASS ' : '§FAIL ') + id + ' ' + msg); if (!ok) fails++; };
const PANELS = fs.readFileSync(path.join(ROOT, 'viewer', 'panels.js'), 'utf8'), SCENE = fs.readFileSync(path.join(ROOT, 'viewer', 'scene.js'), 'utf8');

// the same rule as InputReg.checkPillKeys, on the SOURCE text
const SKIP = /^(if|typeof|function|then|else|for|while|return|catch|switch|getElementById|querySelector|querySelectorAll|click|log|warn|forEach|indexOf)$/;
const names = (t) => { const o = new Set(); (t.match(/(?:\b(?:window|A|APP)\.)?([A-Za-z_$][\w$]*)\s*\(/g) || []).forEach((m) => { const n = m.replace(/^(?:window|A|APP)\./, '').replace(/\s*\($/, ''); if (!SKIP.test(n)) o.add(n); }); return o; };
function pills(src) { const a = src.indexOf('var _actions = ['), b = src.indexOf('\n    ];', a), blk = src.slice(a, b), st = [], r = /^ {6}\{ id: '([A-Za-z0-9_-]+)'/gm; let x; while ((x = r.exec(blk))) st.push([x.index, x[1]]);
  return st.map(([i, id], k) => { const head = (blk.slice(i, k + 1 < st.length ? st[k + 1][0] : blk.length)).split('children')[0]; return { id, key: (/key: '([^']+)'/.exec(head) || [])[1] || null, head }; }); }
function handlers(src) { const i = src.indexOf('var _shortcuts = {'), j = src.indexOf('\n  };', i), sb = src.slice(i, j), h = {}, r = /^\s*(?:'([^']+)'|"([^"]+)"):\s*([\s\S]*?)(?=^\s*(?:'[^']+'|"[^"]+"):|$(?![\s\S]))/gm; let y; while ((y = r.exec(sb))) h[y[1] || y[2]] = y[3]; return h; }
function judge(pSrc, sSrc) {
  const ps = pills(pSrc), hs = handlers(sSrc), by = {}; ps.forEach((p) => { if (p.key && p.key.length === 1) (by[p.key] = by[p.key] || []).push(p.id); });
  return ps.filter((p) => p.key).map((p) => { let st, why = '';
    if (p.key.length > 1) st = 'own-listener';
    else if (by[p.key].length > 1) { st = 'clash'; why = 'shared with ' + by[p.key].filter((i) => i !== p.id).join(','); }
    else if (!hs[p.key]) st = 'missing';
    else if (hs[p.key].indexOf("_pillRun('" + p.id + "')") >= 0) st = 'ok';
    else if (p.head.indexOf("_shortcuts['" + p.key + "']") >= 0) st = 'ok';
    else { const a = names(p.head), b = names(hs[p.key]), hit = [...a].filter((n) => b.has(n)); if (hit.length) st = 'ok'; else { st = 'other-tool'; why = 'handler calls ' + [...b].slice(0, 3).join(',') + '; pill calls ' + [...a].slice(0, 3).join(','); } }
    return { id: p.id, key: p.key, status: st, why }; });
}
const real = judge(PANELS, SCENE);
const mutP = PANELS.replace("{ id: 'sanity',     name: 'Sanity',          key: 'y'", "{ id: 'sanity',     name: 'Sanity',          key: 's'").replace("{ id: 'roleFilter', name: 'Role View',       key: 'd'", "{ id: 'roleFilter', name: 'Role View',       key: 'r'");
const mutS = SCENE.replace(/    'e':  function\(\) \{ A\._pillRun\('egress'\); \},?[^\n]*\n/, '');
const red = judge(mutP, mutS);
log('§PILLKEYS keyed=' + real.length + ' plain=' + real.filter((r) => r.status !== 'own-listener').length + ' own-listener=[' + real.filter((r) => r.status === 'own-listener').map((r) => r.id + ':' + r.key).join(' ') + ']');
real.forEach((r) => log('  ' + r.status.padEnd(12) + ' ' + r.id + ' key=' + r.key + (r.why ? ' (' + r.why + ')' : '')));
const res = Witness('PILL-KEYS')
  .population(() => real)
  .schema({ type: 'object', required: ['id', 'key', 'status'], properties: { id: { type: 'string' }, key: { type: 'string' }, status: { type: 'string' } } })
  .invariant('K1 every keyed pill: its key is its own (no clash, a handler, the pill\'s tool) — ' + real.length + ' pills', (rs) => rs.every((r) => r.status === 'ok' || r.status === 'own-listener'))
  .redControl((rs) => red.length === rs.length ? red : rs)
  .run();
if (res.fail) fails += res.fail;
const rs = new Map(red.map((r) => [r.id, r.status]));
ck('K1-red the planted regressions are named', rs.get('sanity') === 'other-tool' && rs.get('roleFilter') !== 'ok' && rs.get('egress') === 'missing', 'sanity=' + rs.get('sanity') + ' roleFilter=' + rs.get('roleFilter') + ' egress=' + rs.get('egress'));

(async () => {
  if (process.argv.includes('--no-page')) { log('§K2/K3 not judged (--no-page)'); log('§W-PILL-KEYS ' + (fails ? 'FAIL ' + fails : 'PASS (page not judged)')); process.exit(fails ? 1 : 0); }
  const puppeteer = require('puppeteer'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.sql': 'text/plain' };
  const DB = 'PillKeys_extracted.db', VDB = path.join(ROOT, 'viewer', 'buildings', DB), BLD = process.env.BUILDINGS || path.join(process.env.HOME, 'bim-ootb', 'viewer', 'buildings');
  fs.copyFileSync(fs.realpathSync(path.join(BLD, 'Duplex_extracted.db')), VDB);
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await br.newPage(); await page.setViewport({ width: 1600, height: 900 }); const con = [], err = [];
    page.on('console', (m) => { const t = m.text(); if (/§PILLKEY|§ROOM_CYCLE|§ROLE_FILTER|§KBD_ROUTE|§SHORTCUT/.test(t)) con.push(t); }); page.on('pageerror', (e) => err.push(String(e).slice(0, 160)));
    await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/' + DB + '&lang=en_MY', { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.APP && window.APP.db && window._TRL_READY && window._mainPillActions && window._shortcuts && window.InputReg && window.APP.showStructuralSanity', { timeout: 240000 });
    await page.waitForFunction(() => true); for (let i = 0; i < 60 && !con.some((l) => /^§PILLKEY_AUDIT/.test(l)); i++) await sleep(1000);
    const blur = () => page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    const press = async (k) => { await blur(); await page.keyboard.press(k); await sleep(1200); };
    // K3 — the page's own audit line
    const audit = con.filter((l) => /^§PILLKEY_AUDIT/.test(l)).pop() || '';
    ck('K3 the page\'s §PILLKEY_AUDIT: missing=0 clash=0 other-tool=0', /missing=0 clash=0 other-tool=0/.test(audit), audit.slice(0, 200));
    // K2 — y, e: the checklist panel opens and names the rule set
    const panel = () => page.evaluate(() => { const p = document.getElementById('rule-checklist-panel'); return p && getComputedStyle(p).display !== 'none' ? p.innerText.replace(/\s+/g, ' ').slice(0, 60) : null; });
    await press('y'); await page.waitForFunction(() => { const p = document.getElementById('rule-checklist-panel'); return !!p && getComputedStyle(p).display !== 'none' && /Sanity/.test(p.innerText); }, { timeout: 60000 }).catch(() => {});
    const py = await panel(); ck('K2 key y opens Structural Sanity', !!py && /Sanity/.test(py), 'panel=' + JSON.stringify(py));
    await press('e'); await page.waitForFunction(() => { const p = document.getElementById('rule-checklist-panel'); return !!p && getComputedStyle(p).display !== 'none' && /Egress/.test(p.innerText); }, { timeout: 60000 }).catch(() => {});
    const pe = await panel(); ck('K2 key e opens Egress', !!pe && /Egress/.test(pe), 'panel=' + JSON.stringify(pe));
    // d: the Role View index moves
    const r0 = await page.evaluate(() => window.APP._roleFilterIdx); await press('d'); const r1 = await page.evaluate(() => window.APP._roleFilterIdx);
    ck('K2 key d cycles the Role View', r0 !== r1 && con.some((l) => /§ROLE_FILTER/.test(l)), 'idx ' + r0 + ' -> ' + r1);
    // u, k, s: count calls on the real objects the handlers call at press time
    await page.evaluate(() => { const A = window.APP; window.__calls = { ew: 0, rw: 0, shot: 0 }; A.toggleEarthworksPanel = function () { window.__calls.ew++; }; A.toggleRoadworksPanel = function () { window.__calls.rw++; }; A.screenshot = function () { window.__calls.shot++; }; });
    await press('u'); await press('k'); await press('s'); const c = await page.evaluate(() => window.__calls);
    ck('K2 key u calls toggleEarthworksPanel, k calls toggleRoadworksPanel', c.ew === 1 && c.rw === 1, JSON.stringify(c));
    ck('K2 key s still calls A.screenshot exactly once (unchanged)', c.shot === 1, 'screenshot calls=' + c.shot);
    const n0 = con.filter((l) => /§ROOM_CYCLE/.test(l)).length; await press('r'); ck('K2 key r still runs the room cycle (unchanged, non-civil model)', con.filter((l) => /§ROOM_CYCLE/.test(l)).length > n0, '§ROOM_CYCLE lines ' + n0 + ' -> ' + con.filter((l) => /§ROOM_CYCLE/.test(l)).length);
    ck('K3 no page error', err.length === 0, 'pageErrors=' + err.length + (err.length ? ' ' + err[0] : ''));
  } finally { await br.close(); srv.close(); try { fs.unlinkSync(VDB); } catch (e) { /* ignore */ } }
  log('§W-PILL-KEYS ' + (fails ? 'FAIL ' + fails : 'PASS')); process.exit(fails ? 1 : 0);
})().catch((e) => { log('§W-PILL-KEYS ERROR ' + (e && e.stack || e)); process.exit(1); });
