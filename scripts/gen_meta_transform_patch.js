#!/usr/bin/env node
// gen_meta_transform_patch.js (§S12, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md) — generic
// repair-patch generator for the split-pair transform corruption that §S10 (Terminal) and §S11
// (LTU_AHouse) each fixed by hand. Detected fleet-wide by scripts/audit_split_pairs.js; this is the
// other half — given a building whose `<B>_meta.db` disagrees with `<B>_extracted.db`, it writes
// `buildings/patches/<B>_meta.db.sql` for the shipped `A._applyPendingPatch` loader.
//
// NOTHING here is building-specific. Derived per run: the federation guid prefix, the datum offset
// (per-axis median), the repair set, and — the one real decision — WHICH OF TWO PATCH FORMS to emit:
//
//   RTREE form (4 set-based statements, ~2KB, independent of row count). Used when meta.db carries a
//     populated `elements_rtree` whose box centres agree with extracted+offset on >=99% of rows. That
//     table is built at extraction time and was not rewritten by whatever corrupted the transforms,
//     so it is a pre-corruption witness of the same values, already inside the file. LTU_AHouse:
//     125,698/125,698 agreement, 40,805 rows repaired by 4 statements.
//   ROWS form (one UPDATE per repaired row) — the fallback when there is no r-tree, or the r-tree
//     does not agree with extracted (so it is not a witness). Terminal_meta.db has no r-tree at all;
//     its §S10 patch is this form, 2,074 rows.
//
// Size matters more than it looks: _applyPendingPatch re-fetches and re-applies the WHOLE patch, plus
// a full sql.js export() of the DB, on EVERY load. The r-tree form keeps that flat no matter how bad
// the corruption is; the rows form scales with it (LTU would have been ~4MB on a 52MB DB).
//
// Selection runs at HALF ScheduleGate.EPS, not at it, so no row is left within half a tolerance of
// flipping a predicate — measured need: 49 LTU rows are displaced by EXACTLY 0.050000 and a strict
// `> EPS` left them behind, which kept the fleet audit red forever.
//
// A patch file can have MORE THAN ONE OWNER and this generator must never clobber the others.
// buildings/patches/Terminal_meta.db.sql is the proof: 1,119 lines of compiled-room content
// (spatial_structure DROP/CREATE + RM_*/STC_* INSERTs, from the room-compiler lane) with the §S10
// transform UPDATEs appended after it. A wholesale write would silently delete the room half and
// take Terminal's Room lens down. So the generator owns exactly ONE delimited block, replaces only
// that block on every run, and leaves every other line byte-identical. The pre-marker §S10/§S11
// blocks are recognised by their own header and stripped, so the first regeneration migrates them.
//
// Usage: node scripts/gen_meta_transform_patch.js <Building> [--dir buildings] [--out FILE] [--force-rows]
// Exit 0 = patch written (or nothing to do), 2 = error.
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));

const EPS = 0.05;            // ScheduleGate.EPS, mirrored
const SEL = EPS / 2;         // repair threshold — half the tolerance, see header
const RTREE_WITNESS_MIN = 0.99;

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const B = process.argv[2];
if (!B || B.startsWith('--')) { console.error('usage: gen_meta_transform_patch.js <Building> [--dir buildings] [--out FILE] [--force-rows]'); process.exit(2); }
const DIR = path.resolve(arg('dir', path.join(__dirname, '..', 'buildings')));
const FORCE_ROWS = process.argv.indexOf('--force-rows') >= 0;
const OUT = arg('out', path.join(DIR, 'patches', B + '_meta.db.sql'));

const BEGIN = '-- >>> BEGIN §META_TRANSFORM_REPAIR (scripts/gen_meta_transform_patch.js — regenerated block, do not hand-edit)';
const END   = '-- <<< END §META_TRANSFORM_REPAIR';

