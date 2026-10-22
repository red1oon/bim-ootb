#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-EVIDENCE (prompts/DXF2BIM_EVIDENCE_TIERS.md, D36 EVIDENCE TIERS + FLY TO THE EVIDENCE). Read the log after every run: exit code is not evidence.
// Every yellow row carries the KIND of its evidence (stated / read / inferred, a static table per rule, inferred = orange); a click on a row flies the camera to
// that evidence on the sheet where it stands now (the Arrange view's preview placement, else the canvas). Issues proved / disproved:
//   E1 every rule has one tier (a rule: in dxf2suggest.js / the door rules without a tier FAILS; the table is the spec's)
//   E2 the tier counts are the list's (the rows counted in the panel = the §DXF-EVIDENCE log = the suggestion engine run outside the page: the CLI / the preview rounds)
//   E3 the camera goes to the evidence (the highlighted entity's world box inside the visible canvas right of the panels; its handle = the one in `why`; drawn
//      where the sheet stands now)
//   E4 split accept takes only its tier (after `Accept stated + read` no stated / read row remains and every inferred row does; Accept all only with one kind)
//   E5 only a view (markings / verdict / saved texts / gate byte-identical before and after any number of clicks, restore leaves no overlay and every opacity as
//      it was; 0 page errors)
// Sets: the plain Duplex set written here from DXARC.db (prompts/film_dxf2bim_yellow_sets.js); the raw shed is private local material, given by env
// SHED_RAW_DIR (SKIP loudly when unset; never copied into the repo; no sheet text is printed).
// usage: SHED_RAW_DIR=<dir> NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_evidence.js [/tmp/db2/DXARC.db]   (EVIDENCE_SHOTS=<dir>: review screenshots, never the repo)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), DB = process.argv[2] || '/tmp/db2/DXARC.db';
const SHED_RAW = process.env.SHED_RAW_DIR || '';
const RAW9 = ['0_FLOOR_PLAN', '1S_ELEV_SOUTH', '1N_ELEV_NORTH', '2_ELEV_WEST', '7_ELEV_EAST', '3_BEAM_LAYOUT', '4_FOUNDATION_LAYOUT', '8_SECTION_AA_TRUSS', '5_DETAILS'];
const SPEC = { 'PR-UNITS': 'stated', 'PR-SET': 'stated', 'PR-VIEW': 'read', 'PR-NAME': 'read', 'PR-Z': 'read', 'PR-GRID': 'read', 'PR-GRID-TICK': 'inferred', 'PR-Z-GROUND': 'inferred', 'PR-FACE': 'inferred', 'PR-HAXIS': 'inferred', 'PR-CUT': 'inferred' };   // the spec's table
const HANDLE_RULES = ['PR-GRID-TICK', 'PR-GRID', 'PR-Z-GROUND', 'PR-Z'];   // the rules whose `why` names the entity they read
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const skip = (id, why) => console.log('§SKIP ' + id + '  ' + why);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.EVIDENCE_SHOTS || null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

