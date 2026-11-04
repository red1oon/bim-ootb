// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — the DOWN copy of a legacy site into the twin's main db (bim-ootb prompts/CAPEX_DASHBOARD.md §5.26, G6b). Witness: W-DASH-SYNC. Read the §DASH_SYNC lines; the exit code is not evidence.
// The snapshot = capex/tools/legacy_snapshot.js (the small job, stock WS reads, all whitelisted columns). applyCopy is pure over { run, query } (a sql.js handle with .query, erp/ninja_bundle.js makeWritableDbHost): no op-log, no model layer:
// a copy is the site's truth, not this twin's work. MIRROR tables end with exactly legacy's rows of the snapshot's client; REFERENCE tables only upsert. The key is the PK, as every FK in these tables is (§5.26).
export const TABLES = [
  { entity: 'orgs', table: 'AD_Org', pk: 'ad_org_id', mirror: false },
  { entity: 'phaseRef', table: 'C_Phase', pk: 'c_phase_id', mirror: false },
  { entity: 'currencies', table: 'C_Currency', pk: 'c_currency_id', mirror: false },
  { entity: 'projects', table: 'C_Project', pk: 'c_project_id', mirror: true },
  { entity: 'phases', table: 'C_ProjectPhase', pk: 'c_projectphase_id', mirror: true },
  { entity: 'tasks', table: 'C_ProjectTask', pk: 'c_projecttask_id', mirror: true },
  { entity: 'lines', table: 'C_ProjectLine', pk: 'c_projectline_id', mirror: true },
  { entity: 'wf', table: 'AD_WF_Activity', pk: 'ad_wf_activity_id', mirror: true }
];
const same = (a, b) => {
  if (a == null || a === '') return b == null || b === '';
  if (b == null || b === '') return false;
  if (String(a) === String(b)) return true;
  const x = Number(a), y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
};
const lower = o => { const r = {}; for (const k of Object.keys(o)) r[k.toLowerCase()] = o[k]; return r; };

export function applyCopy(db, snap, log) {
  log = log || (() => {});
  const client = snap && snap.meta && snap.meta.client, out = { client, tables: {} };
  if (client == null) { log('§DASH_SYNC refused: the snapshot names no client'); return out; }
  for (const T of TABLES) {
    const rows = snap[T.entity], tag = '§DASH_SYNC table=' + T.table + ' ';
    if ((snap.unavailable || []).includes(T.entity) || !Array.isArray(rows)) { log(tag + 'skip=unavailable (kept as it is)'); out.tables[T.table] = { skip: 'unavailable' }; continue; }
    if (T.mirror && !rows.length) { log(tag + 'skip=empty (a mirror is never emptied by a read of 0 rows)'); out.tables[T.table] = { skip: 'empty' }; continue; }
    const cols = db.query('PRAGMA table_info(' + T.table + ')').map(c => c.name);
    const byLower = {}; cols.forEach(c => { byLower[c.toLowerCase()] = c; });
    if (!byLower[T.pk]) { log(tag + 'skip=no-table'); out.tables[T.table] = { skip: 'no-table' }; continue; }
    const pkCol = byLower[T.pk], uu = byLower[T.table.toLowerCase() + '_uu'], have = new Map();
    db.query('SELECT * FROM ' + T.table).forEach(r => { const l = lower(r); have.set(String(l[T.pk]), l); });
    const seen = new Set(), n = { read: rows.length, inserted: 0, updated: 0, unchanged: 0, deleted: 0, failed: 0, uuDiffer: 0 };
    let firstErr = null;
    for (const raw of rows) {
      const r = lower(raw), id = r[T.pk];
      if (id == null) { n.failed++; firstErr = firstErr || 'row without ' + T.pk; continue; }
      seen.add(String(id));
      const keys = Object.keys(r).filter(k => byLower[k]), cur = have.get(String(id));
      try {
        if (!cur) {
          db.run('INSERT INTO ' + T.table + ' (' + keys.map(k => '"' + byLower[k] + '"').join(',') + ') VALUES (' + keys.map(() => '?').join(',') + ')', keys.map(k => r[k] === undefined ? null : r[k]));
          n.inserted++;
        } else {
          if (uu && cur[uu.toLowerCase()] != null && r[uu.toLowerCase()] != null && String(cur[uu.toLowerCase()]) !== String(r[uu.toLowerCase()])) n.uuDiffer++;
          const diff = keys.filter(k => k !== T.pk && !same(cur[k], r[k]));
          if (!diff.length) { n.unchanged++; continue; }
          db.run('UPDATE ' + T.table + ' SET ' + diff.map(k => '"' + byLower[k] + '"=?').join(',') + ' WHERE "' + pkCol + '"=?', diff.map(k => r[k] === undefined ? null : r[k]).concat([id]));
          n.updated++;
        }
      } catch (e) { n.failed++; firstErr = firstErr || e.message; }
    }
    if (T.mirror) for (const [id, cur] of have) {
      if (seen.has(id) || Number(cur.ad_client_id) !== Number(client)) continue;
      try { db.run('DELETE FROM ' + T.table + ' WHERE "' + pkCol + '"=?', [cur[T.pk]]); n.deleted++; } catch (e) { n.failed++; firstErr = firstErr || e.message; }
    }
    log(tag + Object.keys(n).map(k => k + '=' + n[k]).join(' ') + (firstErr ? ' firstError=' + JSON.stringify(String(firstErr).slice(0, 160)) : ''));
    out.tables[T.table] = n;
  }
  return out;
}
