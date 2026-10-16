// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2marks.js — read/validate/write DXF2BIM markings (view, face, axis, anchors, levels). Spec: docs/DXF2BIM_SPEC.md §24.
// Pure functions; the reader never infers anything: a missing marking is an error, not a default.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Marks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LAYER = 'DXF2BIM-MARK';
  var K = { mm: 0.001, cm: 0.01, m: 1, 'in': 0.0254, ft: 0.3048 };
  var SINGLE = ['SET', 'VIEW', 'NAME', 'UNITS', 'LEVEL', 'FACE', 'HAXIS', 'REGION', 'ROOF'], MULTI = ['GRIDX', 'GRIDY', 'GRIDH', 'Z', 'EXCLUDE', 'OPENING', 'LABEL', 'SCHEDULE', 'TAG', 'ALLOWANCE'];
  var NEED = { PLAN: ['SET', 'VIEW', 'LEVEL', 'UNITS'], ELEV: ['SET', 'VIEW', 'FACE', 'HAXIS', 'UNITS'] };

  function err(code, message, extra) { return Object.assign({ code: code, message: message }, extra || {}); }

  // entities: parsed by dxf-parser (TEXT/MTEXT with .text and .startPoint/.position)
  function readMarks(entities) {
    var out = [];
    (entities || []).forEach(function (e) {
      if (e.layer !== LAYER || (e.type !== 'TEXT' && e.type !== 'MTEXT')) return;
      var t = String(e.text || '').trim();
      var p = e.startPoint || e.position || { x: 0, y: 0 };
      out.push({ raw: t, x: p.x, y: p.y, handle: e.handle });
    });
    out.sort(function (a, b) { return parseInt(a.handle, 16) - parseInt(b.handle, 16); });      // handle order, file order irrelevant
    return out;
  }

  function describe(marks) {
    var d = { gridsX: {}, gridsY: {}, gridsH: {}, zs: [], excludes: [], openings: [], labels: [], schedule: [], tags: [], allowance: {} }, errors = [];
    marks.forEach(function (m) {
      var mt = /^@([A-Z]+)=(.*)$/.exec(m.raw);
      if (!mt) { errors.push(err('MARK:malformed', 'not @KEY=VALUE: ' + m.raw, { handle: m.handle })); return; }
      var key = mt[1], val = mt[2];
      if (SINGLE.indexOf(key) < 0 && MULTI.indexOf(key) < 0) { errors.push(err('MARK:unknown_key', '@' + key, { handle: m.handle })); return; }
      if (val === '') { errors.push(err('MARK:malformed', '@' + key + ' has no value', { handle: m.handle })); return; }
      if (SINGLE.indexOf(key) >= 0) {
        var name = key.toLowerCase();
        if (key === 'LEVEL' || key === 'ROOF') { var n = Number(val); if (!isFinite(n)) { errors.push(err('MARK:malformed', '@' + key + ' not a number: ' + val, { handle: m.handle })); return; } val = n; }   // ROOF: BASIC_SHAPES_SPEC §5.3
        if (key === 'REGION') {
          var rp = val.split(',').map(Number);
          if (rp.length !== 4 || rp.some(function (n) { return !isFinite(n); })) { errors.push(err('MARK:malformed', '@REGION needs x0,y0,x1,y1: ' + val, { handle: m.handle })); return; }
          val = [Math.min(rp[0], rp[2]), Math.min(rp[1], rp[3]), Math.max(rp[0], rp[2]), Math.max(rp[1], rp[3])].join(',');
        }
        if (key === 'VIEW' && val !== 'PLAN' && val !== 'ELEV') { errors.push(err('MARK:malformed', '@VIEW must be PLAN|ELEV: ' + val, { handle: m.handle })); return; }
        if (key === 'UNITS' && !(val in K)) { errors.push(err('MARK:malformed', '@UNITS must be mm|cm|m|in|ft: ' + val, { handle: m.handle })); return; }
        if (key === 'FACE' && ['minX', 'maxX', 'minY', 'maxY'].indexOf(val) < 0) { errors.push(err('MARK:malformed', '@FACE must be minX|maxX|minY|maxY: ' + val, { handle: m.handle })); return; }
        if (key === 'HAXIS' && ['+X', '-X', '+Y', '-Y'].indexOf(val) < 0) { errors.push(err('MARK:malformed', '@HAXIS must be +X|-X|+Y|-Y: ' + val, { handle: m.handle })); return; }
        if (name in d && d[name] !== val) { errors.push(err('MARK:conflict', '@' + key + ' has two values: ' + d[name] + ' / ' + val, { handle: m.handle })); return; }
        d[name] = val;
      } else if (key === 'OPENING') {
        var op = val.split(','), kind = op[0], on = op.slice(1).map(Number);
        if ((kind !== 'door' && kind !== 'window') || on.length !== 4 || on.some(function (n) { return !isFinite(n); })) { errors.push(err('MARK:malformed', '@OPENING needs door|window,h0,y0,h1,y1: ' + val, { handle: m.handle })); return; }
        var orct = { kind: kind, h0: Math.min(on[0], on[2]), y0: Math.min(on[1], on[3]), h1: Math.max(on[0], on[2]), y1: Math.max(on[1], on[3]) };
        if (!d.openings.some(function (q) { return q.kind === orct.kind && q.h0 === orct.h0 && q.y0 === orct.y0 && q.h1 === orct.h1 && q.y1 === orct.y1; })) d.openings.push(orct);
      } else if (key === 'LABEL') {
        var lp = val.split(','), lc = lp[0], lx = Number(lp[1]), ly = Number(lp[2]), lz, lrest = lp.slice(3);
        if (lrest.length && /^z=/.test(lrest[0])) { lz = Number(lrest[0].slice(2)); if (lrest[0].slice(2).trim() === '' || !isFinite(lz)) { errors.push(err('MARK:malformed', '@LABEL z= needs a number: ' + val, { handle: m.handle })); return; } lrest = lrest.slice(1); }
        var lt = lrest.join(',');
        if (['door', 'window', 'wall'].indexOf(lc) < 0 || lp.length < 4 || !isFinite(lx) || !isFinite(ly) || lp[1].trim() === '' || lp[2].trim() === '' || lt.trim() === '') { errors.push(err('MARK:malformed', '@LABEL needs door|window|wall,x,y,[z=m,]text: ' + val, { handle: m.handle })); return; }
        var ldup = d.labels.find(function (q) { return q.class === lc && q.x === lx && q.y === ly && q.z === lz; });
        if (ldup && ldup.text !== lt) { errors.push(err('MARK:conflict', '@LABEL ' + lc + ' at (' + lx + ',' + ly + (lz === undefined ? '' : ',z=' + lz) + ') has two texts: ' + ldup.text + ' / ' + lt, { handle: m.handle })); return; }
        if (!ldup) { var le = { class: lc, x: lx, y: ly, text: lt }; if (lz !== undefined) le.z = lz; d.labels.push(le); }
      } else if (key === 'TAG') {
        var tp = val.split(','), tc = tp[0], trest = tp.slice(1), tz;
        if (trest.length && /^z=/.test(trest[0])) {
          tz = Number(trest[0].slice(2)); if (trest[0].slice(2).trim() === '' || !isFinite(tz)) { errors.push(err('MARK:malformed', '@TAG z= needs a number: ' + val, { handle: m.handle })); return; } trest = trest.slice(1);
        }
        var tt = trest.join(',');
        if (['door', 'window', 'wall'].indexOf(tc) < 0 || tt.trim() === '') { errors.push(err('MARK:malformed', '@TAG needs door|window|wall,[z=m,]text: ' + val, { handle: m.handle })); return; }
        var tdup = d.tags.find(function (q) { return q.class === tc && q.x === m.x && q.y === m.y && q.z === tz; });
        if (tdup && tdup.text !== tt) { errors.push(err('MARK:conflict', '@TAG ' + tc + ' at (' + m.x + ',' + m.y + ') has two texts: ' + tdup.text + ' / ' + tt, { handle: m.handle })); return; }
        if (!tdup) { var te = { class: tc, x: m.x, y: m.y, text: tt }; if (tz !== undefined) te.z = tz; d.tags.push(te); }
      } else if (key === 'ALLOWANCE') {
        var ap = val.split(','), ac = ap[0], an = ap.slice(1).map(Number);
        if ((ac !== 'door' && ac !== 'window') || ap.length !== 3 || ap.slice(1).some(function (t, i) { return t.trim() === '' || !isFinite(an[i]); })) { errors.push(err('MARK:malformed', '@ALLOWANCE needs door|window,w,h: ' + val, { handle: m.handle })); return; }
        if (d.allowance[ac] && (d.allowance[ac].w !== an[0] || d.allowance[ac].h !== an[1])) { errors.push(err('MARK:conflict', '@ALLOWANCE ' + ac + ' has two values', { handle: m.handle })); return; }
        d.allowance[ac] = { w: an[0], h: an[1] };
      } else if (key === 'SCHEDULE') {
        var sp = val.split(','), sc = sp[1], sn = sp.slice(2).map(Number), sok = (sc === 'wall' && sp.length === 3) || ((sc === 'door' || sc === 'window') && sp.length === 4);
        if (!sok || sp[0].trim() === '' || sn.some(function (n, i) { return !isFinite(n) || sp[i + 2].trim() === ''; })) { errors.push(err('MARK:malformed', '@SCHEDULE needs text,door|window,w,h or text,wall,t: ' + val, { handle: m.handle })); return; }
        var sent = sc === 'wall' ? { text: sp[0], class: sc, t: sn[0] } : { text: sp[0], class: sc, w: sn[0], h: sn[1] };
        var sdup = d.schedule.find(function (q) { return q.text === sent.text && q.class === sent.class; });
        if (sdup && JSON.stringify(sdup) !== JSON.stringify(sent)) { errors.push(err('MARK:conflict', '@SCHEDULE ' + sent.text + ' (' + sc + ') has two sizes', { handle: m.handle })); return; }
        if (!sdup) d.schedule.push(sent);
      } else if (key === 'EXCLUDE') {
        var xp = val.split(',').map(Number);
        if (xp.length !== 4 || xp.some(function (n) { return !isFinite(n); })) { errors.push(err('MARK:malformed', '@EXCLUDE needs x0,y0,x1,y1: ' + val, { handle: m.handle })); return; }
        var xr = [Math.min(xp[0], xp[2]), Math.min(xp[1], xp[3]), Math.max(xp[0], xp[2]), Math.max(xp[1], xp[3])];
        if (!d.excludes.some(function (q) { return q.join(',') === xr.join(','); })) d.excludes.push(xr);
      } else if (key === 'Z') {
        var z = Number(val); if (!isFinite(z)) { errors.push(err('MARK:malformed', '@Z not a number: ' + val, { handle: m.handle })); return; }
        var dup = d.zs.find(function (q) { return q.z === z; });
        if (dup && dup.y !== m.y) { errors.push(err('MARK:conflict', '@Z=' + z + ' at two heights: ' + dup.y + ' / ' + m.y, { handle: m.handle })); return; }
        if (!dup) d.zs.push({ z: z, y: m.y });
      } else {
        var bag = key === 'GRIDX' ? d.gridsX : key === 'GRIDY' ? d.gridsY : d.gridsH, pos = key === 'GRIDY' ? m.y : m.x;
        if (val in bag && bag[val] !== pos) { errors.push(err('MARK:conflict', '@' + key + '=' + val + ' at two positions: ' + bag[val] + ' / ' + pos, { handle: m.handle })); return; }
        bag[val] = pos;
      }
    });
    if (d.view === 'ELEV') {      // z comes from the position in an elevation; checked after the loop because marker order is not guaranteed
      d.tags = d.tags.filter(function (q) { if (q.z === undefined) return true; errors.push(err('MARK:malformed', '@TAG z= is not allowed in an ELEV view (z comes from the position): ' + q.text)); return false; });
    }
    {
      var need = (NEED[d.view] || []).filter(function (k) { return d[k.toLowerCase()] === undefined; });
      if (d.view === 'PLAN') {
        if (Object.keys(d.gridsX).length < 2) need.push('GRIDX(>=2)');
        if (Object.keys(d.gridsY).length < 2) need.push('GRIDY(>=2)');
      } else if (d.view === 'ELEV') {
        if (Object.keys(d.gridsH).length < 2) need.push('GRIDH(>=2)');
        if (d.zs.length < 2) need.push('Z(>=2)');
        if (d.face && d.haxis) {
          var faceAxis = d.face.slice(3), hax = d.haxis.slice(1);
          if (faceAxis === hax) errors.push(err('MARK:axis_face', '@HAXIS ' + d.haxis + ' is not perpendicular to face ' + d.face));
        }
      } else if (d.view === undefined) need = ['VIEW'].concat(need);
      if (need.length) errors.push(err('MARK:missing', need.join(','), { keys: need }));
    }
    function sortedBag(b) { var o = {}; Object.keys(b).sort().forEach(function (k) { o[k] = b[k]; }); return o; }       // canonical: no dependence on marker order
    d.gridsX = sortedBag(d.gridsX); d.gridsY = sortedBag(d.gridsY); d.gridsH = sortedBag(d.gridsH);
    d.zs.sort(function (p, q) { return p.z - q.z; });
    d.openings.sort(function (p, q) { return p.h0 - q.h0 || p.y0 - q.y0 || p.h1 - q.h1 || p.y1 - q.y1 || (p.kind < q.kind ? -1 : p.kind > q.kind ? 1 : 0); });
    d.labels.sort(function (p, q) { return p.x - q.x || p.y - q.y || (p.z === undefined ? -1e9 : p.z) - (q.z === undefined ? -1e9 : q.z) || (p.class < q.class ? -1 : p.class > q.class ? 1 : 0); });
    d.tags.sort(function (p, q) { return p.x - q.x || p.y - q.y || (p.z === undefined ? -1e9 : p.z) - (q.z === undefined ? -1e9 : q.z) || (p.class < q.class ? -1 : p.class > q.class ? 1 : 0); });
    d.schedule.sort(function (p, q) { return p.text < q.text ? -1 : p.text > q.text ? 1 : p.class < q.class ? -1 : p.class > q.class ? 1 : 0; });
    d.excludes.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]; });
    return { desc: d, errors: errors };
  }

  // several views in one file (§31): markers belong to the REGION rectangle that contains their insertion point
  function describeAll(marks) {
    var regions = [], errors = [], seen = {};
    marks.forEach(function (m) {
      var mt = /^@REGION=(.*)$/.exec(m.raw); if (!mt) return;
      var rp = mt[1].split(',').map(Number); if (rp.length !== 4 || rp.some(function (n) { return !isFinite(n); })) return;      // malformed: reported by describe below
      var r = [Math.min(rp[0], rp[2]), Math.min(rp[1], rp[3]), Math.max(rp[0], rp[2]), Math.max(rp[1], rp[3])], k = r.join(',');
      if (!seen[k]) { seen[k] = true; regions.push({ rect: r, marks: [] }); }
    });
    if (!regions.length) { var one = describe(marks); return [{ region: null, desc: one.desc, errors: one.errors }]; }
    marks.forEach(function (m) {
      var hit = regions.filter(function (g) { return m.x >= g.rect[0] && m.x <= g.rect[2] && m.y >= g.rect[1] && m.y <= g.rect[3]; });
      if (hit.length !== 1) { errors.push(err('MARK:view_ambiguous', (hit.length ? 'in ' + hit.length + ' regions: ' : 'in no region: ') + m.raw, { handle: m.handle })); return; }
      hit[0].marks.push(m);
    });
    var out = regions.map(function (g) { var d = describe(g.marks); return { region: g.rect, desc: d.desc, errors: d.errors }; });
    var sets = {}; out.forEach(function (v) { if (v.desc.set !== undefined) sets[v.desc.set] = 1; });
    if (Object.keys(sets).length > 1) errors.push(err('MARK:set_mismatch', 'views of one file carry different @SET: ' + Object.keys(sets).join(',')));
    if (errors.length) out.push({ region: null, desc: {}, errors: errors });
    return out;
  }

  // plan: described PLAN, elev: described ELEV; tol in metres. Returns { ok, errors, map }.
  function align(plan, elev, tol) {
    var errors = [], map = null;
    var kp = K[plan.units], ke = K[elev.units];
    var axis = elev.haxis.slice(1), s = elev.haxis[0] === '+' ? 1 : -1;
    var planBag = axis === 'X' ? plan.gridsX : plan.gridsY;
    var labels = Object.keys(elev.gridsH).filter(function (l) { return l in planBag; }).sort();
    if (labels.length < 2) { errors.push(err('MARK:align_fail', 'fewer than 2 shared grid labels on axis ' + axis + ': ' + labels.join(','))); }
    else {
      var offs = labels.map(function (l) { return planBag[l] * kp - s * elev.gridsH[l] * ke; });
      var b = offs[0], resid = offs.map(function (o) { return o - b; });
      var worst = Math.max.apply(null, resid.map(Math.abs));
      if (worst > tol) errors.push(err('MARK:align_fail', 'grid labels disagree by up to ' + worst + ' m', { labels: labels, residuals: resid }));
      else map = { axis: axis, s: s, k: ke, b: b, labels: labels, residual: worst, toPlan: function (h) { return s * h * ke + b; } };
    }
    var zs = elev.zs.slice().sort(function (p, q) { return p.z - q.z; });
    var zok = true;
    for (var j = 1; j < zs.length; j++) {
      var dz = zs[j].z - zs[0].z, dy = (zs[j].y - zs[0].y) * ke;
      if (Math.abs(dz - dy) > tol) { zok = false; errors.push(err('MARK:level_scale_fail', '@Z ' + zs[0].z + ' -> ' + zs[j].z + ' expects dy ' + dz + ' m, drawing gives ' + dy + ' m')); }
    }
    if (map && zok) map.zOf = function (y) { return zs[0].z + (y - zs[0].y) * ke; };
    return { ok: !errors.length, errors: errors, map: map };
  }

  // ---- writer: insert TEXT marker entities into the ENTITIES section of a DXF text ----
  function writeMarks(dxfText, marks, opts) {
    opts = opts || {};
    var eol = dxfText.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    var lines = dxfText.split(/\r?\n/);
    var maxH = 0, endIdx = -1, inEnt = false;
    for (var i = 0; i + 1 < lines.length; i += 2) {
      var c = lines[i].trim(), v = lines[i + 1].trim();
      if (c === '5' || c === '105') { var hv = parseInt(v, 16); if (hv > maxH) maxH = hv; }
      if (c === '0' && v === 'SECTION' && lines[i + 2] !== undefined && lines[i + 2].trim() === '2' && lines[i + 3] !== undefined && lines[i + 3].trim() === 'ENTITIES') inEnt = true;
      else if (inEnt && c === '0' && v === 'ENDSEC') { endIdx = i; break; }
    }
    if (endIdx < 0) throw new Error('writeMarks: no ENTITIES section');
    var out = [];
    marks.forEach(function (m, n) {
      var h = (maxH + 1 + n).toString(16).toUpperCase();
      out.push('0', 'TEXT', '5', h, '8', LAYER, '10', String(m.x || 0), '20', String(m.y || 0), '30', '0', '40', String(opts.height || 1), '1', m.text);
    });
    return lines.slice(0, endIdx).concat(out, lines.slice(endIdx)).join(eol);
  }

  return { readMarks: readMarks, describe: describe, describeAll: describeAll, align: align, writeMarks: writeMarks, LAYER: LAYER, UNITS: K };
});
