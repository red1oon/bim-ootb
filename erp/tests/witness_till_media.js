#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-TILL-MEDIA-OFFLINE / -DEPLOY / -CAP / -HEAP (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §31, §32.2). READ THE LOG after every run (/tmp/rest_logs/media.log): exit code is not evidence.
// THE ISSUES: (1) a cross-origin <img> is opaque so nothing is cached and the catalog is blank offline; (2) a deploy (CACHE_VERSION bump) wiped every cached picture; (3) nothing prefetched the changed
// pictures; (4) no cap. The real erp/sw.js runs in a vm with a fake Cache Storage + fetch. Mutants are COPIES (SW_FILE), each proven applied once; a crash is not a kill.
// HEAP arm: a node fake cannot measure browser heap; it asserts what it can (the SW holds only numbers, the twin DB gets no bytes) and prints INCONCLUSIVE for the live heap number (needs the till page).
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var SW = process.env.SW_FILE || path.join(__dirname, '..', 'sw.js'), MUT = process.env.MEDIA_MUT || '';
var src = fs.readFileSync(SW, 'utf8');
var MUTS = { 'store-opaque': ["resp.type !== 'cors' || ", "", 'offline'], 'purge-media': ["k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME", "k !== CACHE_NAME", 'deploy'], 'refetch-all': ["if (idx[u]) { skipped++; continue; }", "", 'offline'], 'no-cap': ["if (total <= cap) break;", "break;", 'cap'] };
if (MUT) { var m = MUTS[MUT]; var n = src.split(m[0]).length - 1; console.log('§MEDIA_MUT ' + MUT + ' applied=' + n); if (n !== 1) { console.log('§MEDIA_MUT NOT APPLIED exactly once: not a kill'); process.exit(2); } src = src.replace(m[0], m[1]); }
function Resp(body, init) { init = init || {}; this._b = Buffer.from(body == null ? '' : body); this.status = init.status || 200; this.type = init.type || 'default'; this.headers = init.headers || {}; }
Resp.prototype.clone = function () { return new Resp(this._b, this); }; Resp.prototype.arrayBuffer = async function () { return this._b.buffer.slice(this._b.byteOffset, this._b.byteOffset + this._b.length); }; Resp.prototype.json = async function () { return JSON.parse(this._b.toString()); };
Resp.prototype.constructor = Resp;
var store = {}, net = { on: true, calls: 0 }, listeners = {}, origin = 'https://red1oon.github.io';
var cachesApi = { open: async function (n) { var m = store[n] = store[n] || new Map(); return { match: async function (u) { var r = m.get(typeof u === 'string' ? u : u.url); return r ? r.clone() : undefined; }, put: async function (u, r) { m.set(typeof u === 'string' ? u : u.url, r.clone()); }, delete: async function (u) { return m.delete(u); }, keys: async function () { return [...m.keys()]; } }; },
  keys: async function () { return Object.keys(store); }, delete: async function (n) { return delete store[n]; }, match: async function (u) { for (var n in store) { var r = store[n].get(typeof u === 'string' ? u : u.url); if (r) return r.clone(); } } };
