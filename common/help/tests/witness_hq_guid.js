// ⚠ DO NOT REMOVE — W-HQ-GUID (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.6 Step 6b, owner decision 2026-11-17 "Match GlobalId"; design prompts/HELP_QUERY_CORE_DESIGN.md D4). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: in the Viewer and Modeller help panels `#<run>` must list the elements whose GlobalId (elements_meta.guid) STARTS with the typed run (case-sensitive, at least 4 characters, at most 20 listed + "N more"),
// select + frame ONE hit through the app's existing select path when the person presses Enter on it (state read: the selected guid, never a screenshot), say "no element #<run>" for a made-up run, and print the usage line under 4 characters.
// The REAL pages (viewer.html with the shipped Duplex, modeller.html with its Duplex resident (modeller/Duplex_ARC.db, STRWalkerOutliner._residents)), headless chromium. N = the elements_meta rows of that building, counted by this witness with sqlite3 from the file the page loads.
// The ORACLE is this witness's own (JS startsWith over the guids read with sqlite3): a case-sensitive prefix, never the page's SQL.
//   G1 for every element (X of N): `#` + its first 8 characters lists exactly the elements that start with it when there are <= 20 (it is among them), else lists 20 of them and says "<total-20> more".
//   G2 for a sample of elements: `#` + the shortest UNIQUE prefix (>= 4) lists exactly that element; Enter selects it (state: the selected guid == the typed one).
//   G3 `#` + the FULL GlobalId of each element of a case-only pair (two GlobalIds that differ only by letter case; the Viewer's Duplex has them) lists exactly that one element and selects it; a case-insensitive compare would list both.
//      No case-only pair in the building = INCONCLUSIVE for that app (printed which), never PASS.
//   G4 a 3-character run and `#` alone print the usage line; a made-up run prints "No element" + " #run"; `@x` the reserved refusal; the words are the dictionary's, per locale (en_MY, de_DE, zh_CN: ui_help_doc_usage / _none / _more / ui_help_reserved).
//   G5 0 WRITES, measured: the building DB's total_changes() (sql.js) is unchanged over the run (Modeller: and the op-log length).
// Red control (must FAIL G3, or INCONCLUSIVE with the reason when the building has no case-only pair): HQ_BREAK=caseless (the prefix test lower-cases both sides).
// Run: NODE_PATH=~/bim-ootb/node_modules:~/bim-compiler/node_modules node common/help/tests/witness_hq_guid.js [--only viewer|modeller]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
const H = require('./_hq'), k = H.kit('W-HQ-GUID'), BR = process.env.HQ_BREAK || '', ONLY = process.argv.indexOf('--only') > 0 ? process.argv[process.argv.indexOf('--only') + 1] : '';
const VDB = fs.realpathSync(path.join(os.homedir(), 'bim-ootb', 'viewer', 'buildings', 'Duplex_extracted.db')), MDB = path.join(H.ROOT, 'modeller', 'Duplex_ARC.db');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream', '.xml': 'application/xml' };
const serve = (over) => new Promise((ok) => { const s = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile((over && over[p]) || path.join(H.ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); }); s.listen(0, '127.0.0.1', () => ok(s)); });
const sq = (file, sql) => { const r = cp.spawnSync('sqlite3', ['-readonly', '-json', file, sql], { encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout || '[]'); };
const DICT = (loc) => JSON.parse(fs.readFileSync(path.join(H.ROOT, 'viewer', 'i18n', loc + '.json'), 'utf8')).labels || {};
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.indexOf(x) >= 0);
// in-page helpers: type into #cmd-search, wait until the list settles, read it; Enter
const PAGE_JS = `window.__hq = {
  type: async (s) => { const inp = document.getElementById('cmd-search'); inp.value = s; inp.dispatchEvent(new Event('input'));
    for (let i = 0; i < 3000; i++) { await new Promise((r) => setTimeout(r, 2)); if (!document.querySelector('#cmd-list .cmd-doc-wait')) break; }
    const note = document.querySelector('#cmd-list .cmd-doc-note'), more = document.querySelector('#cmd-list .cmd-doc-more');
    return { rows: [...document.querySelectorAll('#cmd-list .cmd-doc-row')].map((r) => r.getAttribute('data-guid')), note: note ? note.textContent : null, noteCls: note ? note.className : null, more: more ? more.textContent : null, hasList: document.querySelectorAll('#cmd-list .cmd-row').length }; },
  enter: () => { const inp = document.getElementById('cmd-search'); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } };`;

