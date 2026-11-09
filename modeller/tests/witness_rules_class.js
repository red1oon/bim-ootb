#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-RULES-CLASS: real-user witness for prompts/MODELLER_RULES_EDITOR.md §CLASS-SHARED. Read the log after every run.
 * ISSUE IT PROVES OR DISPROVES: the walker's rules are one file per building TYPE, so one edited cell changes every building of
 * that type. The editor did not say so, a downloaded edit carried no record of where it was checked, and nothing proved that
 * opening the editor with no edit leaves the walks unchanged.
 * CLAIMS:
 *   C1 HEADER      the editor says "shared by every <class> building" and lists the residents of that class (Duplex: 3, Terminal: 5).
 *   C2 CHECKEDON   the downloaded edit file holds checkedOn = [] (the page runs no fleet check).
 *   C3 NO-EDIT     per resident: Walk ALL twice (walk 2 = reference), open + close the editor, Walk ALL: same placements per
 *                  discipline, same rules content hash, nothing stored. farm_rules.db (no resident): content hash only, walk NOT JUDGED.
 *                  A resident whose reference walk placed nothing is VACUOUS (not counted as a pass).
 *   C4 NOT BLIND   Duplex with one stored cell (+0.5 m z_offset_m of a placed device's schedule row): the same comparison differs.
 * Usage: [RESIDENTS=Duplex,Terminal] [FARM=1] node modeller/tests/witness_rules_class.js   (software GL, headless)
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const TAG = '§W-RULES-CLASS';

// placements per discipline, in walk order, as the user's walk holds them
const snap = (t) => t.pg.evaluate(() => { const w = window.__dwWalks || {}, o = {};
  Object.keys(w).sort().forEach(d => { o[d] = (w[d] || []).map(p => [p.device || null, p.ifc_class || null, +(+p.x).toFixed(6), +(+p.y).toFixed(6), +(+p.z).toFixed(6)]); }); return o; });
// SHA-256 over every table's rows in rowid order (not export(): it closes and reopens the DB)
const rulesHash = (t) => t.pg.evaluate(async () => { const db = window.DiscWalker && window.DiscWalker.rulesDb(); if (!db) return null;
  const tabs = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"); let s = '';
  (tabs.length ? tabs[0].values : []).forEach(([n]) => { const r = db.exec('SELECT rowid AS __r, * FROM "' + n + '" ORDER BY rowid'); s += n + '|' + JSON.stringify(r.length ? r[0].values : []) + '\n'; });
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16); });
// Walk 1 = the user's Walk ALL. Later walks re-walk each discipline it walked, in the same order: Walk ALL skips a service
// already present (measured: walk 2 by Walk ALL = walked 0, skipped 4), so a Walk ALL comparison would judge nothing.
const walkAll = async (t) => { const n0 = t.slog.length; await t.pg.evaluate(() => { window.__dwAllDone = false; window.discWalkAll(); });   // fire and forget: a large building walks for minutes (protocol timeout 180 s)
  await t.pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 1800000, polling: 1000 }).catch(() => {}); await t.sleep(1500);
  const r = await t.pg.evaluate(() => { const x = window.__dwAllResult || {}; return { walked: (x.walked || []).length, refused: (x.refused || []).length, skipped: x.skipped || [], placedTotal: x.placedTotal, order: Object.keys(window.__dwWalks || {}) }; });
  console.log(TAG + ' walkAll ' + JSON.stringify(r)); if (!r.walked) t.slog.slice(n0).filter(l => /§DISC-WALK |§DISCWALK-ALL/.test(l)).slice(0, 8).forEach(l => console.log(TAG + '   ' + l.slice(0, 220))); return { w: await snap(t), order: r.order, ran: r.walked }; };
const walkEach = async (t, key, order) => { let ran = 0;
  for (const disc of order) { const n0 = t.slog.length;
    await t.pg.evaluate((d, k) => { window.__dwLastDoneDisc = null; window.discWalk(d, { building: k }); }, disc, key);
    await t.pg.waitForFunction(d => window.__dwLastDoneDisc === d, { timeout: 1800000, polling: 500 }, disc).catch(() => {}); await t.sleep(300);
    if (t.slog.slice(n0).some(l => l.indexOf('§DISC-WALK ' + disc + ' ') >= 0 || l.indexOf('§DISC-WALK ' + disc + ':') >= 0)) ran++; }
  console.log(TAG + ' walkEach ' + key + ' ran=' + ran + ' of=' + order.length); return { w: await snap(t), order, ran }; };
