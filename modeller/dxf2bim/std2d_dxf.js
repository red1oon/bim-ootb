// ⚠ DO NOT REMOVE — std2d JS port, slice S3 (DXF writer). Spec: bim-ootb prompts/DXF2BIM_MODELLER_LANE.md §L5.6.
// Minimal ASCII DXF (AC1024) writer for the entity set std2d.py emits through ezdxf: LINE, ARC, CIRCLE, LWPOLYLINE, SOLID HATCH, TEXT, linear DIMENSION
// (+ a simple *D block so CAD viewers draw it), XDATA BIMGUID. Deterministic: handles are sequential, no timestamps. Pure: returns a string.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Std2dDxf = factory(); })(this, function () {
  'use strict';
  const num = v => { const s = String(Number(v)); return /^-?\d+$/.test(s) ? s + '.0' : s; };   // always a real, as ezdxf writes
  const ALIGN = { MIDDLE_CENTER: [1, 2], BOTTOM_LEFT: [0, 1] };   // [72 halign, 73 valign]

  class Doc {
    constructor(opts) {
      this.layers = opts.layers;            // name -> [aci, lineweight, linetype]
      this.scale = opts.scale; this.dim = opts.dim;   // dim: {txt, asz, ...}
      this.ents = []; this.meta = []; this.blocks = []; this.h = 0xA0; this.dimN = 0; this.lastGuid = null;   // meta[i] = { type, guid (owner hint), layer, grid, block } for scoped splits (§L6)
    }
    handle() { return (this.h++).toString(16).toUpperCase(); }
    _xd(g) { return g ? ['1001', 'BIMGUID', '1000', g] : []; }
    _e(type, layer, body, sub, extra, guid, lt, grid) {
      const own = guid || (type === 'HATCH' ? this.lastGuid : null);   // a wall hatch belongs to the polyline written just before it
      this.lastGuid = guid || (type === 'HATCH' ? this.lastGuid : null);
      this.meta.push({ type, guid: own, layer, grid: grid || null });
      this.ents.push(['0', type, '5', this.handle(), '330', '17', '100', 'AcDbEntity', '8', layer].concat(lt ? ['6', lt] : [], extra || [], sub, body, this._xd(guid)));
    }
    line(layer, a, b, o) { o = o || {}; this._e('LINE', layer, ['10', num(a[0]), '20', num(a[1]), '30', '0.0', '11', num(b[0]), '21', num(b[1]), '31', '0.0'], ['100', 'AcDbLine'], null, o.guid, o.linetype, o.grid); }
    circle(layer, c, r, o) { o = o || {}; this._e('CIRCLE', layer, ['10', num(c[0]), '20', num(c[1]), '30', '0.0', '40', num(r)], ['100', 'AcDbCircle'], null, o.guid, o.linetype, o.grid); }
    arc(layer, c, r, a0, a1, o) { o = o || {}; this._e('ARC', layer, ['10', num(c[0]), '20', num(c[1]), '30', '0.0', '40', num(r), '100', 'AcDbArc', '50', num(a0), '51', num(a1)], ['100', 'AcDbCircle'], null, o.guid, o.linetype); }
    lwpoly(layer, pts, closed, o) {
      o = o || {}; const b = ['90', String(pts.length), '70', closed ? '1' : '0']; if (typeof o.elevation === 'number') b.push('38', num(o.elevation)); if (typeof o.thickness === 'number') b.push('39', num(o.thickness)); pts.forEach(p => b.push('10', num(p[0]), '20', num(p[1])));
      this._e('LWPOLYLINE', layer, b, ['100', 'AcDbPolyline'], null, o.guid, o.linetype);
    }
    hatch(layer, color, pts, o) {   // SOLID, one polyline boundary path
      o = o || {}; const b = ['10', '0.0', '20', '0.0', '30', '0.0', '210', '0.0', '220', '0.0', '230', '1.0', '2', 'SOLID', '70', '1', '71', '0', '91', '1', '92', '3', '72', '0', '73', '1', '93', String(pts.length)];
      pts.forEach(p => b.push('10', num(p[0]), '20', num(p[1]))); b.push('97', '0', '75', '1', '76', '1', '98', '0');
      this._e('HATCH', layer, b, ['100', 'AcDbHatch'], ['62', String(color)], o.guid);
    }
    text(layer, s, pos, h, o) {
      o = o || {}; const al = ALIGN[o.align || 'BOTTOM_LEFT'] || ALIGN.BOTTOM_LEFT, rot = o.rot || 0;
      const b = ['10', num(pos[0]), '20', num(pos[1]), '30', '0.0', '40', num(h), '1', s].concat(rot ? ['50', num(rot)] : [], ['72', String(al[0]), '11', num(pos[0]), '21', num(pos[1]), '31', '0.0', '100', 'AcDbText', '73', String(al[1])]);
      this._e('TEXT', layer, b, ['100', 'AcDbText'], null, o.guid, null, o.grid);
    }
    // linear dimension: base = a point on the dimension line, p1/p2 = measured points, angle 0 (horizontal) or 90 (vertical); loc = optional moved text position
    dimension(layer, base, p1, p2, angle, loc) {
      const n = ++this.dimN, meas = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const h = angle === 0 ? [[p1[0], base[1]], [p2[0], base[1]]] : [[base[0], p1[1]], [base[0], p2[1]]];
      const mid = loc || [(h[0][0] + h[1][0]) / 2, (h[0][1] + h[1][1]) / 2];
      const bl = [['0', 'LINE', '8', layer, '10', num(h[0][0]), '20', num(h[0][1]), '30', '0.0', '11', num(h[1][0]), '21', num(h[1][1]), '31', '0.0'],
        ['0', 'LINE', '8', layer, '10', num(p1[0]), '20', num(p1[1]), '30', '0.0', '11', num(h[0][0]), '21', num(h[0][1]), '31', '0.0'],
        ['0', 'LINE', '8', layer, '10', num(p2[0]), '20', num(p2[1]), '30', '0.0', '11', num(h[1][0]), '21', num(h[1][1]), '31', '0.0'],
        ['0', 'TEXT', '8', layer, '10', num(mid[0]), '20', num(mid[1]), '30', '0.0', '40', num(this.dim.txt * this.scale), '1', String(Math.round(meas)), '72', '1', '11', num(mid[0]), '21', num(mid[1]), '31', '0.0', '73', '2']];
      this.blocks.push(['0', 'BLOCK', '5', this.handle(), '100', 'AcDbEntity', '8', '0', '100', 'AcDbBlockBegin', '2', '*D' + n, '70', '1', '10', '0.0', '20', '0.0', '30', '0.0', '3', '*D' + n, '1', ''].concat(...bl, ['0', 'ENDBLK', '5', this.handle(), '100', 'AcDbEntity', '8', '0', '100', 'AcDbBlockEnd']));
      this.lastGuid = null; this.meta.push({ type: 'DIMENSION', guid: null, layer, grid: null, block: this.blocks.length - 1 });
      this.ents.push(['0', 'DIMENSION', '5', this.handle(), '330', '17', '100', 'AcDbEntity', '8', layer, '100', 'AcDbDimension', '280', '0', '2', '*D' + n, '3', 'STD100',
        '10', num(base[0]), '20', num(base[1]), '30', '0.0', '11', num(mid[0]), '21', num(mid[1]), '31', '0.0', '70', '32', '71', '5', '1', '<>',
        '100', 'AcDbAlignedDimension', '13', num(p1[0]), '23', num(p1[1]), '33', '0.0', '14', num(p2[0]), '24', num(p2[1]), '34', '0.0', '50', num(angle), '100', 'AcDbRotatedDimension']);
      return meas;
    }
    // keep(meta, index) -> boolean: serialise a subset of the entities (same handles); dimension blocks only for kept DIMENSIONs. No argument = everything (unchanged output).
    toString(keep) {
      const o = [], P = (...a) => a.forEach(x => o.push(x));
      const ents = keep ? this.ents.filter((e, i) => keep(this.meta[i], i)) : this.ents;
      const blockKeep = new Set(); if (keep) this.meta.forEach((m, i) => { if (m.type === 'DIMENSION' && keep(m, i)) blockKeep.add(m.block); });
      const blocks = keep ? this.blocks.filter((b, i) => blockKeep.has(i)) : this.blocks;
      P('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1024', '9', '$INSUNITS', '70', '4', '9', '$MEASUREMENT', '70', '1', '9', '$LTSCALE', '40', num(this.scale / 2), '9', '$HANDSEED', '5', (this.h + 0x1000).toString(16).toUpperCase(), '0', 'ENDSEC');
      P('0', 'SECTION', '2', 'TABLES');
      P('0', 'TABLE', '2', 'LTYPE', '70', '3',
        '0', 'LTYPE', '2', 'Continuous', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0',
        '0', 'LTYPE', '2', 'DASHED', '70', '0', '3', 'Dashed', '72', '65', '73', '2', '40', '19.05', '49', '12.7', '74', '0', '49', '-6.35', '74', '0',
        '0', 'LTYPE', '2', 'CENTER', '70', '0', '3', 'Center', '72', '65', '73', '4', '40', '50.8', '49', '31.75', '74', '0', '49', '-6.35', '74', '0', '49', '6.35', '74', '0', '49', '-6.35', '74', '0', '0', 'ENDTAB');
      const names = Object.keys(this.layers);
      P('0', 'TABLE', '2', 'LAYER', '70', String(names.length));
      names.forEach(n => P('0', 'LAYER', '2', n, '70', '0', '62', String(this.layers[n][0]), '6', this.layers[n][2], '370', String(this.layers[n][1])));
      P('0', 'ENDTAB', '0', 'TABLE', '2', 'STYLE', '70', '1', '0', 'STYLE', '2', 'Standard', '70', '0', '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '2.5', '3', 'txt', '4', '', '0', 'ENDTAB');
      P('0', 'TABLE', '2', 'APPID', '70', '2', '0', 'APPID', '2', 'ACAD', '70', '0', '0', 'APPID', '2', 'BIMGUID', '70', '0', '0', 'ENDTAB');
      P('0', 'TABLE', '2', 'DIMSTYLE', '70', '1', '0', 'DIMSTYLE', '2', 'STD100', '70', '0', '40', num(this.scale), '140', num(this.dim.txt), '41', num(this.dim.asz), '0', 'ENDTAB', '0', 'ENDSEC');
      P('0', 'SECTION', '2', 'BLOCKS'); blocks.forEach(b => P(...b)); P('0', 'ENDSEC');
      P('0', 'SECTION', '2', 'ENTITIES'); ents.forEach(e => P(...e)); P('0', 'ENDSEC', '0', 'EOF');
      return o.join('\n') + '\n';
    }
  }
  return { Doc, num };
});
