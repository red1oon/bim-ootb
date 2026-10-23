#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WIN-TAG-WIDTH (rule D56, prompts/DXF2BIM_FOUNDATION_LANE.md §D56). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: every window was tagged by hand (JKR 48, Clinic 58), although on most sets one window row has one width; and a raw set could not type a window row at all.
 *   V1 MATCH     — with the set's window rows (the model's, typed once), each window cluster whose DRAWN width equals ONE row's width is proposed that row's mark; judged against the model's tag
 *                  where the model's row width = the drawn width (else the drawing does not show the model's window: counted, not judged). 0 wrong. No window row on the set -> INCONCLUSIVE.
 *   V2 LEFT      — a window whose drawn width matches no row is left (listed with its width), never proposed.
 *   V3 FALSIFIER — a second row with the width of the most used row (another mark): every window of that width is refused, naming both rows; none proposed.
 *   V4 READ BACK — the marked set with the model's window tags on the matched windows replaced by the rule's (at the cluster centre, as the editor writes them): no blocking code rises except
 *                  GAP:lod400_library_unreachable (a window that now reaches the fill step; no library in Node), and the blocking total does not rise. Code for code where nothing changed.
 *   V5 THE PAGE  — (BROWSER=1, the first db) the Modeller opened on the marked set with its window @TAG markings removed: one window PR-TAG-WIDTH row per proposed mark; one click per row tags
 *                  its windows; the page's window tags = the Node rule's proposals; 0 page errors (software GL, headless).
 * The window box / centre mirror dxf_meta_editor.js inWin / writeWinTag (= Dxf2Types hits: the cluster bbox).
 * Usage: NODE_PATH=<dir with better-sqlite3> node modeller/tests/witness_dxf_win_tag_width.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js')), SG = require(path.join(M, 'dxf2suggest.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2); if (!dbs.length) { say('MISSING input: a Node model .db (e.g. /tmp/db2/HHSM2.db)'); process.exit(2); }
const inWin = (w, x, y, tol) => { const b = w.bbox; return x >= b[0] - tol && x <= b[2] + tol && y >= b[1] - tol && y <= b[3] + tol; };
const centre = w => [(w.bbox[0] + w.bbox[2]) / 2, (w.bbox[1] + w.bbox[3]) / 2];
const dropTags = text => { const L = text.split('\n'), out = []; for (let i = 0; i < L.length; i += 2) { if (L[i] === '0' && L[i + 1] === 'TEXT') { let j = i + 2, t = null; while (j < L.length && L[j] !== '0') { if (L[j] === '1') t = L[j + 1]; j += 2; }
  if (t && /^@TAG=window,/.test(t)) { i = j - 2; continue; } } out.push(L[i], L[i + 1]); } return out.filter(x => x !== undefined).join('\n'); };
