// inject_openings.js — Path B of RESUME_FLEET_OPENINGS_BACKFILL.md §4.6 (spec written first).
// Injects IfcOpeningElement rows from a fresh attributed-source extraction into a COPY of an
// installed fleet DB whose recorded pipeline cannot be re-run (carve chains, browser imports).
// Frame equality is PROVEN numerically before any write: matched-GUID constant-translation fit.
// Mirrors the LTU reference shape: elements_meta + element_transforms + element_instances
// (LTU's own opening instance hashes are dangling in its _geo.db — that IS the reference shape).
// No walker/engine changes. No invention: every injected value is copied or translated by the fit.
//
// Usage:
//   node inject_openings.js --target <copy.db> --source <staged.db> [--prefix T0_Terminal_]
//                           [--building Hospital] [--disc ARC] [--fit-only]
const _path = require('path');
let Database;
for (const base of [_path.join(process.env.HOME, 'bim-compiler'), _path.join(process.env.HOME, 'bim-ootb')]) {
  try { Database = require(_path.join(base, 'node_modules', 'better-sqlite3')); break; } catch (e) {}
}
if (!Database) { console.error('better-sqlite3 not found in bim-compiler or bim-ootb node_modules'); process.exit(1); }

const args = process.argv.slice(2);
function opt(name, dflt) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; }
const TARGET = opt('target'), SOURCE = opt('source');
// §5.5 lesson: --disc ARC flattened Hospital's attributed 665 ARC + 70 STR opening split and the
// fleet witness caught it (cur-mode fusion divergence). Default is now COPY the source row's
// discipline — the extraction pipeline already assigned it deterministically; --disc overrides
// only when explicitly passed.
const PREFIX = opt('prefix', ''), BUILDING = opt('building', ''), DISC = opt('disc', '');
const FIT_ONLY = args.includes('--fit-only');
if (!TARGET || !SOURCE) { console.error('need --target and --source'); process.exit(1); }

const tgt = new Database(TARGET), src = new Database(SOURCE, { readonly: true });

// ── Guard: no double-inject ──
const pre = tgt.prepare("SELECT count(*) c FROM elements_meta WHERE ifc_class='IfcOpeningElement'").get().c;
if (pre > 0) { console.log('§INJ_ABORT target already has ' + pre + ' openings'); process.exit(2); }

// ── 1. Frame fit ──
const srcTf = src.prepare(
  "SELECT m.guid g, t.center_x x, t.center_y y, t.center_z z, t.bbox_x bx, t.bbox_y by2 " +
  "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
  "WHERE (m.ifc_class LIKE 'IfcDoor%' OR m.ifc_class='IfcWallStandardCase') AND t.center_x IS NOT NULL").all();
const tgtGet = tgt.prepare(
  "SELECT t.center_x x, t.center_y y, t.center_z z, t.bbox_x bx, t.bbox_y by2 " +
  "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.guid=? AND t.center_x IS NOT NULL");
const dx = [], dy = [], dz = [], dbb = [];
for (const r of srcTf) {
  const t = tgtGet.get(PREFIX + r.g);
  if (!t) continue;
  dx.push(t.x - r.x); dy.push(t.y - r.y); dz.push(t.z - r.z);
  if (r.bx != null && t.bx != null) dbb.push(Math.abs(t.bx - r.bx), Math.abs((t.by2 || 0) - (r.by2 || 0)));
}
const n = dx.length;
const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) * (v - m)))); };
const med = a => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const MX = mean(dx), MY = mean(dy), MZ = mean(dz);
const SX = sd(dx), SY = sd(dy), SZ = sd(dz), MB = med(dbb);
console.log('§INJ_FIT n=' + n + ' dx=' + MX.toFixed(4) + ' dy=' + MY.toFixed(4) + ' dz=' + MZ.toFixed(4) +
  ' sd=' + SX.toFixed(4) + ',' + SY.toFixed(4) + ',' + SZ.toFixed(4));
