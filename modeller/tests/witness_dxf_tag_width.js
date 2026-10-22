#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-TAG-WIDTH (rule D47, prompts/DXF2BIM_FOUNDATION_LANE.md §D47). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: every door was tagged by hand, 4 actions each (HHS 116 plan doors, Duplex 14), although the door type is a function of the drawn leaf width on both sets.
 *   W1 MATCH     — with the set's schedule rows (the model's, typed once), each door whose drawn width equals ONE row's width is proposed that row's mark, and the mark equals the model's own tag.
 *   W2 LEFT      — a door whose width matches no row is left (listed with its width), never proposed.
 *   W3 FALSIFIER — a second row with the width of the most common row (another mark): every door of that width is refused, naming both rows; none proposed.
 *   W4 READ BACK — the marked set with the model's tags on the matched doors replaced by the rule's (at the door centre, as the editor writes them) reads to the same verdict, code for code.
 *   W5 THE PAGE  — (BROWSER=1, the first db) the Modeller opened on the marked set with its @TAG markings removed: the door suggestions hold one PR-TAG-WIDTH row per schedule mark; one click
 *                  per row tags its doors (one render), and every door ends with the model's mark (software GL, headless).
 * The door box / centre below mirror dxf_meta_editor.js inDoor / doorCentre (the editor's own placement of a tag).
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_dxf_tag_width.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js')), SG = require(path.join(M, 'dxf2suggest.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2); if (!dbs.length) { say('MISSING input: a Node model .db (e.g. /tmp/db2/HHSM2.db)'); process.exit(2); }
const swing = d => [d.hinge].concat([d.swing_start_deg, d.swing_end_deg].map(a => [d.hinge[0] + d.width * Math.cos(a * Math.PI / 180), d.hinge[1] + d.width * Math.sin(a * Math.PI / 180)]));
const inDoor = (d, x, y, tol) => { const p = swing(d), sx = p.map(q => q[0]), sy = p.map(q => q[1]);
  if (x >= Math.min(...sx) - tol && x <= Math.max(...sx) + tol && y >= Math.min(...sy) - tol && y <= Math.max(...sy) + tol) return true;
  const b = d.opening_box; if (!b) return false; const u = b.axis === 'x' ? x : y, v = b.axis === 'x' ? y : x, L = b.along || b.s; return u >= L[0] - tol && u <= L[1] + tol && v >= b.band[0] - tol && v <= b.band[1] + tol; };
const centre = d => { const b = d.opening_box; if (b) { const L = b.along || b.s, a = (L[0] + L[1]) / 2, c = (b.band[0] + b.band[1]) / 2; return b.axis === 'x' ? [a, c] : [c, a]; }
  const p = swing(d), sx = p.map(q => q[0]), sy = p.map(q => q[1]); return [(Math.min(...sx) + Math.max(...sx)) / 2, (Math.min(...sy) + Math.max(...sy)) / 2]; };
const dropTags = text => { const L = text.split('\n'), out = []; for (let i = 0; i < L.length; i += 2) { if (L[i] === '0' && L[i + 1] === 'TEXT') { let j = i + 2, t = null; while (j < L.length && L[j] !== '0') { if (L[j] === '1') t = L[j + 1]; j += 2; }
  if (t && /^@TAG=door,/.test(t)) { i = j - 2; continue; } } out.push(L[i], L[i + 1]); } return out.filter(x => x !== undefined).join('\n'); };
