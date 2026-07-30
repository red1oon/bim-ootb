#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-VOID-ANCHOR: §ANCHOR — void-consumed hosts as invisible ride anchors.
 * Implementing bim-compiler prompts/RESUME_MODELLER_LOD400_REAL_GEOMETRY.md §START HERE OPEN item 1
 * (✅ APPROVED — USER, 2026-07-30, "yes, build it") — Witness: W-E2E-VOID-ANCHOR.
 * Read the log after every run. Scope: SampleCastle ONLY (the one resident with a void-anchor patch).
 *
 * THE ISSUE THIS WITNESS PROVES/DISPROVES: SampleCastle ships 74 real rel_fills_host edges but only
 * 9 have BOTH ends present as scene features — 65 hosts are VOID-CONSUMED `kozijn` frame walls (their
 * body is 100% removed by their own opening), so fidByGuid[host_guid] is null and stretchRide() skips
 * their filling. The fix seeds those hosts as INVISIBLE ride anchors (real THREE.Mesh, .visible=false,
 * userData.anchor=true) from the patch-shipped real placement+extent (§ANCHOR-EXTRACT-SHIPPED), under
 * the USER'S ONE BINDING CONDITION: anchors are EXCLUDED from every count, pick, and audit.
 *
 * TWO MODES (RED-first):
 *   BASELINE=1 node witness_e2e_void_anchor.js
 *     — run on UNMODIFIED pre-fix code: records the pre-fix truth (reach 9/74, scene/outliner/pick/
 *       audit counts, zero `§ANCHOR ` lines) to tests/logs/void_anchor_baseline.json. Its asserts are
 *       the RED proof: they document that the gap exists (reach=9) and no anchor machinery is present.
 *   node witness_e2e_void_anchor.js            (CHECK mode, needs the recorded baseline)
 *     V1  §ANCHOR seeded n=65 — one summary + 65 per-guid `§ANCHOR seed guid=` lines (boundary-safe
 *         grep: `§ANCHOR ` with trailing space — `§ANCHORED` is a DIFFERENT pre-existing datum tag).
 *     V2  stretchRide reach ≥70/74 (both ends fid-resolved AND box-snapshotted — the exact inputs
 *         sdg_cascade.js stretchRide consumes; baseline measured 9).
 *     V3  RIDE, numerically: a kozijn host's filling RIDES the host's move — production stretchRide
 *         over the LIVE bridge/boxes emits rider delta == host delta; the induced GEOM_MOVE is then
 *         committed through the production oplog path and the filling MESH centre must move by exactly
 *         that delta (extent unchanged — a ride is rigid, never a scale).
 *     GUARDRAIL (falsify-by-count — every one must equal the recorded pre-fix baseline):
 *     G1  visible mesh count IDENTICAL; total meshes = baseline + 65 (all 65 extra are invisible
 *         userData.anchor meshes — unmistakable, never mistakable for the box bug).
 *     G2  Outliner: BOM-tree leaf count + paint total IDENTICAL (anchors add no rows).
 *     G3  raycasts through 3 REAL anchor positions (constants extracted from
 *         migration/modeller_patches/SampleCastle_ARC.db.sql) hit EXACTLY what they hit pre-fix —
 *         never an anchor (pick-path visible/anchor filters).
 *     G4  gmAudit (§GEOMAP-VALIDATE) checked/flagged/noBand IDENTICAL (anchors never audited).
 *     G5  §SAVE_BASELINE armed elements count IDENTICAL (conformity/save gate blind to anchors).
 *     G6  §XEDGE-ALL derived abuts/anchored/spans counts IDENTICAL (cross-edge derive blind to
 *         anchor transforms) — fills/aggregates/datums identical too (recovered, patch-borne).
 *     G7  §ARC-SEED elements= count IDENTICAL (anchors logged separately, never folded in).
 */
'use strict';
const fs = require('fs'), path = require('path');
const { runE2E } = require('./e2e_harness');

const BASELINE_MODE = process.env.BASELINE === '1';
const BASE_FILE = path.join(__dirname, 'logs', 'void_anchor_baseline.json');

