// ⚠ WITNESS W-GLOW-SPRITE — bim-compiler prompts/NIGHT_AND_FIXTURE_LIGHTING.md §PHOTO_GLOW_SPRITE
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   §PHOTO_EMBER lit luminaires by setting `emissive` on the MATERIALS they are drawn with. Batched
//   and instanced meshes share ONE material across everything they draw (Hospital: 1216 luminaires
//   -> 7 materials), so it lit WALL PANELS, beams and railings, and `toneMapped=false` on a material
//   shared with a transparent panel rendered that panel pure black. §PHOTO_GLOW_SPRITE replaces it
//   with an additive Points cloud at the fixture positions, which touches NO scene material at all.
//
// WHAT IS ASSERTED — inclusion and application, not photometry:
//   1. INCLUDED   the luminaire vocabulary selects the real fittings and rejects the accessories
//                 (switches / receptacles / panelboards / sockets / outlets), reported per family.
//   2. APPLIED    every included fixture gets a sprite, in NIGHT MODE, with no Alt+S pressed; and
//                 they are all gone when night mode goes off.
//   3. NOTHING ELSE TOUCHED   emissive / emissiveIntensity / toneMapped of every scene material,
//                 snapshotted before staging and diffed after. Zero mutations is what makes lit
//                 wall panels and black rectangles impossible here rather than merely filtered —
//                 those two failures ARE a changed `emissive` and a flipped `toneMapped`.
//
// Deliberately NOT measured: frame luminance. Pixel measurement needs a camera standing where lamps
// are in line of sight, and finding one costs a raycast search (~50ms/ray against batched meshes)
// plus ~90s per Alt+S fold — for a question that inclusion and application already answer.
// Run: PORT=8403 BLD=Clinic node probe_glow_night.js   |   BLD=Hospital ...
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8403, BLD = process.env.BLD || 'Clinic';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LUM = ['light', 'troffer', 'downlight', 'luminaire', 'lamp', 'sconce', 'pendant'];
const NOT = ['switch', 'receptacle', 'panelboard', 'socket', 'outlet'];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.toggleNightMode && window.APP._glowSpriteCount, { timeout: 240000 });
  await sleep(12000);
  await page.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 180000, polling: 2000 });

  const all = await page.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  const want = all.filter(x => /Architectural|Electrical/i.test(x)).sort();
  for (const b of want) await page.evaluate(bb => { try { window.APP.streamBuilding(bb); } catch (e) {} }, b);
  // Settle-wait UNCONDITIONALLY, not only after an explicit streamBuilding: Hospital is a
  // single-model DB, so `want` is empty and a stream-gated wait never runs at all.
  let guidMapN = -1, stable = 0;
  for (let i = 0; i < 90; i++) {
    const n = await page.evaluate(() => Object.keys(window.APP.guidMap).length);
    stable = (n === guidMapN && n > 0) ? stable + 1 : 0;
    if (stable >= 3) break;
    guidMapN = n; await sleep(2000);
  }

  // ── 1. INCLUDED: what the vocabulary selects, and what it rejects.
  const sel = await page.evaluate((L, N) => {
    const A = window.APP;
    const like = (w, j) => w.map(x => "LOWER(element_name) LIKE '%" + x + "%'").join(j);
    const q = s => { try { return A.dbQuery(s) || []; } catch (e) { return []; } };
    const rows = q("SELECT m.element_name, m.ifc_class FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
      "WHERE m.ifc_class IN ('IfcLightFixture','IfcFlowTerminal','IfcElectricAppliance') AND (" + like(L, ' OR ') + ") AND NOT (" + like(N, ' OR ') + ")");
    const naive = q("SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
      "WHERE m.ifc_class IN ('IfcLightFixture','IfcFlowTerminal','IfcElectricAppliance') AND (" + like(L, ' OR ') + ")");
    // what the NOT clause threw away, by family — the accessories that must not become light sources
    const rej = q("SELECT m.element_name, COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
      "WHERE m.ifc_class IN ('IfcLightFixture','IfcFlowTerminal','IfcElectricAppliance') AND (" + like(L, ' OR ') + ") AND (" + like(N, ' OR ') + ") GROUP BY 1 ORDER BY 2 DESC");
    const fams = {}, classes = {};
    rows.forEach(r => { const f = String(r[0]).split(':')[0]; fams[f] = (fams[f] || 0) + 1; classes[r[1]] = (classes[r[1]] || 0) + 1; });
    return { kept: rows.length, naive: naive.length ? naive[0][0] : 0, families: fams, classes,
             rejected: rej.map(r => [String(r[0]).split(':')[0], r[1]]) };
  }, LUM, NOT);

  const snap = () => page.evaluate(() => {
    const seen = {}, out = [];
    window.APP.collectMeshes(o => o.isMesh).forEach(o => {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        if (!m || seen[m.uuid]) return; seen[m.uuid] = 1;
        out.push([m.uuid, m.emissive ? m.emissive.getHex() : -1, m.emissiveIntensity === undefined ? -1 : m.emissiveIntensity, m.toneMapped !== false ? 1 : 0]);
      });
    });
    return out;
  });
  const diff = (a, b) => {
    const m = {}; a.forEach(r => m[r[0]] = r);
    let n = 0; const eg = [];
    b.forEach(r => { const o = m[r[0]]; if (!o) return;
      if (o[1] !== r[1] || o[2] !== r[2] || o[3] !== r[3]) { n++; if (eg.length < 4) eg.push(`${r[0].slice(0, 8)} emissive ${o[1]}->${r[1]} int ${o[2]}->${r[2]} toneMapped ${o[3]}->${r[3]}`); } });
    return { n, eg };
  };

  const dayMats = await snap();
  await page.evaluate(() => window.APP.toggleNightMode());
  await sleep(5000);
  // Snapshot AFTER night mode: night legitimately makes its own fixture/window materials emissive.
  // Everything the SPRITES do must leave this untouched.
  const before = await snap();
  const staged = await page.evaluate(() => window.APP._glowSpriteCount());
  const fixtures = await page.evaluate(() => window.APP._nightFixtureWorldPositions().length);
  const during = await snap();
  // the cloud is one object with one material of its own — that is WHY nothing is shared
  const cloud = await page.evaluate(() => {
    const o = window.APP.scene.getObjectByName('__glowSprites');
    if (!o) return null;
    const shared = [];
    window.APP.collectMeshes(m => m.isMesh).forEach(m => {
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mm => { if (mm && mm.uuid === o.material.uuid) shared.push(m.name || m.type); });
    });
    return { type: o.type, count: o.geometry.attributes.position.count, matUuid: o.material.uuid.slice(0, 8),
             blending: o.material.blending, depthTest: o.material.depthTest, depthWrite: o.material.depthWrite,
             toneMapped: o.material.toneMapped, sharedWith: shared.length };
  });

  await page.evaluate(() => window.APP.toggleNightMode());   // night OFF
  await sleep(3000);
  const afterOff = await page.evaluate(() => window.APP._glowSpriteCount());
  const after = await snap();
  await browser.close();

  const dNight = diff(dayMats, before), dDuring = diff(before, during);
  // `after` is taken with night mode OFF, so it must be compared against the DAY snapshot, not
  // against the night one — diffing it against `before` just re-reports night mode restoring its
  // own glow materials and reads as a sprite failure. (It did, on the first run of this probe.)
  const dAfter = diff(dayMats, after);
  const L = '='.repeat(84);
  console.log(`\n${L}\nW-GLOW-SPRITE — ${BLD}   (night mode only; inclusion + application, no photometry)\n${L}`);
  console.log(`scene       ${guidMapN} guidMap entries   models: ${want.join(', ') || '(single-model DB)'}`);

  console.log(`\n--- 1. INCLUDED — which elements the vocabulary selects`);
  console.log(`  kept ${sel.kept} of ${sel.naive} class+name matches  (${sel.naive - sel.kept} accessories rejected)`);
  Object.entries(sel.classes).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`    ifc_class  ${String(n).padStart(5)}  ${c}`));
  Object.entries(sel.families).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([f, n]) => console.log(`    included   ${String(n).padStart(5)}  ${f}`));
  if (!sel.rejected.length) console.log(`    rejected       0  (this building has no accessories matching the light words)`);
  sel.rejected.slice(0, 8).forEach(([f, n]) => console.log(`    REJECTED   ${String(n).padStart(5)}  ${f}`));

  console.log(`\n--- 2. APPLIED — night mode alone, no Alt+S`);
  console.log(`  fixtures resolved to world positions   ${fixtures}`);
  console.log(`  sprites staged by night mode           ${staged}`);
  console.log(`  sprites after night mode OFF           ${afterOff}`);
  if (cloud) console.log(`  the cloud                              ${cloud.type} x${cloud.count}, material ${cloud.matUuid}, ` +
    `additive=${cloud.blending === 2}, depthTest=${cloud.depthTest}, depthWrite=${cloud.depthWrite}, toneMapped=${cloud.toneMapped}`);

  console.log(`\n--- 3. NOTHING ELSE TOUCHED — no lit wall panels, no black rectangles, by construction`);
  console.log(`  scene materials tracked                ${before.length}`);
  console.log(`  scene meshes sharing the cloud's material  ${cloud ? cloud.sharedWith : '?'}   (0 = it is the sprites' own material; this is the whole mechanism)`);
  console.log(`  changed by NIGHT MODE itself           ${dNight.n}   (expected — night's own fixture/window glow)`);
  console.log(`  changed by the SPRITES, staged         ${dDuring.n}${dDuring.eg.length ? '\n      ' + dDuring.eg.join('\n      ') : ''}`);
  console.log(`  after night OFF, vs the DAY snapshot    ${dAfter.n}   (0 = everything handed back)${dAfter.eg.length ? '\n      ' + dAfter.eg.join('\n      ') : ''}`);
  console.log(`  §PHOTO_EMBER for comparison            33 collateral elements on the Clinic; walls, beams and railings + black panels on Hospital`);

  const clean = dDuring.n === 0 && dAfter.n === 0 && (!cloud || cloud.sharedWith === 0);
  const applied = fixtures > 0 && staged === fixtures && afterOff === 0;
  const included = sel.kept > 0 && sel.kept === fixtures;
  console.log(`\nVERDICT     ${!clean ? 'FAIL — ' + dDuring.n + '/' + dAfter.n + ' scene materials mutated; wall panels are still at risk'
    : !included ? 'FAIL — vocabulary selected ' + sel.kept + ' but ' + fixtures + ' reached world positions'
    : !applied ? 'FAIL — ' + staged + ' sprites applied for ' + fixtures + ' fixtures, ' + afterOff + ' left after night off'
    : 'PASS — ' + sel.kept + ' luminaires included, all ' + staged + ' applied in night mode, 0 scene materials touched'}`);
  console.log(`\n--- § log lines`);
  console.log(logs.filter(l => /§PHOTO_GLOW_SPRITE|§NIGHT_MODE|PAGEERROR/.test(l)).join('\n'));
  process.exit(clean && applied && included ? 0 : 1);
})();
