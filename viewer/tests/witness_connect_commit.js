#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-CONNECT-COMMIT (CONNECT_SCENE_SPEC.md P3 + bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S8-WITNESS). Read the log after every run.
 * SPEC: two REAL pages in one browser context (same origin -> shared localStorage store + BroadcastChannel): the Modeller and the Viewer, Connect ON.
 *   A real scale-cube drag on a wall with no hosted filling in the Modeller must reach the Viewer, which shows THE SAME Δ line on its hover label.
 *   C0 BASELINE   before the edit the Viewer has received no identity and shows no Δ for the wall (proves the Δ is caused by the edit; RED on a build without P3).
 *   C1 CONNECTED  both surfaces report Connect on.
 *   C2 SAME-ELEMENT the Viewer's hover under the selection-flown camera lands on the wall's own guid (else INCONCLUSIVE - not judged).
 *   C3 ID-IN      the Modeller commit reaches the Viewer: `§CONNECT-ID-IN viewer tip=<the Modeller's chain tip>`.
 *   C4 DELTA-VIEWER the Viewer logged `§S8-DELTA ... surface=viewer` for that guid.
 *   C5 EQUAL      costDelta, schedDelta, qty and the WHOLE label text are byte-equal between the Modeller and the Viewer (cross-surface equality = the falsifier).
 *   C6 HOVER      the Viewer's hover label (#s8-hover-line) shows that text.
 *   C7 UNDO       Ctrl+Z in the Modeller -> Viewer `§S8-DELTA costDelta=0.00` and its hover label loses the Δ line.
 *   C8 CHAIN      KernelOps.verifyChain ok on the shared signed store.
 * INCONCLUSIVE (not PASS) whenever nothing was actually judged (edit did not land, hover missed, no wall).
 */
'use strict';
const fs = require('fs'), path = require('path');
const { runE2E } = require('../../modeller/tests/e2e_harness');
const LIVE = 'https://red1oon.github.io/bim-ootb';
const OUT = process.env.OUT || path.join(__dirname, 's8_shots'); fs.mkdirSync(OUT, { recursive: true });
const verdict = [];
const V = (n, s, d) => { verdict.push(s); console.log('§CONNECT_COMMIT ' + n + ' ' + d + ' => ' + s); };

