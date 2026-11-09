#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — prompts/MODELLER_RULES_EDITOR.md §CLASS-SHARED (c2) fleet check. Read the log after every run; exit code is not evidence.
// ISSUE: a walker-rules edit is made on ONE building but lives in a file shared by every building of that type, and the same file is
// also read by the other type (terminal walks read room schedules from duplex_rules.db; residential walks borrow FP from
// terminal_rules.db). Before an edit is trusted or contributed, walk every READER of the file with and without the edit and say what moved.
// Readers = the Modeller residents (the Open chooser's own RESIDENTS list, read from str_walker_outliner.js) whose own rules, schedule
// source or FP borrow is the edit's file (the real WalkRules + the page's borrow rule, via walk_node_harness.openBuildingRules).
// Each walk is independent (avoid = []), as fleet_band_table.js, so a before/after difference is the edit and nothing else.
// Usage: node rules_edit_fleet_check.js <edits.json> [out.json]     (out defaults to <edits>.checked.json)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const MOD = path.join(__dirname, '..'), BUILDINGS = [path.join(MOD, '..', 'buildings'), path.join(process.env.HOME, 'bim-ootb', 'buildings')];
const realLog = console.log, TAG = '§RULES-FLEET';

function residents() {   // the page's own list, not a copy: parse RESIDENTS = [ { key: '..', db: '..', geoDb: '..' } ... ]
  const src = fs.readFileSync(path.join(MOD, 'str_walker_outliner.js'), 'utf8'), m = /var RESIDENTS = \[([\s\S]*?)\n  \];/.exec(src);
  if (!m) throw new Error('RESIDENTS list not found in str_walker_outliner.js');
  return m[1].split('\n').map(l => /key:\s*'([^']+)'.*?db:\s*'([^']+)'.*?geoDb:\s*'([^']+)'/.exec(l)).filter(Boolean).map(x => ({ key: x[1], db: x[2], geoDb: x[3] }));
}
const rowKey = p => JSON.stringify([p.device || null, p.ifc_class || null, +(+p.x).toFixed(6), +(+p.y).toFixed(6), +(+p.z).toFixed(6)]);
function moved(a, b) {   // rows of b not in a (multiset), and of a not in b
  const ca = {}; a.forEach(k => { ca[k] = (ca[k] || 0) + 1; }); let added = 0;
  b.forEach(k => { if (ca[k]) ca[k]--; else added++; }); const gone = Object.keys(ca).reduce((s, k) => s + ca[k], 0);
  return { added, gone, moved: Math.max(added, gone) };
}

if (!process.env.FLEET_ONE) {
  const inF = process.argv[2]; if (!inF) { realLog('usage: rules_edit_fleet_check.js <edits.json> [out.json]'); process.exit(2); }
  const edits = JSON.parse(fs.readFileSync(inF, 'utf8')), outF = process.argv[3] || inF.replace(/\.json$/, '') + '.checked.json';
  const file = edits.rulesFile, nCells = Object.keys(edits.cells || {}).reduce((s, k) => s + Object.keys(edits.cells[k]).length, 0);
  if (!file) { realLog(TAG + ' ERROR the edit file names no rulesFile'); process.exit(2); }
  const R = residents(), rows = [], checked = [], notReaders = [];
  realLog(TAG + ' start file=' + file + ' cells=' + nCells + ' residents=' + R.length);
  R.forEach(r => {
    const tmp = path.join(require('os').tmpdir(), 'rules_fleet_' + process.pid + '_' + r.key + '.json');
    const c = cp.spawnSync(process.execPath, ['--max-old-space-size=8000', __filename], { env: Object.assign({}, process.env, { FLEET_ONE: JSON.stringify(r), FLEET_EDIT: JSON.stringify({ file, cells: edits.cells || {} }), FLEET_OUT: tmp }), encoding: 'utf8', maxBuffer: 1 << 28, timeout: 1800000 });
    process.stdout.write((c.stdout || '').split('\n').filter(l => /§RULES-FLEET|§WALKNODE (rules|edit)|ERROR/.test(l)).join('\n') + '\n');
    if (c.status !== 0) realLog(TAG + ' FAIL building=' + r.key + ' status=' + c.status + ' ' + String(c.stderr || '').slice(0, 300));
    if (!fs.existsSync(tmp)) return;
    const o = JSON.parse(fs.readFileSync(tmp)); fs.unlinkSync(tmp);
    if (!o.roles.length) { notReaders.push(r.key); return; }
    checked.push(r.key); rows.push.apply(rows, o.rows);
  });
  const totalMoved = rows.reduce((s, x) => s + x.moved, 0), skipped = rows.length ? rows[0].skipped : null;
  const out = Object.assign({}, edits, { checkedOn: checked, fleet: rows, fleetChecked: new Date().toISOString(), notReaders });
  fs.writeFileSync(outF, JSON.stringify(out, null, 1));
  realLog(TAG + ' done file=' + file + ' cells=' + nCells + ' readers=' + checked.length + ' (' + checked.join(',') + ') notReaders=' + notReaders.join(',') + ' walks=' + rows.length + ' moved=' + totalMoved + ' out=' + outF);
  process.exit(0);
}

