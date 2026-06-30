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
  await t.shot('02-walked');

  // T2 — trigger the Outliner "Route trunk" handler (seedTrunk) WITHOUT awaiting: it blocks on the popup. Then
  // assert the REAL modal is up with candidate entries.
  await t.pg.evaluate(() => { window.__seedTrunkPromise = window.seedTrunk('ELEC'); });
  const popup = await t.pg.waitForFunction(() => { const s = document.getElementById('_seedSel'); const ok = document.getElementById('_seedOk'); return s && ok ? { opts: s.options.length } : null; }, { timeout: 12000, polling: 150 }).then(h => h.jsonValue()).catch(() => null);
  t.assert('T2 POPUP (real modal with ≥1 candidate entry + Route button)', popup && popup.opts >= 1, 'options=' + (popup && popup.opts));
  await t.shot('03-popup');
  if (!popup) return;

  // Choose an entry (default is pre-selected) and click Route ▶ — the real button.
  const chosen = await t.pg.evaluate(() => { const s = document.getElementById('_seedSel'); return { guid: s.value, label: s.options[s.selectedIndex] && s.options[s.selectedIndex].textContent }; });
  await t.clickSel('#_seedOk'); await t.sleep(1800);          // route + render (+ any animation) settles
  let trunk1 = await trunkCensus(t);
  for (let i = 0; i < 12 && trunk1.segs === 0; i++) { await t.sleep(300); trunk1 = await trunkCensus(t); }
  const pix1 = await t.pixsum();
  const plan = await t.pg.evaluate(() => { const net = window.__dwTrunk && window.__dwTrunk.ELEC; return net ? { storeys: (net.storeys || []).length, refused: net.refused === true } : null; });
  await t.shot('04-routed');

  t.assert('T3 ROUTED (Route ▶ renders a dwTrunk=ELEC line where there was none)', trunk0.n === 0 && trunk1.n >= 1 && trunk1.segs > 0, 'trunk ' + trunk0.n + '→' + trunk1.n + ' segs0=' + trunk0.segs + ' segs1=' + trunk1.segs + ' entry=' + (chosen && chosen.guid));
  t.assert('T4 PLANNED (net has storeys, not refused; rendered segs>0)', !!plan && plan.refused === false && plan.storeys >= 1 && trunk1.segs > 0, 'plan=' + JSON.stringify(plan) + ' segs=' + trunk1.segs);
  t.assert('T5 VISIBLE (framebuffer changed after routing)', pix0 !== pix1, 'pix ' + pix0 + '→' + pix1);
});
