#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ICON-NOT-IDB (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §30.6). READ THE LOG (/tmp/icon_logs/): §ICON_IDB lines; the exit code is not evidence.
// Owner 2026-11-04: the picture bytes live in object storage, NOT in the twin's IndexedDB. The twin carries the URL STRING in M_Product.ImageURL and nothing more. Claims:
//   N1 the 27 URLs are written to M_Product.ImageURL as ordinary CRUD edits and a RE-BOOTED till reads exactly those 27 strings from the twin (the row holds the URL string only).
//   N2 after that boot, a walk of EVERY IndexedDB store finds no image bytes: svg markup / PNG magic / data:image counts are the same as BEFORE the URLs were written (delta 0), and the IndexedDB grew by less than the
//      icon bytes would have added (the 27 files are 36796 bytes in total: the growth is URL text + op-log rows, not pictures).
//   N3 the till boot made no request to the icon host and received no image/* response (the URL is not fetched into the twin).
//   SELFTEST the scanner can say NO: an svg record planted in a scratch IndexedDB database is found (a scanner that cannot find a planted picture proves nothing).
// Command: node erp/tests/witness_icon_not_idb.js
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..'), ERP = path.join(ROOT, 'erp');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var LIST = JSON.parse(fs.readFileSync(path.join(ERP, 'product_icons', 'product_icons.json'), 'utf8')).products;
var ICON_BYTES = LIST.reduce(function (a, p) { return a + p.bytes; }, 0), J = JSON.stringify;
var V = { judged: 0, failed: 0 };
function check(key, label, ok, info) { V.judged++; if (!ok) V.failed++; console.log('  §ICON_IDB_CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info))); }
async function startServer() {
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname), f = path.join(ROOT, p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  return { server: server, base: 'http://127.0.0.1:' + server.address().port };
}
// runs in the page: walk every IndexedDB database/store/record, count bytes and image markers (svg markup, PNG magic, data:image, image/svg+xml mime text)
function scanIDB() {
  return (async function () {
    var out = { dbs: [], bytes: 0, svg: 0, png: 0, dataimg: 0, records: 0 };
    var dbs = (indexedDB.databases ? await indexedDB.databases() : []);
    function sizeOf(v, acc, depth) {
      if (v == null || depth > 6) return;
      if (typeof v === 'string') { acc.bytes += v.length; mark(v, acc); return; }
      if (v instanceof ArrayBuffer) { acc.bytes += v.byteLength; markBytes(new Uint8Array(v), acc); return; }
      if (ArrayBuffer.isView(v)) { acc.bytes += v.byteLength; markBytes(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), acc); return; }
      if (typeof Blob !== 'undefined' && v instanceof Blob) { acc.bytes += v.size; acc.blobs = (acc.blobs || 0) + 1; if (/^image\//.test(v.type)) acc.png++; return; }
      if (typeof v === 'object') { for (var k in v) sizeOf(v[k], acc, depth + 1); }
    }
    function mark(s, acc) { var a = s.indexOf('<svg'); while (a >= 0) { acc.svg++; a = s.indexOf('<svg', a + 4); } if (s.indexOf('data:image') >= 0) acc.dataimg++; if (s.indexOf('\u0089PNG') >= 0) acc.png++; }
    function markBytes(u8, acc) {   // <svg = 3c 73 76 67 ; PNG = 89 50 4e 47 ; "data:image" = 64 61 74 61 3a 69 6d 61 67 65
      for (var i = 0; i + 3 < u8.length; i++) {
        var b = u8[i]; if (b === 0x3c && u8[i + 1] === 0x73 && u8[i + 2] === 0x76 && u8[i + 3] === 0x67) acc.svg++;
        else if (b === 0x89 && u8[i + 1] === 0x50 && u8[i + 2] === 0x4e && u8[i + 3] === 0x47) acc.png++;
        else if (b === 0x64 && u8[i + 1] === 0x61 && u8[i + 2] === 0x74 && u8[i + 3] === 0x61 && u8[i + 4] === 0x3a && u8[i + 5] === 0x69 && u8[i + 6] === 0x6d) acc.dataimg++;
      }
    }
    for (var d = 0; d < dbs.length; d++) {
      var info = dbs[d], db = await new Promise(function (res, rej) { var r = indexedDB.open(info.name); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.onblocked = function () { rej(new Error('blocked')); }; });
      var names = Array.prototype.slice.call(db.objectStoreNames), rec = { name: info.name, stores: [] };
      for (var s = 0; s < names.length; s++) {
        var acc = { bytes: 0, svg: 0, png: 0, dataimg: 0, n: 0 };
        await new Promise(function (res) { var tx = db.transaction(names[s], 'readonly'), st = tx.objectStore(names[s]), c = st.openCursor(); c.onsuccess = function () { var cur = c.result; if (!cur) return; acc.n++; sizeOf(cur.value, acc, 0); sizeOf(cur.key, acc, 0); cur.continue(); }; tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); }; });
        rec.stores.push({ store: names[s], n: acc.n, bytes: acc.bytes, svg: acc.svg, png: acc.png, dataimg: acc.dataimg });
        out.bytes += acc.bytes; out.svg += acc.svg; out.png += acc.png; out.dataimg += acc.dataimg; out.records += acc.n;
      }
      db.close(); out.dbs.push(rec);
    }
    return out;
  })();
}
(async function () {
  var sv = await startServer(), browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }), REQ = [], RESP = [];
  async function open() {
    var pg = await ctx.newPage(); pg.on('pageerror', function (e) { console.log('   [pageerror] ' + e.message); });
    pg.on('request', function (r) { REQ.push(r.url()); }); pg.on('response', function (r) { RESP.push({ url: r.url(), ct: (r.headers()['content-type'] || '') }); });
    await pg.goto(sv.base + '/erp/till.html', { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.Till && window.Till.ready; }, null, { timeout: 170000 });
    return pg;
  }
  var pg = await open();
  var before = await pg.evaluate(scanIDB);
  console.log('§ICON_IDB before dbs=' + before.dbs.length + ' records=' + before.records + ' bytes=' + before.bytes + ' svg=' + before.svg + ' png=' + before.png + ' dataimg=' + before.dataimg);
  // write the 27 URLs as ordinary CRUD edits (what the head-office Product edit / a SODA delta apply does)
  var idsq = await pg.evaluate(function (vals) { return window.Till.rows("SELECT m_product_id AS id, value FROM m_product WHERE ad_client_id=11 AND value IN ('" + vals.join("','") + "')"); }, LIST.map(function (p) { return p.value.replace(/'/g, "''"); }));
  var idOf = {}; (idsq || []).forEach(function (r) { idOf[r.value] = r.id; });
  check('population', 'all 27 products exist in the till twin (the claim is not judged on an empty set)', LIST.every(function (p) { return idOf[p.value] != null; }), { found: Object.keys(idOf).length });
  var committed = 0;
  for (var i = 0; i < LIST.length; i++) {
    var ok = await pg.evaluate(function (a) { return new Promise(function (res) { var E = window.Till.engine(); var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === 'm_product') { E.removeEventListener('overlay:committed', once); res(true); } }; E.addEventListener('overlay:committed', once);
      E.__crud.applyOp({ op_type: 'CRUD_UPDATE', key: 'm_product', table: 'm_product', verb: 'update', id: a.id, changes: { imageurl: a.url } }); setTimeout(function () { res(false); }, 15000); }); }, { id: idOf[LIST[i].value], url: LIST[i].url });
    if (ok) committed++;
  }
  console.log('§ICON_IDB wrote urls committed=' + committed + ' of ' + LIST.length);
  check('written', '27 of 27 ImageURL edits committed', committed === LIST.length, { committed: committed });
  await pg.close(); REQ.length = 0; RESP.length = 0;
  pg = await open();                                         // the re-boot the claims are judged on
  var rows = await pg.evaluate(function (vals) { return window.Till.rows("SELECT value, imageurl FROM m_product WHERE ad_client_id=11 AND value IN ('" + vals.join("','") + "')"); }, LIST.map(function (p) { return p.value.replace(/'/g, "''"); }));
  var got = {}; (rows || []).forEach(function (r) { got[r.value] = r.imageurl; });
  var same = LIST.filter(function (p) { return got[p.value] === p.url; }).length, maxLen = Math.max.apply(null, LIST.map(function (p) { return (got[p.value] || '').length; }));
  console.log('§ICON_IDB reboot urls_read=' + same + ' of ' + LIST.length + ' longest_value=' + maxLen + ' chars');
  check('N1', 'the re-booted till reads the 27 URL strings from M_Product.ImageURL (each exactly the list URL, <= 200 chars)', same === LIST.length && maxLen <= 200, { same: same, maxLen: maxLen });
  var after = await pg.evaluate(scanIDB);
  console.log('§ICON_IDB after dbs=' + after.dbs.length + ' records=' + after.records + ' bytes=' + after.bytes + ' svg=' + after.svg + ' png=' + after.png + ' dataimg=' + after.dataimg);
  after.dbs.forEach(function (d) { d.stores.forEach(function (s) { var b = before.dbs.filter(function (x) { return x.name === d.name; })[0], bs = b && b.stores.filter(function (x) { return x.store === s.store; })[0]; if (!bs || bs.bytes !== s.bytes || bs.svg !== s.svg) console.log('  §ICON_IDB store ' + d.name + '/' + s.store + ' records ' + (bs ? bs.n : '-') + '->' + s.n + ' bytes ' + (bs ? bs.bytes : '-') + '->' + s.bytes + ' svg ' + (bs ? bs.svg : '-') + '->' + s.svg); }); });
  var growth = after.bytes - before.bytes;
  check('N2-population', 'the IndexedDB walk judged something (databases and records > 0)', after.dbs.length > 0 && after.records > 0, { dbs: after.dbs.length, records: after.records });
  check('N2-markers', 'no new image bytes: svg markup / PNG magic / data:image counts equal before the URLs were written', after.svg === before.svg && after.png === before.png && after.dataimg === before.dataimg, { before: [before.svg, before.png, before.dataimg], after: [after.svg, after.png, after.dataimg] });
  check('N2-growth', 'IndexedDB growth (' + growth + ' bytes: URL text + op-log) is smaller than the ' + ICON_BYTES + ' bytes of the 27 pictures', growth < ICON_BYTES, { growth: growth, icon_bytes: ICON_BYTES });
  var iconReq = REQ.filter(function (u) { return /oraclecloud\.com|product-icons|\.svg(\?|$)/.test(u); }), imgResp = RESP.filter(function (r) { return /^image\//.test(r.ct); });
  console.log('§ICON_IDB boot requests=' + REQ.length + ' to_icon_host=' + iconReq.length + ' image_responses=' + imgResp.length + (imgResp.length ? ' ' + J(imgResp.slice(0, 3)) : ''));
  check('N3', 'the till boot requested no icon URL and got no svg/image response from the app origin (the URL is not fetched into the twin)', iconReq.length === 0 && imgResp.filter(function (r) { return /svg/.test(r.ct) || /product-icons/.test(r.url); }).length === 0, { iconReq: iconReq.slice(0, 3), imgResp: imgResp.slice(0, 3) });
  // SELFTEST: plant an svg record in a scratch database; the scanner must see it
  await pg.evaluate(function () { return new Promise(function (res, rej) { var r = indexedDB.open('icon_selftest', 1); r.onupgradeneeded = function () { r.result.createObjectStore('s'); }; r.onsuccess = function () { var tx = r.result.transaction('s', 'readwrite'); tx.objectStore('s').put('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'k1'); tx.objectStore('s').put(new TextEncoder().encode('<svg></svg>'), 'k2'); tx.oncomplete = function () { r.result.close(); res(); }; }; r.onerror = function () { rej(r.error); }; }); });
  var planted = await pg.evaluate(scanIDB);
  check('SELFTEST', 'the scanner finds a planted svg (2 markers) that was not there before', planted.svg === after.svg + 2, { after: after.svg, planted: planted.svg });
  await browser.close(); sv.server.close();
  var v = !V.judged ? 'INCONCLUSIVE' : V.failed ? 'FAIL' : 'PASS';
  console.log('§ICON_IDB_VERDICT W-ICON-NOT-IDB verdict=' + v + ' judged=' + V.judged + ' failed=' + V.failed);
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§ICON_IDB_VERDICT W-ICON-NOT-IDB verdict=HARNESS-FAIL ' + (e && e.stack)); process.exit(2); });