(async () => {
  const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
  const H = require('./walk_node_harness.js'), r = JSON.parse(process.env.FLEET_ONE), E = JSON.parse(process.env.FLEET_EDIT);
  const SQL = await initSqlJs(), stack = await H.loadStack(SQL), quiet = () => { console.log = function (s) { if (/§WALKNODE (rules|edit)/.test(String(s))) realLog(s); }; };
  const dbF = path.join(MOD, r.db); if (!fs.existsSync(dbF) || fs.statSync(dbF).size < 10240) { realLog(TAG + ' skip building=' + r.key + ' db absent or a pointer'); process.exit(0); }
  const raw = new Uint8Array(fs.readFileSync(dbF));
  const geoP = BUILDINGS.map(d => path.join(d, r.geoDb)).find(p => fs.existsSync(p) && fs.statSync(p).size > 10240), geoDb = geoP ? new SQL.Database(new Uint8Array(fs.readFileSync(geoP))) : null;
  const walkAll = (edit) => { quiet(); const sel = H.openBuildingRules(SQL, stack, r.key, edit), discs = stack.DW.disciplines(), by = {};
    for (const d of discs) { let w; try { w = H.walkLive(SQL, stack, d, new Uint8Array(raw), r.key, [], geoDb ? { geoDb } : {}); } catch (e) { w = { placements: [], err: String(e && e.message || e) }; } by[d] = { rows: (w.placements || []).map(rowKey), err: w.err || null }; }
    console.log = realLog; return { sel, by }; };
  const before = walkAll(null);
  const roles = []; if (before.sel.rules === E.file) roles.push('own'); if (before.sel.schedule === E.file) roles.push('schedule'); if (before.sel.borrowFP === E.file) roles.push('borrowFP');
  if (!roles.length) { realLog(TAG + ' notReader building=' + r.key + ' rules=' + before.sel.rules + ' schedule=' + before.sel.schedule + ' borrowFP=' + before.sel.borrowFP); fs.writeFileSync(process.env.FLEET_OUT, JSON.stringify({ roles, rows: [] })); process.exit(0); }
  const edit = { file: E.file, cells: E.cells }, after = walkAll(edit), done = (edit.applied || []).reduce((s, a) => s + a.done, 0), skipped = (edit.applied || []).length ? edit.applied[0].skipped : 0, rows = [];
  Object.keys(before.by).forEach(d => { const a = before.by[d].rows, b = (after.by[d] || { rows: [] }).rows, m = moved(a, b);
    const row = { building: r.key, role: roles.join('+'), disc: d, placedBefore: a.length, placedAfter: b.length, moved: m.moved, added: m.added, gone: m.gone, cellsApplied: done, skipped, err: before.by[d].err || (after.by[d] || {}).err || null };
    rows.push(row); realLog(TAG + ' row building=' + r.key + ' role=' + row.role + ' disc=' + d + ' placed=' + a.length + '->' + b.length + ' moved=' + m.moved + ' applied=' + done + ' skipped=' + skipped + (row.err ? ' ERROR ' + row.err.slice(0, 120) : '')); });
  fs.writeFileSync(process.env.FLEET_OUT, JSON.stringify({ roles, rows }));
  process.exit(0);
})().catch(e => { realLog(TAG + ' ERROR ' + (e && e.stack || e)); process.exit(1); });