// The reference is a SETTLED walk: each service avoids the others' current placements, so re-walks move a few devices until
// they settle (measured on Duplex, no editor: round 2 moved 2/5/2 ACMV/ELEC/PLB devices, round 3 moved 1/1/1, rounds 4-5 identical).
// Re-walk until two rounds in a row are identical (at most MAX_ROUNDS); not settled = that row is not judged.
const MAX_ROUNDS = +(process.env.MAX_ROUNDS || 6);
const settle = async (t, key, order) => { let prev = await walkEach(t, key, order), r = 2;
  for (; r <= MAX_ROUNDS; r++) { const cur = await walkEach(t, key, order); const same = diff(prev.w, cur.w).length === 0; prev = cur; if (same) break; }
  prev.settled = r <= MAX_ROUNDS; prev.rounds = r; console.log(TAG + ' settle ' + key + ' rounds=' + r + ' settled=' + prev.settled); return prev; };
const openEd = async (t) => { await t.pg.click('#b-rules'); await t.pg.waitForSelector('#rules-ed', { timeout: 30000 }).catch(() => {}); await t.sleep(300); };
const closeEd = async (t) => { const c = await t.pg.$('#rules-close'); if (c) await c.click(); await t.sleep(300); };
const count = o => Object.keys(o).reduce((s, d) => s + o[d].length, 0);
const diff = (a, b) => { const ds = Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort(); return ds.filter(d => JSON.stringify(a[d] || []) !== JSON.stringify(b[d] || [])); };

