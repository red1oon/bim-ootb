#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-PANEL-PILL (prompts/DXF2BIM_MODELLER_LANE.md §L32). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the X on 2D Drawings hid the panel with no way back except re-opening the files (which resets unsaved metadata), and the Metadata button was inside it.
// Driven with real clicks and key presses on the 9-sheet shed. P0 before a set: no pill, keys do nothing. P1 open: pill lit. P2 X closes both, pill dark, grid home, sheets kept. P3 pill: back, no file read, same objects.
// P4 metadata X closes only itself; the pill restores what was open. P5 a re-render does not pop it open. P6 D, Shift+D, O, ? toggle; E follows its pill's disabled state. P7 typing or a dropdown or Ctrl+D fires nothing.
// P8 Help lists the keys. P9 Guide icon = landing lightbulb. P10 the user fold survives pill off and on. P11 0 page errors. P12 the toggle is ignored during the Arrange play. VACUOUS (exit 2) when the input or a control under test is missing.
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_panel_pill.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
(async () => {
  const files = fs.existsSync(MARKED) ? fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)) : [];
  if (files.length !== 9) { console.log('§VACUOUS input: the 9 CLI-marked shed sheets (found ' + files.length + ' in ' + MARKED + ')'); process.exit(2); }
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [], pg = await (await br.createBrowserContext()).newPage(); await pg.setViewport({ width: 1440, height: 810 });
  pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
  let keyFired = 0; pg.on('console', m => { const t = m.text(); if (/^§MODELLER key/.test(t)) keyFired++; if (/^§MODELLER key|panel shown=/.test(t)) console.log('  ' + t.slice(0, 160)); });
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai', { timeout: 120000 });
  await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
  const S = () => pg.evaluate(() => { const v = id => { const e = document.getElementById(id); return !!(e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0); }, b = document.getElementById('b-2d'), G = window.A.scene.children.find(o => o.type === 'GridHelper'), U = window.DxfImportUI.state;
    return { pill: !!b && b.style.display !== 'none', lit: !!b && b.classList.contains('on'), dxf: v('dxf-panel'), dm: v('dm-panel'), grid: G ? [G.position.x, G.position.y, G.scale.x] : null, reads: window.__reads || 0, same: window.__s0 ? window.__s0 === U.sheets : null, group: !!(U.group && U.group.parent), slim: document.body.classList.contains('dxf-slim') }; });
  const key = async (k, mod) => { if (mod) await pg.keyboard.down(mod); await pg.keyboard.press(k); if (mod) await pg.keyboard.up(mod); await sleep(250); };
  // P0
  await pg.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await key('d'); await key('D', 'Shift'); const s0 = await S();
  ok('P0 before a set: the 2D pill is hidden, D and Shift+D open nothing', !s0.pill && !s0.dxf && !s0.dm, JSON.stringify(s0));
  await pg.click('#b-open').catch(async () => { await pg.evaluate(() => document.getElementById('b-open').click()); });
  await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
  await pg.evaluate(() => { const I = window.Dxf2BimImport; if (I) { const o = I.readSheets; I.readSheets = function () { window.__reads = (window.__reads || 0) + 1; return o.apply(this, arguments); }; } });
  const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
  await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfMetaEditor && !window.DxfMetaEditor.state.busy && document.getElementById("dxf-close")', { timeout: 300000 }); await sleep(1000);
  await pg.evaluate(() => { window.__s0 = window.DxfImportUI.state.sheets; window.__ms0 = window.DxfMetaEditor.state.sheets; window.__reads = 0; });
  const s1 = await S(); ok('P1 a loaded set: the pill appears lit, both panels open, the grid follows the sheets', s1.pill && s1.lit && s1.dxf && s1.dm && s1.grid[2] > 1, JSON.stringify(s1));
  // P2
  await pg.click('#dxf-close'); await sleep(300); const s2 = await S();
  ok('P2 X: both panels close, the pill goes dark, the grid goes home, the sheets stay on the canvas', s2.pill && !s2.lit && !s2.dxf && !s2.dm && s2.grid.join() === '0,0,1' && s2.group, JSON.stringify(s2));
  // P5
  await pg.evaluate(() => window.DxfImportUI.clearCatalogue()); await sleep(200); const s5 = await S();
  ok('P5 a re-render while closed does not pop the panel open', !s5.dxf && !s5.lit, JSON.stringify(s5));
  // P3
  await pg.evaluate(() => document.getElementById('b-2d').click()); await sleep(300); const s3 = await S(), ms = await pg.evaluate(() => window.__ms0 === window.DxfMetaEditor.state.sheets);
  ok('P3 the pill: both panels back, lit, grid follows, NO file read, the same sheet and metadata objects', s3.lit && s3.dxf && s3.dm && s3.grid[2] === s1.grid[2] && s3.reads === 0 && s3.same === true && ms, JSON.stringify(s3) + ' meta same=' + ms);
  // P4
  await pg.click('#dm-close'); await sleep(250); const s4a = await S(); await key('d'); const s4b = await S(); await key('d'); const s4c = await S();
  ok('P4 metadata X closes only itself; the pill off and on restores what was open (metadata stays closed)', s4a.dxf && !s4a.dm && s4a.lit && !s4b.dxf && !s4b.lit && s4c.dxf && !s4c.dm && s4c.lit, JSON.stringify([s4a.dxf, s4a.dm, s4b.dxf, s4c.dxf, s4c.dm]));
  // P6
  await key('D', 'Shift'); const a = await S(); await key('D', 'Shift'); const b = await S(); await key('d'); await key('D', 'Shift'); const c = await S();
  ok('P6a Shift+D toggles Drawing metadata; from a closed set it opens 2D Drawings too', a.dm && !b.dm && c.dxf && c.dm && c.lit, JSON.stringify([a.dm, b.dm, c.dxf, c.dm]));
  const on = id => pg.evaluate(i => document.getElementById(i).classList.contains('on'), id), oPanel = () => pg.evaluate(() => { const p = document.getElementById('m-open-panel'); return !!p && p.style.display === 'block'; });
  await key('o'); const o1 = [await oPanel(), await on('b-open')]; await key('o'); const o2 = [await oPanel(), await on('b-open')];
  ok('P6b O toggles the Open chooser and lights its pill', o1[0] && o1[1] && !o2[0] && !o2[1], JSON.stringify([o1, o2]));
  await key('?', 'Shift'); const h1 = await pg.evaluate(() => { const p = document.getElementById('m-help-panel'); return { open: p.style.display === 'block', t: p.innerText }; });
  ok('P8 ? opens Help, which lists O, E, D (only pills in the rail), Shift+D and ?', h1.open && /\bO\b/.test(h1.t) && /\bD\b/.test(h1.t) && /Shift\+D/.test(h1.t) && /\?/.test(h1.t) && /Export[\s\S]{0,12}\bE\b/.test(h1.t), h1.t.split('\n').filter(l => /^(O|E|D|\?|Shift\+D)$/.test(l.trim())).join(','));
  await key('?', 'Shift');
  const ex = await pg.evaluate(() => document.getElementById('b-export').disabled); await key('e'); const eOn = await on('b-export');
  ok('P6c E follows its pill: disabled pill = nothing, enabled = the chooser', ex ? !eOn : eOn, 'disabled=' + ex + ' lit=' + eOn); if (eOn) await key('e');
  // P7: the proof is the count of fired keys, on a control that really holds the focus (an even number of toggles would restore the end state and read as a false PASS, as this witness's first version did)
  await pg.evaluate(() => { const b = document.querySelector('#dm-panel [data-act="sec"][data-sec="edefaults"]'); if (b && !window.DxfMetaEditor.state.sec.edefaults) b.click(); }); await sleep(400);
  const FOCUS = sel => pg.evaluate(sel => { const e = Array.prototype.find.call(document.querySelectorAll('#dm-panel ' + sel), x => x.offsetParent !== null && !x.disabled); if (!e) return null; e.focus(); return document.activeElement === e ? e.tagName : 'NOFOCUS'; }, sel);
  for (const [name, sel] of [['text box', 'input[type="text"],input:not([type])'], ['dropdown', 'select']]) {
    const tag = await FOCUS(sel);
    if (!tag || tag === 'NOFOCUS') { console.log('§VACUOUS P7 ' + name + ': no visible focusable control (' + tag + ')'); fails++; judged++; continue; }
    const k0 = keyFired, snap = await pg.evaluate(() => { const e = document.activeElement; return e.value; }); await pg.keyboard.press('d'); await pg.keyboard.press('o'); await pg.keyboard.press('e'); await sleep(250);
    const held = await pg.evaluate(() => document.activeElement.tagName);
    ok('P7 d, o and e in a metadata ' + name + ' fire no key', keyFired === k0 && held === tag && !(await oPanel()), 'fired=' + (keyFired - k0) + ' focused=' + held);
    await pg.evaluate(v => { const e = document.activeElement; if (e && 'value' in e && e.tagName !== 'SELECT') e.value = v; if (e) e.blur(); }, snap);
  }
  const k7 = keyFired; await key('d', 'Control'); const s7 = await S(); ok('P7c Ctrl+D is left to the browser: no key fired', keyFired === k7 && s7.dxf === true && s7.lit === true, 'fired=' + (keyFired - k7));
  // P9
  const reg = fs.readFileSync(path.join(ROOT, 'erp', 'icons.js'), 'utf8').match(/lightbulb:\s*\{\s*svg:\s*'([^']+)'/)[1], landing = /key:'lightbulb',\s*name:'User Guide'/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')), guide = await pg.evaluate(() => document.querySelector('#b-guide svg').innerHTML), norm = t => (t.match(/ d="[^"]+"/g) || []).join();
  ok('P9 the Guide pill draws exactly the landing page User Guide glyph', landing && norm(reg).length > 0 && norm(reg) === norm(guide), 'landing uses lightbulb=' + landing + ' paths=' + (norm(guide).match(/d=/g) || []).length);
  // P10
  await pg.click('#dxf-fold'); await sleep(400); const f1 = await S(); await key('d'); await key('d'); const f2 = await S(); await pg.click('#dxf-fold'); await sleep(400); const f3 = await S();
  ok('P10 the fold arrow stays: folded survives pill off and on, and unfolds', f1.slim && f2.slim && f2.dxf && !f3.slim, JSON.stringify([f1.slim, f2.slim, f2.dxf, f3.slim]));
  // P12: while the Arrange play holds the panel the toggle is ignored (a raw run also covers it; here the play is started on the marked set)
  const pr = pg.evaluate(() => window.DxfImportUI.arrange({ stepMs: 120, holdMs: 120 }).then(() => 1)); await sleep(500); const a1 = await S();
  if (!a1.slim) { console.log('§VACUOUS P12: the play did not hold the panel slim on this set'); fails++; judged++; }
  else { await key('d'); const a2 = await S(); ok('P12 the 2D toggle is ignored while the Arrange play holds the panel', a2.dxf && a2.slim, JSON.stringify([a2.dxf, a2.slim])); }
  await pr; await sleep(800); const a3 = await S(); ok('P12b after the play the panel is back and the pill lit', a3.dxf && a3.lit && !a3.slim, JSON.stringify([a3.dxf, a3.lit, a3.slim]));
  const pl = await pg.evaluate(() => { const r = document.getElementById('b-2d').getBoundingClientRect(); return { w: r.width, x: r.x, y: r.y }; }); console.log('§PILL-GEOM ' + JSON.stringify(pl));
  ok('P11 0 page errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  console.log('§RESULT judged=' + judged + ' fails=' + fails + (judged < 12 ? ' INCONCLUSIVE' : fails ? ' FAIL' : ' PASS'));
  await br.close(); srv.close(); process.exit(fails || judged < 12 ? 1 : 0);
})().catch(e => { console.log('§ERROR ' + (e && e.stack || e)); process.exit(3); });
