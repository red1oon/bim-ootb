#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-CATALOGUE-ROW (rule D71, prompts/DXF2BIM_FOUNDATION_LANE.md §D71). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: Convert reads state.catalogue (the §D53 firm catalogue) and nothing in the page set it: a firm's materials could only be used from Node.
 *   C1 CHECK     — catalogueCheck takes the tool's catalogue (name + counts stated) and refuses, with a reason, a non-object / another version / a table not keyed by mm / a row with no count.
 *   C2 CONVERT   — Convert with the checked catalogue: walls of a thickness with a row carry '<name>: n of m walls of t mm'; without it the reference; geometry identical.
 *   C3 PAGE      — (with --page <modeller url>, software GL) the 2D panel on a standard set shows the row (none), Load sets it (§DXF-CATALOGUE loaded), the row names it, a malformed file is refused
 *                  (state unchanged), Clear returns to none. INCONCLUSIVE without --page. (Convert's use of state.catalogue is C2: the page passes it to the same I.convert.)
 *   C4 STRUCTURE — (with --structure <dir of the marked shed>) no row on a structure set; it gates as before.
 * Usage: NODE_PATH=<dir with better-sqlite3, web-ifc> node modeller/tests/witness_dxf_catalogue_row.js <Node model .db> <its architecture .ifc> [--page <url> [--sheets <dir>] [--structure <dir of the marked shed>]]
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js')), CAT = require(path.join(M, 'tools/catalogue_from_ifc.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; }, pos = args.filter((a, i) => a[0] !== '-' && (i === 0 || args[i - 1][0] !== '-'));
const [db, ifc] = pos; if (!db || !ifc) { say('MISSING input: <model .db> <its architecture .ifc>'); process.exit(2); }
(async () => {
  const own = await CAT.learn([ifc], { name: 'own-firm' }), cat = JSON.parse(JSON.stringify(own.cat));
  const c = I.catalogueCheck(cat);
  const bads = [['a list', []], ['version 2', Object.assign({}, cat, { version: 2 })], ['walls a list', Object.assign({}, cat, { walls: [] })], ['key not mm', Object.assign({}, cat, { walls: { 'abc': [{ n: 1, material: 'x' }] } })],
    ['row without n', Object.assign({}, cat, { walls: { '100': [{ material: 'x' }] } })], ['empty', { version: 1 }]].map(([k, j]) => [k, I.catalogueCheck(j)]);
  check('C1', 'the tool\'s catalogue is taken (name + counts), every malformed one refused with a reason', c.ok && c.name === 'own-firm' && c.counts.walls === Object.keys(cat.walls).length && bads.every(([, r]) => !r.ok && r.reason),
    `ok=${c.ok} name=${c.name} counts=${JSON.stringify(c.counts)} rows=${c.rows} refused=${bads.map(([k, r]) => k + ':' + (r.ok ? 'TAKEN' : JSON.stringify(r.reason).slice(0, 50))).join(' | ')}`);
  const con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' }), sheets = I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })));
  const a = I.convert(sheets, {}), b = I.convert(sheets, { catalogue: cat }), walls = o => o.els.filter(e => e.class === 'IfcWall');
  const byCat = walls(b).filter(e => e.ifc && /^own-firm: \d+ of \d+ walls of \d+ mm$/.test(e.ifc.material_source || '')).length, byRefA = walls(a).filter(e => e.ifc && /^reference/.test(e.ifc.material_source || '')).length;
  const geo = o => JSON.stringify(o.els.map(e => [e.guid, e.class, e.vertices]));
  check('C2', 'Convert with the checked catalogue: walls take it by thickness (source stated); without it the reference; geometry identical', byCat > 0 && byRefA === walls(a).length && geo(a) === geo(b),
    `walls=${walls(b).length} from_catalogue=${byCat} reference_without=${byRefA} geometry_same=${geo(a) === geo(b)}`);
  if (!opt('--page')) { say('INCONCLUSIVE C3 no --page (the page row needs a browser run)'); say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0); }
  const puppeteer = require(path.join(process.env.HOME, 'bim-compiler/node_modules/puppeteer'));
  const br = await puppeteer.launch({ headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] }), pg = await br.newPage(), logs = [];
  pg.on('console', m => logs.push(m.text()));
  try {
    await pg.goto(opt('--page'), { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction(() => window.DxfImportUI && window.DxfImportUI.openFiles, { timeout: 120000 });
    const dir = opt('--sheets'), files = dir ? fs.readdirSync(dir).filter(f => /\.dxf$/i.test(f)).map(f => ({ name: f, text: fs.readFileSync(path.join(dir, f), 'utf8') })) : Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }));
    await pg.evaluate(async fs => { await window.DxfImportUI.openFiles(fs); }, files);
    const row0 = await pg.evaluate(() => { const r = document.getElementById('dxf-cat-name'); return r ? r.textContent : null; });
    const bad = await pg.evaluate(() => window.DxfImportUI.loadCatalogue('{"version":2}'));
    const row1 = await pg.evaluate(() => document.getElementById('dxf-cat-name').textContent);
    const good = await pg.evaluate(t => window.DxfImportUI.loadCatalogue(t), JSON.stringify(cat));
    const row2 = await pg.evaluate(() => document.getElementById('dxf-cat-name').textContent);
    await pg.evaluate(() => window.DxfImportUI.clearCatalogue());
    const row3 = await pg.evaluate(() => document.getElementById('dxf-cat-name').textContent);
    check('C3', 'the row: none -> a malformed file refused (unchanged) -> the tool\'s catalogue loaded and named -> Clear back to none; logged', row0 && /none/.test(row0) && !bad.ok && /none/.test(row1) && good.ok && /own-firm/.test(row2) && /none/.test(row3) &&
      logs.some(l => /§DXF-CATALOGUE refused reason=/.test(l)) && logs.some(l => /§DXF-CATALOGUE loaded name=own-firm/.test(l)), `rows: "${row0}" | "${row1}" | "${row2}" | "${row3}"`);
    const shed = opt('--structure');   // C4: a structure set (the marked shed) shows no catalogue row
    if (shed) { const sf = fs.readdirSync(shed).filter(f => /\.dxf$/i.test(f)).map(f => ({ name: f, text: fs.readFileSync(path.join(shed, f), 'utf8') }));
      const r4 = await pg.evaluate(async fs => { await window.DxfImportUI.openFiles(fs); return { row: !!document.getElementById('dxf-cat-row'), status: (document.getElementById('dxf-status') || {}).textContent || '' }; }, sf);
      check('C4', 'a structure set (the shed) shows no catalogue row and gates as before', !r4.row && /Structure set/.test(r4.status), `row=${r4.row} status="${r4.status.slice(0, 90)}"`); }
    else say('INCONCLUSIVE C4 no --structure <dir>');
  } finally { await br.close(); }
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { say('FAIL harness ' + (e && e.stack)); process.exit(1); });