// the oracle for E2 on the shed: the suggestion engine outside the page (modeller/dxf2bim_cli.js --accept-suggestions [--level 0]), its accepted rows tallied by the spec's table
function cliTally(files, level) {
  const CLI = require(path.join(ROOT, 'modeller', 'dxf2bim_cli.js')), lines = [];
  const args = CLI.parseArgs(['--sheets'].concat(files, ['--out', fs.mkdtempSync(path.join(os.tmpdir(), 'evcli-')), '--accept-suggestions'], level === null ? [] : ['--level', String(level)]));
  CLI.run(args, s => lines.push(s));
  const t = { stated: 0, read: 0, inferred: 0, none: 0 }; lines.forEach(l => { const m = /^§CLI mark .*\((PR-[A-Z-]+)\)$/.exec(l); if (m) t[SPEC[m[1]] || 'none']++; });
  return t;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
  let duplex = null;
  if (fs.existsSync(DB)) {
    const r = cp.spawnSync('node', [path.join(ROOT, 'prompts', 'film_dxf2bim_yellow_sets.js'), DB, path.join(tmp, 'duplex')], { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_PATH: path.join(process.env.HOME, 'bim-compiler', 'node_modules') }) });
    console.log('  sets: ' + ((r.stdout || '').match(/§FILM_SETS.*/) || ['rc=' + r.status + ' ' + (r.stderr || '').slice(0, 200)])[0].replace(/ out=\S+/, ''));
    if (r.status === 0) duplex = path.join(tmp, 'duplex');
  }
  const dxfs = d => fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f));
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810 });
  const errs = [], elog = []; pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
  pg.on('console', m => { const t = m.text(); if (/^§DXF-EVIDENCE/.test(t)) { elog.push(t); console.log('  ' + t.slice(0, 260)); } });
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
  await pg.evaluate(() => { if (!document.body.classList.contains('ol-collapsed')) { const b = document.getElementById('ol-collapse'); if (b) b.click(); } });
  const idle = () => pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict && !(window.DxfImportUI.state.arr && window.DxfImportUI.state.arr.playing)', { timeout: 240000 });
  const openSet = async (files, onOpen) => {
    await pg.evaluate(o => { window.DxfImportUI.state.arrangeOnOpen = !!o; window.DxfImportUI.state.arrangeOpts = o ? { stepMs: 15, holdMs: 15 } : null; }, !!onOpen);
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await idle(); await sleep(500);
    if (onOpen) { await pg.waitForFunction('window.DxfImportUI.state.arrLast && !(window.DxfImportUI.state.arr && window.DxfImportUI.state.arr.playing)', { timeout: 240000 }); await sleep(800); }
  };
  const shot = async name => { if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  const state = () => pg.evaluate(() => { const S = window.DxfMetaEditor.state; return { verdict: JSON.stringify(S.verdict && { v: S.verdict.verdict, b: S.verdict.blocking, a: S.verdict.advisory }), marks: JSON.stringify(S.sheets.map(sh => sh.marks.map(m => [m.key, m.value, m.x, m.y, m.source]))), texts: S.sheets.map(sh => window.DxfMetaEditor.effText(sh)), gate: window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok }; });
  const same = (a, b) => a.verdict === b.verdict && a.marks === b.marks && a.texts.length === b.texts.length && a.texts.every((t, i) => t === b.texts[i]) && a.gate === b.gate;
  const typeField = async (si, key, val) => { await pg.evaluate((si, key, val) => { const S = window.DxfMetaEditor.state; if (!S.open[si]) document.querySelector('#dm-panel [data-act="card"][data-sheet="' + si + '"]').click();
    const el = document.getElementById('dm-f-' + si + '-' + key); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }, si, key, val); await sleep(300); await idle(); await sleep(600); };
  // the rows the panel shows, by tier: the list (#dm-yellows) and the preview rows of the sheet cards (every round, while the Arrange view stands)
  const counted = sel => pg.evaluate(sel => { const t = { stated: 0, read: 0, inferred: 0, rows: 0, bad: 0 }; document.querySelectorAll(sel).forEach(e => { const k = e.getAttribute('data-tier'), m = e.querySelector('[data-tier-mark]'); t.rows++; if (k in t) t[k]++; if (!m || m.getAttribute('data-tier-mark') !== k || (k === 'inferred') !== e.classList.contains('inf')) t.bad++; }); return t; }, sel);
  const lastLog = re => { const l = elog.filter(x => re.test(x)).pop() || ''; const g = k => Number((new RegExp(k + '=(\\d+)').exec(l) || [])[1]); return { stated: g('stated'), read: g('read'), inferred: g('inferred'), line: l }; };
  const eq3 = (a, b) => a.stated === b.stated && a.read === b.read && a.inferred === b.inferred;
  const s3 = t => t.stated + '/' + t.read + '/' + t.inferred;
  const cardsOpen = () => pg.evaluate(() => { const S = window.DxfMetaEditor.state; S.sec.sheets = true; S.sheets.forEach((sh, i) => { S.open[i] = true; }); window.DxfMetaEditor.show(); });
  // a real click on a row (its text), the fly awaited; then the checks of E3 in the page
  const flyRow = async (sel) => {
    const h = await pg.evaluateHandle(sel => { const e = document.querySelector(sel); if (!e) return null; e.scrollIntoView({ block: 'center' }); return e.querySelector('.t'); }, sel);
    if (!(await h.evaluate(e => !!e))) return null;
    const why = await h.evaluate(e => (e.querySelector('.w') || {}).textContent || ''), rule = await pg.evaluate(sel => document.querySelector(sel).getAttribute('data-rule'), sel);
    await pg.evaluate(() => { window.__ev0 = window.DxfImportUI.state.evLast || null; }); await h.click();
    await pg.waitForFunction('window.DxfImportUI.state.ev && window.DxfImportUI.state.ev.info && window.DxfImportUI.state.evLast !== window.__ev0', { timeout: 30000 }); await sleep(250);
    const res = await pg.evaluate(() => {
      const U = window.DxfImportUI.state, info = U.ev.info, A = window.A, T = window.THREE, cv = A.renderer.domElement.getBoundingClientRect(); let pr = cv.left;
      ['dxf-panel', 'dm-panel'].forEach(id => { const e = document.getElementById(id); if (e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0) pr = Math.max(pr, e.getBoundingClientRect().right); });
      A.camera.updateMatrixWorld(); const b = info.box, px = []; let inside = true;
      for (const x of [b[0][0], b[1][0]]) for (const y of [b[0][1], b[1][1]]) for (const z of [b[0][2], b[1][2]]) { const v = new T.Vector3(x, y, z).project(A.camera), sx = cv.left + (v.x + 1) / 2 * cv.width, sy = cv.top + (1 - v.y) / 2 * cv.height; px.push([Math.round(sx), Math.round(sy)]);
        if (!(sx >= pr && sx <= cv.right - 60 && sy >= cv.top && sy <= cv.bottom && v.z < 1)) inside = false; }
      // drawn where the sheet stands now: the highlighted handle's segments = the Arrange view's current positions of that handle (or the canvas's)
      let where = 'n/a'; if (info.handle) { const R = U.arr; let ref = null;
        if (R && R.live) { const it = R.items.filter(q => q.name === info.sheet)[0]; if (it) { const H = it.raw.hb.concat(it.raw.hd), a = []; H.forEach((hh, s) => { if (hh === info.handle) for (let j = 0; j < 6; j++) a.push(it.cur[s * 6 + j]); }); ref = a; } }
        else if (U.canvas && U.canvas[info.sheet]) ref = U.canvas[info.sheet].segOf[info.handle] || null;
        if (!info.hseg) where = 'text';   // a text: not a drawn segment (its box is drawn through the same placement)
        else if (ref && ref.length) { let w = ref.length === info.hseg.length ? 0 : Infinity; for (let i = 0; i < ref.length && isFinite(w); i++) w = Math.max(w, Math.abs(ref[i] - info.hseg[i])); where = w <= 1e-9 ? 'current' : 'off ' + w; } else where = 'no reference'; }
      const ov = A.scene.getObjectByName('dxf-evidence'), thick = !!(ov && ov.getObjectByName('dxf-evidence-thick'));
      return { info: info, inside: inside, pr: Math.round(pr), px: px, where: where, overlay: !!ov, thick: thick };
    });
    res.why = why; res.rule = rule; return res;
  };
  const restoreChecks = async () => {   // E5: the same row again, Esc and a click on the canvas each restore: no overlay, every sheet's opacity as before the fly
    const opac = () => pg.evaluate(() => { const o = []; [window.DxfImportUI.state.group, window.DxfImportUI.state.arr && window.DxfImportUI.state.arr.group].forEach(G => { if (G) G.children.forEach(ls => { if (ls.material) o.push(ls.name + ':' + ls.material.opacity.toFixed(4)); }); }); return o.join('|'); });
    const gone = () => pg.evaluate(() => !window.DxfImportUI.state.ev && !window.A.scene.getObjectByName('dxf-evidence') && !document.querySelector('#dm-panel .dm-evon'));
    const why = async (o0) => JSON.stringify(await pg.evaluate(() => ({ ev: !!window.DxfImportUI.state.ev, ov: !!window.A.scene.getObjectByName('dxf-evidence'), on: !!document.querySelector('#dm-panel .dm-evon') }))) + ' op=' + ((await opac()) === o0);
    const out = {}, sel = '#dm-panel .dm-pr[data-ev]';
    await pg.keyboard.press('Escape'); await sleep(300); const o0 = await opac();   // the last fly of the rule round restored first (Esc), then the reference
    let r = await flyRow(sel); await pg.evaluate(sel => document.querySelector(sel + '.dm-evon .t').click(), sel); await sleep(300); out.again = (await gone()) && (await opac()) === o0; if (!out.again) console.log('  restore(again) ' + await why(o0));
    r = await flyRow(sel); await pg.keyboard.press('Escape'); await sleep(300); out.esc = (await gone()) && (await opac()) === o0; if (!out.esc) console.log('  restore(esc) ' + await why(o0));
    r = await flyRow(sel); const cv = await pg.evaluate(() => { const b = window.A.renderer.domElement.getBoundingClientRect(); return [b.right - 200, b.bottom - 150]; }); await pg.mouse.click(cv[0], cv[1]); await sleep(300); out.canvas = (await gone()) && (await opac()) === o0; if (!out.canvas) console.log('  restore(canvas) ' + await why(o0));
    out.arrStill = await pg.evaluate(() => !!window.DxfImportUI.state.arr);
    return out;
  };
  const e3 = (tag, r) => {
    if (!r) { ok('E3[' + tag + '] the camera goes to the evidence', false, 'no row'); return; }
    const whs = (r.why.match(/\b(?:tick|line|text) ([0-9A-F]+)\b/g) || []).map(s => s.split(' ')[1]), wh = whs.join('+') || null, I = r.info, needH = HANDLE_RULES.indexOf(r.rule) >= 0;
    ok('E3[' + tag + ' ' + r.rule + '] the camera goes to the evidence: the highlighted box lies inside the visible canvas right of the panels (x ' + r.pr + '..right-60) after the fly; ' + (needH ? 'its handle is the one `why` names; drawn where the sheet stands now' : 'no single entity in `why`: ' + (I.whole ? 'the sheet as a whole' : 'what the rule holds it against')),
      r.inside && r.overlay && I.segs > 0 && (!needH || (whs.indexOf(I.handle) >= 0 && (r.where === 'current' || r.where === 'text'))),
      'sheet=' + I.sheet.replace(/\.dxf$/, '') + ' placed=' + I.placed + ' handle=' + I.handle + (needH ? ' why=' + wh + ' where=' + r.where : '') + ' segs=' + I.segs + '+' + I.segs2 + ' thick=' + r.thick + ' px=' + JSON.stringify([r.px.reduce((m, p) => Math.min(m, p[0]), 1e9), r.px.reduce((m, p) => Math.max(m, p[0]), -1e9)]) + ' cam=' + I.cam.map(c => c.map(v => v.toFixed(1)).join(',')).join('->'));
  };
  const flyRules = async (tag, rules, pref) => { const res = []; for (const rule of rules) { const r = await flyRow((pref || '#dm-panel') + ' .dm-pr[data-ev][data-rule="' + rule + '"]'); e3(tag, r); res.push(r); if (r) await shot(tag + '_fly_' + rule); } return res; };

  // ---------- E1 every rule has one tier ----------
  {
    const src = ['dxf2suggest.js', 'dxf_meta_editor.js'].map(f => fs.readFileSync(path.join(ROOT, 'modeller', f), 'utf8')).join('\n'), rules = Array.from(new Set((src.match(/rule: '(PR-[A-Z-]+)'/g) || []).map(s => s.slice(7, -1)))).sort();
    await pg.evaluate(() => window.DxfImportUI.loadScripts()); const T2 = await pg.evaluate(() => { const o = {}; Object.keys(window.DxfMetaEditor.TIER).forEach(k => { o[k] = window.DxfMetaEditor.tierOf(k); }); return o; });
    const missing = rules.filter(r => ['stated', 'read', 'inferred'].indexOf(T2[r]) < 0), off = Object.keys(SPEC).filter(r => T2[r] !== SPEC[r]), extra = Object.keys(T2).filter(k => k !== 'default' && rules.indexOf(k) < 0);
    ok('E1 every rule has one tier: every `rule:` of dxf2suggest.js (and the door rules) is in the table with one of stated / read / inferred, the table is the spec\'s, no tier for a rule that does not exist',
      rules.length >= 11 && !missing.length && !off.length && !extra.length, 'rules=' + rules.length + ' ' + rules.map(r => r.replace('PR-', '') + ':' + T2[r]).join(' ') + (missing.length ? ' MISSING ' + missing.join(',') : '') + (off.length ? ' NOT-SPEC ' + off.join(',') : '') + (extra.length ? ' EXTRA ' + extra.join(',') : '') + ' (table read after the lazy load)');
  }

  // ---------- the plain Duplex: E2 round 1 + 2; then the roles typed (VIEW on the plans and elevations, LEVEL on the plans), the Arrange view: E3 + E5 ----------
  if (!duplex) ['E2[duplex plain]', 'E3[duplex]', 'E5[duplex]'].forEach(id => skip(id, 'no DXARC.db at ' + DB + ' (the Duplex sets are written from it)'));
  else {
    elog.length = 0; const e0 = errs.length;
    await openSet(dxfs(path.join(duplex, 'plain')), false);
    const pv = await pg.evaluate(() => { const o = { 1: { stated: 0, read: 0, inferred: 0 }, 2: { stated: 0, read: 0, inferred: 0 } }; window.DxfMetaEditor.preview().forEach(P => P.yellow.forEach(y => { if (o[y.round]) o[y.round][window.DxfMetaEditor.tierOf(y.rule)]++; })); return o; });
    const r1 = await counted('#dm-yellows .dm-pr[data-tier]'), l1 = lastLog(/ tiers stated=/), single1 = await pg.evaluate(() => !!document.querySelector('#dm-yellows [data-act="acceptall"]') && !document.querySelector('#dm-yellows [data-act="acceptsr"]'));
    await shot('duplex_list_round1');
    // round 1 accepted row by row (only the rows of round 1: Accept all would take the next round too)
    const ids1 = await pg.evaluate(() => Array.from(document.querySelectorAll('#dm-yellows .dm-pr[data-ev]')).map(e => e.getAttribute('data-ev')));
    for (let n = 0; n < 40; n++) { const c = await pg.evaluate(ids => { const e = Array.from(document.querySelectorAll('#dm-yellows .dm-pr[data-ev]')).find(x => ids.indexOf(x.getAttribute('data-ev')) >= 0); if (!e) return 0; e.querySelector('[data-act="confirm"]').click(); return 1; }, ids1); if (!c) break; await sleep(150); }
    await idle(); await sleep(500);
    const r2 = await counted('#dm-yellows .dm-pr[data-tier]'), l2 = lastLog(/ tiers stated=/);
    await shot('duplex_list_round2');
    ok('E2[duplex plain] the tier counts are the list\'s: round 1 and round 2 counted from the rows (each row\'s mark = its tier, orange = inferred) = the §DXF-EVIDENCE log = the preview rounds (the suggestion engine over shadow copies)',
      eq3(r1, l1) && eq3(r1, pv[1]) && eq3(r2, l2) && eq3(r2, pv[2]) && !r1.bad && !r2.bad && r1.rows === r1.stated + r1.read + r1.inferred && single1,
      'round1 rows=' + s3(r1) + ' log=' + s3(l1) + ' preview=' + s3(pv[1]) + ' | round2 rows=' + s3(r2) + ' log=' + s3(l2) + ' preview=' + s3(pv[2]) + ' | one kind -> Accept all only=' + single1);
    // the roles the titles do not give (they end in a scale): typed by the user, then the Arrange view (preview placement of the yellow values)
    const names = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.name));
    for (let i = 0; i < names.length; i++) { if (/FLOOR_LEVEL/.test(names[i])) await typeField(i, 'VIEW', 'PLAN'); if (/FRONT|REAR|LEFT|RIGHT/.test(names[i])) await typeField(i, 'VIEW', 'ELEV'); }
    for (let i = 0; i < names.length; i++) { if (/LEVEL_1/.test(names[i])) await typeField(i, 'LEVEL', '0'); if (/LEVEL_2/.test(names[i])) await typeField(i, 'LEVEL', '3.1'); }
    await pg.evaluate(() => window.DxfImportUI.arrange({ stepMs: 15, holdMs: 15 })); await idle(); await sleep(800); await cardsOpen(); await sleep(400);
    await shot('duplex_list_tiers');
    const st0 = await state();
    await flyRules('duplex', ['PR-GRID', 'PR-Z', 'PR-CUT', 'PR-FACE', 'PR-HAXIS']);
    const rs = await restoreChecks(), st1 = await state();
    ok('E5[duplex] only a view: markings / verdict / saved texts / gate byte-identical before and after ' + (5 + 3) + ' row clicks; the row again, Esc and a click on the canvas each restore (no overlay, every opacity as before); 0 page errors',
      same(st0, st1) && rs.again && rs.esc && rs.canvas && rs.arrStill && errs.length === e0, JSON.stringify(rs) + ' errors=' + (errs.length - e0));
  }

  // ---------- the raw shed: E2 (the list round 1, every round in the Arrange view's cards = the CLI), E3 phase 1 (nothing yours) and 2 (the plans' role + level, the set typed), E5, E4 ----------
  const rawOk = SHED_RAW && RAW9.every(n => fs.existsSync(path.join(SHED_RAW, n + '.dxf')));
  if (!rawOk) ['E2[shed raw]', 'E3[shed raw]', 'E4[shed raw]', 'E5[shed raw]'].forEach(id => skip(id, 'LOCAL MATERIAL ABSENT: set SHED_RAW_DIR to the 9 raw shed sheets (' + RAW9.join(' ') + ')' + (SHED_RAW ? ', not all found in ' + SHED_RAW : ', unset')));
  else {
    const files = RAW9.map(n => path.join(SHED_RAW, n + '.dxf')), cli0 = cliTally(files, null), cli1 = cliTally(files, 0);
    elog.length = 0; const e0 = errs.length;
    await openSet(files, true); await cardsOpen(); await sleep(400);
    const l1 = await counted('#dm-yellows .dm-pr[data-tier]'), lg1 = lastLog(/ tiers stated=/), p1 = await counted('#dm-panel [data-card] .dm-pv[data-tier]'), pl1 = lastLog(/ preview-tiers /);
    await shot('shed_list_tiers');
    await pg.evaluate(() => { const e = document.querySelector('#dm-panel [data-card] .dm-pv.inf'); if (e) e.scrollIntoView({ block: 'center' }); }); await shot('shed_list_tiers_inferred');
    const tintInf = await pg.evaluate(() => { const R = window.DxfImportUI.state.arr; return R ? R.items.filter(it => it.tintInf).map(it => it.name.replace(/\.dxf$/, '')) : null; });
    ok('E2[shed raw] the tier counts are the list\'s: the list (round 1) and the Arrange view\'s cards (every round) counted from the rows = the §DXF-EVIDENCE log; every round = the CLI\'s --accept-suggestions run tallied by the spec\'s table (suggestions only)',
      eq3(l1, lg1) && eq3(p1, pl1) && eq3(p1, cli0) && !l1.bad && !p1.bad && cli0.none === 0,
      'list=' + s3(l1) + ' log=' + s3(lg1) + ' | cards=' + s3(p1) + ' log=' + s3(pl1) + ' cli=' + s3(cli0) + ' | orange-tinted sheets=' + (tintInf || []).join(','));
    const st0 = await state();
    await flyRules('shed', ['PR-GRID-TICK', 'PR-Z-GROUND', 'PR-FACE', 'PR-CUT', 'PR-UNITS', 'PR-VIEW', 'PR-NAME'], '#dm-panel [data-card]');
    const rs = await restoreChecks(), st1 = await state();
    ok('E5[shed raw] only a view (nothing yours): markings / verdict / saved texts / gate byte-identical before and after ' + (7 + 3) + ' row clicks; the row again, Esc and a click on the canvas each restore and leave the Arrange view standing; 0 page errors',
      same(st0, st1) && rs.again && rs.esc && rs.canvas && rs.arrStill && errs.length === e0, JSON.stringify(rs) + ' errors=' + (errs.length - e0));
    // phase 2: the user states the plans' role and level (HAXIS becomes a yellow row: the elevations stand on the plan grid) and the set on one sheet (PR-SET on the others)
    const names = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.name));
    await typeField(0, 'SET', 'SHED');
    for (let i = 0; i < names.length; i++) if (/FLOOR_PLAN|BEAM_LAYOUT|FOUNDATION_LAYOUT/.test(names[i])) { await typeField(i, 'VIEW', 'PLAN'); await typeField(i, 'LEVEL', '0'); }
    await sleep(1500); await idle(); await cardsOpen(); await sleep(400);
    const p2 = await counted('#dm-panel [data-card] .dm-pv[data-tier]'), pl2 = lastLog(/ preview-tiers /);
    ok('E2[shed raw +level] with @LEVEL=0 on the plans the HAXIS rows join every round: the inferred rows of the cards = the log = the CLI run with --level 0 (the spec\'s 9 / 16 / 106; stated / read differ by what was typed: 3 VIEW rows yours, 8 PR-SET rows from the one typed @SET)',
      eq3(p2, pl2) && p2.inferred === cli1.inferred && !p2.bad, 'cards=' + s3(p2) + ' log=' + s3(pl2) + ' cli(--level 0)=' + s3(cli1));
    const st2 = await state();
    await flyRules('shed+level', ['PR-HAXIS', 'PR-FACE', 'PR-CUT', 'PR-SET', 'PR-GRID-TICK', 'PR-Z-GROUND'], '#dm-panel [data-card]');
    const rs2 = await restoreChecks(), st3 = await state();
    ok('E5[shed raw +level] only a view: byte-identical before and after ' + (6 + 3) + ' more row clicks; restores clean; 0 page errors', same(st2, st3) && rs2.again && rs2.esc && rs2.canvas && errs.length === e0, JSON.stringify(rs2) + ' errors=' + (errs.length - e0));
    // E4: both kinds in the list -> the split buttons; `Accept stated + read` takes only its rows
    const b0 = await pg.evaluate(() => ({ sr: !!document.querySelector('#dm-yellows [data-act="acceptsr"]'), inf: !!document.querySelector('#dm-yellows [data-act="acceptinf"]'), all: !!document.querySelector('#dm-yellows [data-act="acceptall"]'),
      inferred: Array.from(document.querySelectorAll('#dm-yellows .dm-pr[data-tier="inferred"]')).map(e => e.getAttribute('data-ev') || e.textContent), nsr: Array.from(document.querySelectorAll('#dm-yellows .dm-pr[data-tier="stated"],#dm-yellows .dm-pr[data-tier="read"]')).length }));
    await pg.evaluate(() => { const S = window.DxfMetaEditor.state; S.sec.sheets = false; window.DxfMetaEditor.show(); const b = document.querySelector('#dm-yellows [data-act="acceptsr"]'); if (b) b.scrollIntoView({ block: 'end' }); }); await sleep(300);
    await shot('shed_split_buttons');
    await pg.evaluate(() => document.querySelector('#dm-yellows [data-act="acceptsr"]').click()); await sleep(500); await idle(); await sleep(800);
    const b1 = await pg.evaluate(() => ({ sr: Array.from(document.querySelectorAll('#dm-yellows .dm-pr[data-tier="stated"],#dm-yellows .dm-pr[data-tier="read"]')).length, inferred: Array.from(document.querySelectorAll('#dm-yellows .dm-pr[data-tier="inferred"]')).map(e => e.getAttribute('data-ev') || e.textContent),
      user: window.DxfMetaEditor.state.sheets.reduce((n, sh) => n + sh.marks.filter(m => m.source === 'user').length, 0), single: !!document.querySelector('#dm-yellows [data-act="acceptall"]') && !document.querySelector('#dm-yellows [data-act="acceptsr"]') }));
    const kept = b0.inferred.filter(id => b1.inferred.indexOf(id) >= 0).length;
    ok('E4[shed raw] split accept takes only its tier: with stated / read and inferred rows in the list the two buttons replace Accept all; after `Accept stated + read` no stated / read row remains and every inferred row does (one kind left: Accept all again)',
      b0.sr && b0.inf && !b0.all && b0.nsr > 0 && b0.inferred.length > 0 && b1.sr === 0 && kept === b0.inferred.length && b1.single,
      'before: stated+read=' + b0.nsr + ' inferred=' + b0.inferred.length + ' buttons sr=' + b0.sr + ' inf=' + b0.inf + ' all=' + b0.all + ' | after: stated+read=' + b1.sr + ' inferred kept=' + kept + '/' + b0.inferred.length + ' (now ' + b1.inferred.length + ': the next round of the accepted roles) user marks=' + b1.user + ' Accept all only=' + b1.single);
  }
  console.log('  page errors total=' + errs.length);
  await br.close(); srv.close();
  console.log('§W-EVIDENCE ' + (fails ? 'FAIL ' + fails : 'PASS')); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§FAIL W-EVIDENCE crashed ' + (e && e.stack || e)); process.exit(1); });
