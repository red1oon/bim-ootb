#!/usr/bin/env node
// audit_split_pairs.js (§S12, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md) — fleet-wide detector
// for the defect class §S10 (Terminal) and §S11 (LTU_AHouse) each found by hand.
//
// THE ISSUE IT PROVES OR DISPROVES, per building: does the pair the LIVE viewer actually loads
// (`<B>_meta.db` + `<B>_geo.db`, reached through streaming.js §DB_SPLIT_DETECT's silent redirect)
// describe the same geometry as `<B>_extracted.db`, which is the only thing every node/fleet probe
// ever measures? When it does not, probe-green work under-delivers on screen indefinitely and no
// engine fix can be judged from a probe number — that is the whole S1-S9 history.
//
// It is deliberately NOT LTU- or Terminal-specific. Everything the two hand investigations keyed on
// is derived per building here: the federation guid prefix, the datum offset, whether an r-tree
// exists to serve as a pre-corruption witness, and whether geo.db's meshes are local-centred (the
// premise §S10 got wrong and §S11 had to retract — so it is now a measured column, not a belief).
//
// By DEFAULT it audits the pair AS THE USER SEES IT: `buildings/patches/<B>_meta.db.sql` is applied
// to the in-memory copy first, exactly as viewer/scene.js `A._applyPendingPatch` does on every load.
// Auditing the raw file instead would report every already-repaired building as CORRUPT forever and
// make the check useless as a gate. `--raw` audits the shipped bytes without the patch, which is the
// right mode when asking "does the DB itself still need fixing".
//
// Usage:  node scripts/audit_split_pairs.js [--dir buildings] [--building Name] [--sample 400] [--raw]
// Exit 0 when every audited pair is CLEAN, 1 when any pair is CORRUPT (so it can gate CI).
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));

const EPS = 0.05;          // ScheduleGate.EPS — below it no schedule predicate can change
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const DIR = path.resolve(arg('dir', path.join(__dirname, '..', 'buildings')));
const ONLY = arg('building', null);
const SAMPLE = parseInt(arg('sample', '400'), 10);
const RAW = process.argv.indexOf('--raw') >= 0;
const PATCHDIR = path.join(DIR, 'patches');

const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const q = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return null; } };
// Same statement-aware batching as viewer/scene.js A._runSqlChunked. A single db.run() over a
// multi-thousand-statement patch crashes THIS project's bundled sql-wasm ("memory access out of
// bounds") — measured again here on Hospital_meta.db.sql (1.4MB, ~9.5K statements). Accumulate
// lines until one ends in `;` so multi-line CREATE TABLEs never split, then ~500 statements per run.
function runSqlChunked(db, sql) {
  const statements = []; let buf = [];
  for (const ln of sql.split('\n')) {
    if (!ln.trim().length) continue;
    buf.push(ln);
    if (/;\s*$/.test(ln)) { statements.push(buf.join('\n')); buf = []; }
  }
  if (buf.length) statements.push(buf.join('\n'));
  for (let i = 0; i < statements.length; i += 500) db.run(statements.slice(i, i + 500).join('\n'));
  return statements.length;
}

const hasTable = (db, t) => (q(db, "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name='" + t + "'") || []).length > 0;