const codes = v => { const m = {}; (v ? v.blocking.concat(v.advisory) : []).forEach(b => { m[b.code] = (m[b.code] || 0) + 1; }); return JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]])); };
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all(), P = new DxfParser();
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' });
  const files = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })), sheets = I.readSheets(files);
  const rowsAll = {}, perPlan = [];
  sheets.filter(sh => sh.role === 'plan').forEach(sh => {
    const D2 = I.planDoors(sh, 'STD'), ms = MK.readMarks(P.parseSync(sh.text).entities).map(m => ({ raw: m.raw.replace(/\s+@BY=\S+$/, ''), x: m.x, y: m.y }));
    ms.filter(m => /^@SCHEDULE=/.test(m.raw)).forEach(m => { const p = m.raw.slice(10).split(','); if (p[1] === 'door') rowsAll[p[0]] = { mark: p[0], w: p[2] }; });
    const tags = ms.filter(m => /^@TAG=door,/.test(m.raw)).map(m => ({ mark: m.raw.slice(10), x: m.x * D2.factor, y: m.y * D2.factor }));
    const keyOf = {}; D2.doors.forEach(d => { const t = tags.filter(t => inDoor(d, t.x, t.y, D2.snap_tol)); if (t.length === 1) keyOf[d.handle] = t[0].mark; });
    perPlan.push({ sh, D: D2, keyOf });
  });
  const rows = Object.values(rowsAll), run = rs => perPlan.map(pp => ({ pp, r: SG.tagByWidth(pp.D.doors.map(d => ({ handle: d.handle, width: d.width, tagged: false })), rs, { factor: pp.D.factor, tol: pp.D.snap_tol }) }));
  const A = run(rows); let prop = 0, wrong = [], left = 0, leftTagged = 0, keyed = 0, unjudged = 0;
  A.forEach(({ pp, r }) => { keyed += Object.keys(pp.keyOf).length; r.groups.forEach(g => g.doors.forEach(h => { prop++; if (pp.keyOf[h] === undefined) { unjudged++; return; } if (pp.keyOf[h] !== g.mark) wrong.push(pp.sh.name + ':' + h + ' ' + g.mark + '!=' + pp.keyOf[h]); }));
    left += r.left.length; r.left.forEach(l => { if (r.groups.some(g => g.doors.indexOf(l.handle) >= 0)) leftTagged++; }); });
  const leftW = {}; A.forEach(({ r }) => r.left.forEach(l => { leftW[l.width] = (leftW[l.width] || 0) + 1; }));
  check('W1[' + name + ']', 'each door matching one row by width is proposed that row, = the model\'s own tag where the model tags it', prop > unjudged && !wrong.length, `rows=${rows.length} plan_doors=${A.reduce((n, x) => n + x.pp.D.doors.length, 0)} model_tagged=${keyed} proposed=${prop} judged=${prop - unjudged} unjudged(no model tag)=${unjudged} wrong=${wrong.length} refused(rows share a width)=${A.reduce((n, x) => n + x.r.refused.length, 0)} groups=${JSON.stringify(A.flatMap(x => x.r.groups.map(g => g.mark + ':' + g.doors.length)))} ${wrong.slice(0, 3).join(' ')}`);
  check('W2[' + name + ']', 'a door matching no row by width is left, with its width, never proposed', leftTagged === 0, `left=${left} widths=${JSON.stringify(leftW)}`);
  const top = rows.map(r => ({ r, n: A.reduce((n, x) => n + x.r.groups.filter(g => g.mark === r.mark).reduce((k, g) => k + g.doors.length, 0), 0) })).sort((a, b) => b.n - a.n)[0];
  const F = run(rows.concat([{ mark: 'TWIN-OF-' + top.r.mark, w: top.r.w }])), fr = F.reduce((n, x) => n + x.r.refused.filter(z => z.marks.indexOf('TWIN-OF-' + top.r.mark) >= 0).length, 0), fp = F.reduce((n, x) => n + x.r.groups.filter(g => Number(g.w) === Number(top.r.w)).reduce((k, g) => k + g.doors.length, 0), 0);
  check('W3[' + name + ']', 'a second row of the same width refuses every door of that width, none proposed', fr === top.n && fp === 0, `width=${top.r.w} doors_of_it=${top.n} refused=${fr} proposed=${fp}`);
  // W4: the model's tags on the matched doors replaced by the rule's, at the door centre
  const txt = {}; files.forEach(f => { txt[f.name] = f.text; });
  A.forEach(({ pp, r }) => { const keep = MK.readMarks(P.parseSync(pp.sh.text).entities).filter(m => /^@TAG=door,/.test(m.raw)).filter(m => !r.groups.some(g => g.doors.some(h => { const d = pp.D.doors.find(z => z.handle === h); return inDoor(d, m.x * pp.D.factor, m.y * pp.D.factor, pp.D.snap_tol); })));
    const add = []; r.groups.forEach(g => g.doors.forEach(h => { const d = pp.D.doors.find(z => z.handle === h), c = centre(d); add.push({ text: '@TAG=door,' + g.mark + ' @BY=user', x: Number((c[0] / pp.D.factor).toFixed(3)), y: Number((c[1] / pp.D.factor).toFixed(3)) }); }));
    txt[pp.sh.name] = MK.writeMarks(dropTags(pp.sh.text), keep.map(m => ({ text: m.raw, x: m.x, y: m.y })).concat(add)); });
  const v0 = I.convert(sheets, {}).verdict, v1 = I.convert(I.readSheets(Object.keys(txt).map(n => ({ name: n, text: txt[n] }))), {}).verdict;
  check('W4[' + name + ']', 'the set with the rule\'s tags reads to the same verdict as with the model\'s, code for code', codes(v0) === codes(v1), `blocking ${v0 && v0.blocking.length} -> ${v1 && v1.blocking.length} same=${codes(v0) === codes(v1)}`);
});
(async () => {
  if (!process.env.BROWSER) { say('INFO W5 | the page check runs with BROWSER=1'); return; }
  const fs = require('fs'), os = require('os'), http = require('http'), puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(M, '..');
  const con = new Database(dbs[0], { readonly: true }), q = s2 => con.prepare(s2).all(), R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagw-')), files = Object.keys(Dm.files).map(n => { fs.writeFileSync(path.join(dir, n), dropTags(Dm.files[n])); return path.join(dir, n); });
  const P = new DxfParser(), want = {}; Object.keys(Dm.files).forEach(n => { want[n] = MK.readMarks(P.parseSync(Dm.files[n]).entities).filter(m => /^@TAG=door,/.test(m.raw)).length; });
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((rq, rs) => { const p = decodeURIComponent(rq.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { rs.writeHead(404); rs.end(); return; } rs.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); rs.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(), errs = [], tlog = []; await pg.setViewport({ width: 1440, height: 810 });
  pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); say('§PAGEERR ' + String(e).slice(0, 200)); }); pg.on('console', m => { const t = m.text(); if (/tag by width/.test(t)) { tlog.push(t); say('  ' + t.slice(0, 200)); } });
  try {
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    const idle = () => pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 240000 });
    await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; }); await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files); await idle();
    const rows = await pg.evaluate(() => window.DxfMetaEditor.state.dprops.filter(p => p.rule === 'PR-TAG-WIDTH').map(p => p.mark + ':' + p.doors.length));
    let clicks = 0; for (; clicks < 40; clicks++) { const c = await pg.evaluate(() => { const i = window.DxfMetaEditor.state.dprops.findIndex(p => p.rule === 'PR-TAG-WIDTH'); if (i < 0) return 0;
      const b = document.querySelector('#dm-panel [data-act="dconfirm"][data-i="' + i + '"]'); if (!b) return -1; b.click(); return 1; }); if (c <= 0) { if (c < 0) say('INFO W5 | no confirm button for the row'); break; } await idle(); }
    const got = await pg.evaluate(() => { const o = {}; window.DxfMetaEditor.state.sheets.forEach(sh => { o[sh.name] = sh.marks.filter(m => m.key === 'TAG' && /^door,/.test(m.value)).length; }); return o; });
    const nw = Object.values(want).reduce((a, b) => a + b, 0), ng = Object.values(got).reduce((a, b) => a + b, 0);
    check('W5[page ' + path.basename(dbs[0], '.db') + ']', 'one PR-TAG-WIDTH row per schedule mark; one click per row tags its doors; every plan ends with the model\'s tag count', rows.length > 0 && clicks === rows.length && ng === nw && !errs.length,
      `rows=${JSON.stringify(rows)} clicks=${clicks} tags=${ng} model=${nw} logs=${tlog.length} page_errors=${errs.length}`);
  } finally { await br.close(); srv.close(); }
})().then(() => { say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0); }).catch(e => { say('FATAL ' + e.message); process.exit(1); });