runE2E('W-CONNECT-COMMIT', async (t) => {
  const pg = t.pg;                                       // the MODELLER page
  const origin = process.env.S8_LOCAL ? new URL(pg.url()).origin : LIVE;
  const viewerUrl = process.env.S8_LOCAL ? origin + '/viewer/viewer.html?connect=1&db=' + encodeURIComponent('../modeller/Duplex_extracted.db') : origin + '/viewer/viewer.html?connect=1';
  const mk = (l, k) => { const m = l.match(new RegExp(k + '=([^ ]+)')); return m ? m[1] : null; };
  const mlines = () => t.slog.filter(l => /^§S8-DELTA /.test(l));
  const vlines = () => vlog.filter(l => /^§S8-DELTA /.test(l));

  await t.open('Duplex');
  // a NEW WINDOW (not a tab): a background tab is 'hidden' -> its rAF stops -> the Modeller's rAF-gated folds hang. Two windows are both visible.
  const br = pg.browser(), cdp = await br.target().createCDPSession();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, width: 800, height: 560 });
  const vt = await br.waitForTarget(x => x._targetId === targetId); const vp = await vt.page();
  await vp.setViewport({ width: 800, height: 500, deviceScaleFactor: 1 });
  console.log('  §CC_WINDOWS modeller.visibility=' + await pg.evaluate(() => document.visibilityState) + ' viewer.visibility=' + await vp.evaluate(() => document.visibilityState));
  const vlog = []; vp.on('console', m => { const x = m.text(); if (/^§/.test(x)) vlog.push(x); });
  const verr = []; vp.on('pageerror', e => verr.push(String(e).slice(0, 160)));
  await vp.goto(viewerUrl, { waitUntil: 'load', timeout: 300000 });
  for (let i = 0; i < 120; i++) { if (await vp.evaluate(() => !!(window.APP && window.APP.db)).catch(() => false)) break; await t.sleep(1000); }
  const vdb = await vp.evaluate(() => { try { return { n: APP.dbQuery('select count(*) from elements_meta')[0][0], ED: !!window.EditDelta, EDV: !!window.EditDeltaViewer }; } catch (e) { return { err: String(e) }; } });
  console.log('  §CC_VIEWER ' + JSON.stringify(vdb));
  // wall with no hosted filling (same rule as the First Steps witness — finding #1 is not built on)
  // walls a user can see from outside: an ABOVE-GRADE wall op (placement.z + bbox zmin >= 0), axis-safe, NO hosted filling (finding #1 not built on), highest first
  const walls = await pg.evaluate(() => { const O = window.Bonsai.oplog, ops = O._geomOps(), out = [];
    for (const o of ops) { const P = o.parameters || {}; if (!/Wall/i.test(P.ifc_class || '') || !P.bbox) continue; const pl = P.placement || {}; if (!(Math.abs(pl.rotX || 0) < 1e-6 && Math.abs(pl.rotY || 0) < 1e-6)) continue;
      const z0 = (pl.z || 0), z1 = z0 + (P.bbox[5] - P.bbox[4]); if (z0 < -0.01) continue;
      if (window.SdgCascade.ridersFor([o.id], window.__arcGuidByFid, window.__arcFidByGuid, window.swXEdges.fills, new Set([o.id])).length) continue;
      out.push({ f: o.id, z1: z1, len: Math.max(P.bbox[1] - P.bbox[0], P.bbox[3] - P.bbox[2]) }); }
    out.sort((a, b) => (b.z1 - a.z1) || (b.len - a.len)); return out.map(x => x.f); });
  // Connect ON in the Modeller (the real toolbar button)
  await pg.click('#b-connect'); await t.sleep(600);
  const con = { m: await pg.evaluate(() => !!(window.Connect && window.Connect.on)), v: await vp.evaluate(() => !!(window.Connect && window.Connect.on)) };
  V('C1 CONNECTED', con.m && con.v ? 'PASS' : 'FAIL', 'modeller=' + con.m + ' viewer=' + con.v);
  // C0 baseline
  const base = await vp.evaluate(() => ({ edits: Object.keys((window.EditDeltaViewer && EditDeltaViewer._edits) || {}).length, hasEDV: !!window.EditDeltaViewer }));
  const idIn0 = vlog.filter(l => /^§CONNECT-ID-IN viewer/.test(l)).length;
  V('C0 BASELINE', base.edits === 0 && idIn0 === 0 && vlines().length === 0 ? 'PASS' : 'FAIL', 'viewerEditedGuids=' + base.edits + ' idIn=' + idIn0 + ' s8lines=' + vlines().length + ' EditDeltaViewer=' + base.hasEDV);

  // select the wall in the Modeller (real click) -> selection channel flies the Viewer to it
  let fid = null, guid = null;
  for (const wf of walls) {
    const pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), wf); if (!pt) continue;
    await pg.mouse.move(pt[0], pt[1]); await t.sleep(80); await pg.mouse.click(pt[0], pt[1]); await t.sleep(400);
    const ss = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    if (ss.length === 1 && ss[0] === wf) { fid = wf; break; }
    await t.flySettle(); await pg.evaluate(() => window.Bonsai.select(null)); await pg.click('#b-fit'); await t.sleep(900);
  }
  if (fid == null) { for (const n of ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']) V(n, 'INCONCLUSIVE', 'no wall could be selected'); return; }
  guid = await pg.evaluate(f => window.__arcGuidByFid[f], fid);
  await t.flySettle(); await t.sleep(2500);               // Viewer's own fly to the Modeller's selection
  const selIn = vlog.filter(l => /^§CONNECT-SEL-IN viewer/.test(l)).pop();
  console.log('  §CC_SELECTION fid=' + fid + ' guid=' + guid + ' viewerGot=' + (selIn || 'nothing').slice(0, 120));

  // Viewer: hover under the flown camera
  // camera: the Viewer's OWN frame-an-element API (what its Find flow uses) — harness positioning, like frameElement on the Modeller side
  await vp.evaluate((g) => { if (window.APP && APP.focusElement) APP.focusElement([g], { item: true, frame: true }); }, guid); await t.sleep(3500);
  await vp.evaluate(() => { if (window.APP && APP.toggleHoverName) APP.toggleHoverName('api', true); });
  // scan the Viewer canvas with REAL mouse moves until ITS OWN hover raycast reports the wall's guid (the camera is the Viewer's; nothing is assumed about pixels)
  let hp = null;
  const hoverLog = () => vlog.filter(l => /^§HOVER_NAME/.test(l)).pop() || '';
  // find a pixel whose hover raycast (the Viewer's own oracle A.hoverGuidAt — same ray, same guid resolution as the hover label) lands on THIS guid, then hover it with the REAL mouse
  hp = await vp.evaluate((g) => { const W = window.innerWidth, H = window.innerHeight; let best = null;
    for (let y = 8; y < H - 8; y += 6) for (let x = 8; x < W - 8; x += 6) { if (APP.hoverGuidAt(x, y) === g) { const d = Math.hypot(x - W / 2, y - H / 2); if (!best || d < best.d) best = { x: x, y: y, d: d }; } }
    return best ? [best.x, best.y] : null; }, guid);
  if (hp) { await vp.mouse.move(hp[0] - 3, hp[1] - 3); await t.sleep(200); await vp.mouse.move(hp[0], hp[1]); await t.sleep(600); }
  console.log('  §CC_HOVERPOINT ' + JSON.stringify(hp));
  const hoverAtCentre = async () => {
    if (!hp) return null;
    await vp.mouse.move(6, 6); await t.sleep(500); await vp.mouse.move(hp[0] - 2, hp[1] - 2); await vp.mouse.move(hp[0], hp[1]); await t.sleep(1500);
    return vp.evaluate(() => { const e = document.getElementById('hover-name-label'); return e && e.style.display !== 'none' ? { html: e.innerHTML, s8: (document.getElementById('s8-hover-line') || {}).textContent || null } : null; });
  };
  const h0 = await hoverAtCentre();
  const hl = hoverLog();
  const sameEl = !!hp && hl.indexOf(' full=' + guid + ' ') >= 0;
  V('C2 SAME-ELEMENT', sameEl ? 'PASS' : 'INCONCLUSIVE', 'viewerHover="' + hl.slice(0, 120) + '" wantGuid=' + guid);
  console.log('  §CC_BASELINE_LABEL s8=' + JSON.stringify(h0 && h0.s8));

  // Modeller: real scale-cube drag on the longest local axis
  const opBbox = await pg.evaluate(f => window.Bonsai.oplog._geomOps().find(o => o.id === f).parameters.bbox, fid);
  const ld = [opBbox[1] - opBbox[0], opBbox[3] - opBbox[2], opBbox[5] - opBbox[4]], axis = ['scaleX', 'scaleY', 'scaleZ'][ld.indexOf(Math.max.apply(null, ld))];
  await t.flySettle(); await pg.click('#b-move'); await t.sleep(700);
  const giz = await pg.evaluate((ax) => { const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null; let cube = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === ax) cube = o; }); if (!cube) return null; const w = new window.THREE.Vector3(); cube.getWorldPosition(w); const c = new window.THREE.Vector3(); gz.getWorldPosition(c); return { cube: [w.x, w.y, w.z], centre: [c.x, c.y, c.z] }; }, axis);
  if (!giz) { for (const n of ['C3', 'C4', 'C5', 'C6', 'C7', 'C8']) V(n, 'INCONCLUSIVE', 'no ' + axis + ' cube'); return; }
  await t.frameElement(fid, 0.3);
  const od = [giz.cube[0] - giz.centre[0], giz.cube[1] - giz.centre[1], giz.cube[2] - giz.centre[2]], oL = Math.hypot(od[0], od[1], od[2]) || 1, dW = 0.3 * Math.max.apply(null, ld);
  const down = await t.proj(giz.cube[0], giz.cube[1], giz.cube[2]), up = await t.proj(giz.cube[0] + od[0] / oL * dW, giz.cube[1] + od[1] / oL * dW, giz.cube[2] + od[2] / oL * dW);
  const b0 = await t.oplog(); await t.drag(down, up, 10); await t.sleep(2500);
  const a0 = await t.oplog(), last = await t.lastOp();
  const landed = last && last.op_type === 'GEOM_SCALE' && a0.len === b0.len + 1;
  const tip = await pg.evaluate(() => { const o = window.Bonsai.oplog._geomOps(); return o.length ? o[o.length - 1].op_hash : null; });
  console.log('  §CC_EDIT oplog ' + b0.len + '->' + a0.len + ' op=' + (last && last.op_type) + ' tip=' + String(tip).slice(0, 12));
  if (!landed) { for (const n of ['C3', 'C4', 'C5', 'C6', 'C7', 'C8']) V(n, 'INCONCLUSIVE', 'scale did not land'); return; }
  // Modeller's own label (hover, tool mode off)
  await pg.keyboard.press('Escape'); await t.sleep(500);
  let pt = null; for (let i = 0; i < 10 && !pt; i++) { pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), fid); if (!pt) await t.sleep(400); }
  let mlabel = null; if (pt) { await pg.mouse.move(pt[0] + 3, pt[1] + 3); await pg.mouse.move(pt[0], pt[1]); for (let i = 0; i < 40 && !mlabel; i++) { await t.sleep(250); mlabel = await pg.evaluate(() => { const e = document.getElementById('s8-delta-label'); return e && e.style.display !== 'none' ? e.textContent : null; }); } }
  await t.sleep(1500);
  const idIn = vlog.filter(l => /^§CONNECT-ID-IN viewer/.test(l)).pop();
  V('C3 ID-IN', idIn && idIn.indexOf('tip=' + String(tip).slice(0, 12)) >= 0 ? 'PASS' : 'FAIL', 'viewerLog=' + (idIn || 'none').slice(0, 140) + ' modellerTip=' + String(tip).slice(0, 12));
  const vl = vlines().filter(l => mk(l, 'guid') === guid).pop(), ml = mlines().filter(l => mk(l, 'guid') === guid).pop();
  V('C4 DELTA-VIEWER', vl ? 'PASS' : 'FAIL', 'viewer=' + (vl || 'no §S8-DELTA for guid').slice(0, 250));
  const keys = ['qty', 'costDelta', 'schedDelta', 'basis', 'unit', 'rate'];
  const eq = vl && ml && keys.every(k => (k === 'basis' ? (vl.match(/basis=(.*?) finish=/) || [])[1] === (ml.match(/basis=(.*?) finish=/) || [])[1] : mk(vl, k) === mk(ml, k)));
  V('C5 EQUAL', !(vl && ml) ? 'INCONCLUSIVE' : (eq ? 'PASS' : 'FAIL'), 'modeller: costDelta=' + (ml && mk(ml, 'costDelta')) + ' sched=' + (ml && mk(ml, 'schedDelta')) + ' qty=' + (ml && mk(ml, 'qty')) + ' | viewer: costDelta=' + (vl && mk(vl, 'costDelta')) + ' sched=' + (vl && mk(vl, 'schedDelta')) + ' qty=' + (vl && mk(vl, 'qty')));
  console.log('  §CC_VEDITS ' + JSON.stringify(await vp.evaluate((g) => { const E = window.EditDeltaViewer; return { keys: Object.keys(E._edits), has: !!E._edits[g], lbl: E.labelFor(g), hoverFn: typeof (window.APP && APP.toggleHoverName), hs: String(document.querySelector('script[src*="hover_name"]') && document.querySelector('script[src*="hover_name"]').src) }; }, guid)).slice(0, 400));
  const h1 = await hoverAtCentre();
  await vp.screenshot({ path: path.join(OUT, 'viewer-s8-hover.png'), clip: { x: Math.max(0, (hp ? hp[0] : 400) - 260), y: Math.max(0, (hp ? hp[1] : 250) - 100), width: 520, height: 220 } });
  V('C6 HOVER', !sameEl ? 'INCONCLUSIVE' : (h1 && h1.s8 && mlabel && h1.s8 === mlabel ? 'PASS' : 'FAIL'), 'viewerLabel=' + JSON.stringify(h1 && h1.s8) + ' modellerLabel=' + JSON.stringify(mlabel) + (h1 && h1.s8 === mlabel ? ' (byte-equal)' : ''));

  // undo in the Modeller
  const nv = vlines().length;
  await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await pg.keyboard.down('Control'); await pg.keyboard.press('KeyZ'); await pg.keyboard.up('Control'); await t.sleep(3000);
  const vz = vlines().slice(nv).filter(l => mk(l, 'guid') === guid).pop();
  const h2 = await hoverAtCentre();
  V('C7 UNDO', !vz ? 'FAIL' : (mk(vz, 'costDelta') === '0.00' && (!h2 || !h2.s8) ? 'PASS' : 'FAIL'), 'viewer=' + (vz ? 'costDelta=' + mk(vz, 'costDelta') : 'no line after undo') + ' viewerLabelS8=' + JSON.stringify(h2 && h2.s8));
  vlog.filter(l => /^§(S8|CONNECT|HOVER_NAME)/.test(l)).slice(-14).forEach(l => console.log('  §CC_VLOG ' + l.slice(0, 200)));
  V('C8 CHAIN', (await t.verifyChain()) === true ? 'PASS' : 'FAIL', 'verifyChain(shared store)=' + (await t.verifyChain()));
  V('C9 NO-ERROR', verr.length === 0 ? 'PASS' : 'FAIL', 'viewer pageerrors=' + verr.length + ' ' + verr.slice(0, 2).join(' | '));
}, { width: 1200, height: 850, dpr: 2, url: process.env.S8_LOCAL ? undefined : LIVE + '/modeller/modeller.html', noExit: true }).then(r => {
  const c = s => verdict.filter(v => v === s).length;
  console.log('§CONNECT_COMMIT SUMMARY ' + c('PASS') + ' PASS / ' + c('FAIL') + ' FAIL / ' + c('INCONCLUSIVE') + ' INCONCLUSIVE (harness ' + JSON.stringify(r) + ')');
  process.exit(c('FAIL') || c('INCONCLUSIVE') || r.fail ? 1 : 0);
});
