#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-S9-MODELLER-PROJECT (bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S9-WITNESS). Read the log after every run.
 * SPEC: from the Modeller (real clicks), read and open the ERP Project Order of the SELECTED parts, in red1's flow, on THREE real pages of one browser
 *   context (Modeller, Viewer, ERP — one origin, one OPFS store). Default target = the LIVE site (E2E_URL); S9_LOCAL=1 = the worktree.
 *   P1 BUTTON        selecting parts shows "ERP ▸ Project Order", and NOTHING of the ERP owners is loaded before the click (Open time unchanged).
 *   P2 NOT-GENERATED the read says "not generated" (§S9-STATE generated=false) and prices the parts.
 *   P3 GENERATE      Generate -> ONE C_Project; its plannedAmt == the sum recomputed HERE (own SQL on the Duplex DB x the ACTIVE rates) (independent).
 *   P4 VIEWER-EQUAL  the Viewer's own › ERP fold of the SAME guids (its own _selectionPriced SQL path) reports the SAME plannedAmt and lines=+0 (the Viewer SEES
 *                    the Modeller's order), and the Viewer's #find-erp-open link carries the same C_Project id. Cross-surface equality = the falsifier.
 *   P5 LAUNCH        clicking "Open in ERP" opens ../erp/idempiere.html?client=garden&window=130&record=<that id>; the ERP page (auto-login) logs
 *                    §IDEMPIERE-DEEPLINK record=<id> landed (the record is in ITS db).
 *   P6 VARIANT       edit a part of it (real scale-cube drag): the read is a VARIANT: BOTH "A delete & re-issue" and "B Variation Order" are offered; the parts' cost
 *                    (§S9-STATE partsCost) CHANGED by the S8 quantity delta (rounded per class like the fold).
 *   P7 OPTION-A      A leaves EXACTLY ONE project row for the building, and its plannedAmt == the independent sum over the POST-EDIT quantities.
 *   P8 UNDO          Ctrl+Z -> the parts' cost is back to the ORIGINAL value.
 *   P9 COMMITTED     a completed sub purchase order on the project (fixture) -> committed read FROM RECORDS; edit again -> A is DISABLED with its reason named.
 *   P10 OPTION-B     B adds exactly one Variation Order whose GrandTotal == the independent (rate x 1.3 x loading x count); the Viewer reads the same order (vos=1).
 * INCONCLUSIVE (not PASS) whenever nothing was judged (no wall, edit did not land, hover/click missed).
 */
'use strict';
const fs = require('fs'), path = require('path');
const { runE2E } = require('./e2e_harness');
const ROOT = path.join(__dirname, '..', '..');
const LIVE = 'https://red1oon.github.io/bim-ootb';
const BigDecimal = require(path.join(ROOT, 'erp', 'bigdecimal.js'));
const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
const OUT = process.env.OUT || path.join(__dirname, 's9_shots'); fs.mkdirSync(OUT, { recursive: true });
const verdict = [];
const V = (n, s, d) => { verdict.push(s); console.log('§S9_MODELLER ' + n + ' ' + d + ' => ' + s); };
const HALF_UP = BigDecimal.RoundingMode.HALF_UP;

