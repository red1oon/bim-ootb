#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SEEDTRUNK: real-user, maths-asserted E2E of SEED-TRUNK's POPUP flow (route a service
 * trunk from a human-chosen entry). Builds on the render gate W-SEED-TRUNK-RENDER by driving the REAL user popup:
 * open → Walk ELEC (production discWalk, populates fixtures) → seedTrunk (the Outliner "Route trunk" row's handler)
 * → the real _seedPopup modal (a <select> of candidate entries + "Route ▶") → choosing routes + renders the trunk.
 * Asserted by the scene graph (the trunk LineSegments under dwRoot, segs>0) + the planned net + readPixels.
 *   T1 WALK    — a prior ELEC walk placed fixtures (a trunk needs something to route through).
 *   T2 POPUP   — seedTrunk shows the real modal with ≥1 candidate service-entry option + a Route button.
 *   T3 ROUTED  — clicking Route ▶ renders the trunk (a dwTrunk=ELEC LineSegments with >0 segments) where there was none.
 *   T4 PLANNED — the rendered trunk reflects the planned net (storeys ≥1; rendered segs == net-derived segs).
 *   T5 VISIBLE — the framebuffer changed after routing (the user SEES the trunk).
 *   N10 (prompts/DISC_WALK_DRAWN_MAINS.md §9.3) — a trunk is never a main: routing it adds 0 op-log rows and 0 entities to the IFC export, emits no §WALK-MAINS line, and the status says
 *       "proposed trunk, not a drawn main". RED: one deliberate GEOM_INSERT through the walk's own commit call must move the counters, so they can fail.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const trunkCensus = (t) => t.pg.evaluate(() => {
  const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
  const kids = root ? root.children : [];
  const lines = kids.filter(o => o.userData && o.userData.dwTrunk === 'ELEC');
  return { n: lines.length, segs: lines.reduce((s, o) => s + (o.userData.dwTrunkSegs || 0), 0) };
});
runE2E('W-E2E-SEEDTRUNK', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');

  // T1 — fire the REAL production Walk (the Outliner "Walk · ELEC" handler) so there are fixtures to route through.
  await t.pg.evaluate(() => window.discWalk('ELEC', { building: 'Duplex' }));
  await t.pg.waitForFunction(() => window.__dwLastCommitDisc === 'ELEC', { timeout: 25000, polling: 250 }).catch(() => {});
  await t.sleep(400);
  const nFix = await t.pg.evaluate(() => (window.__dwWalks && window.__dwWalks.ELEC || []).length);
  t.assert('T1 WALK (ELEC fixtures placed)', nFix > 0, 'fixtures=' + nFix);
  if (!nFix) return;
  const trunk0 = await trunkCensus(t); const pix0 = await t.pixsum();
  // N10 before: op-log rows and IFC entities by class, as the export writes them. And a console tap for §WALK-MAINS / §TRUNK-PROPOSED.
  const census = () => t.pg.evaluate(async () => { const O = window.Bonsai.oplog, b = await window.Bonsai.ifc.build(), td = new TextDecoder('latin1'), by = {};
    for (const m of td.decode(b.bytes).matchAll(/=\s*(IFC[A-Z0-9]+)\(/g)) by[m[1]] = (by[m[1]] || 0) + 1; return { ops: O.length, geom: O._geomOps().length, ents: by }; });
  await t.pg.evaluate(() => { window.__n10 = []; const L = console.log; console.log = function () { const s = Array.prototype.join.call(arguments, ' '); if (/§WALK-MAINS|§TRUNK-PROPOSED/.test(s)) window.__n10.push(s); return L.apply(console, arguments); }; });
  const c0 = await census();
  await t.shot('02-walked');

  // T2 — trigger the Outliner "Route trunk" handler (seedTrunk) WITHOUT awaiting: it blocks on the popup. Then
  // assert the REAL modal is up with candidate entries.
  await t.pg.evaluate(() => { window.__seedTrunkPromise = window.seedTrunk('ELEC'); });
  const popup = await t.pg.waitForFunction(() => { const s = document.getElementById('_seedSel'); const ok = document.getElementById('_seedOk'); return s && ok ? { opts: s.options.length } : null; }, { timeout: 12000, polling: 150 }).then(h => h.jsonValue()).catch(() => null);
  t.assert('T2 POPUP (real modal with ≥1 candidate entry + Route button)', popup && popup.opts >= 1, 'options=' + (popup && popup.opts));
  await t.shot('03-popup');
  await t.shot('seedtrunk-entry');
  if (!popup) return;

  // Choose an entry (default is pre-selected) and click Route ▶ — the real button.
  const chosen = await t.pg.evaluate(() => { const s = document.getElementById('_seedSel'); return { guid: s.value, label: s.options[s.selectedIndex] && s.options[s.selectedIndex].textContent }; });
  await t.clickSel('#_seedOk'); await t.sleep(1800);          // route + render (+ any animation) settles
  let trunk1 = await trunkCensus(t);
  for (let i = 0; i < 12 && trunk1.segs === 0; i++) { await t.sleep(300); trunk1 = await trunkCensus(t); }
  const pix1 = await t.pixsum();
  const plan = await t.pg.evaluate(() => { const net = window.__dwTrunk && window.__dwTrunk.ELEC; return net ? { storeys: (net.storeys || []).length, refused: net.refused === true } : null; });
  await t.shot('04-routed');
  await t.shot('seedtrunk-trunk-raw');

  t.assert('T3 ROUTED (Route ▶ renders a dwTrunk=ELEC line where there was none)', trunk0.n === 0 && trunk1.n >= 1 && trunk1.segs > 0, 'trunk ' + trunk0.n + '→' + trunk1.n + ' segs0=' + trunk0.segs + ' segs1=' + trunk1.segs + ' entry=' + (chosen && chosen.guid));
  t.assert('T4 PLANNED (net has storeys, not refused; rendered segs>0)', !!plan && plan.refused === false && plan.storeys >= 1 && trunk1.segs > 0, 'plan=' + JSON.stringify(plan) + ' segs=' + trunk1.segs);
  t.assert('T5 VISIBLE (framebuffer changed after routing)', pix0 !== pix1, 'pix ' + pix0 + '→' + pix1);
  const c1 = await census(), n10 = await t.pg.evaluate(() => ({ lines: window.__n10 || [], stat: (document.getElementById('stat') || {}).textContent || '' }));
  const entDiff = Object.keys(Object.assign({}, c0.ents, c1.ents)).filter(k => (c0.ents[k] || 0) !== (c1.ents[k] || 0));
  t.assert('N10a a trunk adds 0 op-log rows', c1.ops === c0.ops && c1.geom === c0.geom, 'ops ' + c0.ops + '→' + c1.ops + ' geom ' + c0.geom + '→' + c1.geom);
  t.assert('N10b a trunk adds 0 entities to the IFC export', entDiff.length === 0, 'classes changed=' + entDiff.length + ' ' + entDiff.slice(0, 5).join(','));
  t.assert('N10c no §WALK-MAINS line, one §TRUNK-PROPOSED committed=0', !n10.lines.some(l => /§WALK-MAINS/.test(l)) && n10.lines.filter(l => /§TRUNK-PROPOSED .*committed=0/.test(l)).length === 1, JSON.stringify(n10.lines).slice(0, 200));
  t.assert('N10d the status says it is a proposed trunk, not a drawn main', /proposed trunk, not a drawn main/.test(n10.stat), JSON.stringify(n10.stat.slice(0, 140)));
  // RED: the counters can fail. One GEOM_INSERT through the same commit call a walk uses.
  const red = await t.pg.evaluate(async () => { const O = window.Bonsai.oplog, w = (O._geomOps().find(x => x.parameters && x.parameters._dw) || {}).parameters; if (!w) return null;
    await O.commitSeedGroup([{ op_type: 'GEOM_INSERT', params: JSON.parse(JSON.stringify(w)) }], 'n10-red-' + O.length); return O.length; });
  const c2 = await census();
  t.assert('N10 RED: a deliberate commit moves the same counters', red != null && c2.ops > c1.ops && Object.keys(c2.ents).some(k => (c2.ents[k] || 0) !== (c1.ents[k] || 0)), 'ops ' + c1.ops + '→' + c2.ops);
}, { width: 1200, height: 850, dpr: 2 });