// One wasm heap cannot hold several of these buildings in sequence — geo.db runs 115-249MB and
// sql.js keeps the whole file in linear memory with no paging (see the LTU_AHouse RAM finding), so a
// second large building throws "memory access out of bounds" mid-audit. When auditing more than one
// building the parent therefore FORKS itself once per building: each row gets a fresh heap that the
// OS reclaims on exit. A single --building run stays in-process.
async function main() {
  const names = Array.from(new Set(fs.readdirSync(DIR)
    .filter(f => /_meta\.db$/.test(f)).map(f => f.replace(/_meta\.db$/, ''))))
    .filter(b => !ONLY || b === ONLY).sort();
  if (!names.length) { console.log('§PAIR_AUDIT no <Name>_meta.db found under ' + DIR); return 0; }

  if (!ONLY && names.length > 1) {
    const { spawnSync } = require('child_process');
    let corrupt = 0;
    for (const B of names) {
      const r = spawnSync(process.execPath, [__filename, '--dir', DIR, '--building', B,
        '--sample', String(SAMPLE)].concat(RAW ? ['--raw'] : []), { encoding: 'utf8', maxBuffer: 1 << 26 });
      process.stdout.write(r.stdout || '');
      if (r.stderr && r.stderr.trim()) process.stderr.write(r.stderr);
      if (r.status === 1) corrupt++;
      else if (r.status !== 0) { console.log('§PAIR_AUDIT ' + B + ' ERROR exit=' + r.status); corrupt++; }
    }
    console.log('§PAIR_AUDIT_SUMMARY audited=' + names.length + ' corrupt=' + corrupt + ' ' + (corrupt ? 'FAIL' : 'PASS'));
    return corrupt ? 1 : 0;
  }

  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  let corrupt = 0;
  for (const B of names) {
    const fMeta = path.join(DIR, B + '_meta.db'), fExt = path.join(DIR, B + '_extracted.db'),
          fGeo = path.join(DIR, B + '_geo.db');
    if (!fs.existsSync(fExt)) { console.log('§PAIR_AUDIT ' + B + ' SKIP — no ' + B + '_extracted.db to compare against'); continue; }
    // Load meta the way the viewer does: shipped bytes + its pending patch (unless --raw).
    const me = new SQL.Database(fs.readFileSync(fMeta)), ex = new SQL.Database(fs.readFileSync(fExt));
    const pFile = path.join(PATCHDIR, B + '_meta.db.sql');
    let patched = 'raw';
    if (!RAW && fs.existsSync(pFile)) {
      try { patched = 'patched(' + runSqlChunked(me, fs.readFileSync(pFile, 'utf8')) + ' stmts)'; }
      catch (e) { patched = 'PATCH_FAILED(' + (e && e.message) + ')'; }
    } else if (!RAW) { patched = 'no-patch'; }

    // ── guid mapping: the federation prefix is DERIVED, never assumed. extracted guids may carry
    // `T0_<B>_`; a naive diff reports zero overlap and sends the reader down a "different
    // extractions" path that is usually false (§S10 lost iterations to exactly this).
    const mt = new Map((q(me, 'SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms') || [])
      .map(v => [String(v[0]), v]));
    const exRows = q(ex, 'SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms') || [];
    let prefix = '';
    const cand = 'T0_' + B + '_';
    if (exRows.length && String(exRows[0][0]).startsWith(cand) && !mt.has(String(exRows[0][0]))) prefix = cand;
    const et = new Map(exRows.map(v => { const g = String(v[0]); return [prefix && g.startsWith(prefix) ? g.slice(prefix.length) : g, v]; }));
    const common = [];
    mt.forEach((v, g) => { if (et.has(g)) common.push(g); });

    // ── datum offset (per-axis median) + per-element deviation from it ──
    const M = { x: med(common.map(g => mt.get(g)[1] - et.get(g)[1])),
                y: med(common.map(g => mt.get(g)[2] - et.get(g)[2])),
                z: med(common.map(g => mt.get(g)[3] - et.get(g)[3])) };
    let off = 0, maxDev = 0, bboxBad = 0, maxBbox = 0;
    for (const g of common) {
      const m = mt.get(g), e = et.get(g);
      const d = Math.max(Math.abs(m[1] - (e[1] + M.x)), Math.abs(m[2] - (e[2] + M.y)), Math.abs(m[3] - (e[3] + M.z)));
      if (d > EPS) { off++; if (d > maxDev) maxDev = d; }
      const b = Math.max(Math.abs(m[4] - e[4]), Math.abs(m[5] - e[5]), Math.abs(m[6] - e[6]));
      if (b > EPS) bboxBad++;
      if (b > maxBbox) maxBbox = b;
    }
    // ── z-collapse signature: rows pinned to exactly 0 on one side only (§S11's smoking gun) ──
    const z0m = common.filter(g => mt.get(g)[3] === 0).length, z0e = common.filter(g => et.get(g)[3] === 0).length;

    // ── r-tree: is there a pre-corruption witness inside meta.db itself, and does it side with
    //    extracted or with the (possibly corrupted) transforms? This is what decides whether a
    //    repair can be 4 set-based statements or must be one UPDATE per row.
    let rt = 'none', rtreeVsTransform = null, rtreeVsExtracted = null;
    if (hasTable(me, 'elements_rtree')) {
      const rows = q(me, 'SELECT m.guid,(r.minX+r.maxX)/2.0,(r.minY+r.maxY)/2.0,(r.minZ+r.maxZ)/2.0 ' +
        'FROM elements_meta m JOIN elements_rtree r ON r.id=m.id') || [];
      if (rows.length) {
        let a = 0, b = 0, n = 0;
        for (const v of rows) {
          const g = String(v[0]), m = mt.get(g), e = et.get(g);
          if (!m || !e) continue;
          n++;
          if (Math.max(Math.abs(v[1] - m[1]), Math.abs(v[2] - m[2]), Math.abs(v[3] - m[3])) > EPS) a++;
          if (Math.max(Math.abs(v[1] - (e[1] + M.x)), Math.abs(v[2] - (e[2] + M.y)), Math.abs(v[3] - (e[3] + M.z))) <= EPS) b++;
        }
        rt = n + ' rows'; rtreeVsTransform = a; rtreeVsExtracted = b + '/' + n;
      }
    }

    // ── geo.db mesh frame: LOCAL-centred or WORLD-baked? The §S10 premise that parked LTU for a
    //    session claimed world-baked without measuring. Decide it, per building, from the bytes.
    //    Read through the sqlite3 CLI, NOT sql.js: geo.db runs 115-249MB and sql.js holds the whole
    //    file in wasm linear memory, which OOMs the heap that already has meta+extracted in it
    //    (measured: Hospital, 228MB geo -> "memory access out of bounds"). The CLI streams instead.
    let meshFrame = 'no geo.db';
    if (fs.existsSync(fGeo)) {
      const { execFileSync } = require('child_process');
      const sq = sql => { try { return execFileSync('sqlite3', [fGeo, sql], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim(); }
                          catch (e) { return null; } };
      const tbls = (sq("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('base_geometries','component_geometries')") || '').split('\n').filter(Boolean);
      if (!tbls.length) meshFrame = 'no geometry table';
      else {
        const tbl = tbls[0];
        const inst = q(me, 'SELECT guid, geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL LIMIT ' + SAMPLE) || [];
        const want = new Map();
        for (const [g, h] of inst) { const m = mt.get(String(g)); if (m && !want.has(String(h))) want.set(String(h), m); }
        const keys = Array.from(want.keys());
        let local = 0, world = 0;
        for (let ci = 0; ci < keys.length; ci += 50) {
          const chunk = keys.slice(ci, ci + 50);
          const inList = chunk.map(h => "'" + h.replace(/'/g, "''") + "'").join(',');
          const out = sq('SELECT geometry_hash || "|" || hex(vertices) FROM ' + tbl + ' WHERE geometry_hash IN (' + inList + ')');
          if (!out) continue;
          for (const line of out.split('\n')) {
            const p2 = line.indexOf('|'); if (p2 < 0) continue;
            const h = line.slice(0, p2), hex = line.slice(p2 + 1);
            const m = want.get(h); if (!m || hex.length < 72) continue;
            const buf = Buffer.from(hex, 'hex');
            const f = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
            for (let i = 0; i + 2 < f.length; i += 3) {
              if (f[i] < x0) x0 = f[i]; if (f[i] > x1) x1 = f[i];
              if (f[i + 1] < y0) y0 = f[i + 1]; if (f[i + 1] > y1) y1 = f[i + 1];
              if (f[i + 2] < z0) z0 = f[i + 2]; if (f[i + 2] > z1) z1 = f[i + 2];
            }
            const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
            const dLocal = Math.sqrt(cx * cx + cy * cy + cz * cz);
            const dWorld = Math.sqrt((cx - m[1]) ** 2 + (cy - m[2]) ** 2 + (cz - m[3]) ** 2);
            if (dLocal < dWorld) local++; else world++;
          }
        }
        meshFrame = local + ' local / ' + world + ' world';
      }
    }

    // A pair that shares no elements is not "clean" — it is unaudited. Never let an empty join,
    // a failed patch or a missing table print a green row.
    const broken = common.length === 0 || /FAILED/.test(patched);
    const verdict = broken ? 'UNAUDITABLE' : (off > 0 ? 'CORRUPT' : 'CLEAN');
    if (broken || off > 0) corrupt++;
    console.log('§PAIR_AUDIT ' + B + ' ' + verdict + ' [' + patched + ']' +
      ' meta=' + mt.size + ' ext=' + et.size + ' common=' + common.length +
      ' prefix=' + (prefix || '(none)') +
      ' offset=(' + M.x.toFixed(3) + ',' + M.y.toFixed(3) + ',' + M.z.toFixed(3) + ')' +
      ' deviating>' + EPS + '=' + off + ' maxDev=' + maxDev.toFixed(2) + 'm' +
      ' bboxMismatch=' + bboxBad + ' (max ' + maxBbox.toFixed(3) + ')' +
      ' zZero meta/ext=' + z0m + '/' + z0e +
      ' rtree=' + rt + (rtreeVsTransform === null ? '' :
        ' rtreeVsTransform=' + rtreeVsTransform + ' rtreeVsExtracted=' + rtreeVsExtracted) +
      ' meshFrame=' + meshFrame);
    me.close(); ex.close();
  }
  if (!ONLY) console.log('§PAIR_AUDIT_SUMMARY audited=' + names.length + ' corrupt=' + corrupt + ' ' + (corrupt ? 'FAIL' : 'PASS'));
  return corrupt ? 1 : 0;
}
main().then(c => process.exit(c)).catch(e => { console.error('§PAIR_AUDIT ERR ' + (e && e.stack || e)); process.exit(2); });
