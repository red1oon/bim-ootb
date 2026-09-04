#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — prompts/AGENT_QUEUE.md §AGENT-ZIPS-BUILT (owns §ERP-SESSION-CLOSE-2 §C2.3 item 5).
//
// WHY THIS EXISTS, and what it already caught. erp/odoo_agent.zip and erp/idempiere_agent.zip are SHIPPED
// DOWNLOADS (common/about_diy.js:196-198, erp/erp_picker.js:318) that DUPLICATE erp/odoo_agent/ and
// erp/idempiere_agent/. §C2.3 item 5 proposed building them at deploy time to remove the duplication
// without removing the feature. Measured before writing a line: **odoo_agent.zip was STALE — all six of
// its files differed from the directory it duplicates.** The duplication had already drifted, silently,
// and a user downloading the Odoo agent was getting something other than the source in the repo.
//
// Deterministic on purpose: fixed timestamps, sorted entry order, deflate level 9. The same directory
// always produces byte-identical bytes, so "did the zip drift" is a hash comparison, not a judgement —
// which is what W-AGENT-ZIP-SYNC asserts. No dependency: node's own zlib plus the ZIP container written
// out here (a `zip` or `python3` binary cannot be assumed on every runner).
//
//   node erp/tools/build_agent_zips.js          build both into erp/
//   node erp/tools/build_agent_zips.js --check   build in memory and REPORT drift, writing nothing
'use strict';
var fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');

var ERP = path.join(__dirname, '..');
// SHAPE IS PER-BUNDLE, and both are now NESTED. §AZ.3 asked the owner whether idempiere_agent.zip should
// stop being FLAT; answered YES, 2026-09-04. It is not only cosmetic — the shipped instruction for that
// download has ALWAYS said `cd idempiere_agent && npm install && node migrate_agent.js --masters`
// (common/about_diy.js:199) while the zip put migrate_agent.js at the ROOT, so there was no directory to
// cd into and the three files landed loose in whatever directory the user was standing in. Nesting makes
// the instruction the app already prints CORRECT. `prefix` stays per-bundle so the shape is stated data,
// never an assumption baked into the writer.
var BUNDLES = [{ dir: 'idempiere_agent', zip: 'idempiere_agent.zip', prefix: 'idempiere_agent/' },
                { dir: 'odoo_agent', zip: 'odoo_agent.zip', prefix: 'odoo_agent/' }];
// A FIXED DOS timestamp (1980-01-01 00:00), so the bytes depend on CONTENT only. A real mtime would make
// every rebuild a different file and turn the drift check into noise.
var DOS_TIME = 0, DOS_DATE = 0x0021;

function crc32(buf) {
  var t = crc32.tab || (crc32.tab = (function () {
    var c, tab = [];
    for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); tab[n] = c >>> 0; }
    return tab;
  })());
  var c = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// zipOf(dirAbs) -> Buffer. Entries are the directory's own files, sorted by name (no recursion: every
// agent bundle is flat, and inventing a nesting rule for a shape that does not exist would be inventing).
function zipOf(dirAbs, prefix) {
  prefix = prefix || '';
  var files = fs.readdirSync(dirAbs).filter(function (n) {
    return fs.statSync(path.join(dirAbs, n)).isFile();
  }).sort();
  // a nested bundle carries the directory entry the original does (a zero-length, stored entry)
  var names = (prefix ? [prefix] : []).concat(files.map(function (n) { return prefix + n; }));
  var locals = [], central = [], offset = 0;
  names.forEach(function (name) {
    var isDir = name.slice(-1) === '/';
    var raw = isDir ? Buffer.alloc(0) : fs.readFileSync(path.join(dirAbs, name.slice(prefix.length)));
    var def = isDir ? Buffer.alloc(0) : zlib.deflateRawSync(raw, { level: 9 });
    var nb = Buffer.from(name, 'utf8'), crc = crc32(raw);
    var lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(isDir ? 0 : 8, 8); lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(def.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nb, def);
    var ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(isDir ? 0 : 8, 10); ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(def.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nb.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nb);
    offset += 30 + nb.length + def.length;
  });
  var cd = Buffer.concat(central), lo = Buffer.concat(locals);
  var end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(lo.length, 16); end.writeUInt16LE(0, 20);
  return { buf: Buffer.concat([lo, cd, end]), names: names };
}

function sha(b) { return crypto.createHash('sha256').update(b).digest('hex').slice(0, 16); }

// contentOf(zipBuf) -> { name: sha } — read an EXISTING zip through its central directory (never the local
// headers, because a zip written by the `zip` CLI may use data descriptors and carry zeroed local sizes).
// This is what makes the drift check meaningful: the tracked zips were produced by a DIFFERENT zipper, so
// their container bytes can never match this builder's even when every file inside is identical. CONTENT
// is the claim — "what a user downloads is what the repo says" — and container bytes are not.
function contentOf(buf) {
  var i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) return null;
  var n = buf.readUInt16LE(i + 10), off = buf.readUInt32LE(i + 16), out = {};
  for (var k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) return null;
    var method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    var nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    var name = buf.slice(off + 46, off + 46 + nlen).toString('utf8');
    var lho = buf.readUInt32LE(off + 42);
    var lnlen = buf.readUInt16LE(lho + 26), lelen = buf.readUInt16LE(lho + 28);
    var data = buf.slice(lho + 30 + lnlen + lelen, lho + 30 + lnlen + lelen + csize);
    out[name] = sha(method === 0 ? data : zlib.inflateRawSync(data));
    off += 46 + nlen + elen + clen;
  }
  return out;
}

// run(check) -> [{ zip, files, bytes, sha, onDisk, drift }]
function run(check) {
  return BUNDLES.map(function (b) {
    var built = zipOf(path.join(ERP, b.dir), b.prefix);
    var out = path.join(ERP, b.zip);
    var wantContent = contentOf(built.buf);
    var haveContent = fs.existsSync(out) ? contentOf(fs.readFileSync(out)) : null;
    var stale = [];
    if (haveContent) {
      Object.keys(wantContent).forEach(function (k) { if (haveContent[k] !== wantContent[k]) stale.push(haveContent[k] === undefined ? k + '(missing)' : k); });
      Object.keys(haveContent).forEach(function (k) { if (wantContent[k] === undefined) stale.push(k + '(extra)'); });
    }
    if (!check) fs.writeFileSync(out, built.buf);
    return { zip: b.zip, dir: b.dir, files: built.names, bytes: built.buf.length,
             sha: sha(built.buf), present: !!haveContent, stale: stale, drift: !!haveContent && stale.length > 0 };
  });
}

module.exports = { run: run, zipOf: zipOf, contentOf: contentOf, BUNDLES: BUNDLES, ERP: ERP };

if (require.main === module) {
  var check = process.argv.indexOf('--check') >= 0;
  var res = run(check);
  res.forEach(function (r) {
    console.log('§AGENT-ZIP ' + r.zip + ' files=' + r.files.length + ' [' + r.files.join(',') + '] bytes=' + r.bytes +
      ' sha=' + r.sha + ' onDisk=' + (r.present ? 'present' : 'absent') +
      (check ? (r.drift ? ' DRIFT=Y stale=[' + r.stale.join(',') + ']' : ' DRIFT=N') : ' written=Y'));
  });
  if (check && res.some(function (r) { return r.drift; })) {
    console.log('🔴 a shipped agent zip does not match the directory it duplicates — run this without --check');
    process.exit(1);
  }
  console.log('🟢 ' + (check ? 'both agent zips match their source directories' : 'both agent zips built from source'));
}
