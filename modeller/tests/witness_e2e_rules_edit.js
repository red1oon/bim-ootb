#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-RULES-EDIT: real-user witness for prompts/MODELLER_RULES_EDITOR.md. Read the log after every run.
 * ISSUE IT PROVES OR DISPROVES: the walker's rules (SQLite tables in <class>_rules.db) could not be seen or edited by a user;
 * the film's claim "the rules are editable JSON" was not true. Real path: open Duplex → Walk ELEC → the Rules button → type a
 * new value into a schedule row → Save → walk again.
 * CLAIMS:
 *   E1 OPEN            the Rules button opens the editor on the loaded rule set; rule_space_schedule rows = the DB's count.
 *   E2 EDIT-CHANGES-WALK  +0.5 m typed into z_offset_m of the one schedule row behind a placed device; Save; walk again: those
 *                      devices' z move +0.5 m (±1e-6), every other ELEC device unchanged. RED on main: no #b-rules.
 *   E3 PERSISTS        reload, open, walk: §DW-RULES-USER … cells=1 ok, and the same +0.5 m.
 *   E4 DOWNLOAD        the downloaded JSON holds that one cell and its UPDATE.
 *   E5 RESET           Reset to shipped → the walk returns to the original z.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const walkElec = async (t) => { await t.pg.evaluate(() => { window.__dwLastDoneDisc = null; window.discWalk('ELEC', { building: 'Duplex' }); });
  await t.pg.waitForFunction(() => window.__dwLastDoneDisc === 'ELEC', { timeout: 120000 }).catch(() => {});
  return t.pg.evaluate(() => (window.__dwWalks.ELEC || []).map(p => ({ device: p.device || null, prov: p.prov || '', x: p.x, y: p.y, z: p.z }))); };
const clickRules = async (t) => { await t.pg.click('#b-rules'); await t.pg.waitForSelector('#rules-ed', { timeout: 20000 }).catch(() => {}); await t.sleep(300); };