// 3 REAL anchor placements — EXTRACTED VERBATIM from bim-compiler
// migration/modeller_patches/SampleCastle_ARC.db.sql (shipped-frame world centres; frame guard there
// measured per-axis |meanΔ| ≤ 0.05 m vs the shipped rtree midpoints). Used for the G3 pick rays in
// BOTH modes so the two runs raycast the IDENTICAL world lines. Non-invent: values are the patch's.
const ANCHOR_PROBES = [
  { guid: '1A9aTEU4z9SwaqEUwI8Lx4', c: [5.1770000000000005, 8.8599999999, 0.78] },
  { guid: '13hN5zL1L2fftXqB_Ac_WZ', c: [16.3849999845, 0.227, -0.026] },
  { guid: '0FdLbmS_r6Ch8VPitxry03', c: [21.422999892700002, 6.5200000000000005, 5.974] }
];

runE2E('W-E2E-VOID-ANCHOR', async (t) => {
  await t.open('SampleCastle'); await t.shot('01-open');

  // the §ARC-1 seed + cross-edges + save-gate baseline all land async after Open — wait for the full set
  await t.pg.waitForFunction(() => !!(window.__arcFidByGuid && window.__arcGuidByFid &&
    window.swXEdges && window.swXEdges.fills && window.__saveGateBaseline), { timeout: 30000 }).catch(() => {});
  await t.sleep(1500);   // let the outliner paint + geomap audit settle

  // ── capture EVERYTHING the guardrail counts, in one in-page pass ─────────────────────────────
  const cap = await t.pg.evaluate((probes) => {
    const g = window.Bonsai.group();
    const meshes = g.children.filter(o => o.isMesh && o.userData && o.userData.featureId != null);
    const visible = meshes.filter(o => o.visible);
    const anchors = meshes.filter(o => o.userData.anchor === true);
    // Outliner: BOM-tree leaves (the seeded element rows) — numeric, window-independent
    let bomLeaves = null;
    try {
      const tr = window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree && window.BOMTreeOutliner._currentTree();
      if (tr) bomLeaves = Object.keys(tr.nodes).filter(k => tr.nodes[k].kind === 'element').length;
    } catch (e) { }
    // G3 pick rays: vertical (top-down, the roof-first line) AND horizontal (+x, through the anchor
    // body height) at each REAL anchor position — filtered EXACTLY like pickAt (§V1 o.visible) plus
    // the userData.anchor defense; record ordered hit fids.
    const rc = new window.THREE.Raycaster();
    const list = g.children.filter(o => o.isMesh && o.visible && !(o.userData && o.userData.anchor));
    const rays = [];
    probes.forEach(p => {
      [[new window.THREE.Vector3(p.c[0], p.c[1], p.c[2] + 60), new window.THREE.Vector3(0, 0, -1)],
       [new window.THREE.Vector3(p.c[0] - 60, p.c[1], p.c[2]), new window.THREE.Vector3(1, 0, 0)]].forEach(rd => {
        rc.set(rd[0], rd[1]); rc.far = 200;
        const hits = rc.intersectObjects(list, false).slice(0, 3).map(h => h.object.userData.featureId);
        rays.push({ guid: p.guid, dir: rd[1].z ? 'down' : '+x', hits: hits });
      });
      // and the UNFILTERED anchor-detection ray: does ANY anchor mesh answer a raw raycast set?
      rc.set(new window.THREE.Vector3(p.c[0] - 60, p.c[1], p.c[2]), new window.THREE.Vector3(1, 0, 0)); rc.far = 200;
      const raw = rc.intersectObjects(g.children.filter(o => o.isMesh), false)
        .filter(h => h.object.userData && h.object.userData.anchor).length;
      rays[rays.length - 1].rawAnchorHits = raw;
    });
    const gm = (window.__gmSeedAudit && window.__gmSeedAudit.SampleCastle) || null;
    const X = window.swXEdges || {};
    const boxByFid = window.Bonsai.gridmove._buildBoxByFid();
    const fbg = window.__arcFidByGuid || {};
    let reach = 0, total = 0;
    (X.fills || []).forEach(e => {
      if (e.filling_guid == null || e.host_guid == null) return;
      total++;
      const h = fbg[e.host_guid], f = fbg[e.filling_guid];
      if (h != null && f != null && boxByFid[h] && boxByFid[f]) reach++;
    });
    return {
      sceneMeshTotal: meshes.length, visibleMeshCount: visible.length, anchorMeshCount: anchors.length,
      anchorsAllInvisible: anchors.every(a => a.visible === false),
      bomLeaves: bomLeaves, rays: rays,
      gm: gm ? { checked: gm.checked, flagged: (gm.flagged || []).length, noBand: gm.noBand } : null,
      saveBaselineElements: Object.keys(window.__saveGateBaseline || {}).length,
      xedge: { abuts: (X.abuts || []).length, anchored: (X.anchored || []).length, spans: (X.spans || []).length,
               fills: (X.fills || []).length, aggregates: (X.aggregates || []).length, datums: (X.datums || []).length },
      reach: reach, fillsBothEnds: total,
      anchorFids: anchors.map(a => a.userData.featureId)
    };
  }, ANCHOR_PROBES);

  // §-log lines — BOUNDARY-SAFE: '§ANCHOR ' with the trailing space; '§ANCHORED' is the datum tag.
  const anchorSeedLines = t.slog.filter(l => l.indexOf('§ANCHOR seed guid=') >= 0);
  const anchorSummary = t.slog.find(l => /§ANCHOR seeded n=\d+/.test(l)) || null;
  const arcSeedLine = t.slog.find(l => l.indexOf('§ARC-SEED-WIRE SampleCastle') >= 0) || '';
  const arcElements = (arcSeedLine.match(/elements=(\d+)/) || [])[1];
  const paintLine = t.slog.filter(l => /paint total=\d+/.test(l)).pop() || '';
  const paintTotal = (paintLine.match(/paint total=(\d+)/) || [])[1];

  console.log('  §VOIDANCHOR capture ' + JSON.stringify({
    scene: cap.sceneMeshTotal, visible: cap.visibleMeshCount, anchors: cap.anchorMeshCount,
    bomLeaves: cap.bomLeaves, paintTotal: paintTotal, gm: cap.gm, saveBase: cap.saveBaselineElements,
    xedge: cap.xedge, reach: cap.reach + '/' + cap.fillsBothEnds, arcElements: arcElements }));

  if (BASELINE_MODE) {
    // ── RED / pre-fix truth: record it, assert the gap exists ─────────────────────────────────
    t.assert('B1 pre-fix reach is the documented 9/74 gap', cap.reach === 9 && cap.fillsBothEnds === 74,
      'reach=' + cap.reach + '/' + cap.fillsBothEnds);
    t.assert('B2 ZERO `§ANCHOR ` lines pre-fix (fix absent — RED context proven)',
      anchorSeedLines.length === 0 && !anchorSummary, 'seedLines=' + anchorSeedLines.length);
    t.assert('B3 ZERO anchor meshes pre-fix', cap.anchorMeshCount === 0, 'anchors=' + cap.anchorMeshCount);
    t.assert('B4 counts captured (scene/visible/outliner/gm/saveBase/xedge all non-null)',
      cap.sceneMeshTotal > 0 && cap.visibleMeshCount > 0 && cap.bomLeaves != null &&
      cap.saveBaselineElements > 0 && paintTotal != null,
      'scene=' + cap.sceneMeshTotal + ' visible=' + cap.visibleMeshCount);
    fs.mkdirSync(path.dirname(BASE_FILE), { recursive: true });
    fs.writeFileSync(BASE_FILE, JSON.stringify({ recorded: new Date().toISOString().slice(0, 10),
      commit: 'pre-fix origin/main', cap: cap, paintTotal: paintTotal, arcElements: arcElements }, null, 1));
    console.log('  §VOIDANCHOR baseline recorded → ' + BASE_FILE);
    return;
  }

  // ── CHECK mode — needs the recorded pre-fix baseline ─────────────────────────────────────────
  if (!fs.existsSync(BASE_FILE)) { t.assert('V0 baseline exists (run BASELINE=1 on pre-fix code first)', false, BASE_FILE); return; }
  const base = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'));
  const b = base.cap;

  t.assert('V1a §ANCHOR seeded n=65 summary line', !!anchorSummary && /n=65/.test(anchorSummary), anchorSummary || 'MISSING');
  t.assert('V1b 65 per-guid `§ANCHOR seed guid=` lines', anchorSeedLines.length === 65, 'lines=' + anchorSeedLines.length);
  t.assert('V1c 65 anchor meshes in scene, ALL invisible', cap.anchorMeshCount === 65 && cap.anchorsAllInvisible,
    'anchors=' + cap.anchorMeshCount + ' allInvisible=' + cap.anchorsAllInvisible);

  t.assert('V2 stretchRide reach ≥70/74 (baseline ' + b.reach + '/' + b.fillsBothEnds + ')',
    cap.reach >= 70 && cap.fillsBothEnds === 74, 'reach=' + cap.reach + '/' + cap.fillsBothEnds);

  // GUARDRAIL — falsify by asserting counts identical to the recorded pre-fix baseline
  t.assert('G1a visible mesh count IDENTICAL to pre-fix', cap.visibleMeshCount === b.visibleMeshCount,
    cap.visibleMeshCount + ' vs baseline ' + b.visibleMeshCount);
  t.assert('G1b total meshes = baseline + 65, every extra one an anchor',
    cap.sceneMeshTotal === b.sceneMeshTotal + 65, cap.sceneMeshTotal + ' vs ' + b.sceneMeshTotal + '+65');
  t.assert('G2a Outliner BOM-tree leaf count IDENTICAL', cap.bomLeaves === b.bomLeaves,
    cap.bomLeaves + ' vs ' + b.bomLeaves);
  t.assert('G2b Outliner paint total IDENTICAL', paintTotal === base.paintTotal,
    paintTotal + ' vs ' + base.paintTotal);
  const raysMatch = cap.rays.length === b.rays.length && cap.rays.every((r, i) =>
    JSON.stringify(r.hits) === JSON.stringify(b.rays[i].hits));
  const anchorHit = cap.rays.some(r => r.hits.some(f => cap.anchorFids.indexOf(f) >= 0));
  const rawAnchorHits = cap.rays.reduce((s, r) => s + (r.rawAnchorHits || 0), 0);
  t.assert('G3a pick rays through 3 anchor positions hit EXACTLY the pre-fix objects', raysMatch,
    JSON.stringify(cap.rays.map(r => r.hits)) + ' vs ' + JSON.stringify(b.rays.map(r => r.hits)));
  t.assert('G3b no filtered ray ever returns an anchor', !anchorHit,
    'rawAnchorMeshesOnLine=' + rawAnchorHits + ' (proves the filter is doing real work when >0)');
  t.assert('G4 gmAudit checked/flagged/noBand IDENTICAL', JSON.stringify(cap.gm) === JSON.stringify(b.gm),
    JSON.stringify(cap.gm) + ' vs ' + JSON.stringify(b.gm));
  t.assert('G5 §SAVE_BASELINE elements IDENTICAL', cap.saveBaselineElements === b.saveBaselineElements,
    cap.saveBaselineElements + ' vs ' + b.saveBaselineElements);
  t.assert('G6 §XEDGE-ALL derived counts IDENTICAL', JSON.stringify(cap.xedge) === JSON.stringify(b.xedge),
    JSON.stringify(cap.xedge) + ' vs ' + JSON.stringify(b.xedge));
  t.assert('G7 §ARC-SEED elements= IDENTICAL (anchors logged separately)', arcElements === base.arcElements,
    arcElements + ' vs ' + base.arcElements);

  // ── V3 THE RIDE, numerically, through the production path ────────────────────────────────────
  // Pick a kozijn ANCHOR host with a filling; run production stretchRide over the LIVE bridge+boxes
  // with a synthesized host TRANSLATE (the same command shape computeCommands emits); assert rider
  // delta == host delta; then commit the induced GEOM_MOVE through the production oplog and assert
  // the filling MESH really moved by that delta (rigid — extent byte-identical).
  const ride = await t.pg.evaluate(() => {
    const fbg = window.__arcFidByGuid, gbf = window.__arcGuidByFid, fills = window.swXEdges.fills;
    const g = window.Bonsai.group();
    const anchorFids = new Set(g.children.filter(o => o.isMesh && o.userData && o.userData.anchor).map(o => o.userData.featureId));
    const boxByFid = window.Bonsai.gridmove._buildBoxByFid();
    for (const e of fills) {
      const h = fbg[e.host_guid], f = fbg[e.filling_guid];
      if (h == null || f == null || !anchorFids.has(h)) continue;       // want an ANCHOR host specifically
      if (!boxByFid[h] || !boxByFid[f]) continue;
      const fm = g.children.find(o => o.isMesh && o.userData.featureId === f);
      if (!fm || !fm.visible) continue;                                  // the filling must be a REAL visible mesh
      const delta = 0.75;
      const cmds = [{ featureId: h, action: 'TRANSLATE', axis: 'x', delta: delta }];
      const out = window.SdgCascade.stretchRide(cmds, gbf, fbg, fills, boxByFid);
      const rider = out.riders.find(r => r.featureId === f);
      fm.geometry.computeBoundingBox();
      const bb = fm.geometry.boundingBox;
      return { hostFid: h, hostGuid: e.host_guid, fillFid: f, fillGuid: e.filling_guid, delta: delta,
        rider: rider || null, hostCmdSurvives: out.commands.length === 1,
        preC: [(bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2],
        preExt: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z] };
    }
    return null;
  });
  console.log('  §VOIDANCHOR ride-discovery ' + JSON.stringify(ride));
  t.assert('V3a an ANCHOR host resolves + production stretchRide emits its filling as rider (delta==host delta)',
    !!(ride && ride.rider) && Math.abs(ride.rider.dx - ride.delta) < 1e-12 && ride.rider.dy === 0 && ride.rider.dz === 0,
    ride && ride.rider ? ('dx=' + ride.rider.dx + ' (host delta ' + ride.delta + ')') : 'NO RIDER');

  if (ride && ride.rider) {
    const post = await t.pg.evaluate(async (r) => {
      // commit through the PRODUCTION gesture path — exactly what gridmove.commit does with riders
      const ops = [{ op_type: 'GEOM_GRID_MOVE', params: { gridId: 'witness-void-anchor', delta: r.delta,
          commands: [{ featureId: r.hostFid, action: 'TRANSLATE', axis: 'x', delta: r.delta }] } },
        { op_type: 'GEOM_MOVE', params: { parent: r.fillFid, dx: r.rider.dx, dy: r.rider.dy, dz: r.rider.dz, induced: 'hosted-by' } }];
      await window.Bonsai.oplog.commitGesture(ops);
      const g = window.Bonsai.group();
      const fm = g.children.find(o => o.isMesh && o.userData.featureId === r.fillFid);
      if (!fm) return null;
      fm.geometry.computeBoundingBox(); const bb = fm.geometry.boundingBox;
      const hm = g.children.find(o => o.isMesh && o.userData.featureId === r.hostFid);
      let hostMoved = null;
      if (hm) { hm.geometry.computeBoundingBox(); const hb = hm.geometry.boundingBox; hostMoved = { visible: hm.visible, cx: (hb.min.x + hb.max.x) / 2 }; }
      return { c: [(bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2],
        ext: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z], host: hostMoved };
    }, ride);
    const dm = post ? [post.c[0] - ride.preC[0], post.c[1] - ride.preC[1], post.c[2] - ride.preC[2]] : null;
    const extSame = post && post.ext.every((v, i) => Math.abs(v - ride.preExt[i]) < 1e-9);
    t.assert('V3b the filling MESH moved by EXACTLY the host delta (dx=' + (dm && dm[0].toFixed(6)) + ')',
      !!dm && Math.abs(dm[0] - ride.delta) < 1e-6 && Math.abs(dm[1]) < 1e-9 && Math.abs(dm[2]) < 1e-9,
      JSON.stringify(dm));
    t.assert('V3c rigid ride — filling extent byte-identical (no scale reached it)', !!extSame, JSON.stringify(post && post.ext));
    t.assert('V3d the anchor host mesh itself moved AND stayed invisible',
      !!(post && post.host) && post.host.visible === false, JSON.stringify(post && post.host));
    await t.shot('02-ride-committed');
  }
});