var BODY = function (u) { return 'IMG:' + u + ':' + 'x'.repeat(2000); };
var ctx = { self: { addEventListener: function (t, f) { listeners[t] = f; }, location: { origin: origin }, clients: { claim: async function () {} }, skipWaiting: function () {} }, caches: cachesApi, Response: Resp, URL: URL, Promise: Promise, console: { log: function () {} }, Date: Date, JSON: JSON, Set: Set, Object: Object, Array: Array, Math: Math, setTimeout: setTimeout,
  fetch: async function (u, o) { var url = typeof u === 'string' ? u : u.url; net.calls++; if (!net.on) throw new Error('offline'); return new Resp(BODY(url), { type: (o && o.mode === 'no-cors') ? 'opaque' : 'cors', status: (o && o.mode === 'no-cors') ? 0 : 200 }); } };
ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
var V = { judged: 0, failed: 0 }, ARMV = {};
function check(arm, ok, label, info) { ARMV[arm] = ARMV[arm] || { j: 0, f: 0 }; ARMV[arm].j++; V.judged++; if (!ok) { ARMV[arm].f++; V.failed++; } console.log('  §MEDIA_CHECK arm=' + arm + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (info ? ' ' + info : '')); }
var URLS = []; for (var i = 1; i <= 27; i++) URLS.push('https://objectstorage.example/icons/p' + i + '.svg');
function msg(data) { return new Promise(function (res) { var p; listeners.message({ data: data, ports: [{ postMessage: res }], waitUntil: function (x) { p = x; } }); }); }
function imgReq(u, mode) { return { url: u, method: 'GET', mode: mode || 'cors', destination: 'image', cache: 'default' }; }
function doFetch(req) { return new Promise(function (res, rej) { var handled = false; listeners.fetch({ request: req, respondWith: function (p) { handled = true; Promise.resolve(p).then(res, rej); } }); if (!handled) res(null); }); }
(async function () {
  console.log('═══ W-TILL-MEDIA — erp/sw.js media cache (§31) ═══' + (MUT ? ' MUTANT=' + MUT : ''));
  // OFFLINE
  var r1 = await msg({ type: 'MEDIA_PREFETCH', urls: URLS, capMb: 50 });
  check('offline', r1.fetched === 27 && r1.files === 27, 'prefetch stores 27 CORS pictures', JSON.stringify(r1));
  var calls0 = net.calls, r2 = await msg({ type: 'MEDIA_PREFETCH', urls: URLS, capMb: 50 });
  check('offline', net.calls === calls0 && r2.skipped === 27, 'unchanged pictures are never refetched', 'netcalls=' + (net.calls - calls0));
  var changed = URLS.slice(); changed[3] = 'https://objectstorage.example/icons/p4-v2.svg'; calls0 = net.calls;
  var r3 = await msg({ type: 'MEDIA_PREFETCH', urls: changed, capMb: 50 });
  check('offline', net.calls - calls0 === 1 && r3.fetched === 1 && r3.evicted === 1 && r3.files === 27, 'an ImageURL delta fetches exactly the changed picture and evicts the old one', JSON.stringify(r3));
  var op = await doFetch(imgReq('https://objectstorage.example/icons/opaque.svg', 'no-cors'));
  check('offline', !store['erp-media-v1'].has('https://objectstorage.example/icons/opaque.svg'), 'a no-cors (opaque) image request never lands in the media cache');
  var cOp = store['erp-media-v1']; ctx.fetch0 = ctx.fetch; ctx.fetch = async function () { return new Resp('x', { type: 'opaque', status: 0 }); };
  var rO = await msg({ type: 'MEDIA_PREFETCH', urls: changed.concat(['https://objectstorage.example/icons/opq.svg']), capMb: 50 }); ctx.fetch = ctx.fetch0;
  check('offline', !cOp.has('https://objectstorage.example/icons/opq.svg') && rO.refused >= 1, 'an opaque response is refused, never stored', JSON.stringify(rO));
  net.on = false; var ok = 0, bad = []; for (var u of changed) { var rs = await doFetch(imgReq(u)); if (rs && rs.status === 200 && (await rs.arrayBuffer()).byteLength > 2000) ok++; else bad.push(u); }
  check('offline', ok === 27, 'network off: every picture of the catalog is served from disk cache', 'served=' + ok + ' of 27');
  var miss = await doFetch(imgReq('https://objectstorage.example/icons/never.svg')); check('offline', miss && miss.status === 503, 'an uncached picture offline answers 503 (placeholder tile), no hang');
  net.on = true;
  // DEPLOY
  await cachesApi.open('erp-ootb-v986'); var before = Object.keys(store).join(',');
  await new Promise(function (res) { listeners.activate({ waitUntil: function (p) { p.then(res); } }); });
  var after = Object.keys(store);
  check('deploy', after.indexOf('erp-media-v1') >= 0 && after.indexOf('erp-ootb-v986') < 0, 'activate keeps erp-media-v1 and purges the old versioned cache', 'before=' + before + ' after=' + after.join(','));
  var st = await msg({ type: 'MEDIA_STATS' }); check('deploy', st.files === 27, 'the 27 pictures survive the version bump', JSON.stringify(st));
  // CAP
  var big = []; for (var j = 0; j < 40; j++) big.push('https://objectstorage.example/icons/big' + j + '.svg');
  var rc = await msg({ type: 'MEDIA_PREFETCH', urls: big, capMb: 0.01 });
  check('cap', rc.bytes <= 0.01 * 1048576 && rc.files > 0 && rc.evicted > 0, 'a 0.01 MB cap evicts down under the cap', JSON.stringify(rc));
  // HEAP
  var idx = JSON.stringify(await (async function () { var c = await cachesApi.open('erp-media-v1'); var r = await c.match('https://media-index.invalid/index.json'); return r.json(); })());
  check('heap', !/IMG:/.test(idx), 'the SW index holds numbers only, no picture bytes');
  console.log('§TILL_MEDIA files=' + rc.files + ' bytes=' + rc.bytes + ' heap_mb=INCONCLUSIVE (node cannot read browser heap; measured on the till page after SODA merge)');
  Object.keys(ARMV).forEach(function (a) { var x = ARMV[a]; console.log('§MEDIA_VERDICT arm=' + a + ' ' + (x.j === 0 ? 'INCONCLUSIVE' : x.f ? 'FAIL' : 'PASS') + ' judged=' + x.j + ' failed=' + x.f); });
  console.log('§MEDIA_VERDICT ' + (V.judged === 0 ? 'INCONCLUSIVE' : V.failed ? 'FAIL' : 'PASS') + ' judged=' + V.judged + ' failed=' + V.failed);
  process.exit(V.judged && !V.failed ? 0 : 1);
})().catch(function (e) { console.log('§MEDIA_CRASH ' + e.stack); process.exit(3); });
