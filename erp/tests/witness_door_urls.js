#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon  SPDX-License-Identifier: MIT
// W-DOOR-URLS - the three stage-1 pages (PDF, Sheet history, File it) have short addresses and one way round.
// Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §15.3 - Witness: W-DOOR-URLS.
// Issues it exposes: U1 a short address that forwards to a missing page or drops the ?query / #hash (a deep link or hand-over lost);
// U2 a page whose row links a missing file, the wrong page, or itself; U3 nothing judged (prints INCONCLUSIVE, never PASS).
// Run: node erp/tests/witness_door_urls.js   (DOORURL_MUTANTS=1 also runs the mutants; each must be killed). Read the log.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');

// The denominator: the row names these pages in this order; the doors are the short addresses that are not the page itself.
const PAGES = [
  { name: 'PDF', file: 'pdf/index.html' },
  { name: 'Sheet history', file: 'erp/sheet_addin/history.html' },
  { name: 'File it', file: 'erp/sheet_addin/file_it.html' }
];
const DOORS = [
  { file: 'history/index.html', target: 'erp/sheet_addin/history.html' },
  { file: 'file-it/index.html', target: 'erp/sheet_addin/file_it.html' }
];

function rel(fromFile, href) {                 // href as the browser resolves it from that file; a folder href means its index.html
  let p = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), href.split(/[?#]/)[0]));
  if (href.split(/[?#]/)[0].endsWith('/')) p = path.posix.join(p, 'index.html');
  return p;
}

// U1: run the door's own script with a stand-in location; read its meta refresh and fallback link.
function judgeDoor(door, text, exists) {
  const out = [];
  const scripts = [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const calls = [];
  const location = { search: '?a=1', hash: '#b', replace: (u) => calls.push(u), href: '' };
  try { scripts.forEach((s) => vm.runInNewContext(s, { location })); } catch (e) { out.push('script threw: ' + e.message); }
  if (calls.length !== 1) out.push('replace called ' + calls.length + ' times');
  else {
    const u = calls[0], m = u.match(/^([^?#]*)(\?a=1)(#b)$/);
    if (!m) out.push('query/hash not carried: ' + u);
    else if (rel(door.file, m[1]) !== door.target) out.push('forwards to ' + rel(door.file, m[1]) + ', expected ' + door.target);
  }
  const meta = (text.match(/http-equiv="refresh" content="0; url=([^"]+)"/) || [])[1];
  if (!meta || rel(door.file, meta) !== door.target) out.push('meta refresh names ' + meta);
  const link = (text.match(/<body[\s\S]*?<a href="([^"]+)"/) || [])[1];
  if (!link || rel(door.file, link) !== door.target) out.push('fallback link names ' + link);
  if (!exists(door.target)) out.push('target missing in the tree: ' + door.target);
  return { rows: 1, failed: out };
}

// U2: the row on each page.
function judgePage(page, text, exists) {
  const out = [];
  const navs = [...text.matchAll(/<nav class="apps"[^>]*>([\s\S]*?)<\/nav>/g)];
  if (navs.length !== 1) return { rows: 0, failed: ['rows found: ' + navs.length] };
  const items = [...navs[0][1].matchAll(/<(a|b)\b([^>]*)>([^<]*)<\/\1>/g)].map((m) => ({ tag: m[1], attrs: m[2], name: m[3] }));
  const names = items.map((i) => i.name);
  if (names.join('|') !== PAGES.map((p) => p.name).join('|')) out.push('names ' + JSON.stringify(names));
  items.forEach((it) => {
    const want = PAGES.find((p) => p.name === it.name);
    if (!want) return;
    if (want.file === page.file) {
      if (it.tag !== 'b' || !/aria-current="page"/.test(it.attrs)) out.push('current page "' + it.name + '" is linked or not marked');
      return;
    }
    const href = (it.attrs.match(/href="([^"]+)"/) || [])[1];
    if (it.tag !== 'a' || !href) { out.push('"' + it.name + '" has no link'); return; }
    const to = rel(page.file, href);
    if (to !== want.file) out.push('"' + it.name + '" -> ' + to + ', expected ' + want.file);
    if (!exists(to)) out.push('"' + it.name + '" -> missing file ' + to);
  });
  return { rows: items.length, failed: out };
}

function run(tag, files) {
  const exists = (f) => Object.prototype.hasOwnProperty.call(files, f) ? files[f] != null : fs.existsSync(path.join(ROOT, f));
  const read = (f) => Object.prototype.hasOwnProperty.call(files, f) ? files[f] : (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : null);
  let judged = 0, failed = 0; const res = {};
  DOORS.forEach((d) => {
    const t = read(d.file); const r = t == null ? { rows: 0, failed: ['door missing'] } : judgeDoor(d, t, exists);
    judged += r.rows ? 1 : 0; failed += r.failed.length ? 1 : 0; res['U1 ' + d.file] = r.failed;
    if (!tag) console.log('§DOORURL-U1 door=/' + path.posix.dirname(d.file) + '/ target=' + d.target + ' ' + (r.failed.length ? 'FAIL ' + r.failed.join('; ') : 'PASS'));
  });
  PAGES.forEach((p) => {
    const t = read(p.file); const r = t == null ? { rows: 0, failed: ['page missing'] } : judgePage(p, t, exists);
    judged += r.rows ? 1 : 0; failed += r.failed.length ? 1 : 0; res['U2 ' + p.file] = r.failed;
    if (!tag) console.log('§DOORURL-U2 page=' + p.file + ' items=' + r.rows + ' ' + (r.failed.length ? 'FAIL ' + r.failed.join('; ') : 'PASS'));
  });
  return { judged, failed, res };
}

const base = run(null, {});
const expected = DOORS.length + PAGES.length;
console.log('§DOORURL-U3 doorsJudged+pagesJudged=' + base.judged + ' of ' + expected);

let mutantsLine = '';
if (process.env.DOORURL_MUTANTS === '1') {
  const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const M = [
    ['door drops the hash', 'U1', { 'history/index.html': rd('history/index.html').replace(" + location.hash", '') }],
    ['door to a missing page', 'U1', { 'erp/sheet_addin/file_it.html': null }],
    ['row link to a missing file', 'U2', { 'pdf/index.html': rd('pdf/index.html').replace('../erp/sheet_addin/history.html"', '../erp/sheet_addin/histroy.html"') }],
    ['current page linked', 'U2', { 'erp/sheet_addin/history.html': rd('erp/sheet_addin/history.html').replace('<b aria-current="page">Sheet history</b>', '<a href="history.html">Sheet history</a>') }]
  ];
  let killed = 0;
  M.forEach(([name, by, files]) => {
    const r = run(name, files);
    const hit = Object.keys(r.res).filter((k) => k.startsWith(by) && r.res[k].length);
    if (hit.length) killed++;
    console.log('§DOORURL-MUTANT "' + name + '" ' + (hit.length ? 'KILLED by ' + hit.join(',') : 'SURVIVED'));
  });
  mutantsLine = ' mutants=' + killed + '/' + M.length;
  if (killed !== M.length) base.failed++;
}

const verdict = base.judged === 0 ? 'INCONCLUSIVE' : (base.failed || base.judged !== expected ? 'FAIL' : 'PASS');
console.log('§DOORURL-VERDICT ' + verdict + ' judged=' + base.judged + ' failed=' + base.failed + mutantsLine);
process.exit(verdict === 'PASS' ? 0 : 1);