// Return `existing` with this generator's block removed, preserving every other owner's lines.
// Handles both the marked form and the pre-marker §S10/§S11 blocks (a header comment run followed
// by bare UPDATE/CREATE TEMP statements, appended at the end of the file).
function stripOwnBlock(existing) {
  const lines = existing.split('\n');
  const out = [];
  let inMarked = false, inLegacyHeader = false;
  for (const ln of lines) {
    if (ln.startsWith(BEGIN)) { inMarked = true; continue; }
    if (inMarked) { if (ln.startsWith(END)) inMarked = false; continue; }
    if (/^--\s*§S1[012]_META_TRANSFORM_REPAIR/.test(ln) || /^--\s*§META_TRANSFORM_REPAIR/.test(ln)) { inLegacyHeader = true; continue; }
    if (inLegacyHeader && /^--/.test(ln)) continue;            // rest of that header's comment run
    inLegacyHeader = false;
    if (/^UPDATE element_transforms SET center_/.test(ln)) continue;
    if (/^\s*(center_[xyz]|UPDATE element_transforms SET$)/.test(ln)) continue;   // multi-line UPDATE body
    if (/_s11_fix|_fix_meta_transform/.test(ln)) continue;      // set-based form's staging table
    if (/^\s*(\(r\.min|FROM elements_meta m JOIN elements_rtree|JOIN element_transforms t ON|WHERE abs\(\(r\.min|OR abs\(\(r\.min)/.test(ln)) continue;
    out.push(ln);
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n');
}

const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const q = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return null; } };

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const fMeta = path.join(DIR, B + '_meta.db'), fExt = path.join(DIR, B + '_extracted.db');
  for (const f of [fMeta, fExt]) if (!fs.existsSync(f)) { console.error('§PATCH_GEN ' + B + ' ERROR missing ' + f); process.exit(2); }
  const me = new SQL.Database(fs.readFileSync(fMeta)), ex = new SQL.Database(fs.readFileSync(fExt));

  const mt = new Map((q(me, 'SELECT guid, center_x, center_y, center_z FROM element_transforms') || []).map(v => [String(v[0]), v]));
  const exRows = q(ex, 'SELECT guid, center_x, center_y, center_z FROM element_transforms') || [];
  const cand = 'T0_' + B + '_';
  const prefix = (exRows.length && String(exRows[0][0]).startsWith(cand) && !mt.has(String(exRows[0][0]))) ? cand : '';
  const et = new Map(exRows.map(v => { const g = String(v[0]); return [prefix && g.startsWith(prefix) ? g.slice(prefix.length) : g, v]; }));
  const common = []; mt.forEach((v, g) => { if (et.has(g)) common.push(g); });
  if (!common.length) { console.error('§PATCH_GEN ' + B + ' ERROR no shared guids (prefix=' + (prefix || 'none') + ')'); process.exit(2); }
  const M = { x: med(common.map(g => mt.get(g)[1] - et.get(g)[1])),
              y: med(common.map(g => mt.get(g)[2] - et.get(g)[2])),
              z: med(common.map(g => mt.get(g)[3] - et.get(g)[3])) };

  let corrupt = 0, maxCorrupt = 0;
  for (const g of common) {
    const m = mt.get(g), e = et.get(g);
    const d = Math.max(Math.abs(m[1] - (e[1] + M.x)), Math.abs(m[2] - (e[2] + M.y)), Math.abs(m[3] - (e[3] + M.z)));
    if (d > EPS) { corrupt++; if (d > maxCorrupt) maxCorrupt = d; }
  }
  const z0 = common.filter(g => mt.get(g)[3] === 0).length - common.filter(g => et.get(g)[3] === 0).length;

  // ── is meta.db's own r-tree a usable pre-corruption witness? ──
  const rtRows = q(me, 'SELECT m.guid,(r.minX+r.maxX)/2.0,(r.minY+r.maxY)/2.0,(r.minZ+r.maxZ)/2.0 ' +
    'FROM elements_meta m JOIN elements_rtree r ON r.id=m.id') || [];
  let witness = 0, checked = 0, rtreeFix = 0;
  for (const v of rtRows) {
    const g = String(v[0]), m = mt.get(g), e = et.get(g);
    if (!m || !e) continue;
    checked++;
    if (Math.max(Math.abs(v[1] - (e[1] + M.x)), Math.abs(v[2] - (e[2] + M.y)), Math.abs(v[3] - (e[3] + M.z))) <= EPS) witness++;
    if (Math.max(Math.abs(v[1] - m[1]), Math.abs(v[2] - m[2]), Math.abs(v[3] - m[3])) > SEL) rtreeFix++;
  }
  const useRtree = !FORCE_ROWS && checked > 0 && (witness / checked) >= RTREE_WITNESS_MIN;
  me.close(); ex.close();

  if (corrupt === 0) { console.log('§PATCH_GEN ' + B + ' NOTHING_TO_DO deviating>' + EPS + '=0'); return; }

  const head = [
    '-- §META_TRANSFORM_REPAIR ' + B + ' (' + new Date().toISOString().slice(0, 10) +
      ', bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S10/§S11/§S12)',
    '-- ' + B + '_meta.db — the pair the live viewer loads through streaming.js §DB_SPLIT_DETECT — carries a',
    '-- per-element-corrupted rebase against ' + B + '_extracted.db (the extraction truth): ' + corrupt + ' of ' + common.length,
    '-- rows deviate >' + EPS + 'm from the modal rigid offset (' + M.x.toFixed(6) + ', ' + M.y.toFixed(6) + ', ' + M.z.toFixed(6) + '), max ' + maxCorrupt.toFixed(2) + 'm' +
      (z0 > 0 ? ', and ' + z0 + ' more rows sit at center_z exactly 0 here than in truth.' : '.'),
    '-- Corrupted centres flip bearing/containment relations, so the live scheduler classifies a',
    '-- different building from the one every fleet probe measures. geo.db needs no patch: its mesh',
    '-- vertices are local-centred, so a repaired transform carries mesh and bbox with it.',
    '-- Repair threshold is HALF ScheduleGate.EPS (' + SEL + 'm) so nothing is left within half a tolerance',
    '-- of flipping a predicate. Absolute SET values => idempotent. Generated by',
    '-- scripts/gen_meta_transform_patch.js; detected by scripts/audit_split_pairs.js.'
  ];

  let body, n;
  if (useRtree) {
    n = rtreeFix;
    head.push('-- FORM: r-tree. ' + B + '_meta.db\'s own elements_rtree agrees with extracted+offset on ' +
      witness + '/' + checked + ' rows,');
    head.push('-- i.e. it predates the corruption and already holds the correct centres. ' + n + ' rows disagree with');
    head.push('-- their own box by >' + SEL + 'm and are snapped back — as 4 set-based statements, so the patch stays');
    head.push('-- ~2KB no matter how many rows it repairs (it is re-applied on EVERY load of this DB).');
    head.push('-- The staging table keeps an explicit PRIMARY KEY: without it the correlated lookups degrade to');
    head.push('-- n^2 scans and the patch does not finish (measured).');
    body = [
      'CREATE TEMP TABLE _fix_meta_transform (guid TEXT PRIMARY KEY, cx REAL, cy REAL, cz REAL);',
      'INSERT INTO _fix_meta_transform SELECT m.guid,',
      '  (r.minX+r.maxX)/2.0, (r.minY+r.maxY)/2.0, (r.minZ+r.maxZ)/2.0',
      '  FROM elements_meta m JOIN elements_rtree r ON r.id = m.id',
      '  JOIN element_transforms t ON t.guid = m.guid',
      '  WHERE abs((r.minX+r.maxX)/2.0 - t.center_x) > ' + SEL,
      '     OR abs((r.minY+r.maxY)/2.0 - t.center_y) > ' + SEL,
      '     OR abs((r.minZ+r.maxZ)/2.0 - t.center_z) > ' + SEL + ';',
      'UPDATE element_transforms SET',
      '  center_x = (SELECT cx FROM _fix_meta_transform f WHERE f.guid = element_transforms.guid),',
      '  center_y = (SELECT cy FROM _fix_meta_transform f WHERE f.guid = element_transforms.guid),',
      '  center_z = (SELECT cz FROM _fix_meta_transform f WHERE f.guid = element_transforms.guid)',
      ' WHERE guid IN (SELECT guid FROM _fix_meta_transform);',
      'DROP TABLE _fix_meta_transform;'
    ];
  } else {
    head.push('-- FORM: per-row. ' + (checked === 0 ? 'This meta.db has no elements_rtree'
      : 'This meta.db\'s elements_rtree agrees with extracted on only ' + witness + '/' + checked + ' rows') +
      ', so there is no');
    head.push('-- in-file witness to restore from; values come from ' + B + '_extracted.db + the modal offset.');
    body = [];
    n = 0;
    for (const g of common) {
      const m = mt.get(g), e = et.get(g);
      const tx = e[1] + M.x, ty = e[2] + M.y, tz = e[3] + M.z;
      if (Math.max(Math.abs(m[1] - tx), Math.abs(m[2] - ty), Math.abs(m[3] - tz)) <= SEL) continue;
      n++;
      body.push('UPDATE element_transforms SET center_x=' + tx.toFixed(6) + ', center_y=' + ty.toFixed(6) +
        ', center_z=' + tz.toFixed(6) + " WHERE guid='" + g.replace(/'/g, "''") + "';");
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const prior = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const kept = prior ? stripOwnBlock(prior) : '';
  const block = [BEGIN].concat(head, body, [END]).join('\n');
  fs.writeFileSync(OUT, (kept ? kept + '\n\n' : '') + block + '\n');
  const keptLines = kept ? kept.split('\n').filter(l => l.trim()).length : 0;
  console.log('§PATCH_GEN ' + B + ' form=' + (useRtree ? 'rtree' : 'rows') + ' repairs=' + n +
    ' corruptVsExtracted=' + corrupt + ' maxDev=' + maxCorrupt.toFixed(2) + 'm' +
    ' rtreeWitness=' + (checked ? witness + '/' + checked : 'none') +
    ' offset=(' + M.x.toFixed(6) + ',' + M.y.toFixed(6) + ',' + M.z.toFixed(6) + ')' +
    ' prefix=' + (prefix || '(none)') + ' otherOwnersKept=' + keptLines + ' lines' +
    ' bytes=' + fs.statSync(OUT).size + ' out=' + OUT);
}
main().catch(e => { console.error('§PATCH_GEN ERR ' + (e && e.stack || e)); process.exit(2); });