runE2E('W-S9-MODELLER-PROJECT', async (t) => {
  const pg = t.pg, origin = process.env.S9_LOCAL ? new URL(pg.url()).origin : LIVE;
  const slog = () => t.slog;
  const last = (re) => slog().filter(l => re.test(l)).pop() || '';
  const kv = (l, k) => { const m = l.match(new RegExp(k + '=([^ ]+)')); return m ? m[1] : null; };
  const shot = async (label, rects, pad) => {   // clip = union of the given viewport rects (+pad), clamped
    rects = rects.filter(Boolean); const vp = pg.viewport(); pad = pad == null ? 14 : pad;
    let x0 = Math.max(0, Math.min(...rects.map(r => r.x)) - pad), y0 = Math.max(0, Math.min(...rects.map(r => r.y)) - pad), x1 = Math.min(vp.width, Math.max(...rects.map(r => r.x + r.w)) + pad), y1 = Math.min(vp.height, Math.max(...rects.map(r => r.y + r.h)) + pad);
    await pg.screenshot({ path: path.join(OUT, label + '.png'), clip: { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) } });
    console.log('  §SHOTCLIP ' + label + ' ' + [x0, y0, x1 - x0, y1 - y0].map(Math.round));
  };
  const rectOf = (sel) => pg.evaluate(s => { const e = document.querySelector(s); if (!e || e.style.display === 'none') return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
  await t.open('Duplex');
  if (process.env.S9_LOCAL) await pg.evaluate(() => { window.__S9_BUILDING_LABELS = {}; });   // FIXTURE only: the local Viewer opens the Modeller's own DB, which carries no federated building label

  // ── subject: two above-grade walls with no hosted filling ──
  const walls = await pg.evaluate(() => { const O = window.Bonsai.oplog, out = [];
    for (const o of O._geomOps()) { const P = o.parameters || {}; if (!/Wall/i.test(P.ifc_class || '') || !P.bbox) continue; const pl = P.placement || {}; if (!(Math.abs(pl.rotX || 0) < 1e-6 && Math.abs(pl.rotY || 0) < 1e-6)) continue;
      const z0 = pl.z || 0, z1 = z0 + (P.bbox[5] - P.bbox[4]); if (z0 < -0.01) continue;
      if (window.SdgCascade.ridersFor([o.id], window.__arcGuidByFid, window.__arcFidByGuid, window.swXEdges.fills, new Set([o.id])).length) continue;
      out.push({ f: o.id, z1: z1, len: Math.max(P.bbox[1] - P.bbox[0], P.bbox[3] - P.bbox[2]) }); }
    out.sort((a, b) => (b.z1 - a.z1) || (b.len - a.len)); return out.map(x => x.f); });
  const pick = async (fid, shift) => { const pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), fid); if (!pt) return false;
    await pg.mouse.move(pt[0], pt[1]); await t.sleep(80); if (shift) await pg.keyboard.down('Shift'); await pg.mouse.click(pt[0], pt[1]); if (shift) await pg.keyboard.up('Shift'); await t.sleep(500); return true; };
  let fidA = null, fidB = null;
  for (const wf of walls) { if (fidA == null) { if (await pick(wf, false)) { const s = await pg.evaluate(() => Array.from(window.Bonsai._selSet || [])); if (s.length === 1 && s[0] === wf) fidA = wf; else { await t.flySettle(); await pg.evaluate(() => window.Bonsai.select(null)); await pg.click('#b-fit'); await t.sleep(900); } } }
    else { await t.flySettle(); if (!fidB && !global.__dollied) { global.__dollied = true; await t.dolly(2.6); await t.sleep(500); }   // the first pick zoomed onto wall A: pull back so a neighbour is in view
      if (await pick(wf, true)) { const s = await pg.evaluate(() => Array.from(window.Bonsai._selSet || [])); if (s.length === 2) { fidB = wf; break; } } } }
  if (fidA == null || fidB == null) { V('P1 BUTTON', 'INCONCLUSIVE', 'could not select two walls by real clicks (A=' + fidA + ' B=' + fidB + ')'); return; }
  await t.flySettle(); await t.sleep(500);
  const guids = await pg.evaluate(() => Array.from(window.Bonsai._selSet).map(f => window.__arcGuidByFid[f]));
  console.log('  §S9_SUBJECT fids=' + fidA + ',' + fidB + ' guids=' + guids.join(','));

  // P1
  const btn = await pg.evaluate(() => { const b = document.getElementById('s9-erp-btn'); return { vis: !!b && b.style.display !== 'none', text: b && b.textContent, owners: { PS: !!window.ProjOrderState, PF: !!window.ProjFold, ED: !!window.EditDelta } }; });
  V('P1 BUTTON', btn.vis && !btn.owners.PS && !btn.owners.PF && !btn.owners.ED ? 'PASS' : 'FAIL', 'button=' + JSON.stringify(btn.text) + ' visible=' + btn.vis + ' ownersBeforeClick=' + JSON.stringify(btn.owners));
  if (!btn.vis) return;

  // ── independent expectation from the Duplex DB file + the ACTIVE rates (read after the lazy load) ──
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const bdb = new SQL.Database(fs.readFileSync(path.join(ROOT, 'modeller', 'Duplex_extracted.db')));
  const dimsOf = (g) => bdb.exec("SELECT m.ifc_class, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.guid='" + g.replace(/'/g, "''") + "'")[0].values[0];
  const area = (d) => { const s = d.slice().sort((a, b) => b - a); return s[0] * s[1]; };
  let RATES = null;
  const expectPlanned = (factors, subset) => {   // per class: round(rate x SUM qty) exactly like the fold (setScale 0 HALF_UP), summed
    const byCls = {}; (subset || guids).forEach(g => { const r = dimsOf(g), f = factors[g] || [1, 1, 1]; const d = [r[1] * f[0], r[2] * f[1], r[3] * f[2]]; (byCls[r[0]] = byCls[r[0]] || []).push(d); });
    let tot = BigDecimal.ZERO; Object.keys(byCls).forEach(c => { const rt = RATES[c] || { rate: 0, unit: 'EA' }; const qty = byCls[c].reduce((s, d) => s + (rt.unit === 'M2' ? area(d) : rt.unit === 'M' ? Math.max(...d) : rt.unit === 'M3' ? d[0] * d[1] * d[2] : 1), 0);
      tot = tot.add(BigDecimal.of(String(rt.rate)).multiply(BigDecimal.of(String(qty))).setScale(0, HALF_UP)); }); return tot.toString(); };
  const partsCostOf = (l) => kv(l, 'partsCost');

  // P2 — click the button: read (lazy-loads the owners; fetches the seed once)
  const n0 = slog().length;
  await pg.click('#s9-erp-btn');
  for (let i = 0; i < 240 && !/§S9-STATE/.test(slog().slice(n0).join('\n')); i++) await t.sleep(500);
  const st0 = slog().slice(n0).filter(l => /^§S9-STATE/.test(l)).pop() || '';
  RATES = await pg.evaluate(() => JSON.parse(JSON.stringify(window.RATES)));
  const txt0 = await pg.evaluate(() => (document.getElementById('s9-state') || {}).textContent || null);
  await shot('s9-1-read-not-generated', [await rectOf('#s9-panel'), await rectOf('#s9-erp-btn')], 12);
  V('P2 NOT-GENERATED', kv(st0, 'generated') === 'false' && kv(st0, 'kind') === 'not-generated' && /generate/.test(kv(st0, 'actions') || '') ? 'PASS' : (st0 ? 'FAIL' : 'INCONCLUSIVE'), st0.slice(0, 230) + ' | panel="' + (txt0 || '').slice(0, 100) + '"');
  const cost0 = partsCostOf(st0);

  // P3 — generate
  const n1 = slog().length;
  await pg.click('#s9-generate');
  for (let i = 0; i < 120 && !/§S9-ACT kind=generate/.test(slog().slice(n1).join('\n')); i++) await t.sleep(400);
  await t.sleep(1200);
  const gen = slog().slice(n1).filter(l => /^§S9-GENERATE/.test(l)).pop() || '', st1 = slog().slice(n1).filter(l => /^§S9-STATE/.test(l)).pop() || '';
  const exp0 = expectPlanned({}); const projId = kv(gen, 'project');
  const nProj = await pg.evaluate(async () => { const s = await window.ProjOrderUI.store(); return window.ProjOrderState.countProjects(s.db, window.ProjOrderState.projectKey(window.__dwName)); });
  await shot('s9-2-generated', [await rectOf('#s9-panel')], 12);
  V('P3 GENERATE', gen && nProj === 1 && kv(gen, 'plannedAmt') === exp0 && kv(st1, 'generated') === 'true' && kv(st1, 'plannedAmt') === exp0 ? 'PASS' : (gen ? 'FAIL' : 'INCONCLUSIVE'),
    gen.slice(0, 160) + ' independentPlanned=' + exp0 + ' projectRows=' + nProj + ' stateAfter=' + (st1.match(/generated=true.*?kind=/) || [''])[0]);
  const planned0 = kv(gen, 'plannedAmt');

  // P5 — launch (real click on the link; it opens a new page)
  const br = pg.browser(); const created = new Promise(res => br.once('targetcreated', res));
  await pg.click('#s9-open'); const tgt = await Promise.race([created, t.sleep(15000).then(() => null)]);
  const opened = tgt ? tgt.url() : null; if (tgt) { try { const pp = await tgt.page(); if (pp) await pp.close(); } catch (e) { } }
  const expUrl = origin + '/erp/idempiere.html?client=garden&window=130&record=' + projId;
  // P5b — the ERP page itself (auto-login) lands on the record
  const cdp = await br.target().createCDPSession(); const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, width: 1100, height: 700 });
  const et = await br.waitForTarget(x => x._targetId === targetId); const ep = await et.page(); const elog = []; ep.on('console', m => { const x = m.text(); if (/^§/.test(x)) elog.push(x); });
  await ep.goto(expUrl + '&login=GardenAdmin', { waitUntil: 'load', timeout: 300000 });
  for (let i = 0; i < 120 && !elog.some(l => /IDEMPIERE-DEEPLINK/.test(l)); i++) await t.sleep(1000);
  const dl = elog.filter(l => /IDEMPIERE-DEEPLINK|BIM_OVERLAY/.test(l));
  const landed = elog.find(l => /IDEMPIERE-DEEPLINK record=\d+ landed/.test(l));
  V('P5 LAUNCH', opened && opened.replace(/#.*$/, '') === expUrl && landed && landed.indexOf('record=' + projId + ' ') >= 0 ? 'PASS' : (opened ? 'FAIL' : 'INCONCLUSIVE'), 'clickedLink=' + opened + ' expected=' + expUrl + ' ERP:' + dl.slice(0, 3).join(' | ').slice(0, 260));
  try { await ep.close(); } catch (e) { }

  // P4 — the Viewer
  const vt0 = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, width: 1000, height: 660 });
  const vt = await br.waitForTarget(x => x._targetId === vt0.targetId); const vp = await vt.page(); await vp.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  const vlog = []; vp.on('console', m => { const x = m.text(); if (/^(§|\[RP-C\])/.test(x)) vlog.push(x); });
  await vp.goto(process.env.S9_LOCAL ? origin + '/viewer/viewer.html?db=' + encodeURIComponent('../modeller/Duplex_extracted.db') : origin + '/viewer/viewer.html', { waitUntil: 'load', timeout: 300000 });
  for (let i = 0; i < 180; i++) { if (await vp.evaluate(() => !!(window.APP && window.APP.db && window.APP._SQL && window.ProjFold && window.ProjOrderState)).catch(() => false)) break; await t.sleep(1000); }
  await vp.evaluate(async () => { if (window.APP.loadNavigate) await window.APP.loadNavigate(); }); await t.sleep(800);   // the Find/Navigate bundle is lazy
  await vp.evaluate((g) => { window.APP.applyFindScope(g.join(',')); }, guids); await t.sleep(3500);
  await vp.evaluate(() => { const b = document.getElementById('find-erp-btn'); if (b) b.click(); });
  for (let i = 0; i < 120 && !vlog.some(l => /§PROJ_PUSH_PERSIST/.test(l)); i++) await t.sleep(700);
  const vpush = vlog.filter(l => /§PROJ_PUSH project=/.test(l)).pop() || '', vcost = vlog.filter(l => /§FIND_COST/.test(l)).pop() || '';
  const vlink = await vp.evaluate(() => { const a = document.getElementById('find-erp-open'); return a ? { href: a.getAttribute('href'), vis: a.style.display !== 'none' } : null; });
  const vplanned = (vpush.match(/plannedAmt=(\S+)/) || [])[1], vlines = (vpush.match(/lines=\+(\d+)/) || [])[1];
  const vstate = await vp.evaluate(async (b) => { const SQL = window.APP._SQL; const st = await window.ProjOrderState.openStore(SQL, () => { throw new Error('no store'); }); return { src: st.src, rows: window.ProjOrderState.countProjects(st.db, b) }; }, await pg.evaluate(() => window.ProjOrderState.projectKey(window.__dwName))).catch(e => ({ err: String(e).slice(0, 80) }));
  const vkey = await vp.evaluate(() => window.APP.activeBuilding), mkey = await pg.evaluate(() => window.ProjOrderState.projectKey(window.__dwName));
  V('P4 VIEWER-EQUAL', vpush && vkey === mkey && vplanned === planned0 && vlines === '0' && vlink && vlink.vis && vlink.href.indexOf('record=' + projId) >= 0 ? 'PASS' : (vpush ? 'FAIL' : 'INCONCLUSIVE'),
    'buildingKey viewer=' + vkey + ' modeller=' + mkey + ' | viewer ' + vpush.slice(0, 200) + ' | modellerPlanned=' + planned0 + ' viewerPlanned=' + vplanned + ' lines=+' + vlines + ' link=' + JSON.stringify(vlink) + ' viewerCost="' + vcost.slice(0, 120) + '" opfsStore=' + JSON.stringify(vstate));

  // P6 — edit one wall of the PO (select only A, scale its longest axis by the real cube)
  await pg.bringToFront().catch(() => { });
  await t.flySettle(); await pg.evaluate(() => window.Bonsai.select(null)); await t.sleep(400);
  await pick(fidA, false); await t.flySettle(); await t.sleep(500);
  const guidA = await pg.evaluate(f => window.__arcGuidByFid[f], fidA);
  const opBbox = await pg.evaluate(f => window.Bonsai.oplog._geomOps().find(o => o.id === f).parameters.bbox, fidA);
  const ld = [opBbox[1] - opBbox[0], opBbox[3] - opBbox[2], opBbox[5] - opBbox[4]], axis = ['scaleX', 'scaleY', 'scaleZ'][ld.indexOf(Math.max.apply(null, ld))];
  const doScale = async (mult) => {
    await pg.click('#b-move'); await t.sleep(700);
    const giz = await pg.evaluate((ax) => { const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null; let cube = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === ax) cube = o; }); if (!cube) return null; const w = new window.THREE.Vector3(); cube.getWorldPosition(w); const c = new window.THREE.Vector3(); gz.getWorldPosition(c); return { cube: [w.x, w.y, w.z], centre: [c.x, c.y, c.z] }; }, axis);
    if (!giz) return null;
    await t.frameElement(fidA, 0.3);
    const od = [giz.cube[0] - giz.centre[0], giz.cube[1] - giz.centre[1], giz.cube[2] - giz.centre[2]], oL = Math.hypot(od[0], od[1], od[2]) || 1, dW = (mult || 1) * 0.3 * Math.max.apply(null, ld);
    const down = await t.proj(giz.cube[0], giz.cube[1], giz.cube[2]), up = await t.proj(giz.cube[0] + od[0] / oL * dW, giz.cube[1] + od[1] / oL * dW, giz.cube[2] + od[2] / oL * dW);
    const b = await t.oplog(); await t.drag(down, up, 10); await t.sleep(2200);
    const a = await t.oplog(), l = await t.lastOp();
    await pg.keyboard.press('Escape'); await t.sleep(400);
    return (l && l.op_type === 'GEOM_SCALE' && a.len === b.len + 1) ? [l.parameters.fx || 1, l.parameters.fy || 1, l.parameters.fz || 1] : null;
  };
  const f1 = await doScale();
  if (!f1) { for (const n of ['P6 VARIANT', 'P7 OPTION-A', 'P8 UNDO', 'P9 COMMITTED', 'P10 OPTION-B']) V(n, 'INCONCLUSIVE', 'scale did not land'); return; }
  const n2 = slog().length;
  await pg.click('#s9-erp-btn'); for (let i = 0; i < 60 && !/§S9-STATE/.test(slog().slice(n2).join('\n')); i++) await t.sleep(400);
  await t.sleep(600);
  const st2 = slog().slice(n2).filter(l => /^§S9-STATE/.test(l)).pop() || '';
  const abBtns = await pg.evaluate(() => ({ a: document.getElementById('s9-a') && !document.getElementById('s9-a').disabled, b: !!document.getElementById('s9-b'), variant: (document.getElementById('s9-variant') || {}).textContent || null }));
  await shot('s9-3-variant', [await rectOf('#s9-panel')], 12);
  // parts cost for A alone: unedited vs edited (independent)
  const costOf = (f) => { const g = guidA, r = dimsOf(g), ff = f || [1, 1, 1], d = [r[1] * ff[0], r[2] * ff[1], r[3] * ff[2]]; const rt = RATES[r[0]]; return BigDecimal.of(String(rt.rate)).multiply(BigDecimal.of(String(rt.unit === 'M2' ? area(d) : 1))).setScale(0, HALF_UP).toString(); };
  const costA0 = costOf(null), costA1 = costOf(f1);
  V('P6 VARIANT', kv(st2, 'kind') === 'variant' && abBtns.a && abBtns.b && kv(st2, 'edited') === 'true' && partsCostOf(st2) === costA1 ? 'PASS' : (st2 ? 'FAIL' : 'INCONCLUSIVE'),
    st2.slice(0, 240) + ' | A enabled=' + abBtns.a + ' B present=' + abBtns.b + ' partsCost shown=' + partsCostOf(st2) + ' independent(edited)=' + costA1 + ' (unedited ' + costA0 + ') factors=' + JSON.stringify(f1));

  // P7 — option A
  const n3 = slog().length;
  await pg.click('#s9-a'); for (let i = 0; i < 120 && !/§S9-DELETE-REISSUE ok/.test(slog().slice(n3).join('\n')); i++) await t.sleep(400);
  await t.sleep(1000);
  const dr = slog().slice(n3).filter(l => /^§S9-DELETE-REISSUE ok/.test(l)).pop() || '', st3 = slog().slice(n3).filter(l => /^§S9-STATE/.test(l)).pop() || '';
  const fac = {}; fac[guidA] = f1; const exp1 = expectPlanned(fac, [guidA]);   // A re-issues from the SELECTION (wall A, edited)
  const nProj2 = await pg.evaluate(async () => { const s = await window.ProjOrderUI.store(); return window.ProjOrderState.countProjects(s.db, window.ProjOrderState.projectKey(window.__dwName)); });
  await shot('s9-4-option-a', [await rectOf('#s9-panel')], 12);
  V('P7 OPTION-A', dr && nProj2 === 1 && kv(st3, 'plannedAmt') === exp1 && /scopeNote=more/.test(st2) ? 'PASS' : (dr ? 'FAIL' : 'INCONCLUSIVE'),
    dr.slice(0, 200) + ' | scopeNote(before A)=' + kv(st2, 'scopeNote') + ' projectRows=' + nProj2 + ' plannedAmt ' + planned0 + '->' + kv(st3, 'plannedAmt') + ' independent(post-edit)=' + exp1);

  // P8 — undo the edit
  const n4 = slog().length;
  await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await pg.keyboard.down('Control'); await pg.keyboard.press('KeyZ'); await pg.keyboard.up('Control'); await t.sleep(2500);
  await pg.click('#s9-erp-btn'); for (let i = 0; i < 60 && !/§S9-STATE/.test(slog().slice(n4).join('\n')); i++) await t.sleep(400); await t.sleep(600);
  const st4 = slog().slice(n4).filter(l => /^§S9-STATE/.test(l)).pop() || '';
  V('P8 UNDO', st4 && partsCostOf(st4) === costA0 && kv(st4, 'edited') === 'false' ? 'PASS' : (st4 ? 'FAIL' : 'INCONCLUSIVE'), st4.slice(0, 200) + ' | partsCost=' + partsCostOf(st4) + ' original=' + costA0);

  // P9 — committed (a completed sub purchase order on the project, as the ERP would hold it) then edit again
  await pg.evaluate(async () => { const s = await window.ProjOrderUI.store(), db = s.db; const pid = db.exec("SELECT C_Project_ID FROM C_Project WHERE Value=?", [window.ProjOrderState.projectKey(window.__dwName)])[0].values[0][0];
    db.run("INSERT INTO C_Order (C_Order_ID,AD_Client_ID,AD_Org_ID,IsActive,C_BPartner_ID,Description,IsSOTrx,DocStatus,GrandTotal,C_Project_ID,DocumentNo) VALUES (991001,11,11,'Y',120,'Sub-contract PO (fixture): ' || ?,'N','CO',1000,?,'FIX-1')", [window.ProjOrderState.projectKey(window.__dwName), pid]);
    await window.ProjOrderState.persist(db); });
  const f2 = await doScale(2);   // a LARGER second stretch: the VO is the difference to the order line as it stands (already holding the first stretch after A)
  if (!f2) { V('P9 COMMITTED', 'INCONCLUSIVE', 'second scale did not land'); V('P10 OPTION-B', 'INCONCLUSIVE', 'second scale did not land'); return; }
  const n5 = slog().length;
  await pg.click('#s9-erp-btn'); for (let i = 0; i < 60 && !/§S9-STATE/.test(slog().slice(n5).join('\n')); i++) await t.sleep(400); await t.sleep(600);
  const st5 = slog().slice(n5).filter(l => /^§S9-STATE/.test(l)).pop() || '';
  const c5 = await pg.evaluate(() => ({ aDisabled: document.getElementById('s9-a') ? document.getElementById('s9-a').disabled : null, refuse: (document.getElementById('s9-refuse') || {}).textContent || null, b: !!document.getElementById('s9-b') && !document.getElementById('s9-b').disabled }));
  const rowsBefore = await pg.evaluate(async () => { const s = await window.ProjOrderUI.store(); return window.ProjOrderState.countProjects(s.db, window.ProjOrderState.projectKey(window.__dwName)); });
  await shot('s9-5-committed', [await rectOf('#s9-panel')], 12);
  V('P9 COMMITTED', kv(st5, 'committed') === 'true' && c5.aDisabled === true && /committed/.test(c5.refuse || '') && c5.b && /issueVO/.test(kv(st5, 'actions') || '') && !/deleteReissue/.test(kv(st5, 'actions') || '') ? 'PASS' : (st5 ? 'FAIL' : 'INCONCLUSIVE'),
    st5.slice(0, 220) + ' | A disabled=' + c5.aDisabled + ' reason="' + (c5.refuse || '').slice(0, 130) + '" B enabled=' + c5.b + ' projectRows=' + rowsBefore);

  // P10 — option B: ONE PRICING BASIS. VO == round0(rate x area(second stretch)) - the order line as it stands (after A); PO + VO == a fresh fold of the edited part.
  const n6 = slog().length;
  await pg.click('#s9-b'); for (let i = 0; i < 120 && !/§S9-VO /.test(slog().slice(n6).join('\n')); i++) await t.sleep(400); await t.sleep(1000);
  const vo = slog().slice(n6).filter(l => /^§S9-VO /.test(l)).pop() || '', st6 = slog().slice(n6).filter(l => /^§S9-STATE/.test(l)).pop() || '';
  const facs2 = {}; facs2[guidA] = f2;
  const freshEdited = expectPlanned(facs2, [guidA]);                 // fresh fold of the edited part (selection = A)
  const poNow = kv(st3, 'plannedAmt');                                  // the order line as it stands after A
  const expVO = BigDecimal.of(freshEdited).subtract(BigDecimal.of(poNow)).toString();
  const inv = BigDecimal.of(poNow).add(BigDecimal.of(kv(vo, 'grandTotal') || '0')).compareTo(BigDecimal.of(freshEdited)) === 0;
  await shot('s9-6-option-b', [await rectOf('#s9-panel')], 12);
  const voLine = await pg.evaluate(() => (document.getElementById('s9-vos') || {}).textContent || null);
  const vstate2 = await vp.evaluate(async (b) => { const st = await window.ProjOrderState.openStore(window.APP._SQL, () => { throw new Error('no store'); }); const s = window.ProjOrderState.readState(st.db, b, [], { ProjControl: window.ProjControl }); return { src: st.src, vos: s.vos.length, committed: s.committed.is, vo0: s.vos[0] && s.vos[0].total, st0: s.vos[0] && window.ProjOrderState.voStatusLabel(s.vos[0].status), rows: window.ProjOrderState.countProjects(st.db, b) }; }, await pg.evaluate(() => window.ProjOrderState.projectKey(window.__dwName))).catch(e => ({ err: String(e).slice(0, 80) }));
  V('P10 OPTION-B', vo && BigDecimal.of(kv(vo, 'grandTotal')).compareTo(BigDecimal.of(expVO)) === 0 && Number(expVO) > 0 && inv && /vos=1/.test(st6) && /Drafted/.test(voLine || '') && vstate2.vos === 1 && vstate2.committed === true && vstate2.st0 === 'Drafted' ? 'PASS' : (vo ? 'FAIL' : 'INCONCLUSIVE'),
    vo.slice(0, 200) + ' independent(fresh fold of edited - order line)=' + freshEdited + '-' + poNow + '=' + expVO + ' | INVARIANT PO(' + poNow + ') + VO(' + kv(vo, 'grandTotal') + ') == fresh fold (' + freshEdited + '): ' + inv + ' | panel "' + (voLine || '').slice(0, 90) + '" | viewer reads ' + JSON.stringify(vstate2));
}, { width: 1200, height: 850, dpr: 2, url: process.env.S9_LOCAL ? undefined : LIVE + '/modeller/modeller.html', noExit: true }).then(r => {
  const c = s => verdict.filter(v => v === s).length;
  console.log('§S9_MODELLER SUMMARY ' + c('PASS') + ' PASS / ' + c('FAIL') + ' FAIL / ' + c('INCONCLUSIVE') + ' INCONCLUSIVE (harness ' + JSON.stringify(r) + ')');
  process.exit(c('FAIL') || c('INCONCLUSIVE') || r.fail ? 1 : 0);
});
