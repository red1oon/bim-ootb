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
  var SINGLE = ['SET', 'VIEW', 'NAME', 'UNITS', 'LEVEL', 'FACE', 'HAXIS', 'REGION', 'ROOF', 'CUT', 'SCOPE', 'FRAME'], MULTI = ['GRIDX', 'GRIDY', 'GRIDH', 'Z', 'EXCLUDE', 'OPENING', 'LABEL', 'SCHEDULE', 'TAG', 'ALLOWANCE', 'WALLTOP', 'LAYER', 'BODYZ', 'SIZE'];
  var NEED = { PLAN: ['SET', 'VIEW', 'LEVEL', 'UNITS'], ELEV: ['SET', 'VIEW', 'FACE', 'HAXIS', 'UNITS'], ROOF: ['SET', 'VIEW', 'LEVEL', 'UNITS', 'ROOF'], SECTION: ['SET', 'VIEW', 'UNITS', 'HAXIS', 'CUT'] };   // ROOF view: lane spec L2.3 D1; SECTION: L1.4 F5

  // bim-ootb lane spec L4.2: @LAYER=<name>,<type> - the rule types the reader of each view accepts (+ dims / grid: qualify settings, 'ignore' for the readers)
  var LAYER_TYPES = {
    PLAN: ['wall', 'wallline', 'slab', 'component', 'opening', 'glazing', 'ignore'],   // Dxf2Bim validateMap TYPES (the plan reader's own check)
    ELEV: ['elevwall', 'elevdoor', 'glazing', 'levelline', 'ignore'],                  // Dxf2Elev.elevWallRects / elevClusters('glazing'|'elevdoor'), Dxf2Shell.levelLinesZ
    ROOF: ['roof', 'glazing', 'ignore'],                                               // Dxf2Shell.roofPlan
    SECTION: ['sectslab', 'sectwall', 'roof', 'ignore'],                               // Dxf2Shell.sectionSlabs (+ L2.8 section walls)
    ANY: ['dims', 'grid'],
    BODY: ['column', 'beam', 'footing', 'gradebeam', 'member', 'plate', 'panel', 'bar', 'fan'] };   // bim-ootb lane L7.10 (+ L11 panel = an elevation HATCH layer read as wall panels; + L14 bar = LINE members of a SECTION sheet; + L11.3 fan = concentric CIRCLEs on an elevation): the user types a layer with a BODY kind (any view); every existing reader maps it to 'ignore', the bodies module reads it
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
    var d = { gridsX: {}, gridsY: {}, gridsH: {}, zs: [], excludes: [], openings: [], labels: [], schedule: [], bodyz: [], tags: [], allowance: {}, walltop: [], walltop_walls: [], sizes: [], by: {} }, errors = [];
    marks.forEach(function (m) {
      // lane spec L2.7 (5): @BY=model|user is a SUFFIX in the same TEXT and qualifies only that TEXT's marking; none -> 'file'
      var raw = m.raw, by = 'file', nBy = (raw.match(/@BY=/g) || []).length;
      if (nBy) {
        var bm = /^(.*\S)\s+@BY=(\S*)$/.exec(raw);
        if (nBy > 1 || !bm || (bm[2] !== 'model' && bm[2] !== 'user') || /@BY=/.test(bm[1])) { errors.push(err('MARK:by_invalid', (nBy > 1 ? 'a second @BY' : !bm ? 'a TEXT holding only @BY' : '@BY must be model|user') + ': ' + raw, { handle: m.handle })); return; }
        raw = bm[1]; by = bm[2];
      }
      var mt = /^@([A-Z]+)=(.*)$/.exec(raw);
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
        if (key === 'SCOPE') {                                                             // bim-ootb lane spec L6: @SCOPE=KEY (the storey's annotation sheet) | @SCOPE=<name>,x0,y0,x1,y1 (a wing/zone sheet, mm of the sheet's @UNITS)
          var sp0 = val.split(',');
          if (!(val === 'KEY' || (sp0.length === 5 && /^[A-Za-z0-9_]+$/.test(sp0[0]) && sp0.slice(1).every(function (n) { return n.trim() !== '' && isFinite(Number(n)); })))) { errors.push(err('MARK:malformed', '@SCOPE needs KEY or <name>,x0,y0,x1,y1: ' + val, { handle: m.handle })); return; }
        }
        if (key === 'FRAME') {                                                             // §L1.16: <angle deg>,<x mm>,<y mm> - the wing was drawn rotated by -angle about (x,y); the importer turns it back
          var fp = val.split(',').map(function (n) { return n.trim() === '' ? NaN : Number(n); });
          if (fp.length !== 3 || fp.some(function (n) { return !isFinite(n); })) { errors.push(err('MARK:malformed', '@FRAME needs <angle deg>,<x mm>,<y mm>: ' + val, { handle: m.handle })); return; }
          val = fp.join(',');
        }
        if (key === 'VIEW' && val !== 'PLAN' && val !== 'ELEV' && val !== 'ROOF' && val !== 'SECTION') { errors.push(err('MARK:malformed', '@VIEW must be PLAN|ELEV|ROOF|SECTION: ' + val, { handle: m.handle })); return; }
        if (key === 'CUT') {                                                               // L1.4 F5: <X|Y>,<plan coordinate in the sheet's @UNITS>
          var cp = val.split(','), cv = Number(cp[1]);
          if (cp.length !== 2 || (cp[0] !== 'X' && cp[0] !== 'Y') || cp[1].trim() === '' || !isFinite(cv)) { errors.push(err('MARK:malformed', '@CUT needs X|Y,<coordinate>: ' + val, { handle: m.handle })); return; }
          val = cp[0] + ',' + cv;
        }
        if (key === 'UNITS' && !(val in K)) { errors.push(err('MARK:malformed', '@UNITS must be mm|cm|m|in|ft: ' + val, { handle: m.handle })); return; }
        if (key === 'FACE' && ['minX', 'maxX', 'minY', 'maxY'].indexOf(val) < 0) { errors.push(err('MARK:malformed', '@FACE must be minX|maxX|minY|maxY: ' + val, { handle: m.handle })); return; }
        if (key === 'HAXIS' && ['+X', '-X', '+Y', '-Y'].indexOf(val) < 0) { errors.push(err('MARK:malformed', '@HAXIS must be +X|-X|+Y|-Y: ' + val, { handle: m.handle })); return; }
        if (name in d && d[name] !== val) { errors.push(err('MARK:conflict', '@' + key + ' has two values: ' + d[name] + ' / ' + val, { handle: m.handle })); return; }
        d[name] = val; d.by[key] = by;
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
        if (!ldup) { var le = { class: lc, x: lx, y: ly, text: lt }; if (lz !== undefined) le.z = lz; le.by = by; d.labels.push(le); }
      } else if (key === 'TAG') {
        var tp = val.split(','), tc = tp[0], trest = tp.slice(1), tz;
        if (trest.length && /^z=/.test(trest[0])) {
          tz = Number(trest[0].slice(2)); if (trest[0].slice(2).trim() === '' || !isFinite(tz)) { errors.push(err('MARK:malformed', '@TAG z= needs a number: ' + val, { handle: m.handle })); return; } trest = trest.slice(1);
        }
        var tt = trest.join(',');
        if (['door', 'window', 'wall'].indexOf(tc) < 0 || tt.trim() === '') { errors.push(err('MARK:malformed', '@TAG needs door|window|wall,[z=m,]text: ' + val, { handle: m.handle })); return; }
        var tdup = d.tags.find(function (q) { return q.class === tc && q.x === m.x && q.y === m.y && q.z === tz; });
        if (tdup && tdup.text !== tt) { errors.push(err('MARK:conflict', '@TAG ' + tc + ' at (' + m.x + ',' + m.y + ') has two texts: ' + tdup.text + ' / ' + tt, { handle: m.handle })); return; }
        if (!tdup) { var te = { class: tc, x: m.x, y: m.y, text: tt }; if (tz !== undefined) te.z = tz; te.by = by; d.tags.push(te); }
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
        if (sdup && JSON.stringify(Object.assign({}, sdup, { by: undefined })) !== JSON.stringify(sent)) { errors.push(err('MARK:conflict', '@SCHEDULE ' + sent.text + ' (' + sc + ') has two sizes', { handle: m.handle })); return; }
        if (!sdup) { sent.by = by; d.schedule.push(sent); }
      } else if (key === 'BODYZ') {                                                          // bim-ootb lane L7.14: the z range (m) the USER states for a body kind no elevation shows: @BODYZ=<kind>,<z0>,<z1>
        var bp = val.split(','), bk = (bp[0] || '').trim(), bn = bp.slice(1).map(Number);
        if (LAYER_TYPES.BODY.indexOf(bk) < 0 || bp.length !== 3 || bp.slice(1).some(function (t, i) { return t.trim() === '' || !isFinite(bn[i]); }) || !(bn[0] < bn[1])) { errors.push(err('MARK:malformed', '@BODYZ needs <' + LAYER_TYPES.BODY.join('|') + '>,<z0 m>,<z1 m> with z0 < z1: ' + val, { handle: m.handle })); return; }
        var bdup = d.bodyz.find(function (q) { return q.kind === bk; });
        if (bdup && (bdup.z0 !== bn[0] || bdup.z1 !== bn[1])) { errors.push(err('MARK:conflict', '@BODYZ ' + bk + ' has two ranges', { handle: m.handle })); return; }
        if (!bdup) d.bodyz.push({ kind: bk, z0: bn[0], z1: bn[1], by: by });
      } else if (key === 'SIZE') {                                                          // bim-ootb lane L10: the NUMBER the user states for one body side: @SIZE=<body id>,<x|y|w|d>,<metres> (x,y = plan extents of a column/footing/plate; w,d = width,depth of a band kind)
        var zp = val.split(','), zg = (zp[0] || '').trim(), za = (zp[1] || '').trim(), zv = Number(zp[2]);
        if (zp.length !== 3 || !zg || ['x', 'y', 'w', 'd'].indexOf(za) < 0 || (zp[2] || '').trim() === '' || !isFinite(zv) || !(zv > 0)) { errors.push(err('MARK:malformed', '@SIZE needs <body id>,<x|y|w|d>,<metres > 0>: ' + val, { handle: m.handle })); return; }
        var zdup = d.sizes.find(function (q) { return q.id === zg && q.axis === za; });
        if (zdup && zdup.value !== zv) { errors.push(err('MARK:conflict', '@SIZE ' + zg + ' ' + za + ' has two values', { handle: m.handle })); return; }
        if (!zdup) d.sizes.push({ id: zg, axis: za, value: zv, by: by });
      } else if (key === 'LAYER') {                                                         // L4.2: name = everything before the LAST comma
        var lc = val.lastIndexOf(','), ln = lc > 0 ? val.slice(0, lc).trim() : '', lt = lc > 0 ? val.slice(lc + 1).trim() : '';
        if (!ln || !lt) { errors.push(err('MARK:malformed', '@LAYER needs <layer name>,<type>: ' + val, { handle: m.handle })); return; }
        var L0 = d.layers || (d.layers = []), ld = L0.find(function (q) { return q.layer === ln; });
        if (ld && ld.type !== lt) { errors.push(err('MARK:conflict', '@LAYER ' + ln + ' has two types: ' + ld.type + ' / ' + lt, { handle: m.handle })); return; }
        if (!ld) L0.push({ layer: ln, type: lt, by: by, handle: m.handle });
      } else if (key === 'WALLTOP') {                                                      // L2.3 D3: user-stated convention, never a default
        var wp = val.split(','), wl = Number(wp[0]);
        if (/^handle:/.test(wp[0])) {                                                       // L2.6 A: per-wall top, @WALLTOP=handle:<h>,<z_top_m>
          var wh = wp[0].slice(7).trim(), wz = Number(wp[1]), wb = wp.length === 3 ? Number(wp[2]) : undefined;   // §L1.24: optional third value = the wall's base elevation (m)
          if ((wp.length !== 2 && wp.length !== 3) || !/^[0-9A-Fa-f]+$/.test(wh) || wp[1].trim() === '' || !isFinite(wz) || (wp.length === 3 && (wp[2].trim() === '' || !isFinite(wb)))) { errors.push(err('MARK:malformed', '@WALLTOP=handle:<h>,<z_top_m>[,<z_base_m>] expected: ' + val, { handle: m.handle })); return; }
          wh = wh.toUpperCase();
          var wd = d.walltop_walls.find(function (q) { return q.wall === wh; });
          if (wd && wd.z !== wz) { errors.push(err('MARK:conflict', '@WALLTOP handle ' + wh + ' has two tops: ' + wd.z + ' / ' + wz, { handle: m.handle })); return; }
          if (wd && wd.base !== wb) { errors.push(err('MARK:conflict', '@WALLTOP handle ' + wh + ' has two bases: ' + wd.base + ' / ' + wb, { handle: m.handle })); return; }
          if (!wd) { var ent = { wall: wh, z: wz, handle: m.handle, by: by }; if (wb !== undefined) ent.base = wb; d.walltop_walls.push(ent); }
          return;
        }
        if (wp.length !== 2 || wp[0].trim() === '' || !isFinite(wl) || wp[1] !== 'slab_above') { errors.push(err('MARK:malformed', '@WALLTOP needs <level>,slab_above or handle:<h>,<z_top_m>: ' + val, { handle: m.handle })); return; }
        if (!d.walltop.some(function (q) { return q.level === wl; })) d.walltop.push({ level: wl, rule: wp[1], handle: m.handle, by: by });
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
    if (d.view === 'ELEV' || d.view === 'SECTION') {      // z comes from the position in an elevation; checked after the loop because marker order is not guaranteed
      d.tags = d.tags.filter(function (q) { if (q.z === undefined) return true; errors.push(err('MARK:malformed', '@TAG z= is not allowed in an ELEV view (z comes from the position): ' + q.text)); return false; });
    }
    if (d.layers && LAYER_TYPES[d.view]) d.layers = d.layers.filter(function (q) {      // checked after the loop: the view may come later in handle order
      if (LAYER_TYPES[d.view].indexOf(q.type) >= 0 || LAYER_TYPES.ANY.indexOf(q.type) >= 0 || LAYER_TYPES.BODY.indexOf(q.type) >= 0) return true;
      errors.push(err('MARK:layer_type', '@LAYER ' + q.layer + ',' + q.type + ': a ' + d.view + ' sheet reads ' + LAYER_TYPES[d.view].concat(LAYER_TYPES.ANY, LAYER_TYPES.BODY).join('|'), { handle: q.handle, layer: q.layer, type: q.type, view: d.view })); return false;
    });
    {
      var need = (NEED[d.view] || []).filter(function (k) { return d[k.toLowerCase()] === undefined; });
      if (d.view === 'PLAN') {
        if (Object.keys(d.gridsX).length < 2) need.push('GRIDX(>=2)');
        if (Object.keys(d.gridsY).length < 2) need.push('GRIDY(>=2)');
      } else if (d.view === 'ELEV' || d.view === 'SECTION') {
        if (Object.keys(d.gridsH).length < 2) need.push('GRIDH(>=2)');
        if (d.zs.length < 2) need.push('Z(>=2)');
        if (d.view === 'ELEV' && d.face && d.haxis) {
          var faceAxis = d.face.slice(3), hax = d.haxis.slice(1);
          if (faceAxis === hax) errors.push(err('MARK:axis_face', '@HAXIS ' + d.haxis + ' is not perpendicular to face ' + d.face));
        }
        if (d.view === 'SECTION' && d.cut && d.haxis && d.cut.split(',')[0] === d.haxis.slice(1)) errors.push(err('MARK:axis_cut', '@HAXIS ' + d.haxis + ' runs along the cut axis ' + d.cut));
      } else if (d.view === undefined) need = ['VIEW'].concat(need);
      if (need.length) errors.push(err('MARK:missing', need.join(','), { keys: need }));
    }
    function sortedBag(b) { var o = {}; Object.keys(b).sort().forEach(function (k) { o[k] = b[k]; }); return o; }       // canonical: no dependence on marker order
    d.gridsX = sortedBag(d.gridsX); d.gridsY = sortedBag(d.gridsY); d.gridsH = sortedBag(d.gridsH);
    d.zs.sort(function (p, q) { return p.z - q.z; });
    d.openings.sort(function (p, q) { return p.h0 - q.h0 || p.y0 - q.y0 || p.h1 - q.h1 || p.y1 - q.y1 || (p.kind < q.kind ? -1 : p.kind > q.kind ? 1 : 0); });
    d.labels.sort(function (p, q) { return p.x - q.x || p.y - q.y || (p.z === undefined ? -1e9 : p.z) - (q.z === undefined ? -1e9 : q.z) || (p.class < q.class ? -1 : p.class > q.class ? 1 : 0); });
    d.tags.sort(function (p, q) { return p.x - q.x || p.y - q.y || (p.z === undefined ? -1e9 : p.z) - (q.z === undefined ? -1e9 : q.z) || (p.class < q.class ? -1 : p.class > q.class ? 1 : 0); });
    d.sizes.sort(function (p, q) { return p.id < q.id ? -1 : p.id > q.id ? 1 : p.axis < q.axis ? -1 : p.axis > q.axis ? 1 : 0; });
    d.bodyz.sort(function (p, q) { return p.kind < q.kind ? -1 : p.kind > q.kind ? 1 : 0; });
    d.schedule.sort(function (p, q) { return p.text < q.text ? -1 : p.text > q.text ? 1 : p.class < q.class ? -1 : p.class > q.class ? 1 : 0; });
    d.excludes.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]; });
    d.walltop.sort(function (p, q) { return p.level - q.level; });
    d.walltop_walls.sort(function (p, q) { return parseInt(p.wall, 16) - parseInt(q.wall, 16); });
    if (d.layers) d.layers.sort(function (p, q) { return p.layer < q.layer ? -1 : p.layer > q.layer ? 1 : 0; });   // present only when the sheet states @LAYER
    return { desc: d, errors: errors };
  }

  // L4.2: the sheet's stated layer rules as a layer map (dims / grid -> 'ignore' for the readers), or null; withLayers puts them FIRST
  // (Dxf2Bim.matchRule: first match wins), so a stated rule overrides the configured set's rule for that layer and nothing else.
  function layerMap(desc) {
    if (!desc || !desc.layers || !desc.layers.length) return null;
    return { version: 1, rules: desc.layers.map(function (q) { return { match: 'exact', pattern: q.layer, type: LAYER_TYPES.ANY.indexOf(q.type) >= 0 || LAYER_TYPES.BODY.indexOf(q.type) >= 0 ? 'ignore' : q.type }; }) };
  }
  function withLayers(map, desc) {
    var lm = layerMap(desc); if (!lm) return map;
    return { version: map ? map.version : 1, rules: lm.rules.concat(map ? map.rules : []) };
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
    if (opts.handleBase > maxH) maxH = opts.handleBase;   // §L6: a KEY sheet's markings must not reuse a handle of a scope sheet's entity
    var out = [];
    marks.forEach(function (m, n) {
      var h = (maxH + 1 + n).toString(16).toUpperCase();
      out.push('0', 'TEXT', '5', h, '8', LAYER, '10', String(m.x || 0), '20', String(m.y || 0), '30', '0', '40', String(opts.height || 1), '1', m.text);
    });
    return lines.slice(0, endIdx).concat(out, lines.slice(endIdx)).join(eol);
  }

  return { readMarks: readMarks, describe: describe, describeAll: describeAll, align: align, writeMarks: writeMarks, layerMap: layerMap, withLayers: withLayers, LAYER_TYPES: LAYER_TYPES, LAYER: LAYER, UNITS: K };
});