runE2E('W-E2E-RULES-EDIT', async (t) => {
  await t.open('Duplex');
  const hasBtn = await t.pg.evaluate(() => !!document.getElementById('b-rules'));
  if (!hasBtn) { t.assert('E1 OPEN (Rules button exists)', false, 'no #b-rules on this tree'); return; }
  // E0 — Rules clicked BEFORE the rules are loaded (a fresh open on a real building: the lazy fetch had not finished; refused on
  // the first build). RED control on Duplex: unload the walker's rules (dwOpen(null)) right before the click.
  await t.pg.evaluate(() => window.DiscWalker.dwOpen(null));
  const n0 = t.slog.length; await clickRules(t);
  const e0 = await t.pg.evaluate(() => !!document.getElementById('rules-ed'));
  t.assert('E0 OPENS-BEFORE-LOAD (Rules clicked with no rules loaded → the open path loads them and the editor opens)', e0 && !t.slog.slice(n0).some(l => /§RULES-EDIT open refused/.test(l)),
    'open=' + e0 + ' "' + (t.slog.slice(n0).filter(l => /§RULES-EDIT open/.test(l)).pop() || '').slice(0, 110) + '"');
  await t.pg.evaluate(() => window.RulesEditor && window.RulesEditor.close());
  const w0 = await walkElec(t);
  // the one schedule row behind a placed device: (disc, device_id, placement_rule) matching exactly one row
  const pick = await t.pg.evaluate((w) => { const db = window.DiscWalker.rulesDb(), q = s => { const r = db.exec(s); return r.length ? r[0].values : []; };
    const seen = {};
    for (const p of w) { if (!p.device || !/^sched:space-schedule:/.test(p.prov)) continue; const rule = p.prov.split(':').pop(); const k = p.device + '|' + rule; if (seen[k]) continue; seen[k] = 1;
      const rs = q("SELECT rowid, z_offset_m FROM rule_space_schedule WHERE disc='ELEC' AND device_id='" + p.device + "' AND placement_rule='" + rule + "'");
      if (rs.length === 1) return { rowid: rs[0][0], z0: rs[0][1], device: p.device, rule: rule, total: q('SELECT COUNT(*) FROM rule_space_schedule')[0][0] }; }
    return null; }, w0);
  if (!pick) { console.log('  ⚠ INCONCLUSIVE: no placed device maps to exactly one schedule row'); return; }
  console.log('§RULESEDIT pick ' + JSON.stringify(pick) + ' walked=' + w0.length);

  // E1 — open through the real button
  await clickRules(t);
  const e1 = await t.pg.evaluate(() => ({ open: !!document.getElementById('rules-ed'), rows: document.querySelectorAll('#rules-ed [data-row-id^="rule_space_schedule:"]').length }));
  const openLine = t.slog.filter(l => /§RULES-EDIT open /.test(l)).pop() || '';
  t.assert('E1 OPEN (editor on the loaded rule set; schedule rows = the DB count)', e1.open && e1.rows === pick.total && /file=duplex_rules\.db/.test(openLine), JSON.stringify(e1) + ' db=' + pick.total + ' "' + openLine.slice(0, 120) + '"');

  // E2 — type +0.5 into z_offset_m of that row (open its section first, as a user would)
  const rowSel = '#rules-ed [data-row-id="rule_space_schedule:' + pick.rowid + '"]';
  const z1 = +(pick.z0 + 0.5).toFixed(6);
  const typed = await t.pg.evaluate((sel) => { const row = document.querySelector(sel); if (!row) return 'no row';
    let bd = row.parentElement; while (bd && !/propsheet-bd/.test(bd.className)) bd = bd.parentElement; if (bd) { bd.style.maxHeight = '70vh'; bd.style.overflowY = 'auto'; }
    row.scrollIntoView({ block: 'center' }); return 'ok'; }, rowSel);
  const inputSel = await t.pg.evaluate((sel) => { const row = document.querySelector(sel); if (!row) return null;
    const all = Array.from(row.querySelectorAll('*')); const lab = all.find(e => e.children.length === 0 && e.textContent.trim() === 'z_offset_m'); if (!lab) return null;
    // settings_editor lays a row out as flat siblings: [label] [key caption] [control] [key caption] [control] …
    const inp = lab.nextElementSibling; if (!inp || inp.tagName !== 'INPUT') return null; inp.id = 'w-rules-zoff'; return '#w-rules-zoff'; }, rowSel);
  if (inputSel) { await t.pg.click(inputSel, { clickCount: 3 }); await t.pg.keyboard.type(String(z1)); await t.pg.keyboard.press('Tab'); await t.sleep(200); }
  await t.pg.click('#rules-save'); await t.sleep(300);
  const w1 = await walkElec(t);
  const isPick = p => p.device === pick.device && p.prov.split(':').pop() === pick.rule;
  const moved = [], other = [];
  w1.forEach((p, i) => { const q = w0[i]; if (!q) return; (isPick(p) ? moved : other).push(p.z - q.z); });
  const okMoved = moved.length > 0 && moved.every(d => Math.abs(d - 0.5) < 1e-6), okOther = other.every(d => Math.abs(d) < 1e-9);
  t.assert('E2 EDIT-CHANGES-WALK (typed +0.5 m → those devices +0.5 m, all others unchanged)', !!inputSel && okMoved && okOther && w1.length === w0.length,
    'typed=' + typed + '/' + (inputSel || 'no input') + ' moved=' + moved.length + ' dz=' + JSON.stringify(moved.slice(0, 4).map(d => +d.toFixed(6))) + ' others=' + other.length + ' maxOther=' + Math.max(0, ...other.map(Math.abs)).toExponential(1) +
    ' save="' + (t.slog.filter(l => /§RULES-EDIT save/.test(l)).pop() || '').slice(0, 100) + '"');

  // E4 — download (before reset)
  await t.pg.click('#rules-dl'); await t.sleep(300);
  const dl = await t.pg.evaluate(() => window.__rulesEditDownload || null);
  const cellKeys = dl ? Object.keys(dl.cells) : [];
  t.assert('E4 DOWNLOAD (one cell + its UPDATE)', !!dl && cellKeys.length === 1 && cellKeys[0] === 'rule_space_schedule:' + pick.rowid && /UPDATE "rule_space_schedule" SET "z_offset_m"=/.test(dl.sql),
    dl ? JSON.stringify(dl.cells) + ' sql="' + dl.sql.slice(0, 90) + '"' : 'no download');

  // E3 — reload the page: the stored edit is re-applied on open
  await t.pg.reload({ waitUntil: 'load' });
  await t.pg.waitForFunction('window.__sceneReady===true && !!window.Bonsai', { timeout: 60000 }).catch(() => {});
  const n3 = t.slog.length;
  await t.open('Duplex');
  const w3 = await walkElec(t);
  const userLine = t.slog.slice(n3).filter(l => /§DW-RULES-USER file=duplex_rules\.db/.test(l)).pop() || '';
  const moved3 = w3.filter(isPick).map((p, k) => p.z - w0.filter(isPick)[k].z);
  t.assert('E3 PERSISTS (after reload: §DW-RULES-USER cells=1 ok, same +0.5 m)', /cells=1 skipped=0 ok/.test(userLine) && moved3.length > 0 && moved3.every(d => Math.abs(d - 0.5) < 1e-6),
    '"' + userLine.slice(0, 100) + '" dz=' + JSON.stringify(moved3.slice(0, 3).map(d => +d.toFixed(6))));

  // E5 — reset to shipped, walk: original z
  await clickRules(t); await t.pg.click('#rules-reset'); await t.sleep(800);
  const w5 = await walkElec(t);
  const back = w5.every((p, i) => w0[i] && Math.abs(p.z - w0[i].z) < 1e-9) && w5.length === w0.length;
  const stored = await t.pg.evaluate(() => localStorage.getItem(window.DiscWalker.userRulesKey('duplex_rules.db')));
  t.assert('E5 RESET (back to the shipped rules: original z, nothing stored)', back && !stored, 'walked=' + w5.length + ' stored=' + stored);
}, { width: 1400, height: 900, dpr: 1 });
