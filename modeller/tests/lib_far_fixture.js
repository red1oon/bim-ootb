// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// lib_far_fixture.js — the RT_FAR fixture method, ONE copy (W-EXPORT-ROUNDTRIP and W-ONE-FRAME both call it): a copy of a public IFC with the IfcSite placement moved to
// map-scale coordinates, edited as STEP text (one new IfcCartesianPoint + the site IfcAxis2Placement3D's Location reference). Optional site-fact edits for W-ONE-FRAME F4.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

// farCopy(src, dx, dy, opts) → { file, dir, log }
//   opts.lat / opts.lon: [deg,min,sec,millionths] (or null to write $) replace the IfcSite RefLatitude/RefLongitude
//   opts.dz: also move the site up by dz metres (z columns)
//   opts.outlier: { cls: 'IFCSPACE'|'IFCOPENINGELEMENT', dy, dx } (W-ONE-FRAME F1b): ONE more element of that class, a clone of the file's first one (same shape) placed dx,dy metres from the moved site origin
//   opts.trueNorth: [x,y] a TrueNorth direction written into the 'Model' IfcGeometricRepresentationContext
function farCopy(src, dx, dy, opts) {
  opts = opts || {}; const dz = opts.dz || 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtfar-')), dst = path.join(dir, 'Duplex_FAR.ifc');
  let t = fs.readFileSync(src, 'latin1');
  const m = /^(#\d+)=IFCSITE\([^;]*?,(#\d+),\$,\$,\.ELEMENT\./m.exec(t), lp = new RegExp('^' + m[2] + '=IFCLOCALPLACEMENT\\(\\$,(#\\d+)\\);', 'm').exec(t), ax = new RegExp('^(' + lp[1] + '=IFCAXIS2PLACEMENT3D\\()(#\\d+)(,[^;]*\\);)', 'm').exec(t), oldPt = new RegExp('^' + ax[2] + '=IFCCARTESIANPOINT\\(([^;]*)\\);', 'm').exec(t);
  const maxId = () => Math.max.apply(null, (t.match(/^#(\d+)=/gm) || []).map(x => parseInt(x.slice(1))));
  const newId = '#' + (maxId() + 1), newPt = `((${dx.toFixed(3)},${dy.toFixed(3)},${dz.toFixed(3)}))`;
  const addEntity = line => { const k = t.lastIndexOf('\nENDSEC;'); t = t.slice(0, k) + '\n' + line + t.slice(k); };   // the DATA section's ENDSEC (the last one): the first ENDSEC closes the HEADER, where an entity is not an entity
  t = t.replace(ax[0], ax[1] + newId + ax[3]); addEntity(`${newId}=IFCCARTESIANPOINT${newPt};`);   // the origin point #3 is shared by other placements, so it is left alone and the site gets its own
  const edits = [];
  if (opts.lat !== undefined || opts.lon !== undefined) {   // IFCSITE(guid,owner,name,desc,longname,placement,compositionType... : the site line carries ,.ELEMENT.,(lat),(lon),elev,...
    const siteRe = new RegExp('^(' + m[1] + '=IFCSITE\\([^;]*?\\.ELEMENT\\.,)(\\([^)]*\\)|\\$),(\\([^)]*\\)|\\$),', 'm'), sm = siteRe.exec(t);
    if (!sm) throw new Error('lib_far_fixture: IfcSite line not in the expected shape');
    const cpa = a => a ? `(${a.join(',')})` : '$';
    t = t.replace(sm[0], sm[1] + (opts.lat !== undefined ? cpa(opts.lat) : sm[2]) + ',' + (opts.lon !== undefined ? cpa(opts.lon) : sm[3]) + ',');
    edits.push('site lat=' + (opts.lat ? opts.lat.join('/') : '$') + ' lon=' + (opts.lon ? opts.lon.join('/') : '$'));
  }
  if (opts.trueNorth) {
    const dId = '#' + (maxId() + 1), ctx = /^(#\d+=IFCGEOMETRICREPRESENTATIONCONTEXT\(\$,'Model',3,[^,]*,#\d+,)\$(\);)/m.exec(t);
    if (!ctx) throw new Error('lib_far_fixture: Model context not in the expected shape');
    t = t.replace(ctx[0], ctx[1] + dId + ctx[2]); addEntity(`${dId}=IFCDIRECTION((${opts.trueNorth.map(v => v.toFixed(9)).join(',')}));`);
    edits.push('TrueNorth=' + opts.trueNorth.join(','));
  }
  if (opts.outlier) {
    const o = opts.outlier, tm = new RegExp("^(#\\d+)=" + o.cls + "\\(('[^']*')(,#\\d+,(?:'[^']*'|\\$),(?:'[^']*'|\\$),(?:'[^']*'|\\$),)(#\\d+)(,[^;]*\\);)", 'm').exec(t);
    if (!tm) throw new Error('lib_far_fixture: no ' + o.cls + ' to clone');
    const pt = '#' + (maxId() + 1); addEntity(`${pt}=IFCCARTESIANPOINT((${(o.dx || 0).toFixed(3)},${o.dy.toFixed(3)},0.));`);
    const ax2 = '#' + (maxId() + 1); addEntity(`${ax2}=IFCAXIS2PLACEMENT3D(${pt},$,$);`);
    const lp2 = '#' + (maxId() + 1); addEntity(`${lp2}=IFCLOCALPLACEMENT(${m[2]},${ax2});`);
    const el = '#' + (maxId() + 1); addEntity(`${el}=${o.cls}('0OUTLIERxxxxxxxxxxxxx'${tm[3]}${lp2}${tm[5]}`);
    edits.push(`outlier ${o.cls} ${el} (clone of ${tm[1]}) at site+(${o.dx || 0},${o.dy},0)`);
  }
  fs.writeFileSync(dst, t, 'latin1');
  return { file: dst, dir, log: `§RT-FAR site ${m[1]} placement ${m[2]} -> axis ${lp[1]} Location ${ax[2]} was ${oldPt[1]}; now ${newId}=IFCCARTESIANPOINT${newPt} (new point appended; the axis ${lp[1]} Location ${ax[2]} -> ${newId}). Copy: ${dst}` + (edits.length ? ' edits: ' + edits.join('; ') : '') };
}
module.exports = { farCopy };