const cdiff = (a, b) => { const A = JSON.parse(codes(a)), Bm = JSON.parse(codes(b)), m = {}; A.forEach(([k, n]) => { m[k] = [n, 0]; }); Bm.forEach(([k, n]) => { m[k] = [(m[k] || [0])[0], n]; }); return JSON.stringify(Object.keys(m).filter(k => m[k][0] !== m[k][1]).map(k => k + ' ' + m[k][0] + '->' + m[k][1])); };
const codes = v => { const m = {}; (v ? v.blocking.concat(v.advisory) : []).forEach(b => { m[b.code] = (m[b.code] || 0) + 1; }); return JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]])); };
let nRows = 0;
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all(), P = new DxfParser();
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' });
  const files = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })), sheets = I.readSheets(files);
  const rowsAll = {}, perPlan = [];
  sheets.filter(sh => sh.role === 'plan').forEach(sh => {
    const D2 = I.planDoors(sh, 'STD'), ms = MK.readMarks(P.parseSync(sh.text).entities).map(m => ({ raw: m.raw.replace(/\s+@BY=\S+$/, ''), x: m.x, y: m.y }));
    ms.filter(m => /^@SCHEDULE=/.test(m.raw)).forEach(m => { const p = m.raw.slice(10).split(','); if (p[1] === 'window') rowsAll[p[0]] = { mark: p[0], w: p[2] }; });
    const tags = ms.filter(m => /^@TAG=window,/.test(m.raw)).map(m => ({ mark: m.raw.slice(12), x: m.x * D2.factor, y: m.y * D2.factor }));
    const keyOf = {}; D2.windows.forEach(w => { const t = tags.filter(t => inWin(w, t.x, t.y, D2.snap_tol)); if (t.length === 1) keyOf[w.handle] = t[0].mark; });
    perPlan.push({ sh, D: D2, keyOf });
  });
  const rows = Object.values(rowsAll); nRows += rows.length;
  if (!rows.length) { say('INCONCLUSIVE V1-V4[' + name + '] | no window schedule row on the set: nothing judged | plan_windows=' + perPlan.reduce((n, x) => n + x.D.windows.length, 0)); return; }
  const run = rs => perPlan.map(pp => ({ pp, r: SG.tagByWidth(pp.D.windows.map(w => ({ handle: w.handle, width: w.width, tagged: false })), rs, { factor: pp.D.factor, tol: pp.D.snap_tol }) }));
  const A = run(rows); let prop = 0, wrong = [], left = 0, leftTagged = 0, keyed = 0, noKey = 0, notShown = [];
  A.forEach(({ pp, r }) => { keyed += Object.keys(pp.keyOf).length; r.groups.forEach(g => g.doors.forEach(h => { prop++; const k = pp.keyOf[h]; if (k === undefined) { noKey++; return; }
      const w = pp.D.windows.find(z => z.handle === h), kw = Number(rowsAll[k].w) * pp.D.factor;
      if (Math.abs(w.width - kw) > pp.D.snap_tol) { notShown.push(pp.sh.name.replace(/_std\.dxf$/, '') + ':' + h + ' drawn ' + (w.width / pp.D.factor).toFixed(1) + ' model ' + rowsAll[k].w); return; }
      if (k !== g.mark) wrong.push(pp.sh.name + ':' + h + ' ' + g.mark + '!=' + k); }));
    left += r.left.length; r.left.forEach(l => { if (r.groups.some(g => g.doors.indexOf(l.handle) >= 0)) leftTagged++; }); });
  const leftW = {}; A.forEach(({ r }) => r.left.forEach(l => { leftW[l.width] = (leftW[l.width] || 0) + 1; }));
  const judged = prop - noKey - notShown.length;
  check('V1[' + name + ']', 'each window drawn as wide as ONE row is proposed that row, = the model\'s tag wherever the drawing shows the model\'s width', judged > 0 && !wrong.length,
    `rows=${rows.length} plan_windows=${A.reduce((n, x) => n + x.pp.D.windows.length, 0)} model_tagged=${keyed} proposed=${prop} judged=${judged} wrong=${wrong.length} no_model_tag=${noKey} not_shown(model width != drawn)=${notShown.length} refused(rows share a width)=${A.reduce((n, x) => n + x.r.refused.length, 0)} groups=${JSON.stringify(A.flatMap(x => x.r.groups.map(g => g.mark.slice(-24) + ':' + g.doors.length)))} ${notShown.slice(0, 2).join(' ')} ${wrong.slice(0, 3).join(' ')}`);
  check('V2[' + name + ']', 'a window matching no row by drawn width is left, with its width, never proposed', leftTagged === 0, `left=${left} widths=${JSON.stringify(leftW)}`);
  const top = rows.map(r => ({ r, n: A.reduce((n, x) => n + x.r.groups.filter(g => g.mark === r.mark).reduce((k, g) => k + g.doors.length, 0), 0) })).sort((a, b) => b.n - a.n)[0];
  if (!top.n) say('INCONCLUSIVE V3[' + name + '] | no row proposed any window: the twin row has nothing to refuse');
  else { const F = run(rows.concat([{ mark: 'TWIN-OF-' + top.r.mark, w: top.r.w }])), fr = F.reduce((n, x) => n + x.r.refused.filter(z => z.marks.indexOf('TWIN-OF-' + top.r.mark) >= 0).length, 0), fp = F.reduce((n, x) => n + x.r.groups.filter(g => Number(g.w) === Number(top.r.w)).reduce((k, g) => k + g.doors.length, 0), 0);
    check('V3[' + name + ']', 'a second row of the same width refuses every window of that width, none proposed', fr === top.n && fp === 0, `width=${top.r.w} windows_of_it=${top.n} refused=${fr} proposed=${fp}`); }
  const txt = {}; files.forEach(f => { txt[f.name] = f.text; });
  A.forEach(({ pp, r }) => { const keep = MK.readMarks(P.parseSync(pp.sh.text).entities).filter(m => /^@TAG=window,/.test(m.raw)).filter(m => !r.groups.some(g => g.doors.some(h => { const w = pp.D.windows.find(z => z.handle === h); return inWin(w, m.x * pp.D.factor, m.y * pp.D.factor, pp.D.snap_tol); })));
    const add = []; r.groups.forEach(g => g.doors.forEach(h => { const w = pp.D.windows.find(z => z.handle === h), c = centre(w); add.push({ text: '@TAG=window,' + g.mark + ' @BY=user', x: Number((c[0] / pp.D.factor).toFixed(3)), y: Number((c[1] / pp.D.factor).toFixed(3)) }); }));
    txt[pp.sh.name] = MK.writeMarks(dropTags(pp.sh.text), keep.map(m => ({ text: m.raw, x: m.x, y: m.y })).concat(add)); });
  const v0 = I.convert(sheets, {}).verdict, v1 = I.convert(I.readSheets(Object.keys(txt).map(n => ({ name: n, text: txt[n] }))), {}).verdict;
  const C0 = new Map(JSON.parse(codes(v0))), C1 = new Map(JSON.parse(codes(v1))), rose = [...C1.keys()].filter(k => k !== 'GAP:lod400_library_unreachable' && C1.get(k) > (C0.get(k) || 0));
  check('V4[' + name + ']', 'the rule\'s window tags raise no blocking code (but the library-bound one) and no blocking total over the model\'s tags', !!v0 && !!v1 && !rose.length && v1.blocking.length <= v0.blocking.length, `rose=${JSON.stringify(rose)} blocking ${v0 && v0.blocking.length} -> ${v1 && v1.blocking.length} same=${codes(v0) === codes(v1)}${codes(v0) === codes(v1) ? '' : ' differ=' + cdiff(v0, v1)}`);
  (global.__proposed = global.__proposed || {})[name] = prop;
});
(async () => {
  if (!process.env.BROWSER) { say('INFO V5 | the page check runs with BROWSER=1'); return; }
  const fs = require('fs'), os = require('os'), http = require('http'), puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(M, '..');
  const con = new Database(dbs[0], { readonly: true }), q = s2 => con.prepare(s2).all(), R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wtagw-')), files = Object.keys(Dm.files).map(n => { fs.writeFileSync(path.join(dir, n), dropTags(Dm.files[n])); return path.join(dir, n); });
  const want = (global.__proposed || {})[path.basename(dbs[0], '.db')] || 0;
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((rq, rs) => { const p = decodeURIComponent(rq.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { rs.writeHead(404); rs.end(); return; } rs.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); rs.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(), errs = [], tlog = []; await pg.setViewport({ width: 1440, height: 810 });
  pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); say('§PAGEERR ' + String(e).slice(0, 200)); }); pg.on('console', m => { const t = m.text(); if (/tag by width \(windows\)/.test(t)) { tlog.push(t); say('  ' + t.slice(0, 200)); } });
  try {
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    const idle = () => pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 300000 });
    await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; }); await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files); await idle();
    const isW = 'p => p.rule === "PR-TAG-WIDTH" && p.cls === "window"';
    const rows = await pg.evaluate(new Function('return window.DxfMetaEditor.state.dprops.filter(' + isW + ').map(p => p.mark.slice(-20) + ":" + p.wins.length)'));
    let clicks = 0; for (; clicks < 40; clicks++) { const c = await pg.evaluate(new Function('const i = window.DxfMetaEditor.state.dprops.findIndex(' + isW + '); if (i < 0) return 0; const b = document.querySelector(\'#dm-panel [data-act="dconfirm"][data-i="\' + i + \'"]\'); if (!b) return -1; b.click(); return 1;'));
      if (c <= 0) { if (c < 0) say('INFO V5 | no confirm button for the row'); break; } await idle(); }
    const got = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.reduce((n, sh) => n + sh.marks.filter(m => m.key === 'TAG' && /^window,/.test(m.value)).length, 0));
    check('V5[page ' + path.basename(dbs[0], '.db') + ']', 'one window PR-TAG-WIDTH row per proposed mark; one click per row; the page\'s window tags = the Node rule\'s proposals', rows.length > 0 && clicks === rows.length && got === want && !errs.length,
      `rows=${JSON.stringify(rows)} clicks=${clicks} tags=${got} node_proposed=${want} logs=${tlog.length} page_errors=${errs.length}`);
  } finally { await br.close(); srv.close(); }
})().then(() => { say('SUMMARY fail=' + fail + (nRows ? '' : ' (INCONCLUSIVE: no window rows on any set)')); process.exit(fail ? 1 : 0); }).catch(e => { say('FATAL ' + e.message); process.exit(1); });