console.log('§INJ_SCALE medDbbox=' + MB.toFixed(4));
const FIT_OK = n >= 30 && SX <= 0.02 && SY <= 0.02 && SZ <= 0.02 && MB <= 0.02;
console.log('§INJ_FIT_VERDICT ' + (FIT_OK ? 'PASS' : 'FAIL'));
if (!FIT_OK || FIT_ONLY) process.exit(FIT_OK ? 0 : 3);

// ── 2. Inject ──
const metaCols = tgt.prepare('PRAGMA table_info(elements_meta)').all().map(c => c.name);
const hasGeoTable = !!tgt.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='component_geometries'").get();
const geoCols = hasGeoTable ? tgt.prepare('PRAGMA table_info(component_geometries)').all().map(c => c.name) : [];
const ops = src.prepare(
  "SELECT m.guid g, m.ifc_class ic, m.element_name nm, m.storey st, m.discipline dc, m.material_name mn, m.material_rgba mr, " +
  "t.center_x x, t.center_y y, t.center_z z, t.rotation_x rx, t.rotation_y ry, t.rotation_z rz, " +
  "t.bbox_x bx, t.bbox_y by2, t.bbox_z bz, i.geometry_hash h " +
  "FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid " +
  "LEFT JOIN element_instances i ON i.guid=m.guid WHERE m.ifc_class='IfcOpeningElement'").all();

const insMeta = tgt.prepare('INSERT OR IGNORE INTO elements_meta (' +
  metaCols.filter(c => c !== 'id').join(',') + ') VALUES (' +
  metaCols.filter(c => c !== 'id').map(() => '?').join(',') + ')');
const insTf = tgt.prepare('INSERT OR IGNORE INTO element_transforms ' +
  '(guid,center_x,center_y,center_z,rotation_x,rotation_y,rotation_z,bbox_x,bbox_y,bbox_z) VALUES (?,?,?,?,?,?,?,?,?,?)');
const insInst = tgt.prepare('INSERT OR IGNORE INTO element_instances (guid,geometry_hash) VALUES (?,?)');
const srcGeo = hasGeoTable ? src.prepare('SELECT * FROM component_geometries WHERE geometry_hash=?') : null;
let insGeo = null;
if (hasGeoTable) insGeo = tgt.prepare('INSERT OR IGNORE INTO component_geometries (' + geoCols.join(',') + ') VALUES (' + geoCols.map(() => '?').join(',') + ')');

let cMeta = 0, cTf = 0, cInst = 0, cGeo = 0;
const txn = tgt.transaction(() => {
  for (const o of ops) {
    const guid = PREFIX + o.g;
    const vals = metaCols.filter(c => c !== 'id').map(c => {
      switch (c) {
        case 'guid': return guid;
        case 'ifc_class': return o.ic;
        case 'element_name': return o.nm;
        case 'element_type': return null;
        case 'storey': return o.st;
        case 'discipline': return DISC || o.dc;
        case 'material_name': return o.mn;
        case 'material_rgba': return o.mr;
        case 'building': return BUILDING || null;
        default: return null;
      }
    });
    cMeta += insMeta.run(...vals).changes;
    if (o.x != null) cTf += insTf.run(guid, o.x + MX, o.y + MY, o.z + MZ, o.rx, o.ry, o.rz, o.bx, o.by2, o.bz).changes;
    if (o.h) {
      cInst += insInst.run(guid, o.h).changes;
      if (hasGeoTable && srcGeo) {
        const g = srcGeo.get(o.h);
        if (g) cGeo += insGeo.run(...geoCols.map(c => c in g ? g[c] : (c === 'building' ? (BUILDING || null) : null))).changes;
      }
    }
  }
});
txn();
console.log('§INJ_ROWS meta=' + cMeta + ' tf=' + cTf + ' inst=' + cInst + ' geo=' + cGeo);
const post = tgt.prepare("SELECT count(*) c FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
  "WHERE m.ifc_class='IfcOpeningElement' AND t.center_x IS NOT NULL").get().c;
console.log('§INJ_VERIFY openings_with_transforms=' + post);
