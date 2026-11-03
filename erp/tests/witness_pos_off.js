#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POS-OFF (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §13, §14.8, §17.4): the POS pill is DELETED and nothing else broke. READ THE LOG: every verdict is a § line; INCONCLUSIVE when nothing was judged;
//   a mutant that CRASHES is not a kill.
// ISSUES (each check names the one it proves): OFF1 the deleted files are gone from the tree and from the service-worker precache; OFF2 the ERP page loads with 0 page errors and requests none of them
//   (a leftover <script> would be a 404 and a silent half-loaded page); OFF3 the pill registry has no `pos` / `kitchen` pill (nor the earcon speaker pill that only the POS lens used) on the file AND on the mounted bar;
//   OFF4 Warehouse Walk still completes a shipment: viewer/wh_walk.js loads erp/pos_core.js and calls POSCore.completeShipmentOps; run on a real seed shipment (Drafted M_InOut, dt from the seed) it yields SET_STATUS CO;
//   pos_core.js exports nothing else (the trim is real, §14.8); OFF5 nothing in the tree still names the retired globals.
// Mutants (WPO_MUT=<name>, a COPY served, proven applied exactly once): stale-script-tag (idempiere.html re-adds pos_lens.js), core-without-ship (pos_core.js loses completeShipmentOps).
// Run: node erp/tests/witness_pos_off.js 2>&1 | tee /tmp/till_logs/s2_pos_off.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..'), ERP = path.join(ROOT, 'erp'), MUT = process.env.WPO_MUT || '';
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
var J = JSON.stringify, judged = 0, failed = 0;
function check(key, ok, label, info) { judged++; if (!ok) failed++; console.log('  §POSOFF_CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 300))); }
var DELETED = ['erp/pos_lens.js', 'erp/kitchen_lens.js', 'erp/kitchen_core.js', 'erp/img_store.js', 'erp/sfx.json', 'erp/tests/witness_pos_pillbar.js', 'erp/tests/poc_pos_close_leak.js', 'erp/tests/fixtures/pos_host.html'];
var OVER = {};
if (MUT) {
  var M = { 'stale-script-tag': ['erp/idempiere.html', '<script src="pos_core.js?v=3"></script>', '<script src="pos_core.js?v=3"></script><script src="pos_lens.js?v=11"></script>'], 'core-without-ship': ['erp/pos_core.js', 'return { completeShipmentOps: completeShipmentOps };', 'return {};'] }[MUT];
  if (!M) { console.log('§POSOFF_CRASH unknown mutant'); process.exit(2); }
  var orig = fs.readFileSync(path.join(ROOT, M[0]), 'utf8'); if (orig.split(M[1]).length !== 2) { console.log('§POSOFF_CRASH MUTATION DID NOT APPLY ' + M[0]); process.exit(2); }
  OVER['/' + M[0]] = orig.replace(M[1], function () { return M[2]; });
}
(async function main() {
  console.log('═══ W-POS-OFF — the POS pill is deleted and the ERP page + Warehouse Walk still work (prompts §17.4) ═══' + (MUT ? ' MUTANT=' + MUT : ''));
  // OFF1 files + precache
  check('OFF1-files-gone', DELETED.every(function (f) { return !fs.existsSync(path.join(ROOT, f)); }), 'the ' + DELETED.length + ' deleted files are absent from the tree', DELETED.filter(function (f) { return fs.existsSync(path.join(ROOT, f)); }));
  var sw = fs.readFileSync(path.join(ERP, 'sw.js'), 'utf8');
  check('OFF1-sw-precache', !/'(pos_lens|kitchen_lens|kitchen_core|img_store)\.js'|'sfx\.json'/.test(sw) && /'pos_core\.js'/.test(sw), 'sw.js precaches none of them and still precaches the trimmed pos_core.js', null);
  // OFF3 (file) the registry
  var pills = JSON.parse(fs.readFileSync(path.join(ERP, 'pills_idmp.json'), 'utf8')), ids = []; (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (typeof o.id === 'string' && o.name) ids.push(o.id); Object.keys(o).forEach(function (k) { walk(o[k]); }); } })(pills);
  check('OFF3-registry-file', ids.length > 5 && ['pos', 'kitchen', 'audio'].every(function (i) { return ids.indexOf(i) < 0; }), 'pills_idmp.json (' + ids.length + ' pills) has no pos / kitchen / audio pill', ids);
  var pr = fs.readFileSync(path.join(ERP, 'plugin_release.js'), 'utf8'); check('OFF1-plugin-release', pr.indexOf("'pos_lens'") < 0, 'plugin_release.js no longer lists the pos_lens built-in', null);
  // OFF4 the walk
  var wh = fs.readFileSync(path.join(ROOT, 'viewer/wh_walk.js'), 'utf8');
  check('OFF4-walk-wiring', /loadScript\('\.\.\/erp\/pos_core\.js/.test(wh) && /POSCore\.completeShipmentOps\(/.test(wh), 'viewer/wh_walk.js still loads erp/pos_core.js and calls POSCore.completeShipmentOps', null);
  var src = OVER['/erp/pos_core.js'] != null ? OVER['/erp/pos_core.js'] : fs.readFileSync(path.join(ERP, 'pos_core.js'), 'utf8'), mod = { exports: {} };
  new Function('module', 'exports', 'window', src)(mod, mod.exports, undefined);
  var P = mod.exports;
  check('OFF4-core-trimmed', J(Object.keys(P)) === J(['completeShipmentOps']), 'pos_core.js exports exactly completeShipmentOps (the rest is deleted)', Object.keys(P));
  if (!global.window) global.window = {}; process.env.SQLJS = SQLJS_DIR;
  var SQL = await require(SQLJS_DIR)({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } }), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var q = function (sql) { var st = db.prepare(sql), out = []; while (st.step()) { var o = st.getAsObject(), r = {}; Object.keys(o).forEach(function (k) { r[k.toLowerCase()] = o[k]; }); out.push(r); } st.free(); return out; };
  var io = q("SELECT i.m_inout_id, i.c_doctype_id, 'DR' AS docstatus FROM m_inout i WHERE i.c_doctype_id IN (SELECT c_doctype_id FROM c_doctype WHERE COALESCE(ispickqaconfirm,'N')<>'Y' AND COALESCE(isshipconfirm,'N')<>'Y') AND EXISTS (SELECT 1 FROM m_inoutline l WHERE l.m_inout_id=i.m_inout_id) ORDER BY i.m_inout_id LIMIT 1")[0];   // the seed holds no Drafted shipment (all CO): a real seed shipment's lines + a plain doctype (the walk's S-2b case) are presented as Drafted, which is how the walk hands them over
  var res = null;
  if (io && P.completeShipmentOps) {
    var lines = q('SELECT m_inoutline_id, m_product_id, movementqty FROM m_inoutline WHERE m_inout_id=' + io.m_inout_id).map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { o[k.toLowerCase()] = r[k]; }); return o; });
    var dt = q('SELECT ispickqaconfirm, isshipconfirm FROM c_doctype WHERE c_doctype_id=' + io.c_doctype_id)[0] || {}, dtl = {}; Object.keys(dt).forEach(function (k) { dtl[k.toLowerCase()] = dt[k]; });
    res = P.completeShipmentOps({ docstatus: io.docstatus, m_inout_id: io.m_inout_id }, lines, dtl, {});
    console.log('§POSOFF_WALK inout=' + io.m_inout_id + ' lines=' + lines.length + ' result=' + J(res).slice(0, 200));
  }
  check('OFF4-walk-completes', !!io && !!res && res.ok === true && res.ops.some(function (o) { return o.op_type === 'SET_STATUS' && o.doc_status === 'CO'; }) && res.movements.length > 0, 'a seed shipment (a plain, non-confirm doctype; lines as the walk reads them, presented Drafted) (' + (io ? io.m_inout_id : 'none found') + ') completes through POSCore.completeShipmentOps: SET_STATUS CO + C- movements', res);
  // OFF2 + OFF3 (page)
  var server = http.createServer(function (req, rs) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (OVER[p] != null) { rs.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); rs.end(OVER[p]); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p); if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end('nf'); return; }
    rs.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] }), ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } }), pg = await ctx.newPage();
  var reqs = [], errs = [], missing = []; pg.on('request', function (r) { reqs.push(r.url()); }); pg.on('pageerror', function (e) { errs.push(e.message); }); pg.on('response', function (r) { if (r.status() === 404) missing.push(r.url()); });
  await pg.goto(base + '/erp/idempiere.html?login=GardenAdmin', { waitUntil: 'load' });
  await pg.waitForFunction(function () { return window.__idmpDb && window.__crud && document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 240000 }).catch(function () {});
  await pg.waitForTimeout(2500);
  var names = DELETED.map(function (f) { return path.basename(f); }).filter(function (n) { return !/^(witness|poc)_|pos_host/.test(n); });
  var hit = reqs.filter(function (u) { return names.some(function (n) { return u.indexOf('/' + n) >= 0; }); });
  check('OFF2-no-request-for-deleted', reqs.length > 20 && hit.length === 0, 'the ERP page made ' + reqs.length + ' requests, none for a deleted file (' + names.join(', ') + ')', hit);
  check('OFF2-no-404', missing.filter(function (u) { return /\.(js|json|html)(\?|$)/.test(u); }).length === 0, 'no script / json request answered 404', missing.slice(0, 5));
  check('OFF2-page-errors', errs.length === 0, '0 page errors', errs.slice(0, 3));
  var live = await pg.evaluate(function () { return { bar: [].map.call(document.querySelectorAll('[id^="pill-"]'), function (e) { return e.id.replace('pill-', ''); }), core: typeof window.POSCore === 'object' ? Object.keys(window.POSCore) : null, lens: typeof window.PosLens, kit: typeof window.KitchenLens, img: typeof window.ImgStore, openPos: typeof window.openPosFor }; });
  check('OFF3-mounted-bar', live.bar.length > 5 && ['pos', 'kitchen', 'audio'].every(function (i) { return live.bar.indexOf(i) < 0; }), 'the mounted pill bar (' + live.bar.length + ' pills) has no pos / kitchen / audio', live.bar);
  check('OFF5-globals-gone', live.lens === 'undefined' && live.kit === 'undefined' && live.img === 'undefined' && live.openPos === 'undefined' && J(live.core) === J(['completeShipmentOps']), 'PosLens / KitchenLens / ImgStore / openPosFor are gone; POSCore is only completeShipmentOps', live);
  var deepl = await (async function () { var p2 = await ctx.newPage(), e2 = []; p2.on('pageerror', function (e) { e2.push(e.message); }); var lg = []; p2.on('console', function (m) { lg.push(m.text()); }); await p2.goto(base + '/erp/idempiere.html?login=GardenAdmin&lens=pos', { waitUntil: 'load' }); await p2.waitForTimeout(6000); await p2.close(); return { errs: e2, opened: lg.filter(function (l) { return /§DEEPLINK lens=pos|§POS-PILL/.test(l); }) }; })();
  check('OFF2-deeplink-inert', deepl.errs.length === 0 && deepl.opened.length === 0, '?lens=pos is now inert (no §DEEPLINK / §POS-PILL line, no error)', deepl);
  await browser.close(); server.close();
  var v = !judged ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS';
  console.log('§POSOFF_VERDICT W-POS-OFF verdict=' + v + ' judged=' + judged + ' failed=' + failed + (MUT ? ' mutant=' + MUT : ''));
  process.exit(failed ? 1 : 0);
})().catch(function (e) { console.log('§POSOFF_CRASH ' + (e && e.stack || e)); process.exit(3); });