runE2E('W-RULES-CLASS', async (t) => {
  const all = await t.pg.evaluate(() => (window.STRWalkerOutliner && window.STRWalkerOutliner._residents || []).map(r => ({ key: r.key, file: window.WalkRules.rulesDb(r.key) })));
  const want = process.env.RESIDENTS ? process.env.RESIDENTS.split(',') : all.map(r => r.key);
  console.log(TAG + ' residents=' + all.length + ' ' + JSON.stringify(all) + ' judging=' + want.join(','));
  if (!(await t.pg.evaluate(() => !!document.getElementById('b-rules')))) { t.assert('C1 HEADER (Rules button exists)', false, 'no #b-rules on this tree'); return; }

  let judged = 0, vacuous = 0, duplexRef = null;
  for (const key of want) {
    const file = (all.find(r => r.key === key) || {}).file, expect = all.filter(r => r.file === file).map(r => r.key);
    await t.open(key);
    const W1 = await walkAll(t), W2 = await settle(t, key, W1.order), h0 = await rulesHash(t), w1 = W1.w, w2 = W2.w;
    await openEd(t);
    const head = await t.pg.evaluate(() => { const e = document.getElementById('rules-shared'); return e ? e.textContent : null; });
    const cls = await t.pg.evaluate(k => window.WalkRules.buildingClass(k).cls, key);
    if (key === 'Duplex' || key === 'Terminal' || !process.env.RESIDENTS) {
      const named = expect.every(k => head && head.indexOf(k) >= 0), others = all.filter(r => r.file !== file).every(r => !head || head.indexOf(r.key) < 0);
      t.assert('C1 HEADER ' + key + ' (shared by every ' + cls + ' building, lists ' + expect.length + ')', !!head && head.indexOf('shared by every ' + cls + ' building') >= 0 && named && others, '"' + (head || 'no #rules-shared') + '"');
    }
    if (key === 'Duplex') {
      await t.pg.click('#rules-dl'); await t.sleep(300);
      const dl = await t.pg.evaluate(() => window.__rulesEditDownload || null);
      t.assert('C2 CHECKEDON (download holds checkedOn = [])', !!dl && Array.isArray(dl.checkedOn) && dl.checkedOn.length === 0, dl ? 'checkedOn=' + JSON.stringify(dl.checkedOn) : 'no download');
    }
    await closeEd(t);
    const h1 = await rulesHash(t), stored = await t.pg.evaluate(f => localStorage.getItem(window.DiscWalker.userRulesKey(f)), file);
    const W3 = await walkEach(t, key, W1.order), w3 = W3.w, d = diff(w2, w3);
    console.log(TAG + ' row building=' + key + ' file=' + file + ' walk1=' + count(w1) + ' walk2=' + count(w2) + ' walk3=' + count(w3) + ' discs=' + Object.keys(w2).join('/') + ' differ=' + JSON.stringify(d) + ' w1vsw2=' + JSON.stringify(diff(w1, w2)) + ' hash=' + h0 + '/' + h1 + ' stored=' + !!stored + ' ran=' + W2.ran + '/' + W3.ran + ' of ' + W1.order.length + ' settledAfter=' + W2.rounds + ' settled=' + W2.settled);
    if (!count(w2) || !W2.settled || W2.ran < W1.order.length || W3.ran < W1.order.length) { vacuous++; console.log(TAG + ' VACUOUS ' + key + ' (the reference walk placed nothing, did not settle, or a re-walk did not run)'); continue; }
    judged++;
    t.assert('C3 NO-EDIT ' + key + ' (open + close the editor: same placements, same rules, nothing stored)', d.length === 0 && h0 && h0 === h1 && !stored, 'placed=' + count(w2) + ' differ=' + JSON.stringify(d) + ' hash=' + h0 + '/' + h1 + ' stored=' + !!stored);
    if (key === 'Duplex') duplexRef = w2;
  }
  console.log(TAG + ' sweep judged=' + judged + ' vacuous=' + vacuous + ' of=' + want.length);

  // farm_rules.db: no resident uses it. Load it with no building open, open + close the editor, content unchanged.
  if (!process.env.RESIDENTS || process.env.FARM) {
    await t.pg.reload({ waitUntil: 'load' }); await t.pg.waitForFunction('window.__sceneReady===true && !!window.DiscWalker', { timeout: 60000 }).catch(() => {});
    await t.pg.evaluate(async () => { window.DiscWalker.dwOpen(null); await window.DiscWalker.dwInit(window.SQL, window._DW_BASE, 'farm_rules.db'); });
    const f0 = await rulesHash(t), lf = await t.pg.evaluate(() => window.DiscWalker.loadedFile());
    await openEd(t); const fh = await t.pg.evaluate(() => { const e = document.getElementById('rules-shared'); return e ? e.textContent : null; }); await closeEd(t);
    const f1 = await rulesHash(t);
    console.log(TAG + ' farm file=' + lf + ' hash=' + f0 + '/' + f1 + ' header="' + fh + '" walk=NOT JUDGED (no farm building)');
    t.assert('C3 NO-EDIT farm_rules.db (header names the farm class; content unchanged; walk not judged: no farm building)', lf === 'farm_rules.db' && f0 && f0 === f1 && /shared by every farm building; no resident building uses them/.test(fh || ''), 'file=' + lf + ' hash=' + f0 + '/' + f1 + ' "' + fh + '"');
  }

  // C4 — the comparison is not blind: one stored cell on Duplex moves its walk
  if (duplexRef) {
    await t.pg.reload({ waitUntil: 'load' }); await t.pg.waitForFunction('window.__sceneReady===true && !!window.Bonsai', { timeout: 60000 }).catch(() => {});
    await t.open('Duplex'); const D1 = await walkAll(t), dOrder = D1.order.length ? D1.order : Object.keys(duplexRef); await settle(t, 'Duplex', dOrder);
    const cell = await t.pg.evaluate(() => { const db = window.DiscWalker.rulesDb(), w = window.__dwWalks.ELEC || [];
      for (const p of w) { if (!p.device || !/^sched:space-schedule:/.test(p.prov || '')) continue; const rule = p.prov.split(':').pop();
        const r = db.exec("SELECT rowid, z_offset_m FROM rule_space_schedule WHERE disc='ELEC' AND device_id='" + p.device + "' AND placement_rule='" + rule + "'");
        if (r.length && r[0].values.length === 1) { const [rowid, z] = r[0].values[0]; return { key: 'rule_space_schedule:' + rowid, z: +(z + 0.5).toFixed(6) }; } } return null; });
    if (!cell) { const pv = await t.pg.evaluate(() => (window.__dwWalks.ELEC || []).slice(0, 6).map(p => (p.device || '-') + '@' + (p.prov || '-'))); console.log(TAG + ' C4 INCONCLUSIVE no placed ELEC device maps to one schedule row; sample=' + JSON.stringify(pv)); }
    else {
      await t.pg.evaluate(async (c) => { const DW = window.DiscWalker; localStorage.setItem(DW.userRulesKey('duplex_rules.db'), JSON.stringify({ cells: { [c.key]: { z_offset_m: c.z } } })); await DW.reloadRules(window.SQL, window._DW_BASE); }, cell);
      const WE = await settle(t, 'Duplex', dOrder), wE = WE.w, dE = diff(duplexRef, wE);
      await openEd(t); await t.pg.click('#rules-reset'); await t.sleep(800); await closeEd(t);
      t.assert('C4 NOT BLIND (one stored cell → the same comparison differs)', dE.length > 0, 'cell=' + JSON.stringify(cell) + ' differ=' + JSON.stringify(dE));
    }
  }
}, { width: 1400, height: 900, dpr: 1, protocolTimeout: 3600000 });
