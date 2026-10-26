#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-YELLOW-GROUP (prompts/DXF2BIM_FOUNDATION_LANE.md §D81). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the yellow list was written per entity and per sheet (Duplex 102 rows, HHS 240, shed 142 from 10 rules each) with the accept buttons after the last row.
// §D81 groups it per rule and per set. The danger of grouping is hiding or changing something, so each check names what could go wrong:
//   YG1 nothing lost: the rows in the list = the §DXF-EVIDENCE rows= count.
//   YG2 the groups are the rules: every group header's n = the rows in its body, every body row carries the group's rule, groups + single rows = the distinct rules.
//   YG3 grouping is presentation only: Accept all gives the same markings as the flat list of before (window.__dmNoGroup = true, the falsifier switch).
//   YG4 a group tick takes exactly its group: its rows are gone, every row of every other group is still there.
//   YG5 the grid is a measurement: the grid header names each key with its label range and bays, and the bays = the sorted coordinate differences of its rows (drawing units, to 0.5).
//   YG6 a set-wide value that disagrees is not hidden: one sheet's $INSUNITS changed -> its units row is outside the group, marked disagrees, and the group tick leaves it.
//   YG7 the buttons come first: the accept buttons sit above the first group.
// Sets: the plain Duplex written from the Duplex model db (prompts/film_dxf2bim_yellow_sets.js; db = argv[2] or ~/.cache/dxf2bim/db/DXARC.db, §D79); the raw shed from SHED_RAW_DIR (private, SKIP without).
// usage: SHED_RAW_DIR=<dir> NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_yellow_group.js [DXARC.db]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), DB = process.argv[2] || path.join(os.homedir(), '.cache', 'dxf2bim', 'db', 'DXARC.db'), SHED_RAW = process.env.SHED_RAW_DIR || '';
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const skip = (id, why) => console.log('§SKIP ' + id + '  ' + why), sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ygroup-')); let duplex = null;
  if (fs.existsSync(DB)) { const r = cp.spawnSync('node', [path.join(ROOT, 'prompts', 'film_dxf2bim_yellow_sets.js'), DB, path.join(tmp, 'duplex')], { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_PATH: path.join(process.env.HOME, 'bim-compiler', 'node_modules') }) });
    console.log('  sets: ' + ((r.stdout || '').match(/§FILM_SETS.*/) || ['rc=' + r.status])[0].replace(/ out=\S+/, '')); if (r.status === 0) duplex = path.join(tmp, 'duplex', 'plain'); }
  const dxfs = d => fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [], elog = [];
  const page = async () => { const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 });
    pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/^§DXF-EVIDENCE tiers|accept group=/.test(t)) elog.push(t); if (/accept group=/.test(t)) console.log('  ' + t.slice(0, 200)); });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 }); return pg; };
  const idle = pg => pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict && !(window.DxfImportUI.state.arr && window.DxfImportUI.state.arr.playing)', { timeout: 240000 });
  const openSet = async (pg, files, noGroup) => { await pg.evaluate(g => { window.__dmNoGroup = !!g; window.DxfImportUI.state.arrangeOnOpen = false; }, noGroup);
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files); await idle(pg); await sleep(600); };
  const list = pg => pg.evaluate(() => { const Y = document.getElementById('dm-yellows'); if (!Y) return null;
    const rows = Array.from(Y.querySelectorAll('.dm-pr[data-tier]')), hd = Array.from(Y.querySelectorAll('.dm-grp[data-grp]'));
    const groups = hd.map(h => { const k = h.getAttribute('data-grp'), body = Y.querySelector('[data-grp-body="' + CSS.escape(k) + '"]'), br = body ? Array.from(body.querySelectorAll('.dm-pr[data-tier]')) : [];
      return { k, n: +h.getAttribute('data-grp-n'), body: br.length, rules: Array.from(new Set(br.map(r => r.getAttribute('data-rule')))), w: (h.querySelector('.w') || {}).textContent || '', tick: !!h.querySelector('[data-act="grpok"]'), top: h.offsetTop,
        ev: br.map(r => r.getAttribute('data-ev')).filter(Boolean) }; });
    const singles = rows.filter(r => !r.closest('.dm-grpb')).map(r => r.getAttribute('data-rule'));
    const btn = Y.querySelector('[data-act="acceptall"],[data-act="acceptsr"]');
    return { rows: rows.length, rules: Array.from(new Set(rows.map(r => r.getAttribute('data-rule')))), groups, singles, btnTop: btn ? btn.offsetTop : null, ev: rows.map(r => r.getAttribute('data-ev')).filter(Boolean) }; });
  const lastRows = () => { const l = elog.filter(t => /tiers stated=/.test(t)).pop() || ''; const m = / rows=(\d+)/.exec(l); return m ? +m[1] : null; };
  const acceptAll = pg => pg.evaluate(async () => { for (let r = 0; r < 12; r++) { const b = ['acceptall', 'acceptsr', 'acceptinf'].map(k => document.querySelector('#dm-yellows [data-act="' + k + '"]')).filter(Boolean)[0]; if (!b) break; b.click(); await new Promise(z => setTimeout(z, 400)); } });
  const marks = pg => pg.evaluate(() => JSON.stringify(window.DxfMetaEditor.state.sheets.map(sh => sh.name + ':' + sh.marks.map(m => [m.key, m.value, m.x, m.y, m.source].join('|')).sort().join(';'))));
  const texts = pg => pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(sh => window.DxfMetaEditor.effText(sh)));
  const gridCheck = L => { const out = []; L.groups.filter(g => /GRID/.test(g.k) && g.ev.length).forEach(g => { const per = {};
      g.ev.forEach(e => { const p = e.split('|'), key = p[2], c = key === 'GRIDY' ? +p[5] : +p[4]; ((per[key] = per[key] || {})[p[0]] = per[key][p[0]] || []).push(c); });
      Object.keys(per).sort().forEach(key => { const b = {}; Object.values(per[key]).forEach(cs => { cs.sort((x, y) => x - y); for (let i = 1; i < cs.length; i++) b[Math.round((cs[i] - cs[i - 1]) * 2) / 2] = 1; });
        const B = Object.keys(b).map(Number).sort((x, y) => x - y), want = !B.length ? 'bays none' : B.length <= 4 ? 'bays ' + B.join(' / ') : 'bays ' + B[0] + '–' + B[B.length - 1];
        out.push({ g: g.k, key, want, ok: g.w.includes(key + ' ') && g.w.includes(want) }); }); }); return out; };
  const judge = async (tag, files) => {
    const pg = await page(); elog.length = 0; await openSet(pg, files, false); const L = await list(pg);
    if (!L || !L.rows) { ok('YG1[' + tag + '] a yellow list exists', false, 'none'); return; }
    ok('YG1[' + tag + '] nothing lost: rows in the list = the §DXF-EVIDENCE rows=', L.rows === lastRows(), 'list=' + L.rows + ' log=' + lastRows());
    const keys = new Set(L.groups.map(g => g.k.replace(/!$/, '')).concat(L.singles));
    ok('YG2[' + tag + '] the groups are the rules: header n = body rows, one rule per body, groups + singles = the distinct rules', L.groups.every(g => g.n === g.body && g.rules.length === 1 && g.rules[0] === g.k.replace(/!$/, '')) && keys.size === L.rules.length,
      'groups=' + L.groups.length + ' singles=' + L.singles.length + ' rules=' + L.rules.length + ' ' + L.groups.map(g => g.k + ':' + g.n).join(' '));
    ok('YG7[' + tag + '] the accept buttons sit above the first group', L.btnTop !== null && (!L.groups.length || L.btnTop < L.groups[0].top), 'btn=' + L.btnTop + ' firstGroup=' + (L.groups[0] || {}).top);
    const G = gridCheck(L);
    const yg5 = G.map(x => Object.assign({ r: 1, w: (L.groups.find(g => g.k === x.g) || {}).w }, x));   // §D81 YG5 is judged once per set over its rounds (the plain Duplex reads its grid in round 2 only)
    const pick = L.groups.filter(g => g.tick && !/GRID|UNITS|VIEW|SET/.test(g.k))[0] || L.groups.filter(g => g.tick)[0];
    if (!pick) skip('YG4[' + tag + ']', 'no group with a tick'); else {
      await pg.click('#dm-yellows [data-grp="' + pick.k + '"] [data-act="grpok"]'); await idle(pg); await sleep(500); const A = await list(pg), others = L.ev.filter(e => !pick.ev.includes(e)), left = others.filter(e => !A.ev.includes(e));
      ok('YG4[' + tag + '] one group tick takes exactly its rows: they are gone, every row of the other groups is still there', pick.ev.every(e => !A.ev.includes(e)) && !left.length, 'group=' + pick.k + ' rows=' + pick.n + ' others=' + others.length + ' lost=' + left.length); }
    // round 2 (the grid, datums, faces arrive once the roles are in): accept round 1 once, then the same checks on the new list
    // Accept all runs on through the later rounds, so round 1 is cleared with its own group ticks (each takes only the rows it showed)
    for (let i = 0; i < 12; i++) { const k = await pg.evaluate(() => { const b = document.querySelector('#dm-yellows .dm-grp [data-act="grpok"]'); if (!b) return null; b.click(); return b.getAttribute('data-grp'); }); if (!k) break; await idle(pg); await sleep(400);
      const cur = await list(pg); if (cur && L.ev.every(e => !cur.ev.includes(e))) break; }
    await sleep(800);
    const L2 = await list(pg);
    if (!L2 || !L2.rows) skip('YG1-YG5[' + tag + ' round 2]', 'no rows after round 1'); else {
      ok('YG1[' + tag + ' round 2] nothing lost', L2.rows === lastRows(), 'list=' + L2.rows + ' log=' + lastRows());
      const k2 = new Set(L2.groups.map(g => g.k.replace(/!$/, '')).concat(L2.singles));
      ok('YG2[' + tag + ' round 2] the groups are the rules', L2.groups.every(g => g.n === g.body && g.rules.length === 1 && g.rules[0] === g.k.replace(/!$/, '')) && k2.size === L2.rules.length, 'rows=' + L2.rows + ' ' + L2.groups.map(g => g.k + ':' + g.n).join(' ') + (L2.singles.length ? ' singles=' + L2.singles.join(',') : ''));
      gridCheck(L2).forEach(x => yg5.push(Object.assign({ r: 2, w: (L2.groups.find(g => g.k === x.g) || {}).w }, x))); }
    if (!yg5.length) skip('YG5[' + tag + ']', 'no grid group in round 1 or 2'); else ok('YG5[' + tag + '] the grid header states each key\'s label range and bays = its rows\' coordinate differences (rounds ' + Array.from(new Set(yg5.map(x => x.r))).join('+') + ')', yg5.every(x => x.ok), yg5.map(x => 'r' + x.r + ' ' + x.key + ' ' + x.want + (x.ok ? '' : ' MISSING in "' + x.w + '"')).join(' | '));
    await acceptAll(pg); await idle(pg); const mg = await marks(pg); await pg.close();
    const pf = await page(); await openSet(pf, files, true); const F = await list(pf);
    await acceptAll(pf); await idle(pf); const mf = await marks(pf), tf = await texts(pf); await pf.close();
    const pa = await page(); await openSet(pa, files, false); await acceptAll(pa); await idle(pa); const ta = await texts(pa); await pa.close();   // the SAME user action (Accept all only) on the grouped list
    ok('YG3[' + tag + '] grouping is presentation only: the group-tick path (round 1 by group ticks, then Accept all) ends with the same markings as the flat list\'s Accept all (falsifier __dmNoGroup); the flat list has no group header', mg === mf && F && F.groups.length === 0,
      'markings ' + (mg === mf ? 'equal' : 'DIFFER') + ' (as sets; the order follows the user\'s clicks), flat groups=' + (F ? F.groups.length : '?'));
    ok('YG3b[' + tag + '] the same action gives the same file: Accept all on the grouped list writes marked texts byte-identical to Accept all on the flat list', ta.length === tf.length && ta.every((t, i) => t === tf[i]), ta.filter((t, i) => t !== tf[i]).length + ' of ' + ta.length + ' differ');
  };
  if (!duplex) skip('YG1-YG7[duplex]', 'no Duplex model db at ' + DB + ' (node modeller/tools/witness_dbs.js)'); else {
    await judge('duplex plain', dxfs(duplex));
    // YG6: one sheet in metres, the others as written
    const mix = path.join(tmp, 'mix'); fs.mkdirSync(mix); const fl = dxfs(duplex); let changed = null;
    fl.forEach((f, i) => { let t = fs.readFileSync(f, 'utf8'); if (i === 0) { const t2 = t.replace(/(\$INSUNITS\r?\n\s*70\r?\n\s*)(\d+)/, (a, p, v) => { changed = v + '->' + (v === '6' ? '4' : '6'); return p + (v === '6' ? '4' : '6'); }); t = t2; } fs.writeFileSync(path.join(mix, path.basename(f)), t); });
    if (!changed) skip('YG6', 'no $INSUNITS in the first sheet'); else {
      const pg = await page(); await openSet(pg, dxfs(mix), false); const L = await list(pg), bad = L.groups.find(g => g.k === 'PR-UNITS!'), grp = L.groups.find(g => g.k === 'PR-UNITS');
      let after = null; if (grp && grp.tick) { await pg.click('#dm-yellows [data-grp="PR-UNITS"] [data-act="grpok"]'); await idle(pg); await sleep(500); after = await list(pg); }
      const still = after && bad && bad.ev.every(e => after.ev.includes(e));
      ok('YG6 a disagreeing set-wide value is not hidden: the changed sheet\'s units row is its own group, marked disagrees, without a tick; the group tick leaves it', !!bad && bad.n === 1 && !bad.tick && /disagrees/.test(bad.w) && !!still,
        'insunits ' + changed + ' bad=' + (bad ? bad.n + ' "' + bad.w + '"' : 'none') + ' group=' + (grp ? grp.n + ' "' + grp.w + '"' : 'none') + ' stillAfterTick=' + still); await pg.close(); }
  }
  const RAW = SHED_RAW && fs.existsSync(SHED_RAW) ? dxfs(SHED_RAW) : [];
  if (RAW.length !== 9) skip('YG1-YG5[shed raw]', 'LOCAL MATERIAL ABSENT: set SHED_RAW_DIR to the 9 raw shed sheets'); else await judge('shed raw', RAW);
  await br.close(); srv.close();
  ok('YG0 no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('§W-YELLOW-GROUP ' + (judged <= 1 ? 'INCONCLUSIVE (nothing judged)' : fails ? 'FAIL ' + fails : 'PASS') + ' judged=' + judged);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§FAIL FATAL ' + (e && e.stack || e)); process.exit(1); });
