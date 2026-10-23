// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2bim_import.js — DXF2BIM lane L3 (prompts/DXF2BIM_MODELLER_LANE.md §L3 "L3 build spec"): the ORCHESTRATION of BIMCompiler
// tests/dxf2bim/rosetta_dx_shell.js pipeline() (variant A, the main model), ported so the Modeller runs the SAME basic-shapes
// pipeline on dropped DXF files. Every geometric rule lives in the verbatim modules under dxf2bim/ (see dxf2bim/SOURCE.md);
// every number comes from dxf2bim/dxf2shell_config.js. This file only: reads sheets, assigns roles from DXF2BIM-MARK markings,
// gates, calls the modules in the witness's order, and maps the result to the Modeller's ARC-seed op form (toOps).
// UMD: Node (witness C1-PORT) and the page (window.Dxf2BimImport). Pure: no DOM, no THREE, no network (loadOci takes an injected fetchJson).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({ DxfParser: require('./lib/dxf-parser.js'), B: require('./dxf2bim/dxf2bim.js'), MK: require('./dxf2bim/dxf2marks.js'),
      E: require('./dxf2bim/dxf2elev.js'), M: require('./dxf2bim/dxf2mesh.js'), T: require('./dxf2bim/dxf2types.js'), S: require('./dxf2bim/dxf2shell.js'),
      C: require('./dxf2bim/dxf2shell_config.js'), Q: require('./dxf2bim/dxf2qualify.js'), REF: require('./element_defaults.json'), SREF: require('./synthetic_ref.json') });
  } else {
    root.Dxf2BimImport = factory({ DxfParser: root.DxfParser, B: root.Dxf2Bim, MK: root.Dxf2Marks, E: root.Dxf2Elev, M: root.Dxf2Mesh, T: root.Dxf2Types, S: root.Dxf2Shell, C: root.Dxf2ShellConfig, Q: root.Dxf2Qualify });
  }
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';
  var TAG = '§DXF-IMPORT';
  var DxfParser = L.DxfParser, B = L.B, MK = L.MK, E = L.E, M = L.M, T = L.T, S = L.S, C = L.C, Q = L.Q;
  // F6 D11: a plan states the thinnest wall piece it reads as a wall (@WALLMIN, metres); without it the set config stands
  function exOf(desc) { return desc && desc.excludes && desc.excludes.length ? desc.excludes : undefined; }   // §D58 the user's @EXCLUDE rectangles reach every plan run (absent when none: run_id unchanged)
  function cfgFor(desc) { var w = desc && desc.wallmin !== undefined ? Number(desc.wallmin) : NaN; return isFinite(w) && w > 0 ? Object.assign({}, C.CFG, { wall: Object.assign({}, C.CFG.wall, { min_thickness: w }) }) : C.CFG; }

  // ---- SHA-256 (FIPS 180-4), synchronous, over the UTF-8 bytes of a string: the modules need a sync hashHex (crypto.subtle is async).
  // Equality with Node crypto is witnessed by C1 (run_id hashes every sheet text and every storey run id).
  var KS = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var out = [], i, c; s = unescape(encodeURIComponent(s)); for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); out.push(c); } return new Uint8Array(out);
  }
  function sha256Hex(str) {
    var msg = utf8(str), n = msg.length, nb = ((n + 9 + 63) >> 6) << 6, buf = new Uint8Array(nb), w = new Int32Array(64), i, j, t;
    buf.set(msg); buf[n] = 0x80;
    var bits = n * 8, hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
    buf[nb - 8] = hi >>> 24; buf[nb - 7] = (hi >>> 16) & 255; buf[nb - 6] = (hi >>> 8) & 255; buf[nb - 5] = hi & 255;
    buf[nb - 4] = lo >>> 24; buf[nb - 3] = (lo >>> 16) & 255; buf[nb - 2] = (lo >>> 8) & 255; buf[nb - 1] = lo & 255;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    for (i = 0; i < nb; i += 64) {
      for (j = 0; j < 16; j++) w[j] = (buf[i + 4 * j] << 24) | (buf[i + 4 * j + 1] << 16) | (buf[i + 4 * j + 2] << 8) | buf[i + 4 * j + 3];
      for (j = 16; j < 64; j++) {
        var x = w[j - 15], y = w[j - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3), s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)), ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + KS[j] + w[j]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)), mj = (a & b) ^ (a & c) ^ (b & c);
        t = (S0 + mj) | 0; h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }

  var r6 = B.r6, J = JSON.stringify;
  var FACE_ORDER = ['minY', 'maxY', 'minX', 'maxX'];   // elevation order = the witness's FRONT, REAR, LEFT, RIGHT (deterministic, stated)
  function parse(text) { return new DxfParser().parseSync(text); }

  // ---- §L6 scoped sets: a storey drawn as a KEY sheet (@SCOPE=KEY: grid, dimensions, levels, every marking) + wing/zone sheets (@SCOPE=<name>,x0,y0,x1,y1: the elements they own).
  // Every sheet is a serialisation of ONE whole-storey document (same entity handles), so assembling = the KEY sheet + the geometry entities of every scope sheet (annotation layers of a
  // scope sheet, its grid copy, title and match lines, are display only and are dropped). Done BEFORE role detection: the merged sheet is an ordinary whole-storey plan to the rest.
  // Checks (blocking QF:, advisory): scope_no_key, scope_level_conflict, scope_overlap, scope_grid_disagree, scope_duplicate_piece | scope_gap.
  var SCOPE_TOL = 10;   // sheet units of the sheet (mm for the std set): rectangles/grid positions closer than this agree (the grid merge tolerance, L1.1 R5)
  function chunkDxf(text) {
    var L = String(text).split(/\r?\n/), start = -1, end = -1, i;
    for (i = 0; i + 3 < L.length; i += 2) {
      if (start < 0) { if (L[i].trim() === '0' && L[i + 1].trim() === 'SECTION' && L[i + 2].trim() === '2' && L[i + 3].trim() === 'ENTITIES') start = i + 4; }
      else if (L[i].trim() === '0' && L[i + 1].trim() === 'ENDSEC') { end = i; break; }
    }
    if (start < 0 || end < 0) return null;
    var ents = [], cur = null;
    for (i = start; i < end; i += 2) {
      if (L[i].trim() === '0') { cur = { lines: [], layer: null, handle: null }; ents.push(cur); }
      if (!cur) continue;
      cur.lines.push(L[i], L[i + 1]);
      var c = L[i].trim(); if (c === '8' && cur.layer === null) cur.layer = L[i + 1].trim(); if (c === '5' && cur.handle === null) cur.handle = L[i + 1].trim();
    }
    return { head: L.slice(0, start), ents: ents, tail: L.slice(end) };
  }
  function scopeOfText(text) {   // {level, scope:'KEY'|{name,rect}, grid:{X:{label:pos}, Y:{...}}} from the sheet's own markings, or null
    var dxf = parse(text), marks = MK.readMarks(dxf.entities), de = MK.describe(marks), d = de.desc;
    if (!d.scope || d.view !== 'PLAN') return null;
    var g = { X: d.gridsX || {}, Y: d.gridsY || {} };
    var sc = d.scope === 'KEY' ? 'KEY' : (function (a) { return { name: a[0], rect: a.slice(1).map(Number) }; })(String(d.scope).split(','));
    return { level: d.level, base: String(d.name || '').split('__')[0] || ('L' + d.level), scope: sc, grid: g, desc: d };
  }
  function mergeScopes(files) {
    var rep = { blocking: [], advisory: [], groups: [] }, info = files.map(function (f) { var o = null; try { o = scopeOfText(f.text); } catch (e) { o = null; } return o; });
    var groups = {}; files.forEach(function (f, i) { if (info[i]) (groups[info[i].base] = groups[info[i].base] || []).push(i); });   // a KEY and its wings share @NAME up to '__'
    var drop = {}, merged = {}, add = function (arr, code, sheet, msg) { arr.push({ code: code, sheet: sheet, message: msg }); };
    Object.keys(groups).forEach(function (lv) {
      var idx = groups[lv], keys = idx.filter(function (i) { return info[i].scope === 'KEY'; }), scs = idx.filter(function (i) { return info[i].scope !== 'KEY'; });
      if (keys.length !== 1) { add(rep.blocking, 'QF:scope_no_key', files[idx[0]].name, 'storey ' + lv + ': ' + keys.length + ' KEY sheets (@SCOPE=KEY: exactly one per scoped storey)'); return; }
      var K = keys[0], kinfo = info[K], kc = chunkDxf(files[K].text), grp = { level: kinfo.level, name: lv, key: files[K].name, scopes: scs.map(function (i) { return files[i].name; }) };
      rep.groups.push(grp);
      if (!kc) { add(rep.blocking, 'QF:scope_no_key', files[K].name, 'the KEY sheet has no ENTITIES section'); return; }
      scs.forEach(function (i) { if (r6(info[i].desc.level) !== r6(kinfo.desc.level)) add(rep.blocking, 'QF:scope_level_conflict', files[i].name, 'scope ' + info[i].scope.name + ' @LEVEL=' + info[i].desc.level + ' but the KEY sheet @LEVEL=' + kinfo.desc.level); });
      for (var a = 0; a < scs.length; a++) for (var b = a + 1; b < scs.length; b++) {
        var A = info[scs[a]].scope.rect, Bq = info[scs[b]].scope.rect, ow = Math.min(A[2], Bq[2]) - Math.max(A[0], Bq[0]), oh = Math.min(A[3], Bq[3]) - Math.max(A[1], Bq[1]);
        if (ow > SCOPE_TOL && oh > SCOPE_TOL) add(rep.blocking, 'QF:scope_overlap', files[scs[b]].name, 'scopes ' + info[scs[a]].scope.name + ' and ' + info[scs[b]].scope.name + ' overlap by ' + Math.round(ow) + ' x ' + Math.round(oh));
      }
      var area = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      scs.forEach(function (i) { var r = info[i].scope.rect; area += (r[2] - r[0]) * (r[3] - r[1]); x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[2]); y1 = Math.max(y1, r[3]); });
      if (scs.length && (x1 - x0) * (y1 - y0) - area > SCOPE_TOL * (x1 - x0 + y1 - y0)) add(rep.advisory, 'QF:scope_gap', files[K].name, 'storey ' + lv + ': the scopes leave ' + Math.round(((x1 - x0) * (y1 - y0) - area) / 1e6) + ' m2 of their bounding rectangle undrawn');
      scs.forEach(function (i) {
        ['X', 'Y'].forEach(function (ax) { Object.keys(info[i].grid[ax]).forEach(function (lab) {
          var kp = kinfo.grid[ax][lab], sp = info[i].grid[ax][lab];
          if (kp === undefined || Math.abs(kp - sp) > SCOPE_TOL) add(rep.blocking, 'QF:scope_grid_disagree', files[i].name, 'grid ' + ax + lab + ' is at ' + sp + ' on scope ' + info[i].scope.name + ' but ' + (kp === undefined ? 'absent on the KEY sheet' : kp + ' on the KEY sheet'));
        }); });
      });
      var seen = {}; kc.ents.forEach(function (e) { if (e.handle) seen[e.handle] = files[K].name; });
      var extra = [];
      scs.forEach(function (i) {
        var c = chunkDxf(files[i].text); if (!c) { add(rep.blocking, 'QF:scope_no_key', files[i].name, 'no ENTITIES section'); return; }
        c.ents.forEach(function (e) {
          if (e.layer === 'A-GRID' || e.layer === 'DXF2BIM-MARK' || (e.layer && e.layer.indexOf('A-ANNO') === 0)) return;
          if (e.handle && seen[e.handle]) { add(rep.blocking, 'QF:scope_duplicate_piece', files[i].name, 'entity ' + e.handle + ' is also on ' + seen[e.handle]); return; }
          if (e.handle) seen[e.handle] = files[i].name; extra.push(e);
        });
      });
      var text = kc.head.slice();
      // the whole-storey entity order is the handle order of the writer (sequential): geometry sorted by handle, then the KEY's markings in their own order (pipeline outputs depend on entity order)
      var isScopeMark = function (e) { for (var q = 0; q + 1 < e.lines.length; q += 2) if (e.lines[q].trim() === '1' && /^@SCOPE=/.test(e.lines[q + 1].trim())) return true; return false; };
      var isMark = function (e) { return e.layer === 'DXF2BIM-MARK'; }, hv = function (e) { return e.handle ? parseInt(e.handle, 16) : Infinity; };
      var geo = kc.ents.filter(function (e) { return !isMark(e); }).concat(extra).map(function (e, n) { return { e: e, n: n }; }).sort(function (a, b) { return hv(a.e) - hv(b.e) || a.n - b.n; }).map(function (x) { return x.e; });
      geo.concat(kc.ents.filter(function (e) { return isMark(e) && !isScopeMark(e); })).forEach(function (e) { text = text.concat(e.lines); });
      text = text.concat(kc.tail);
      merged[K] = { name: files[K].name.replace(/__KEY(_std)?\.dxf$/i, '$1.dxf'), text: text.join('\n') };
      scs.forEach(function (i) { drop[i] = true; });
    });
    var out = []; files.forEach(function (f, i) { if (drop[i]) return; out.push(merged[i] || f); });
    return { files: out, report: rep };
  }

  // ---- R1-R4 sheet roles from DXF2BIM-MARK markings only ----
  function readSheet(name, text, hashHex, opts) {
    var dxf = parse(text), marks = MK.readMarks(dxf.entities), de = MK.describe(marks), d = de.desc, synth = null, shaIn = text;
    // §L7.9 line-work elevation/section: closed rectangle outlines are synthesised from the loose lines (on the members' own layer), so the reader's elevwall rule finds them
    var PR = (typeof self !== 'undefined' && self.Dxf2Prep) || (typeof require === 'function' && opts && opts.prep) || null;
    var wl = (d.layers || []).filter(function (l) { return l.type === 'elevwall' || l.type === 'sectwall'; }).map(function (l) { return l.layer; });
    if (PR && (d.view === 'ELEV' || d.view === 'SECTION') && wl.length && PR.hasLineWork(dxf.entities, wl)) {
      var ch = opts && opts.prepChoices && opts.prepChoices['loops.snap_tol'], tol = ch !== undefined && isFinite(Number(ch)) ? Number(ch) : PR.SNAP_TOL_DEFAULT;
      // member LINEs are replaced by their outline (the reader would otherwise read each loose line on an elevwall layer as a zero-area rectangle)
      var sy = PR.synthRects(dxf.entities, tol, wl); dxf.entities = dxf.entities.filter(function (e, i) { return !(e.type === 'LINE' && sy.consumed[i]); }).concat(sy.entities); shaIn = text + '|loops:' + tol;
      synth = { tol: tol, chosen: ch !== undefined, rects: sy.rects, nonRect: sy.nonRect, mixed: sy.mixed, loops: sy.loops, segments: sy.segments };
    }
    var sh = { name: name, text: text, sha: hashHex(shaIn), synth: synth, dxf: dxf, marks: marks.length, desc: d, errors: de.errors, role: null, why: null };
    // §L11 HATCH loops (dxf-parser has none): read from the text on elevations, where wall panels are drawn as hatches; the layers they sit on are listed so the user can type them
    var HH = (typeof self !== 'undefined' && self.Dxf2Hatch) || (typeof module === 'object' && module.exports ? require('./dxf2hatch.js') : null);
    if (HH && /\nHATCH\r?\n/.test(text)) { sh.hatches = HH.parseHatches(text); sh.hatchLayers = sh.hatches.hatches.reduce(function (o, h) { if (h.layer) o[h.layer] = (o[h.layer] || 0) + 1; return o; }, {}); }
    var missing = [], other = [];
    de.errors.forEach(function (e) { if (e.code === 'MARK:missing') missing = missing.concat(e.keys || []); else other.push(e.code + ' ' + (e.message || '')); });
    if (!marks.length) sh.why = 'no DXF2BIM-MARK marking';
    else if (other.length) sh.why = other.join('; ');
    else if (d.view === 'PLAN' && typeof d.level === 'number' && !missing.length) { sh.role = 'plan'; sh.level = d.level; }
    else if (d.view === 'ELEV' && d.face && !missing.length) { sh.role = 'elev'; sh.face = d.face; }
    else if (d.view === 'ROOF' && typeof d.roof === 'number' && !missing.length) { sh.role = 'roof'; sh.roofZ = d.roof; }   // BIMCompiler #182 (lane L2.3 D1): @VIEW=ROOF + @LEVEL + @ROOF
    else if (d.view === 'SECTION' && d.cut && !missing.length) { sh.role = 'section'; sh.cut = d.cut; }
    else if (d.view === 'DRAWING' && !missing.length) { sh.role = 'drawing'; }   // §F7: a drawing issued for reading (the view at the plane): listed, never converted   // §L3.3 R5: @VIEW=SECTION (NEED SET,VIEW,UNITS,HAXIS,CUT + GRIDH, Z)
    else sh.why = 'markings name no role (view=' + d.view + (missing.length ? ', missing ' + missing.join(',') : '') + ')';
    if (sh.role && !(d.units in MK.UNITS)) { sh.role = null; sh.why = 'no @UNITS'; }
    if (sh.role) sh.factor = MK.UNITS[d.units];
    return sh;
  }
  // §L1.16: the wing frame a set was drawn in, from @FRAME=<deg>,<x mm>,<y mm> on its sheets (every sheet that has one must agree; mm sheets only). null = not a wing set.
  function frameOfSheets(sheets) {
    var fr = null, bad = null;
    sheets.forEach(function (sh) {
      var f = sh.desc && sh.desc.frame; if (!f) return;
      var p = String(f).split(',').map(Number), mm = sh.desc.units === 'mm';
      if (!mm) { bad = bad || { sheet: sh.name, reason: '@FRAME needs @UNITS=mm' }; return; }
      var c = { angle: p[0], ox: p[1] / 1000, oy: p[2] / 1000, sheet: sh.name };
      if (fr && (Math.abs(fr.angle - c.angle) > 1e-9 || Math.abs(fr.ox - c.ox) > 1e-9 || Math.abs(fr.oy - c.oy) > 1e-9)) bad = bad || { sheet: sh.name, reason: '@FRAME differs from ' + fr.sheet };
      fr = fr || c;
    });
    return bad ? { error: bad } : fr;
  }
  function readSheets(files, opts) {
    var hashHex = (opts && opts.hashHex) || sha256Hex, m = mergeScopes(files);   // §L6: scoped storeys are assembled first
    var out = m.files.map(function (f) { return readSheet(f.name, f.text, hashHex, opts); });
    out.scopeReport = m.report; return out;
  }
  // §L3.3 layer-map set (DX or STD): the set whose elevation-wall layer (its MAP_ELEV 'elevwall' rule, read from the copied config) has
  // entities on EVERY elevation sheet; both or neither -> null (the gate refuses, no guess).
  var SETS = { DX: { MAP_PLAN: C.MAP_PLAN, MAP_ELEV: C.MAP_ELEV, MAP_LEVL: C.MAP_LEVL, MAP_ROOF: C.MAP_ROOF, MAP_SECT: C.STD.MAP_SECT, EXCL_ELEV: null, QUALIFY: C.QUALIFY, maps: undefined },
    STD: { MAP_PLAN: C.STD.MAP_PLAN, MAP_ELEV: C.STD.MAP_ELEV, MAP_LEVL: C.STD.MAP_LEVL, MAP_ROOF: C.STD.MAP_ROOF, MAP_SECT: C.STD.MAP_SECT, EXCL_ELEV: C.STD.EXCL_ELEV, QUALIFY: C.STD.QUALIFY, CURTAIN: C.STD.CURTAIN,
      maps: { plan: C.STD.MAP_PLAN, elev: C.STD.MAP_ELEV, levl: C.STD.MAP_LEVL, roof: C.STD.MAP_ROOF, sect: C.STD.MAP_SECT } } };
  function elevWallLayers(map) { return map.rules.filter(function (r) { return r.type === 'elevwall' && r.match === 'exact'; }).map(function (r) { return r.pattern; }); }
  function setOf(sheets) {
    var el = sheets.filter(function (s) { return s.role === 'elev'; });
    var fit = Object.keys(SETS).filter(function (k) { var ly = elevWallLayers(SETS[k].MAP_ELEV);
      return el.length && el.every(function (s) { return s.dxf.entities.some(function (e) { return ly.indexOf(e.layer) >= 0; }); }); });
    return { name: fit.length === 1 ? fit[0] : null, fits: fit, layers: Object.keys(SETS).map(function (k) { return k + ':' + elevWallLayers(SETS[k].MAP_ELEV).join('|'); }) };
  }
  // §L4.2: layer rules are @LAYER markings now (Dxf2Marks.withLayers per sheet); the L4.1 session rules are gone. setWith = the set by name.
  function setWith(name) { return SETS[name] || null; }
  // §D53 best-effort materials. opts.ref = synthetic_ref.json (the page passes its loaded copy; Node: the shipped one), opts.catalogue = a firm catalogue (modeller/tools/catalogue_from_ifc.js).
  // A wall / slab whose drawn thickness has a catalogue row takes its most frequent material (the count stated); otherwise the reference's material for its class. Geometry is never touched.
  var MAT_TAB = { IfcWall: 'walls', IfcSlab: 'slabs' };
  function thicknessMm(e) {
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];   // a loop, not Math.max.apply: an estimated slab (D51) has more vertices than the call stack takes (LTU)
    e.vertices.forEach(function (v) { v.forEach(function (c, k) { if (c < lo[k]) lo[k] = c; if (c > hi[k]) hi[k] = c; }); });
    var dx = hi[0] - lo[0], dy = hi[1] - lo[1], dz = hi[2] - lo[2];
    return Math.round((e.class === 'IfcSlab' || e.class === 'IfcRoof' ? dz : Math.min(dx, dy)) * 1000);
  }
  function applyMaterials(els, opts) {
    var ref = (opts && opts.ref) || L.SREF, cat = opts && opts.catalogue;
    if (!ref || !ref.parts) return;
    els.forEach(function (e) {
      if (!e.vertices || !e.vertices.length || e.ifc && e.ifc.material) return;
      var part = ref.parts[e.class]; if (!part && !MAT_TAB[e.class]) return;
      var t = thicknessMm(e), rows = cat && MAT_TAB[e.class] && cat[MAT_TAB[e.class]] && cat[MAT_TAB[e.class]][String(t)];
      if (rows && rows.length && rows[0].material) {
        var tot = rows.reduce(function (a, r) { return a + r.n; }, 0);
        e.ifc = Object.assign({ ifc_class: e.class }, e.ifc, { material: rows[0].material, type_name: rows[0].type || undefined, material_source: (cat.name || 'catalogue') + ': ' + rows[0].n + ' of ' + tot + ' ' + MAT_TAB[e.class] + ' of ' + t + ' mm',
          material_alt: rows.length > 1 ? rows.slice(1).map(function (r) { return r.n + 'x ' + r.material; }) : undefined, thickness_mm: t });
      } else if (part) e.ifc = Object.assign({ ifc_class: e.class }, e.ifc, { material: part.material, material_source: 'reference (synthetic_ref.json ' + e.class + ')', thickness_mm: t });
    });
  }
  // §D71 the 2D panel's "Load catalogue": a firm catalogue (tools/catalogue_from_ifc.js) is taken whole or refused with the reason, never half-loaded
  function catalogueCheck(j) {
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, reason: 'not a JSON object' };
    if (j.version !== 1) return { ok: false, reason: 'version ' + JSON.stringify(j.version) + ' (this reader takes version 1, as tools/catalogue_from_ifc.js writes)' };
    var counts = {}, rows = 0, bad = null;
    ['walls', 'slabs', 'doors'].forEach(function (tab) {
      var T = j[tab]; if (bad) return;
      if (T === undefined) { counts[tab] = 0; return; }
      if (!T || typeof T !== 'object' || Array.isArray(T)) { bad = tab + ' is not an object keyed by mm'; return; }
      var keys = Object.keys(T); counts[tab] = keys.length;
      keys.forEach(function (k) {
        if (bad) return;
        if (!/^\d+$/.test(k)) { bad = tab + ' key ' + JSON.stringify(k) + ' is not a whole number of mm'; return; }
        if (!Array.isArray(T[k]) || !T[k].length) { bad = tab + '[' + k + '] is not a list of rows'; return; }
        T[k].forEach(function (r) { if (bad) return; if (!r || typeof r.n !== 'number' || !(r.n > 0)) bad = tab + '[' + k + '] has a row with no count n'; else rows++; });
      });
    });
    if (bad) return { ok: false, reason: bad };
    if (!rows) return { ok: false, reason: 'no rows in walls / slabs / doors' };
    return { ok: true, name: typeof j.name === 'string' && j.name ? j.name : 'catalogue', counts: counts, rows: rows };
  }
  // §D51 the best-effort slab setting: a plan's @DEFAULT > the registry the caller passes (opts.defaultsRef, the page's element_defaults.json) > the registry shipped with this module > walls_bounded
  var SLAB_OUTLINE_KEY = 'slab.outline_when_not_rect', WALLTOP_KEY = 'wall.top_when_unseen', UNDERSIDE_KEY = 'slab.underside_when_stepped';
  function settingOf(sheets, opts, key, fallback) {   // a plan's @DEFAULT > opts.defaultsRef (the page's element_defaults.json) > the shipped registry > the fallback
    var st = null; (sheets || []).forEach(function (sh) { ((sh.desc && sh.desc.defaults) || []).forEach(function (q) { if (q.key === key && st === null) st = q.value; }); });
    if (st !== null) return st;
    var ref = (opts && opts.defaultsRef) || L.REF, e = ref && ref.defaults && ref.defaults[key];
    return e && e.value ? e.value : fallback;
  }
  function slabOutlineSetting(sheets, opts) { return settingOf(sheets, opts, SLAB_OUTLINE_KEY, 'walls_bounded'); }
  function curtainLayer(set, layer) { return !!(set && set.CURTAIN && set.CURTAIN.indexOf(layer) >= 0); }   // §D45
  function gate(sheets, opts) {   // opts.set: the set the USER states (editor); otherwise from the elevation-wall layer evidence
    var userSet = opts && opts.set && SETS[opts.set] ? opts.set : null;
    var refused = sheets.filter(function (s) { return !s.role; }).map(function (s) { return { sheet: s.name, reason: s.why }; });
    ((sheets.scopeReport && sheets.scopeReport.blocking) || []).forEach(function (b) { refused.push({ sheet: b.sheet, reason: b.code + ': ' + b.message }); });   // §L6
    var n = function (r) { return sheets.filter(function (s) { return s.role === r; }).length; };
    if (!n('plan')) refused.push({ sheet: '(set)', reason: 'no storey plan (@VIEW=PLAN + @LEVEL)' });
    if (!n('elev')) refused.push({ sheet: '(set)', reason: 'no elevation (@VIEW=ELEV + @FACE)' });
    if (n('roof') !== 1) refused.push({ sheet: '(set)', reason: 'roof plans=' + n('roof') + ' (need exactly 1: @VIEW=ROOF + @LEVEL + @ROOF)' });
    var lv = {}; sheets.filter(function (s) { return s.role === 'plan'; }).forEach(function (s) { if (lv[s.level]) refused.push({ sheet: s.name, reason: 'two plans at @LEVEL=' + s.level }); lv[s.level] = 1; });
    var fc = {}; sheets.filter(function (s) { return s.role === 'elev'; }).forEach(function (s) { if (fc[s.face]) refused.push({ sheet: s.name, reason: 'two elevations on @FACE=' + s.face }); fc[s.face] = 1; });
    if (n('section') > 1) refused.push({ sheet: '(set)', reason: 'sections=' + n('section') + ' (at most 1: @VIEW=SECTION)' });
    var so = n('elev') ? setOf(sheets) : null;
    if (userSet) return { ok: refused.length === 0, refused: refused, set: userSet, setFrom: 'user', evidence: so ? so.name : null };
    if (so && !so.name) refused.push({ sheet: '(set)', reason: 'layer set ambiguous: elevation-wall layers ' + so.layers.join(', ') + ' fit ' + (so.fits.join('+') || 'none') + ' on every elevation' });
    return { ok: refused.length === 0, refused: refused, set: so ? so.name : null, setFrom: 'evidence' };
  }
  // §L4.1: the verdict when the pipeline does NOT run (roles incomplete, or the pipeline refused): the gaps are UNKNOWN, so one blocking
  // GAP:pipeline_not_run {reason} stands for them (never a silent pass); markings, layers, units, dimension and grid checks still run.
  function qualifyNotRun(sheets, opts) {
    opts = opts || {};
    var SET = setWith(opts.set), CFG = C.CFG, files = [], planOps = {};
    var mapsOf = function (v) { return !SET ? null : v === 'PLAN' ? [SET.MAP_PLAN] : v === 'ROOF' ? [SET.MAP_ROOF] : v === 'SECTION' ? [SET.MAP_SECT] : v === 'ELEV' ? [SET.MAP_ELEV, SET.MAP_LEVL].concat(SET.EXCL_ELEV ? [SET.EXCL_ELEV] : []) : null; };
    sheets.slice().sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }).forEach(function (sh) {
      var f = { name: sh.name, dxf: sh.dxf }, lm = mapsOf(sh.desc.view); if (lm) f.layer_maps = lm; files.push(f);
      if (SET && sh.desc.view === 'PLAN') { try { planOps[sh.name] = B.run(sh.text, MK.withLayers(SET.MAP_PLAN, sh.desc), cfgFor(sh.desc), { exclude: exOf(sh.desc), DxfParser: DxfParser, hashHex: opts.hashHex || sha256Hex, library: [] }).ops; } catch (e) { /* qualify: check_skipped */ } }
    });
    return Q.qualify({ files: files, plan_ops: planOps, gaps: [{ code: 'GAP:pipeline_not_run', reason: opts.why || 'pipeline not run' }], resolved: {} }, SET ? SET.QUALIFY : C.QUALIFY);
  }

  // §L4.3 the door openings of ONE plan sheet as the reader sees them (Dxf2Bim.run with the set's plan map + the sheet's @LAYER rules):
  // the editor's Doors section resolves a canvas click and places a @TAG with the reader's own door geometry. Pure; metres.
  function planDoors(sheet, setName, opts) {
    var SET = setWith(setName); if (!SET || !sheet || sheet.desc.view !== 'PLAN' || !(sheet.desc.units in MK.UNITS)) return null;
    var run = B.run(sheet.text, MK.withLayers(SET.MAP_PLAN, sheet.desc), cfgFor(sheet.desc), { exclude: exOf(sheet.desc), DxfParser: DxfParser, hashHex: (opts && opts.hashHex) || sha256Hex, library: [] });
    return { factor: MK.UNITS[sheet.desc.units], snap_tol: C.CFG.snap_tol, doors: run.ops.filter(function (o) { return o.op_type === 'DXF_OPENING' && o.params.kind === 'door' && o.params.hinge; }).map(function (o) {
      var P = o.params; return { handle: P.handle, hinge: P.hinge, width: P.width, swing_start_deg: P.swing_start_deg, swing_end_deg: P.swing_end_deg, opening_box: P.opening_box || null }; }),
      windows: run.ops.filter(function (o) { return o.op_type === 'DXF_OPENING' && o.params.kind === 'window' && o.params.bbox; }).map(function (o) {   // §D56 the window clusters (§D55) of the same run: width = the drawn long side
        var b = o.params.bbox; return { handle: o.params.handle, bbox: b.slice(), width: Math.max(b[2] - b[0], b[3] - b[1]) }; }) };
  }

  // ---- §L4.4 a Tag-tool click on an ELEVATION opening → the plan position + z the reader binds (pure; the reader's own functions) ----
  // plans: described PLAN sheets ({name, text, dxf, desc}); elev: the described ELEV sheet; handle: the picked entity. Returns
  // {ok, cls, plan, x, y (plan drawing units), z (m), elevHandles, opening, p:[p0,p1], why}. Never guesses: none / a tie → ok:false + why.
  function footprintOf(op) {   // = Dxf2Types footprint (window: bbox, else centre/width/depth); door: its drawn opening box, else the swing box
    var p = op.params;
    if (p.kind === 'door' && p.hinge) {
      var b = p.opening_box; if (b) { var L = b.along || b.s; return b.axis === 'x' ? [L[0], b.band[0], L[1], b.band[1]] : [b.band[0], L[0], b.band[1], L[1]]; }
      var H = p.hinge, pts = [H].concat([p.swing_start_deg, p.swing_end_deg].map(function (a) { return [H[0] + p.width * Math.cos(a * Math.PI / 180), H[1] + p.width * Math.sin(a * Math.PI / 180)]; }));
      return [Math.min.apply(null, pts.map(function (q) { return q[0]; })), Math.min.apply(null, pts.map(function (q) { return q[1]; })), Math.max.apply(null, pts.map(function (q) { return q[0]; })), Math.max.apply(null, pts.map(function (q) { return q[1]; }))];
    }
    if (p.bbox) return p.bbox;
    if (p.centre && typeof p.width === 'number' && typeof p.depth === 'number') {
      var hx = (p.angle_deg === 90 ? p.depth : p.width) / 2, hy = (p.angle_deg === 90 ? p.width : p.depth) / 2;
      return [p.centre[0] - hx, p.centre[1] - hy, p.centre[0] + hx, p.centre[1] + hy];
    }
    return null;
  }
  function elevPick(plans, elev, setName, handle) {
    var SET = setWith(setName), no = function (why) { return { ok: false, why: why }; };
    if (!SET) return no('no layer-map set');
    var P = plans.filter(function (s) { return s && s.desc && s.desc.view === 'PLAN' && typeof s.desc.level === 'number' && (s.desc.units in MK.UNITS); }).sort(function (a, b) { return a.desc.level - b.desc.level; });
    if (!P.length) return no('no plan with @LEVEL and @UNITS');
    if (!elev || !elev.desc || elev.desc.view !== 'ELEV' || !elev.desc.face) return no('not an elevation with @FACE');
    var al = MK.align(P[0].desc, elev.desc, C.MARK_ALIGN_TOL);
    if (!al.map || !al.map.zOf) return no('the elevation does not align with plan ' + P[0].name);
    var em = MK.withLayers(SET.MAP_ELEV, elev.desc), cls = null, cl = null;
    [['glazing', 'window'], ['elevdoor', 'door']].forEach(function (t) {
      if (cl) return; var c = E.elevClusters(elev.dxf.entities, em, al.map, C.CFG.snap_tol, t[0]).filter(function (q) { return q.handles.indexOf(handle) >= 0; })[0];
      if (c) { cl = c; cls = t[1]; } });
    if (!cl) return no('handle ' + handle + ' is not on an opening layer of this elevation (glazing / door)');
    var z = Math.round((cl.z0 + cl.z1) / 2 * 1e4) / 1e4;
    var pl = P.filter(function (s) { return s.desc.level <= z; }).pop();
    if (!pl) return no('z ' + z + ' is below the lowest plan level ' + P[0].desc.level);
    var run = B.run(pl.text, MK.withLayers(SET.MAP_PLAN, pl.desc), cfgFor(pl.desc), { exclude: exOf(pl.desc), DxfParser: DxfParser, hashHex: sha256Hex, library: [] });
    var walls = run.ops.filter(function (o) { return o.op_type === 'DXF_WALL' && o.params.rect; });
    if (!walls.length) return no('plan ' + pl.name + ' has no wall pieces (no envelope)');
    var env = S.envelope(walls), face = elev.desc.face, ax = (face === 'minY' || face === 'maxY') ? 0 : 1, fc = { minX: env[0], minY: env[1], maxX: env[2], maxY: env[3] }[face];
    var cand = run.ops.filter(function (o) { return o.op_type === 'DXF_OPENING' && (o.params.category || o.params.kind) === cls; }).map(function (o) {
      var f = footprintOf(o); if (!f) return null;
      var lo = f[ax], hi = f[ax + 2]; if (Math.min(hi, cl.p1) - Math.max(lo, cl.p0) <= 0) return null;
      var a0 = f[1 - ax], a1 = f[3 - ax], d = fc < a0 ? a0 - fc : fc > a1 ? fc - a1 : 0;
      return { op: o, f: f, d: Math.round(d * 1e6) / 1e6 };
    }).filter(Boolean).sort(function (a, b) { return a.d - b.d; });
    if (!cand.length) return no('no ' + cls + ' in plan ' + pl.name + ' over ' + cl.p0 + '..' + cl.p1 + ' along the ' + face + ' face');
    if (cand.length > 1 && cand[1].d === cand[0].d) return no('two ' + cls + 's in plan ' + pl.name + ' at the same distance from the ' + face + ' face (' + cand[0].op.params.handle + ', ' + cand[1].op.params.handle + ')');
    var k = MK.UNITS[pl.desc.units], f0 = cand[0].f, r3 = function (v) { return Math.round(v * 1000) / 1000; };
    return { ok: true, cls: cls, plan: pl.name, x: r3((f0[0] + f0[2]) / 2 / k), y: r3((f0[1] + f0[3]) / 2 / k), z: z, elevHandles: cl.handles, opening: cand[0].op.params.handle, p: [cl.p0, cl.p1], faceDist: cand[0].d };
  }

  // ---- the pipeline: rosetta_dx_shell.js pipeline({convention:false}), same calls, same order ----
  // library (optional): { families:[{id, ot, ifc_class, w, h, d}], wallTypes:[{id, t}], geoms:[{element_ref, ifc_class, geometry_hash, vertices, faces, bbox}], labels:{<storey>:[...]} }
  function convert(sheets, opts) {
    opts = opts || {};
    var hashHex = opts.hashHex || sha256Hex, library = opts.library || null;
    var g = gate(sheets, { set: opts.set }); if (!g.ok) return { refused: g.refused };
    var CFG = C.CFG, deps = { DxfParser: DxfParser, hashHex: hashHex, library: [] }, SET = setWith(g.set);
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var roofSh = sheets.filter(function (s) { return s.role === 'roof'; })[0], sectSh = sheets.filter(function (s) { return s.role === 'section'; })[0] || null;
    var elevSh = sheets.filter(function (s) { return s.role === 'elev'; }).sort(function (a, b) { return FACE_ORDER.indexOf(a.face) - FACE_ORDER.indexOf(b.face); });
    var R = { gaps: [], refused: null, set: g.set, setFrom: g.setFrom };
    var refuse = function (sheet, reason) { R.refused = (R.refused || []).concat([{ sheet: sheet, reason: reason }]); return R; };
    var base = plans[0].desc;
    var elevs = [];
    for (var ei = 0; ei < elevSh.length; ei++) {
      var es = elevSh[ei], al = MK.align(base, es.desc, C.MARK_ALIGN_TOL);
      if (!al.map || !al.map.zOf) return refuse(es.name, 'elevation does not align with plan ' + plans[0].name + ' (' + J(al.errors || al.error || null) + ')');
      elevs.push({ name: es.name, face: es.face, roof: es.desc.roof, map: al.map, lines: S.levelLinesZ(es.dxf.entities, MK.withLayers(SET.MAP_LEVL, es.desc), al.map),   // §L4.2: the sheet's @LAYER rules first in every map
        clusters: E.elevClusters(es.dxf.entities, MK.withLayers(SET.MAP_ELEV, es.desc), al.map, CFG.snap_tol, 'glazing'), walls: E.elevWallRects(es.dxf.entities, MK.withLayers(SET.MAP_ELEV, es.desc), al.map),
        doors: E.elevClusters(es.dxf.entities, MK.withLayers(SET.MAP_ELEV, es.desc), al.map, CFG.snap_tol, 'elevdoor') });
    }
    R.elevs = elevs;
    var allRects = [].concat.apply([], elevs.map(function (e) { return e.walls; }));
    var allDatum = [].concat.apply([], elevs.map(function (e) { return e.lines || []; }));   // §L1.27: drawn level datum lines (z in metres, absolute)
    var ST = plans.map(function (p, i) { return { name: 'Level ' + (i + 1), sheet: p.name, sh: p, level: p.level }; });
    for (var si = 0; si < ST.length; si++) {
      var st = ST[si];
      st.levelDrawn = allRects.filter(function (r) { return Math.abs(r.z0 - st.level) <= CFG.elev_tol; }).map(function (r) { return r.handle; });
      // §L1.27: a level is also drawn by a level datum line of an elevation (it states nothing about wall bases: heights still come from rectangles that start at the level, or @WALLTOP)
      st.levelDatum = allDatum.filter(function (l) { return Math.abs(l.z - st.level) <= CFG.elev_tol; }).map(function (l) { return l.handle; });
      if (!st.levelDrawn.length && !st.levelDatum.length) return refuse(st.sheet, '@LEVEL=' + st.level + ' is not a drawn elevation boundary (BASIC_SHAPES_SPEC §2.3 LV)');
      var nxt;
      if (ST[si + 1]) nxt = ST[si + 1].level;
      else if (st.levelDrawn.length) nxt = Math.max.apply(null, allRects.filter(function (r) { return Math.abs(r.z0 - st.level) <= CFG.elev_tol; }).map(function (r) { return r.z1; }));
      else {   // no rectangle starts at the top storey's level: the lowest drawn datum above it
        var above = allDatum.filter(function (l) { return l.z > st.level + CFG.elev_tol; }).map(function (l) { return l.z; });
        if (!above.length) return refuse(st.sheet, '@LEVEL=' + st.level + ': no drawn level above the top storey (§L1.27)');
        nxt = Math.min.apply(null, above);
      }
      st.top = nxt;
      var run = B.run(st.sh.text, MK.withLayers(SET.MAP_PLAN, st.sh.desc), cfgFor(st.sh.desc), exOf(st.sh.desc) ? Object.assign({ exclude: exOf(st.sh.desc) }, deps) : deps); st.exRep = run.report.exclude; st.before = run.ops; st.planGaps = run.report.gaps; st.run_id = run.run_id;
      // L2.6 C: the plan's tags label the doors (and, §F8 D24, the windows) before their heights; a door or window no elevation shows takes the scheduled height
      var pd = st.sh.desc, sch = T.scheduleFromDesc(pd, MK.UNITS), ops = run.ops;
      if ((pd.tags || []).length) { var tg = T.applyTags(ops, [{ desc: pd }], MK.UNITS, { snap_tol: CFG.snap_tol, level: st.level }); ops = tg.ops; st.tagged = tg.labelled; }
      ops = E.applyElevations(ops, elevs.map(function (e) { return { face: e.face, clusters: e.clusters }; }), Object.assign({}, CFG, { wall: Object.assign({ height: r6(nxt - st.level) }, CFG.wall) }), { level: st.level, hashHex: hashHex, schedule: Object.keys(sch).length ? sch : null }).ops;
      ops = E.applyWallHeights(ops, elevs.map(function (e) { return { face: e.face, walls: e.walls }; }), CFG, { level: st.level }).ops;
      var dh = E.applyDoorHeights(ops, elevs.map(function (e) { return { face: e.face, doors: e.doors }; }), CFG, { level: st.level, schedule: Object.keys(sch).length ? sch : null, schedule_head_frame: C.CASING });
      ops = dh.ops; st.doorRep = dh.report;
      st.after = ops;
    }
    R.ST = ST;
    // L2.6 E: a marked SECTION sheet states slab top / underside (Dxf2Shell.sectionSlabs)
    var sopt = null;
    if (sectSh) {
      var sal = MK.align(base, sectSh.desc, C.MARK_ALIGN_TOL);
      R.section = sal.map ? S.sectionSlabs(sectSh.dxf.entities, MK.withLayers(SET.MAP_SECT, sectSh.desc), sal.map, ST.map(function (st) { return st.level; }), CFG, sectSh.desc.roof, { stepped: settingOf(sheets, opts, UNDERSIDE_KEY, 'longest_cut') })
        : { slabs: {}, roof: null, gaps: [{ code: 'GAP:section_align_fail', errors: sal.errors.map(function (e) { return e.code; }) }] };
      R.sectionSheet = sectSh.name; sopt = { section: R.section };
      if (sectSh.desc.cut && sal.map) { var cp = sectSh.desc.cut.split(','); R.sectionCut = { axis: cp[0], at: Number(cp[1]) * MK.UNITS[sectSh.desc.units] }; }
    }
    R.slabZ = {};
    ST.forEach(function (st, i) { R.slabZ[st.name] = S.slabZ({ level: st.level, ops: st.after }, i ? { level: ST[i - 1].level, ops: ST[i - 1].after } : null, CFG, sopt); });
    var TOP = ST[ST.length - 1];
    R.roofZ = S.roofZ({ level: TOP.level, ops: TOP.after }, elevs, CFG);
    // L2.6 A: wall tops the plan's @WALLTOP markings state; U = underside of the slab above (the top storey: the roof bottom)
    ST.forEach(function (st, i) {
      var d = st.sh.desc, dflt = settingOf(sheets, opts, WALLTOP_KEY, 'slab_above') === 'slab_above';   // §D54 the default runs on a plan with no wall-top marking too
      if (!(d.walltop || []).length && !(d.walltop_walls || []).length && !dflt) return;
      var U = ST[i + 1] ? R.slabZ[ST[i + 1].name].bottom : R.roofZ.bottom;
      var a = E.applyWallTops(st.after, st.before, d, st.level, U, { defaultSlabAbove: dflt }); st.after = a.ops; st.wallTopRep = a.report;
    });
    // lane spec L2.8 (1): wall base from the lowest stated source (section > elevation > plan level + advisory)
    ST.forEach(function (st, i) {
      var lower = ST[i - 1], sec = R.section && R.sectionCut ? { walls: R.section.walls || [], axis: R.sectionCut.axis, at: R.sectionCut.at } : null;
      var wb = S.applyWallBases(st.after, { level: st.level, lowerLevel: lower ? lower.level : undefined,
        lowerPieces: lower ? lower.before.filter(function (o) { return o.op_type === 'DXF_WALL' && o.params.rect; }).map(function (o) { return o.params.rect; }) : [], section: sec, tol: CFG.snap_tol });
      st.after = wb.ops; st.baseAdv = wb.advisories; st.baseRep = wb.report;
    });
    ST.forEach(function (st) { st.ringBridges = S.bridgeOpenings(st.after, CFG, { level: st.level, hashHex: hashHex }).infill; st.ring = S.innerRing(st.after, CFG, { bridges: st.ringBridges }); });   // §D44 the bridges count as face cover
    // §D70.1 the plan's drawn slab edge (A-FLOR-OTLN) is READ: it supersedes the §D44 rectangle and the §D51 estimate on that storey; a plan without it behaves as before
    ST.forEach(function (st) {
      st.edge = S.slabEdges(st.sh.dxf && st.sh.dxf.entities, MK.withLayers(SET.MAP_PLAN, st.sh.desc), st.sh.factor);
      if (st.edge.pieces.length) st.ring = Object.assign({}, st.ring, { gaps: (st.ring.gaps || []).filter(function (x) { return !/^GAP:slab_outline_/.test(x.code); }) });
    });
    R.roofPlan = S.roofPlan(roofSh.dxf.entities, MK.withLayers(SET.MAP_ROOF, roofSh.desc), roofSh.factor, TOP.ring.envelope, TOP.ring.outline, CFG);
    R.roofSheet = roofSh.name;
    R.run_id = C.runId(B.canon, hashHex, ST.map(function (st) { return st.run_id; }), sheets.map(function (s) { return s.sha; }), SET.maps);
    // type binding + labels: only with library rows (the rosetta_dx_types chain)
    if (library) {
      var LIB = { wall: library.wallTypes.filter(function (w) { return w.id !== 'NONE'; }).map(function (w) { return { id: w.id, thickness: w.t / 1000 }; }),
        window: library.families.filter(function (f) { return f.ot === 'WINDOW'; }).map(function (f) { return { id: f.id, set: C.setOf(f.id), width: f.w / 1000, height: f.h / 1000 }; }),
        door: library.families.filter(function (f) { return f.ot === 'DOOR'; }).map(function (f) { return { id: f.id, set: C.setOf(f.id), width: f.w / 1000, height: f.h / 1000 }; }) };
      ST.forEach(function (st) {
        var lr = T.applyLabels(st.after, { units: 'm', labels: (library.labels && library.labels[st.name]) || [] }, { m: 1 }, { snap_tol: CFG.snap_tol, level: st.level });
        st.labelGaps = lr.gaps.length;
        st.after = T.bindTypes(lr.ops, LIB, { bind: { size_tol: C.TYPES.size_tol, prefer: C.TYPES.prefer } }, {}).ops;
      });
    }
    ST.forEach(function (st) {
      var b = S.bridgeOpenings(st.after, CFG, { level: st.level, hashHex: hashHex });
      st.bridge = b; st.infill = b.infill; st.voidOf = {};
      b.voids.forEach(function (v) { v.keyOf.forEach(function (k) { st.voidOf[k] = v; }); });
    });
    R.fillHard = []; R.fillGaps = [];
    if (library) {
      // §L3.2: a subset library holds the candidate set COMPLETE only for library.complete, and library.withheld names the families whose
      // selected product (familyToRef's ref) has a candidate mesh the file does not hold. Their openings are taken out BEFORE placeFills
      // and each is a named hard GAP (never a substitute, never a box); the rest go through placeFills unchanged (its own throw = storey hard fail).
      var withheld = library.withheld || {}, complete = library.complete || null;
      var libRows = { families: library.families.map(function (f) { return { family_id: f.id, ifc_class: f.ifc_class, description: f.d }; }), geoms: library.geoms };
      ST.forEach(function (st) {
        var pre = [], ops = st.after.filter(function (o) {
          var q = o.params, tid = o.op_type === 'DXF_OPENING' && (q.kind === 'window' || q.kind === 'door') && q.type && q.type.type_id;
          if (!tid) return true;
          if (withheld[tid]) { pre.push({ code: 'GAP:lod400_mesh_missing', handle: q.handle, kind: q.kind, type_id: tid, element_ref: withheld[tid].ref, missing: withheld[tid].hashes }); return false; }
          if (complete && complete.indexOf(tid) < 0) { pre.push({ code: 'GAP:lod400_not_in_subset', handle: q.handle, kind: q.kind, type_id: tid }); return false; }
          return true;
        });
        var hardMsg = pre.map(function (x) { return x.code + ' ' + x.kind + ' ' + x.handle + ' ' + x.type_id + (x.missing ? ' (' + x.missing.join(',') + ')' : ''); });
        try { st.fills = S.placeFills(ops, libRows, { level: st.level, hashHex: hashHex, size_tol: C.FILL.size_tol, voidOf: st.voidOf }); }
        catch (e) { st.fills = { elements: [], gaps: e.gaps || [] }; hardMsg.push(e.message); }
        st.fills = { elements: st.fills.elements, gaps: pre.concat(st.fills.gaps) };
        st.hard = hardMsg.length ? hardMsg.join('; ') : null;
        if (st.hard) R.fillHard.push(st.name + ': ' + st.hard);
        st.fills.gaps.forEach(function (x) { R.fillGaps.push(Object.assign({ storey: st.name }, x)); });
      });
    } else {
      // §L3 fills STOPPED: the Modeller has no reachable LOD400 library rows. Every cut opening needs a fill → one hard GAP each, no box.
      ST.forEach(function (st) {
        var need = [].concat.apply([], st.bridge.voids.map(function (v) { return v.openings; }));
        st.fills = { elements: [], gaps: need.map(function (h) { return { code: 'GAP:lod400_library_unreachable', handle: h, storey: st.name }; }) };
        st.hard = need.length ? 'GAP:lod400_library_unreachable x' + need.length : null;
        if (need.length) R.fillHard.push(st.name + ': ' + st.hard);
      });
    }
    // mesh (as the witness): pieces + infill, slabs with a thickness, fills, roof
    // L2.8 (2): one wall per footprint across consecutive plans, on the final element set
    var msk = S.mergeStacked(ST.map(function (st) { return { name: st.name, level: st.level, ops: st.after.filter(function (o) { return o.op_type === 'DXF_WALL'; }) }; }), CFG.snap_tol, CFG.elev_tol);
    msk.storeys.forEach(function (x, i) { ST[i].meshWalls = x.ops; }); R.merged = msk.merged;
    var els = [];
    ST.forEach(function (st) {
      var wallOps = st.meshWalls.concat(st.infill);
      var m = M.meshFromOps(wallOps, { level: st.level, hashHex: hashHex, snapTol: CFG.snap_tol });
      st.meshGaps = m.gaps;
      m.elements.forEach(function (e) { if (e.class === 'IfcWall' && curtainLayer(SET, e.layer)) e.class = 'IfcCurtainWall'; els.push(Object.assign(e, { storey: st.name, sheet: st.sheet })); });   // §D45
      var sz = R.slabZ[st.name];
      if (st.edge.pieces.length && typeof sz.thickness === 'number') {   // §D70.1 one slab per drawn piece, at the storey's slab level (one per storey: level changes are not drawn)
        st.edge.pieces.forEach(function (pc, k) {
          var pm = pc.rectilinear ? S.prismRect(pc.outer, pc.holes, sz.bottom, sz.top) : S.prismPoly(pc.outer, pc.holes, sz.bottom, sz.top);
          if (pm) els.push({ guid: hashHex('slab-edge|' + st.name + '|' + J(pc.outer)).slice(0, 32), class: 'IfcSlab', handle: pc.handles.join(','), layer: 'A-FLOR-OTLN', piece: k, vertices: pm.vertices, faces: pm.faces, storey: st.name, sheet: st.sheet });
          else st.edge.gaps.push({ code: 'GAP:slab_edge_degenerate', handle: pc.handles[0], area: pc.area, reason: 'the drawn slab edge makes no body (degenerate ring or no slab thickness)' });
        });
      }
      else if (st.ring.outline && typeof sz.thickness === 'number') {
        var pm = S.prismRect(st.ring.outline, [], sz.bottom, sz.top);
        if (pm) els.push({ guid: hashHex('slab|' + st.name + '|' + J(st.ring.outline)).slice(0, 32), class: 'IfcSlab', handle: (st.ring.members || []).join(','), layer: 'A-WALL-*', piece: 0, vertices: pm.vertices, faces: pm.faces, storey: st.name, sheet: st.sheet });
      }
      else if (typeof sz.thickness === 'number' && (st.ring.gaps || []).some(function (x) { return x.code === 'GAP:slab_outline_not_rectangular'; }) && slabOutlineSetting(sheets, opts) === 'walls_bounded') {
        // §D51 best effort: the cells the walls bound on both axes, amber (derived), stated as a default with the setting that turns it off
        var bc = S.boundedCells(st.after, CFG, { bridges: st.ringBridges }), pe = bc && S.prismCells(bc.X, bc.Y, bc.solid, sz.bottom, sz.top);
        if (pe) {
          els.push({ guid: hashHex('slab-est|' + st.name + '|' + bc.area).slice(0, 32), class: 'IfcSlab', handle: 'estimated', layer: 'A-WALL-*', piece: 0, vertices: pe.vertices, faces: pe.faces, storey: st.name, sheet: st.sheet, prov: 'derived' });
          st.ring.gaps = st.ring.gaps.map(function (x) { return x.code !== 'GAP:slab_outline_not_rectangular' ? x : Object.assign({}, x, { code: 'GAP:slab_outline_estimated', estimated_m2: bc.area, setting: SLAB_OUTLINE_KEY,
            reason: 'the walls do not draw a rectangle: a best-effort slab of ' + bc.area + ' m2 (the area the walls bound on both axes) was made, amber; the rectangle would be ' + x.rect_m2 + ' m2. Turn it off with @DEFAULT=' + SLAB_OUTLINE_KEY + ',none or in element_defaults.json' }); });
        }
      }
      st.fills.elements.forEach(function (e) { els.push(Object.assign(e, { storey: st.name, sheet: st.sheet })); });
    });
    if (TOP.ring.outline && R.roofPlan.ok && typeof R.roofZ.thickness === 'number') {
      var rpm = S.prismRect(TOP.ring.outline, R.roofPlan.holes.map(function (h) { return h.ring; }), R.roofZ.bottom, R.roofZ.top);
      if (rpm) els.push({ guid: hashHex('roof|' + J(TOP.ring.outline)).slice(0, 32), class: 'IfcRoof', handle: R.roofPlan.roof_handle, layer: 'A-ROOF', piece: 0, vertices: rpm.vertices, faces: rpm.faces, storey: 'Roof', sheet: roofSh.name });
    }
    els.forEach(function (e) { if (e.volume === undefined) { e.volume = r6(M.volume(e)); e.watertight = M.watertight(e); } });
    applyMaterials(els, opts);   // §D53 best-effort materials (reference by class, a firm catalogue by thickness)
    R.els = els;
    R.libGeom = {}; if (library) library.geoms.forEach(function (gm) { if (gm.vertices && gm.vertices.length) R.libGeom[gm.geometry_hash] = gm; });
    // infill identity: the mesh guid meshFromOps gives each infill op (asked of the module, not re-derived)
    R.infillGuid = {};
    ST.forEach(function (st) {
      st.infill.forEach(function (o) { var me = M.meshFromOps([o], { level: st.level, hashHex: hashHex, snapTol: CFG.snap_tol }).elements; if (me.length === 1) R.infillGuid[me[0].guid] = { storey: st.name, op: o }; });
    });
    // §L3.3 qualify input, exactly as rosetta_dx_shell.js writes dx_shell_gaps.json (variant A) + rosetta_qualify.js builds the files / plan_ops
    var qg = [], resolved = {}, pick = function (x) { var o = Object.assign({}, x); delete o.run_id; return o; };
    ST.forEach(function (st) {
      var sheet = st.sheet, sz = R.slabZ[st.name];
      st.after.filter(function (o) { return o.op_type === 'DXF_GAP'; }).forEach(function (o) { qg.push(Object.assign({ sheet: sheet }, pick(o.params))); });
      (st.ring.gaps || []).concat(sz.gaps || [], st.edge.gaps).forEach(function (x) { qg.push(Object.assign({ sheet: sheet, shape: 'slabs' }, pick(x))); });
      if (st.exRep && (st.exRep.excluded || st.exRep.exclude_straddle)) qg.push({ sheet: sheet, shape: 'walls', code: 'GAP:excluded_by_user', count: st.exRep.excluded, straddle: st.exRep.exclude_straddle, reason: st.exRep.excluded + ' entit(ies) wholly inside the plan\'s @EXCLUDE area(s) left out' + (st.exRep.exclude_straddle ? '; ' + st.exRep.exclude_straddle + ' only partly inside kept' : '') + ' (the user\'s choice; remove the @EXCLUDE to read them)' });   // §D58
      if (st.wallTopRep && st.wallTopRep.defaulted) qg.push({ sheet: sheet, shape: 'walls', code: 'GAP:wall_top_defaulted', count: st.wallTopRep.defaulted, setting: WALLTOP_KEY, reason: st.wallTopRep.defaulted + ' wall(s) no elevation shows run to the slab underside above (a default, amber): state a top with @WALLTOP, or turn it off with @DEFAULT=' + WALLTOP_KEY + ',none / element_defaults.json' });   // §D54
      st.bridge.gaps.concat(st.fills.gaps).forEach(function (x) { qg.push(Object.assign({ sheet: sheet, shape: 'openings' }, pick(x))); });
      st.meshGaps.forEach(function (x) { qg.push(Object.assign({ sheet: sheet }, pick(x))); });
      (st.baseAdv || []).forEach(function (x) { qg.push(Object.assign({ sheet: sheet, shape: 'walls' }, pick(x))); });
      var opH = {}; st.after.filter(function (o) { return o.op_type === 'DXF_OPENING'; }).forEach(function (o) { opH[o.params.handle] = (o.params.parts || []).map(function (q) { return q.handle; }); });
      var rs = {}; st.bridge.voids.forEach(function (v) { v.openings.forEach(function (h) { rs[h] = 1; (opH[h] || []).forEach(function (x) { rs[x] = 1; }); }); });
      st.fills.elements.forEach(function (e) { if (typeof e.handle === 'string') rs[e.handle] = 1; });
      resolved[sheet] = Object.keys(rs).sort(function (a, b) { return parseInt(a, 16) - parseInt(b, 16); });
    });
    ((R.section && R.section.gaps) || []).forEach(function (x) { qg.push(Object.assign({ sheet: R.sectionSheet, shape: 'slabs' }, pick(x))); });
    R.roofPlan.gaps.concat(R.roofZ.gaps || []).forEach(function (x) { qg.push(Object.assign({ sheet: roofSh.name, shape: 'roof' }, pick(x))); });
    var mapsOf = function (sh) { return sh.role === 'plan' ? [SET.MAP_PLAN] : sh.role === 'roof' ? [SET.MAP_ROOF] : sh.role === 'section' ? [SET.MAP_SECT] : [SET.MAP_ELEV, SET.MAP_LEVL].concat(SET.EXCL_ELEV ? [SET.EXCL_ELEV] : []); };
    var planOps = {}; ST.forEach(function (st) { planOps[st.sheet] = st.before; });
    R.qualifyInput = { files: sheets.slice().sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }).map(function (sh) { return { name: sh.name, dxf: sh.dxf, layer_maps: mapsOf(sh) }; }),
      plan_ops: planOps, gaps: qg, resolved: resolved };
    R.verdict = Q.qualify(R.qualifyInput, SET.QUALIFY);
    // §F7 D18: doors read from A-DOOR-DFLT were drawn from the building's standard, not stated by the model: a YELLOW default, listed, never a model fact
    R.defaultDoors = Object.keys(planOps).reduce(function (n, k) { return n + (planOps[k] || []).filter(function (o) { return o.op_type === 'DXF_OPENING' && o.params && o.params.layer === 'A-DOOR-DFLT'; }).length; }, 0);
    R.frame = frameOfSheets(sheets);   // §L1.16
    return R;
  }

  // ---- map to the Modeller's ARC-seed form (L3 design decision). Pure: returns registerable meshes + ops; parent = index into inserts. ----
  function bboxOf(V) {
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    V.forEach(function (v) { for (var a = 0; a < 3; a++) { if (v[a] < mn[a]) mn[a] = v[a]; if (v[a] > mx[a]) mx[a] = v[a]; } });
    return { min: mn, max: mx };
  }
  function asset(guid, V, F, uncut) {
    var bb = bboxOf(V), c = [0, 1, 2].map(function (a) { return (bb.min[a] + bb.max[a]) / 2; });
    var v = new Float32Array(V.length * 3), f = new Uint32Array(F.length * 3);
    V.forEach(function (p, i) { v[3 * i] = p[0] - c[0]; v[3 * i + 1] = p[1] - c[1]; v[3 * i + 2] = p[2] - c[2]; });
    F.forEach(function (t, i) { f[3 * i] = t[0]; f[3 * i + 1] = t[1]; f[3 * i + 2] = t[2]; });
    var lb = [bb.min[0] - c[0], bb.max[0] - c[0], bb.min[1] - c[1], bb.max[1] - c[1], bb.min[2] - c[2], bb.max[2] - c[2]];
    return { hash: 'dxf-' + guid, v: v, f: f, bbox: lb, anchorOffset: [0, 0, 0], uncut: !!uncut, centre: c, halfZ: (bb.max[2] - bb.min[2]) / 2 };
  }
  function toOps(R, opts) {
    opts = opts || {};
    var hashHex = opts.hashHex || sha256Hex, colorFor = opts.colorFor || function () { return undefined; };
    var level = {}; R.ST.forEach(function (st) { level[st.name] = st.level; });
    var assets = [], inserts = [], cuts = [], groups = [], skipped = [], lineReport = null;
    // §L1.16: a wing set was drawn rotated by -angle about (ox,oy); the model is turned back by +angle. Bodies are rotated as world vertices (so the baked mesh is already in
    // place, placement.rot 0); a library fill keeps its mesh and gets the rotated centre + placement.rot. Openings of a framed wall are BAKED (no GEOM_CUT: the worker only cuts
    // axis-aligned boxes and a GEOM_ROTATE on an insert is a no-op there, L1.16 slice 2).
    var fr = opts.frame && !opts.frame.error ? opts.frame : null, fth = fr ? fr.angle * Math.PI / 180 : 0, fco = Math.cos(fth), fsi = Math.sin(fth);
    var fpt = function (x, y) { return fr ? [fco * (x - fr.ox) - fsi * (y - fr.oy) + fr.ox, fsi * (x - fr.ox) + fco * (y - fr.oy) + fr.oy] : [x, y]; };
    function insert(guid, cls, storey, V, F, prov, uncut) {
      if (fr) V = V.map(function (p) { var q = fpt(p[0], p[1]); return [q[0], q[1], p[2]]; });
      var a = asset(guid, V, F, uncut); assets.push(a);
      var P = { realGeomHash: a.hash, bbox: a.bbox, placement: { x: r6(a.centre[0]), y: r6(a.centre[1]), z: r6(a.centre[2] - a.halfZ), rot: 0 }, ifc_class: cls,
        storey: storey, provenance: prov };
      if (typeof level[storey] === 'number') P.storey_elev = level[storey];
      var col = colorFor(cls); if (col != null) P.color = col;
      inserts.push({ op_type: 'GEOM_INSERT', params: P, outputGuid: 'dxf-' + guid });
      return inserts.length - 1;
    }
    // 1. every non-infill, non-fill element as its own body (fills: none in the page; with a library they are listed, see C1-PORT)
    R.els.forEach(function (e) {
      if (R.infillGuid[e.guid] || ((e.class === 'IfcDoor' || e.class === 'IfcWindow') && e.kind !== 'doorswing')) return;   // §L26: a door built from its plan swing (kind doorswing) is a body of its own, not a library fill
      var pv = { dxf_handle: String(e.handle), layer: e.layer, sheet: e.sheet, run_id: R.run_id };
      if (e.prov) pv.prov_kind = e.prov;                        // §L7.3 drawn | derived | assumed
      if (e.ifc) pv.ifc = e.ifc;                                // §L7.4 {ifc_class, PredefinedType, type_name, material}
      var ix = insert(e.guid, e.class, e.storey, e.vertices, e.faces, pv);
      var mc = e.ifc && e.ifc.colour;                               // §L26 the standard material colour (synthetic_ref.json material_colour) is the canvas colour; no entry = neutral grey
      if (mc) inserts[ix].params.color = (Math.round(mc[0] * 255) << 16) | (Math.round(mc[1] * 255) << 8) | Math.round(mc[2] * 255);
      if (opts.evidenceColours || !mc) {                            // the evidence lens (or no material colour at all): the old tint
        if (e.prov === 'assumed') inserts[ix].params.color = 0xff2d2d;   // §L7.3 RED = no drawing evidence for the body's existence/position
        else if (e.prov === 'derived') inserts[ix].params.color = 0xffb347;   // §L13 AMBER = computed from drawn evidence plus a stated convention (synthetic slab/roof, inherited thickness, stated range)
      }
    });
    // 2. each §6 void group: ONE uncut body G x strip x [zb,zt] + one GEOM_CUT per opening z-interval (§SLIDE-SEED form)
    R.ST.forEach(function (st) {
      st.bridge.voids.forEach(function (v) {
        var key = v.openings.join(',') + '@' + v.s.join('..');
        var inf = st.infill.filter(function (o) { return o.params.openings.join(',') + '@' + o.params.length === v.openings.join(',') + '@' + r6(v.s[1] - v.s[0]) &&
          Math.abs((v.axis === 'x' ? o.params.rect[0] : o.params.rect[1]) - v.s[0]) <= 1e-9; });
        if (!inf.length) { skipped.push({ storey: st.name, openings: v.openings, reason: 'no infill (opening spans the whole wall height): nothing to cut' }); return; }
        var zs = inf.map(function (o) { return [st.level + o.params.base, st.level + o.params.base + o.params.height]; }).concat(v.z);
        var zb = Math.min.apply(null, zs.map(function (z) { return z[0]; })), zt = Math.max.apply(null, zs.map(function (z) { return z[1]; }));
        var ivs = v.z.map(function (z) { return z.slice(); }).sort(function (p, q) { return p[0] - q[0]; }), uni = 0, cur = null;
        ivs.forEach(function (z) { if (!cur || z[0] > cur[1]) { if (cur) uni += cur[1] - cur[0]; cur = z.slice(); } else cur[1] = Math.max(cur[1], z[1]); }); if (cur) uni += cur[1] - cur[0];
        var infH = inf.reduce(function (n, o) { return n + o.params.height; }, 0);
        if (Math.abs(uni + infH - (zt - zb)) > 1e-6) { skipped.push({ storey: st.name, openings: v.openings, reason: 'voids + infill != body height (' + r6(uni) + '+' + r6(infH) + ' vs ' + r6(zt - zb) + ')', refuse: true }); return; }
        var rc = inf[0].params.rect, ring = [[rc[0], rc[1]], [rc[2], rc[1]], [rc[2], rc[3]], [rc[0], rc[3]]];
        var pm = S.prismRect(ring, [], r6(zb), r6(zt));
        if (!pm) { skipped.push({ storey: st.name, openings: v.openings, reason: 'body not rectilinear', refuse: true }); return; }
        var bguid = hashHex(inf[0].input_guids.join('|') + '|gap-body').slice(0, 32);
        var prov = { dxf_handle: inf[0].params.infill_of.join('+'), layer: inf[0].params.layer, sheet: st.sheet, run_id: R.run_id };
        var wallCls = curtainLayer(setWith(R.set), inf[0].params.layer) ? 'IfcCurtainWall' : 'IfcWall';   // §D45 the body around an opening in a curtain band is the curtain wall
        if (fr) {   // baked: one prism per infill z-interval (the complement of the voids), same footprint rect; no GEOM_CUT
          var bi = inf.map(function (o, i) {
            var zlo = st.level + o.params.base, zhi = zlo + o.params.height, pi = S.prismRect(ring, [], r6(zlo), r6(zhi));
            return pi ? insert(hashHex(bguid + '|baked|' + i).slice(0, 32), wallCls, st.name, pi.vertices, pi.faces, prov, true) : -1;
          });
          if (bi.indexOf(-1) >= 0) { skipped.push({ storey: st.name, openings: v.openings, reason: 'framed body not rectilinear', refuse: true }); return; }
          groups.push({ storey: st.name, body: bi[0], guid: 'dxf-' + bguid, rect: rc, zb: r6(zb), zt: r6(zt), openings: v.openings, infill: inf.map(function (o) { return o.output_guid; }), voids: v.z, baked: bi });
          return;
        }
        var hi = insert(bguid, wallCls, st.name, pm.vertices, pm.faces, prov, true);
        groups.push({ storey: st.name, body: hi, guid: 'dxf-' + bguid, rect: rc, zb: r6(zb), zt: r6(zt), openings: v.openings, infill: inf.map(function (o) { return o.output_guid; }), voids: v.z });
        v.z.forEach(function (z, i) {
          cuts.push({ op_type: 'GEOM_CUT', params: { parent: hi, void: { c1: [rc[0], rc[1], z[0]], c2: [rc[2], rc[3], z[1]] }, slide: { opening: v.openings.join('+'), filling: null, fillingFid: null },
            provenance: { dxf_handle: v.openings.join('+'), layer: 'A-DOOR|A-GLAZ', sheet: st.sheet, run_id: R.run_id } }, outputGuid: 'dxf-' + hashHex(bguid + '|cut|' + i).slice(0, 32) });
        });
      });
    });
    // 2b. §D59 (a) a drawn wall line = ONE wall body: the bodies of one storey that share class, layer, z-range, cross band and evidence kind and touch end to end along their axis become the union
    // prism; their cuts are re-parented to it. Not for a turned (framed) set: its openings are baked into the bodies.
    if (!fr) (function () {
      var WC = { IfcWall: 1, IfcCurtainWall: 1 }, tol = C.CFG.snap_tol, n = inserts.length, par = [], cutOf = {};
      cuts.forEach(function (c) { cutOf[c.params.parent] = true; });
      var box = inserts.map(function (o) { var P = o.params; if (!WC[P.ifc_class] || P.anchorOnly) return null; var b = P.bbox, c = P.placement, h = (b[5] - b[4]) / 2;
        return [c.x + b[0], c.y + b[2], c.z + h + b[4], c.x + b[1], c.y + b[3], c.z + h + b[5]]; });
      var kind = function (P) { return (P.provenance && P.provenance.prov_kind) || 'drawn'; }, typ = function (P) { var t = P.provenance && P.provenance.ifc; return t ? JSON.stringify([t.type_name, t.material, t.PredefinedType]) : null; };
      var near = function (a, b) { return Math.abs(a - b) <= tol; };
      for (var i = 0; i < n; i++) par[i] = i;
      var find = function (i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
      for (var a = 0; a < n; a++) { if (!box[a]) continue; for (var b = a + 1; b < n; b++) { if (!box[b]) continue;
        var A = box[a], B = box[b], Pa = inserts[a].params, Pb = inserts[b].params;
        if (Pa.storey !== Pb.storey || Pa.ifc_class !== Pb.ifc_class || (Pa.provenance && Pa.provenance.layer) !== (Pb.provenance && Pb.provenance.layer) || kind(Pa) !== kind(Pb)) continue;
        if (typ(Pa) && typ(Pb) && typ(Pa) !== typ(Pb)) continue;
        if (!near(A[2], B[2]) || !near(A[5], B[5])) continue;
        var xLine = near(A[1], B[1]) && near(A[4], B[4]) && (near(A[3], B[0]) || near(B[3], A[0])), yLine = near(A[0], B[0]) && near(A[3], B[3]) && (near(A[4], B[1]) || near(B[4], A[1]));
        if (xLine || yLine) par[find(a)] = find(b); } }
      var lines = {}; for (var k = 0; k < n; k++) if (box[k]) (lines[find(k)] = lines[find(k)] || []).push(k);
      var keep = [], remap = {}, newIns = [], newAs = [], merged = 0;
      for (var q = 0; q < n; q++) {
        var L = box[q] ? lines[find(q)] : null;
        if (!L || L.length === 1) { remap[q] = newIns.length; newIns.push(inserts[q]); newAs.push(assets[q]); continue; }
        if (L[0] !== q) { remap[q] = remap[L[0]]; continue; }   // a later member: folded into its line's body (placed at the line's first member)
        var bx = L.map(function (m) { return box[m]; }), x0 = Math.min.apply(null, bx.map(function (r) { return r[0]; })), y0 = Math.min.apply(null, bx.map(function (r) { return r[1]; })),
          x1 = Math.max.apply(null, bx.map(function (r) { return r[3]; })), y1 = Math.max.apply(null, bx.map(function (r) { return r[4]; })), z0 = bx[0][2], z1 = bx[0][5];
        var pm = S.prismRect([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [], r6(z0), r6(z1)), P0 = inserts[q].params;
        var typed = L.map(function (m) { return inserts[m].params; }).filter(function (P) { return P.provenance && P.provenance.ifc; })[0] || P0;
        var prov = Object.assign({}, P0.provenance, { dxf_handle: L.map(function (m) { return inserts[m].params.provenance.dxf_handle; }).join('+'), members: L.map(function (m) { return inserts[m].outputGuid; }) });
        if (typed.provenance && typed.provenance.ifc) prov.ifc = typed.provenance.ifc;
        var gid = hashHex(L.map(function (m) { return inserts[m].outputGuid; }).join('|') + '|line').slice(0, 32), ncut = L.some(function (m) { return cutOf[m]; });
        var as = asset(gid, pm.vertices, pm.faces, ncut), Pm = { realGeomHash: as.hash, bbox: as.bbox, placement: { x: r6(as.centre[0]), y: r6(as.centre[1]), z: r6(as.centre[2] - as.halfZ), rot: 0 }, ifc_class: P0.ifc_class, storey: P0.storey, provenance: prov };
        if (typeof P0.storey_elev === 'number') Pm.storey_elev = P0.storey_elev;
        if (typed.color != null) Pm.color = typed.color; else if (P0.color != null) Pm.color = P0.color;
        remap[q] = newIns.length; newIns.push({ op_type: 'GEOM_INSERT', params: Pm, outputGuid: 'dxf-' + gid }); newAs.push(as); merged += L.length;
      }
      cuts.forEach(function (c) { c.params.parent = remap[c.params.parent]; });
      groups.forEach(function (g) { g.body = remap[g.body]; g.guid = newIns[g.body].outputGuid; });
      inserts.length = 0; Array.prototype.push.apply(inserts, newIns); assets.length = 0; Array.prototype.push.apply(assets, newAs);
      lineReport = { bodies_before: n, bodies_after: newIns.length, merged_members: merged };
    })();
    // 3. §L3.2 fills: GEOM_INSERT of the bound LOD400 library mesh, registered ONCE per geometry_hash ('lib-<hash>', recentred on its bbox centre)
    var libAsset = {}, fills = [];
    R.els.forEach(function (e) {
      if ((e.class !== 'IfcDoor' && e.class !== 'IfcWindow') || e.kind === 'doorswing') return;
      var G = R.libGeom && R.libGeom[e.geometry_hash];
      if (!G) { skipped.push({ storey: e.storey, openings: [e.handle], reason: 'fill mesh ' + e.geometry_hash + ' not in the library rows', refuse: true }); return; }
      var a = libAsset[e.geometry_hash];
      if (!a) { a = asset('x', G.vertices, G.faces, false); a.hash = 'lib-' + e.geometry_hash; libAsset[e.geometry_hash] = a; assets.push(a); }
      var P = { realGeomHash: a.hash, bbox: a.bbox, placement: { x: r6(fpt(e.centre[0], e.centre[1])[0]), y: r6(fpt(e.centre[0], e.centre[1])[1]), z: r6(e.centre[2] - a.halfZ), rot: fr ? r6(((fr.angle % 360) + 360) % 360) : 0 }, ifc_class: e.class, storey: e.storey,
        provenance: { dxf_handle: String(e.handle), layer: e.layer, sheet: e.sheet, run_id: R.run_id, element_ref: e.element_ref, geometry_hash: e.geometry_hash, family_id: e.family_id } };
      if (typeof level[e.storey] === 'number') P.storey_elev = level[e.storey];
      var col = colorFor(e.class); if (col != null) P.color = col;
      inserts.push({ op_type: 'GEOM_INSERT', params: P, outputGuid: 'dxf-' + e.guid }); fills.push(inserts.length - 1);
    });
    // §D59 (b) a cut names its fill: the one fill of the same storey whose handle is one of the cut's openings and whose centre lies in the cut's void
    cuts.forEach(function (c) {
      var hs = String(c.params.slide.opening).split('+'), st = inserts[c.params.parent] && inserts[c.params.parent].params.storey, V = c.params.void, t = 0.01;
      var lo = [0, 1, 2].map(function (k) { return Math.min(V.c1[k], V.c2[k]) - t; }), hi = [0, 1, 2].map(function (k) { return Math.max(V.c1[k], V.c2[k]) + t; });
      var hit = fills.filter(function (fi) { var P = inserts[fi].params, b = P.bbox, ctr = [P.placement.x, P.placement.y, P.placement.z + (b[5] - b[4]) / 2];
        return P.storey === st && hs.indexOf(String(P.provenance.dxf_handle)) >= 0 && ctr.every(function (v, k) { return v >= lo[k] && v <= hi[k]; }); });
      if (hit.length === 1) { c.params.slide.filling = inserts[hit[0]].outputGuid; c.params.slide.fillingIdx = hit[0]; }
    });
    return { assets: assets, inserts: inserts, cuts: cuts, groups: groups, skipped: skipped, fills: fills, lines: lineReport };
  }

  // §L3.2: the locally generated library subset (BIMCompiler scripts/export_library_subset.js) → the `library` convert takes.
  // A family whose candidate set references a mesh the file does not hold is WITHHELD (selection without every candidate could pick
  // another mesh): its openings hard-fail GAP:lod400_mesh_missing. Pure; no I/O.
  function librarySubset(J0) {
    if (!J0 || J0.format !== 'dxf2bim-library-subset/1') throw new Error('library subset: unknown format ' + (J0 && J0.format));
    var rows = J0.rows, meshes = J0.meshes || {}, missing = [];
    var geoms = rows.ad_geometry_map.map(function (m) {
      var g = meshes[m.geometry_hash];
      if (!g) { missing.push(m.geometry_hash); return { element_ref: m.element_ref, ifc_class: m.ifc_class, geometry_hash: m.geometry_hash, vertices: [], faces: [], missing: true }; }
      var V = [], F = [], i;
      for (i = 0; i + 2 < g.vertices.length; i += 3) V.push([g.vertices[i], g.vertices[i + 1], g.vertices[i + 2]]);
      for (i = 0; i + 2 < g.faces.length; i += 3) F.push([g.faces[i], g.faces[i + 1], g.faces[i + 2]]);
      var mn = [0, 1, 2].map(function (a) { return Math.min.apply(null, V.map(function (v) { return v[a]; })); }), mx = [0, 1, 2].map(function (a) { return Math.max.apply(null, V.map(function (v) { return v[a]; })); });
      return { element_ref: m.element_ref, ifc_class: m.ifc_class, geometry_hash: m.geometry_hash, vertices: V, faces: F, bbox: { min: mn, max: mx } };
    });
    var families = rows.ad_opening_family.map(function (f) { return { id: f.family_id, ot: f.opening_type, ifc_class: f.ifc_class, w: f.default_width_mm, h: f.default_height_mm, d: f.description }; });
    // withheld: the product familyToRef selects (from the map rows, which are all present) has a candidate row whose mesh is absent
    var withheld = {};
    if (missing.length) families.forEach(function (f) {
      var m = S.familyToRef({ family_id: f.id, ifc_class: f.ifc_class, description: f.d }, geoms); if (!m.ref) return;
      var hit = geoms.filter(function (g) { return g.missing && g.element_ref === m.ref && g.ifc_class === f.ifc_class; }).map(function (g) { return g.geometry_hash; });
      if (hit.length) withheld[f.id] = { ref: m.ref, hashes: hit };
    });
    return { families: families, wallTypes: rows.ad_wall_type.map(function (w) { return { id: w.wall_type_id, t: w.total_mm }; }),
      geoms: geoms.filter(function (g) { return !g.missing; }), labels: J0.labels || {}, complete: J0.complete_for_families, withheld: withheld, missing: missing,
      header: { source: J0.source, input: J0.input, counts: J0.counts } };
  }

  // ---- §L3.4: the library on OCI (BIMCompiler export_library_subset.js --full): index + shards (geometry_hash[0:2]). Library data only:
  // a drawing states its products as @TAG markings (no labels sidecar).
  // Pure except the injected fetchJson(url) → parsed JSON | null on 404 (throws on any other failure). Builds the SAME subset form
  // librarySubset reads, so the withheld / missing / not-in-subset rules of §L3.2 apply unchanged.
  var ORDER3 = function (a, b) { return a.element_ref < b.element_ref ? -1 : a.element_ref > b.element_ref ? 1 : a.ifc_class < b.ifc_class ? -1 : a.ifc_class > b.ifc_class ? 1 : a.geometry_hash < b.geometry_hash ? -1 : a.geometry_hash > b.geometry_hash ? 1 : 0; };
  // the shards holding a family's candidate rows (familyToRef's set: same class + Dxf2Shell.pairKey size key, as the export)
  function familyShards(index, fam) {
    var key = S.pairKey(fam.description), out = {};
    if (key) index.rows.ad_geometry_map.forEach(function (m) { if (m.ifc_class === fam.ifc_class && S.pairKey(m.element_ref) === key) out[m.shard] = 1; });
    return Object.keys(out).sort();
  }
  // index + the shards loaded so far → the `library` convert takes; `complete` = the families whose candidate shards are all loaded
  function libraryFromShards(index, shards, complete) {
    var rows = [], meshes = {};
    Object.keys(shards).sort().forEach(function (n) {
      var J0 = shards[n];
      if (!J0 || J0.format !== 'dxf2bim-library-shard/1' || J0.library_sha256 !== index.source.sha256) throw new Error('library shard ' + n + ': wrong format or library');
      rows = rows.concat(J0.rows.ad_geometry_map); Object.keys(J0.meshes).forEach(function (h) { meshes[h] = J0.meshes[h]; });
    });
    rows.sort(ORDER3);
    var L0 = librarySubset({ format: 'dxf2bim-library-subset/1', source: index.source, input: { oci: true, shards: Object.keys(shards).sort() },
      counts: { ad_opening_family: index.rows.ad_opening_family.length, ad_wall_type: index.rows.ad_wall_type.length, ad_geometry_map: rows.length, meshes: Object.keys(meshes).length },
      rows: { ad_opening_family: index.rows.ad_opening_family, ad_wall_type: index.rows.ad_wall_type, ad_geometry_map: rows }, meshes: meshes,
      complete_for_families: complete.slice().sort(), labels: null });
    return L0;
  }
  // iterate: convert → the bound families not yet loaded (GAP:lod400_not_in_subset) → their shards. ≤ maxPasses.
  async function loadOci(sheets, o) {
    var fx = o.fetchJson, base = o.base, memo = o.memo || {};
    var get = async function (u) { if (!(u in memo)) memo[u] = await fx(u); return memo[u]; };
    var latest = await fx(base + 'latest.json');
    if (!latest || latest.format !== 'dxf2bim-library-latest/1') throw new Error('latest.json ' + (latest ? 'unknown format ' + latest.format : 'not found'));
    var index = await get(base + latest.index);
    if (!index || index.format !== 'dxf2bim-library-index/1' || index.source.sha256 !== latest.library_sha256) throw new Error('index ' + latest.index + (index ? ' does not match latest.json' : ' not found'));
    var dir = latest.index.replace(/index\.json$/, ''), shards = {}, complete = [], famById = {}, passes = 0, R = null, Lb = null, max = o.maxPasses || 4;
    index.rows.ad_opening_family.forEach(function (f) { famById[f.family_id] = f; });
    while (passes < max) {
      Lb = libraryFromShards(index, shards, complete);
      R = convert(sheets, Object.assign({}, o.convertOpts || {}, { library: Lb })); passes++;
      if (R.refused) break;
      var more = false;
      var need = {}; (R.fillGaps || []).forEach(function (x) { if (x.code === 'GAP:lod400_not_in_subset' && complete.indexOf(x.type_id) < 0) need[x.type_id] = 1; });
      var fams = Object.keys(need).sort();
      for (var i = 0; i < fams.length; i++) {
        var f = famById[fams[i]]; if (!f) throw new Error('bound family ' + fams[i] + ' not in the index');
        var sh = familyShards(index, f);
        for (var j = 0; j < sh.length; j++) if (!shards[sh[j]]) { var sj = await get(base + dir + sh[j] + '.json'); if (!sj) throw new Error('shard ' + sh[j] + ' not found'); shards[sh[j]] = sj; }
        complete.push(fams[i]); more = true;
      }
      if (!more) break;
    }
    Lb = libraryFromShards(index, shards, complete);
    return { library: Lb, R: R, passes: passes, sha: index.source.sha256, shards: Object.keys(shards).sort(), families: complete.slice().sort() };
  }

  function counts(R) {
    var by = {}; R.els.forEach(function (e) { var k = e.storey + '/' + e.class + (R.infillGuid[e.guid] ? '(infill)' : ''); by[k] = (by[k] || 0) + 1; });
    return by;
  }

  return { TAG: TAG, sha256Hex: sha256Hex, mergeScopes: mergeScopes, frameOfSheets: frameOfSheets, chunkDxf: chunkDxf, readSheets: readSheets, readSheet: readSheet, librarySubset: librarySubset, familyShards: familyShards, libraryFromShards: libraryFromShards, loadOci: loadOci, catalogueCheck: catalogueCheck, SETS: SETS, setOf: setOf, setWith: setWith, qualifyNotRun: qualifyNotRun, planDoors: planDoors, elevPick: elevPick, gate: gate, convert: convert, toOps: toOps, counts: counts, parse: parse, FACE_ORDER: FACE_ORDER };
});