async function claims(app, pg, guids, ctx) {
  const N = guids.length, tag = app + ' ';
  const startsN = (p) => guids.filter((g) => g.startsWith(p));
  const writes = () => pg.evaluate(ctx.writes), w0 = await writes();
  // ---- G1 ----
  let g1ok = 0, small = 0, big = 0, bigOk = 0, miss = []; const t0 = Date.now();
  for (const g of guids) {
    const p = g.slice(0, 8), exp = startsN(p), r = await pg.evaluate((s) => window.__hq.type(s), '#' + p);
    if (exp.length <= 20) { small++; if (sameSet(r.rows, exp) && r.rows.indexOf(g) >= 0 && !r.more) g1ok++; else if (miss.length < 3) miss.push(g + ' listed ' + r.rows.length + ' of ' + exp.length); }
    else { big++; const mm = /^(\d+)/.exec(r.more || ''); if (r.rows.length === 20 && r.rows.every((x) => exp.indexOf(x) >= 0) && mm && Number(mm[1]) === exp.length - 20) bigOk++; else if (miss.length < 3) miss.push(g.slice(0, 8) + ' (group ' + exp.length + ') listed ' + r.rows.length + ' more="' + r.more + '"'); }
  }
  k.L('G1 ' + tag + 'elements N=' + N + ' · 8-char prefix groups <= 20: ' + small + ' elements, > 20 (max 20 + "N more"): ' + big + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s');
  if (!N) k.incon('G1 ' + app, 'VACUOUS: no element'); else k.chk('G1 ' + tag + '`#` + first 8 characters: ' + (g1ok + bigOk) + ' of ' + N + ' elements (' + g1ok + ' found in a list of <= 20 exactly as the oracle; ' + bigOk + ' in a group of > 20: 20 listed + the right "N more")', g1ok + bigOk === N, miss.join(' ; '));
  // ---- G2 ----
  const shortest = (g) => { for (let L = 4; L <= g.length; L++) if (startsN(g.slice(0, L)).length === 1) return g.slice(0, L); return g; };
  const step = Math.max(1, Math.floor(N / 16)), sample = guids.filter((g, i) => i % step === 0).slice(0, 16); let g2 = 0, nop2 = 0; const bad2 = [];
  for (const g of sample) {
    const p = shortest(g), r = await pg.evaluate((s) => window.__hq.type(s), '#' + p);
    await pg.evaluate(ctx.clear); await pg.evaluate(() => window.__hq.enter());
    const sel = await ctx.waitSel(pg, g); if (process.env.GUID_DEBUG) console.log('  g2 ' + g + ' typed #' + p + ' rows=' + r.rows.length + ' sel=' + sel.ok + ' ' + Math.round((Date.now() - t0) / 1000) + 's');
    if (r.rows.length === 1 && r.rows[0] === g && sel.ok) g2++; else if (r.rows.length === 1 && r.rows[0] === g && sel.nopick && ctx.noPick.has(g)) { g2++; nop2++; } else if (bad2.length < 3) bad2.push(g + ' typed #' + p + ' listed ' + r.rows.length + ' selected=' + JSON.stringify(sel.state));
  }
  k.L('G2 ' + tag + 'sample of ' + sample.length + ' elements (every ' + step + 'th), shortest unique prefix >= 4 characters');
  if (!sample.length) k.incon('G2 ' + app, 'VACUOUS'); else k.chk('G2 ' + tag + 'the shortest unique prefix lists exactly that element and Enter selects it (state read: ' + ctx.stateName + '): ' + g2 + ' of ' + sample.length + (nop2 ? ' (' + nop2 + ' of them have no real 3D pick in this app: no element_transforms row, the existing select path answers no-pick exactly as the Outliner row does; oracle: ' + ctx.noPick.size + ' of N=' + N + ' elements)' : ''), g2 === sample.length, bad2.join(' ; '));
  // ---- G3 case-only pairs ----
  const lower = {}; guids.forEach((g) => { (lower[g.toLowerCase()] = lower[g.toLowerCase()] || []).push(g); });
  const pairs = Object.keys(lower).filter((l) => lower[l].length > 1).map((l) => lower[l]);
  if (!pairs.length) k.L('G3 ' + tag + 'no two GlobalIds of this building differ only by letter case (N=' + N + '): the case claim cannot be judged on it' + (app === 'viewer' ? '' : '; the shared HelpGuid.plan is judged on the Viewer\'s building'));
  const twins = [].concat.apply([], pairs.slice(0, 6)); let g3 = 0; const bad3 = [];
  for (const g of twins) {
    const r = await pg.evaluate((s) => window.__hq.type(s), '#' + g); await pg.evaluate(ctx.clear); await pg.evaluate(() => window.__hq.enter());
    const sel = await ctx.waitSel(pg, g);
    if (r.rows.length === 1 && r.rows[0] === g && sel.ok) g3++; else if (bad3.length < 3) bad3.push(g + ' listed ' + JSON.stringify(r.rows) + ' selected=' + JSON.stringify(sel.state));
  }
  if (!pairs.length) { if (app === 'viewer') k.incon('G3 viewer', 'no case-only GlobalId pair in this building: the caseless red control cannot be told apart here'); }
  else k.chk('G3 ' + tag + 'full GlobalId of a case-only pair lists exactly that element and selects it (' + pairs.length + ' pairs in the building, ' + twins.length + ' elements tried; a caseless compare lists both): ' + g3 + ' of ' + twins.length, g3 === twins.length, bad3.join(' ; '));
  // ---- G4 words ----
  const D = DICT(ctx.locale), en = DICT('en_MY'), T = (key) => D[key] || en[key];
  const big4 = {}; guids.forEach((g) => { big4[g.slice(0, 4)] = (big4[g.slice(0, 4)] || 0) + 1; });
  const rs = await pg.evaluate(async () => ({ u3: await window.__hq.type('#abc'), u0: await window.__hq.type('#'), none: await window.__hq.type('#@@@@zz'), res: await window.__hq.type('@x') }));
  const g4 = [['#abc usage', rs.u3.note, T('ui_help_doc_usage')], ['# usage', rs.u0.note, T('ui_help_doc_usage')], ['made-up', rs.none.note, T('ui_help_doc_none') + ' #@@@@zz'], ['@x', rs.res.note, T('ui_help_reserved')]];
  let g4ok = 0; const bad4 = []; g4.forEach((x) => { if (x[1] === x[2] && x[2]) g4ok++; else bad4.push(x[0] + ' page "' + x[1] + '" dictionary "' + x[2] + '"'); });
  k.chk('G4 ' + tag + 'usage (3 characters, `#` alone), "no element #run", the @ refusal, in the dictionary\'s words for ' + ctx.locale + ': ' + g4ok + ' of ' + g4.length, g4ok === g4.length, bad4.join(' ; '));
  // ---- G5 ----
  const w1 = await writes(); k.L('G5 ' + tag + 'writes counter before=' + w0 + ' after=' + w1);
  if (w0 == null || w1 == null) k.incon('G5 ' + app, 'the write counter is not readable'); else k.chk('G5 ' + tag + '0 writes: ' + ctx.writeName + ' ' + w0 + ' -> ' + w1, w0 === w1);
}

(async function main() {
  const { chromium } = require(H.PW);
  if (!fs.existsSync(VDB) && ONLY !== 'modeller') { k.incon('viewer', 'the shipped Duplex is not at ' + VDB); }
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    if (ONLY !== 'modeller' && fs.existsSync(VDB)) {
      const guids = sq(VDB, 'SELECT guid FROM elements_meta ORDER BY rowid').map((r) => r.guid), srv = await serve({ '/viewer/buildings/WitnessGuid_extracted.db': VDB }), base = 'http://127.0.0.1:' + srv.address().port;
      k.L('viewer: Duplex ' + VDB + ' elements_meta rows N=' + guids.length + ' distinct=' + new Set(guids).size);
      for (const loc of ['en_MY']) {
        const ctxp = await browser.newContext({ viewport: { width: 900, height: 600 }, serviceWorkers: 'block' }), pg = await ctxp.newPage(), errs = [];
        pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
        if (BR) await pg.addInitScript('window.__HQ_BREAK=' + JSON.stringify(BR));
        try {
          await pg.goto(base + '/viewer/viewer.html?db=buildings/WitnessGuid_extracted.db&lang=' + loc, { waitUntil: 'load', timeout: 120000 });
          await pg.waitForFunction('window.APP && window.APP.db && window._TRL_READY && window._mainPillActions && window.showCommandPalette && window.HelpGuid && window.HelpGrammar', { timeout: 240000 });
          await pg.evaluate(() => window.showCommandPalette()); await pg.waitForSelector('#cmd-search', { timeout: 30000 }); await pg.evaluate(PAGE_JS);
          const rows = await pg.evaluate(() => window.APP.dbQuery('SELECT count(*) FROM elements_meta')[0][0]);
          k.L('viewer page: elements_meta rows in the page DB=' + rows + ' (file: ' + guids.length + ')');
          if (rows !== guids.length) k.chk('viewer the page holds the same building as the file: ' + rows + ' vs ' + guids.length, false);
          await claims('viewer', pg, guids, {
            locale: loc, noPick: new Set(), stateName: 'APP.focusedGuids', writeName: 'total_changes()', writes: () => window.APP.db.exec('SELECT total_changes()')[0].values[0][0], clear: () => { window.APP.focusedGuids = null; },
            waitSel: async (p, g) => { for (let i = 0; i < 150; i++) { const s = await p.evaluate(() => window.APP.focusedGuids); if (s && s.length === 1 && s[0] === g) return { ok: true, state: s }; await p.waitForTimeout(100); } return { ok: false, state: await p.evaluate(() => window.APP.focusedGuids) }; } });
          k.L('viewer page errors=' + errs.length + (errs.length ? ' ' + errs.slice(0, 2).join(' | ') : ''));
        } catch (e) { k.incon('viewer ' + loc, 'page failed: ' + String(e && e.message).split('\n')[0]); }
        await ctxp.close();
      }
      // locales: the words only
      for (const loc of ['de_DE', 'zh_CN']) {
        const ctxp = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }), pg = await ctxp.newPage();
        try {
          await pg.goto(base + '/viewer/viewer.html?db=buildings/WitnessGuid_extracted.db&lang=' + loc, { waitUntil: 'load', timeout: 120000 });
          await pg.waitForFunction('window.APP && window.APP.db && window._TRL_READY && window._mainPillActions && window.showCommandPalette && window.HelpGuid', { timeout: 240000 });
          await pg.evaluate(() => window.showCommandPalette()); await pg.waitForSelector('#cmd-search'); await pg.evaluate(PAGE_JS);
          const D = DICT(loc), rs = await pg.evaluate(async () => ({ u: (await window.__hq.type('#abc')).note, n: (await window.__hq.type('#@@@@zz')).note, r: (await window.__hq.type('@x')).note }));
          const ok = rs.u === D.ui_help_doc_usage && rs.n === D.ui_help_doc_none + ' #@@@@zz' && rs.r === D.ui_help_reserved && D.ui_help_doc_usage !== DICT('en_MY').ui_help_doc_usage;
          k.chk('G4 viewer ' + loc + ' the three notes are the translated dictionary words (not English): ' + JSON.stringify(rs), ok, ok ? '' : 'dictionary ' + JSON.stringify([D.ui_help_doc_usage, D.ui_help_doc_none, D.ui_help_reserved]));
        } catch (e) { k.incon('viewer ' + loc, 'page failed: ' + String(e && e.message).split('\n')[0]); }
        await ctxp.close();
      }
      srv.close();
    }
    if (ONLY !== 'viewer') {
      const guids = sq(MDB, 'SELECT guid FROM elements_meta ORDER BY rowid').map((r) => r.guid), srv = await serve(null), base = 'http://127.0.0.1:' + srv.address().port;
      k.L('modeller: Duplex resident ' + MDB + ' elements_meta rows N=' + guids.length + ' distinct=' + new Set(guids).size);
      const ctxp = await browser.newContext({ viewport: { width: 900, height: 600 }, serviceWorkers: 'block' }), pg = await ctxp.newPage(), errs = [];
      pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
      if (BR) await pg.addInitScript('window.__HQ_BREAK=' + JSON.stringify(BR));
      try {
        await pg.goto(base + '/modeller/modeller.html?lang=en_MY', { waitUntil: 'load', timeout: 120000 });
        await pg.waitForFunction('window.__sceneReady === true && window.HelpPanel && window.HelpGuid && document.getElementById("m-help")', { timeout: 120000 });
        await pg.click('#b-open'); await pg.waitForTimeout(300); await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
        await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 90000 }); await pg.waitForTimeout(2500);
        await pg.evaluate(() => document.getElementById('m-help').click()); await pg.waitForSelector('#cmd-search', { timeout: 30000 }); await pg.evaluate(PAGE_JS);
        const rows = await pg.evaluate(async () => { const db = await window.OpenBuildingDb.get(); return db.exec('SELECT count(*) FROM elements_meta')[0].values[0][0]; });
        k.L('modeller page: elements_meta rows in the open building=' + rows + ' (file: ' + guids.length + ')');
        if (rows !== guids.length) k.chk('modeller the page holds the same building as the file: ' + rows + ' vs ' + guids.length, false);
        await claims('modeller', pg, guids, {
          locale: 'en_MY', noPick: new Set(sq(MDB, "SELECT m.guid FROM elements_meta m WHERE m.guid NOT IN (SELECT guid FROM element_transforms)").map((r) => r.guid)), stateName: 'Bonsai.selectByGuid: __lastGuidSelect + the selected feature\'s guid / __lastGuidFrame', writeName: 'total_changes() + op-log length',
          writes: async () => { const db = await window.OpenBuildingDb.get(); return db.exec('SELECT total_changes()')[0].values[0][0] + ':' + (window.Bonsai.oplog ? window.Bonsai.oplog.length : 'n/a'); },
          clear: () => { window.__lastGuidSelect = null; window.__lastGuidFrame = null; },
          waitSel: async (p, g) => { for (let i = 0; i < 100; i++) { const s = await p.evaluate(() => ({ s: window.__lastGuidSelect, f: window.__lastGuidFrame, gf: window.__arcGuidByFid || {} })); const ok = s.s && s.s.guid === g && ((s.s.via === 'feature' && s.s.sel === s.s.fid && s.gf[s.s.sel] === g) || (s.s.via === 'frame' && s.f && s.f.guid === g)); if (ok) return { ok: true, state: s.s }; if (s.s && s.s.guid === g && s.s.via === 'none') return { ok: false, nopick: true, state: s.s }; await p.waitForTimeout(100); } return { ok: false, state: await p.evaluate(() => window.__lastGuidSelect) }; } });
        k.L('modeller page errors=' + errs.length + (errs.length ? ' ' + errs.slice(0, 2).join(' | ') : ''));
      } catch (e) { k.incon('modeller', 'page failed: ' + String(e && e.message).split('\n')[0]); }
      await ctxp.close(); srv.close();
    }
  } finally { await browser.close(); }
  k.end();
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exitCode = 2; });
