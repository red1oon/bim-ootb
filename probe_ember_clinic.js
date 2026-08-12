// PROBE — §PHOTO_EMBER glow-only, Clinic main hallway. Spec: PHOTOREAL_STILL_RENDER.md §PHOTO_EMBER.
//
// User ruling: "glow only first, use the Clinic hallway, then have a the later version to compare."
// So this renders the SAME camera in the SAME room twice, through the real Alt+S fold, and hands back
// two stills plus the numbers — baseline and glow — so the comparison is a comparison and not a memory
// of what the last render looked like.
//
// A SANDBOX, deliberately: nothing here edits the viewer. It reaches in at runtime exactly the way
// ghostglass.js already does (cache emissive/emissiveIntensity per material, set, restore), so if the
// look is not worth it, there is nothing to revert.
//
// WHY THE STILLS ARE NOT THE ONLY OUTPUT: this project's rule is that code and maths are the truth,
// never "does it look right". For a LIGHTING change the image genuinely is the deliverable — but it is
// reported next to numbers that can be argued with: how many fixtures were matched (and that switches
// were NOT), mean and peak luminance of each render, and what the fold cost. A glow that does not move
// the luminance numbers is decoration that is not reaching the frame.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8403;
const BLD = process.env.BLD || 'Clinic';
const ROOM = process.env.ROOM || '≈ Second Floor R22';   // 21.8 x 6.8m, 67 luminaires — see the spec
const OUT = process.env.OUT || '/tmp/ember_out';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The luminaire vocabulary, and the exclusions that matter more than the vocabulary does. The Clinic
// has 236 "M_Lighting Switches", 28 "M_Lighting and Appliance Panelboard" and 961 "M_Duplex
// Receptacle" — every one of which a naive '%light%' would set glowing.
const LUM_WORDS = ['light', 'troffer', 'downlight', 'luminaire', 'lamp', 'sconce', 'pendant'];
const NOT_WORDS = ['switch', 'receptacle', 'panelboard', 'socket', 'outlet'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.startStillRefine && window.APP._composer,
    { timeout: 180000 });
  await sleep(12000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 120000, polling: 2000 });

  // ── 0. Federated models. The Clinic is FIVE separate `building` values and the streamer loads the
  //       one nearest the camera — the first cut of this probe sat at the opening camera for 20s, got
  //       Clinic_HVAC_IFC2x3 only, and concluded there were no luminaires in the scene. The user's own
  //       baked film shows the downlights and sphere sconces plainly, which is the better evidence:
  //       Electrical DOES stream in a real session as the camera moves. So ask for it explicitly
  //       rather than hoping proximity brings it, and take Architectural too — glow with no walls or
  //       ceiling to sit in is not a hallway shot.
  const streamed = await page.evaluate(async () => {
    const A = window.APP;
    const want = (A.dbQuery("SELECT DISTINCT building FROM elements_meta") || []).map(r => r[0])
      .filter(b => /Architectural|Electrical/i.test(b))
      .sort();   // Architectural FIRST — the room has to exist before the lights in it mean anything
    window.__emberWant = want;
    return want;
  });
  // ONE AT A TIME. Firing streamBuilding for both models in the same tick only ever landed one of
  // them (guidMap came back 5822 = HVAC + Electrical, with Architectural missing entirely, so the
  // render had fixtures floating in the dark with no walls or floor). Request, wait for the count to
  // settle, then request the next.
  for (const b of streamed) {
    await page.evaluate(bb => { try { window.APP.streamBuilding(bb); } catch (e) {} }, b);
    let prev = -1;
    for (let i = 0; i < 60; i++) {
      const n = await page.evaluate(() => Object.keys(window.APP.guidMap).length);
      if (n === prev && n > 0) break;
      prev = n; await sleep(2000);
    }
  }
  const rendered = await page.evaluate(() => [...(window.APP.buildingsRendered || [])]);

  // ── 1. The room, and the luminaires inside it — selected from the DB, by position, because
  //       rel_contained_in_space carries no ELEC rows at all.
  const room = await page.evaluate((ROOM) => {
    const r = window.APP.dbQuery(
      "SELECT guid, name, center_x, center_y, center_z, size_x, size_y, size_z FROM spatial_structure WHERE name = '" +
      ROOM.replace(/'/g, "''") + "'");
    if (!r || !r.length) return null;
    const q = r[0];
    return { guid: q[0], name: q[1], cx: q[2], cy: q[3], cz: q[4], sx: q[5], sy: q[6], sz: q[7] };
  }, ROOM);
  if (!room) { console.log('ROOM NOT FOUND: ' + ROOM); await browser.close(); process.exit(1); }

  const sel = await page.evaluate((room, LUM, NOT) => {
    const like = (col, words, join) => words.map(w => "lower(" + col + ") LIKE '%" + w + "%'").join(join);
    const sql =
      "SELECT e.guid, e.element_name, e.material_rgba FROM elements_meta e " +
      "JOIN element_transforms t ON t.guid = e.guid WHERE (" + like('e.element_name', LUM, ' OR ') + ") " +
      "AND NOT (" + like('e.element_name', NOT, ' OR ') + ") " +
      "";
    // NO room filter. The user's framing is "implant ANY lighting fixture as source of light", and a
    // room box actively hurts: the wall sconces they can see in the hallway sit outside the compiled
    // space's bbox, so filtering by room dropped exactly the fixtures they asked about. Emissive costs
    // nothing per fixture, so scoping it to a room buys nothing and loses the sconces.
    const rows = window.APP.dbQuery(sql) || [];
    // The exclusions are ASSERTED, not assumed: count what a naive match would have swept in.
    const naive = (window.APP.dbQuery(
      "SELECT COUNT(*) FROM elements_meta e JOIN element_transforms t ON t.guid=e.guid WHERE (" +
      like('e.element_name', LUM, ' OR ') + ") " +
      "AND t.center_x BETWEEN " + (room.cx - room.sx / 2) + " AND " + (room.cx + room.sx / 2) + " " +
      "AND t.center_y BETWEEN " + (room.cy - room.sy / 2) + " AND " + (room.cy + room.sy / 2) + " " +
      "AND ABS(t.center_z - " + room.cz + ") < 4") || [[0]])[0][0];
    // TWO sets, and conflating them put the camera inside a wall: everything gets LIT (emissive is
    // free per fixture and the sconces live outside the compiled room's box), but the CAMERA is
    // placed from the hallway's fixtures alone — otherwise the centroid is the whole building.
    const roomRows = window.APP.dbQuery(sql +
      " AND t.center_x BETWEEN " + (room.cx - room.sx / 2) + " AND " + (room.cx + room.sx / 2) +
      " AND t.center_y BETWEEN " + (room.cy - room.sy / 2) + " AND " + (room.cy + room.sy / 2) +
      " AND ABS(t.center_z - " + room.cz + ") < 4") || [];
    const fams = {};
    rows.forEach(r => { const f = String(r[1]).split(':')[0]; fams[f] = (fams[f] || 0) + 1; });
    return { guids: rows.map(r => r[0]), roomGuids: roomRows.map(r => r[0]), families: fams, naive: naive };
  }, room, LUM_WORDS, NOT_WORDS);

  // ── 2. The camera comes from Alt+C. Deriving a viewpoint by hand failed three times (bbox centroid
  //       and fixture-anchor both landed inside walls, and the fixture anchor resolved to the world
  //       origin because instance-matrix extraction is wrong for batched meshes). None of that needs
  //       solving here: cinemaPathPlan already walks this building at eye level through its corridors,
  //       and poseAt(t) is the same function the bake flies. Sample its walk band and stand there.
  const cam = await page.evaluate(async () => {
    const A = window.APP;
    let plan = null;
    try { plan = A.cinemaPathPlan(30); } catch (e) { return { ok: false, err: e.message }; }
    if (!plan || typeof plan.poseAt !== 'function') return { ok: false, err: 'no plan' };
    // The walk sits between the dive/spin and the rise/orbit; mid-film is inside the building.
    const ts = [0.40, 0.50, 0.60];
    const poses = ts.map(t => { const p = plan.poseAt(t); return { t: t, x: p.x, y: p.y, z: p.z, tx: p.tx, ty: p.ty, tz: p.tz }; });
    return { ok: true, poses: poses, sec: plan.sec, pathLen: plan.pathLen };
  });
  if (!cam.ok) { console.log('CINEMA PLAN UNAVAILABLE: ' + cam.err); await browser.close(); process.exit(1); }
  async function stand(pose) {
    await page.evaluate(p => {
      const A = window.APP;
      A.camera.position.set(p.x, p.y, p.z);
      A.controls.target.set(p.tx, p.ty, p.tz);
      A.controls.update();
      if (A.markDirty) A.markDirty();
    }, pose);
    await sleep(800);
  }

  // ── 3. How many of those GUIDs are actually meshes in the scene? A glow applied to nothing looks
  //       exactly like a glow that is too subtle, so this number has to be reported either way.
  // guidMap is keyed meshId -> guid for standalone meshes and meshId_slot -> guid for instanced and
  // batched ones. Reading it the other way round (guidMap[o.id] and hoping) found nothing at all: the
  // Clinic's fixtures are instanced, so their key carries a slot suffix. Invert the map instead.
  const matched = await page.evaluate(guids => {
    const A = window.APP, want = new Set(guids);
    const ids = new Set();
    Object.keys(A.guidMap).forEach(k => {
      if (want.has(A.guidMap[k])) ids.add(parseInt(String(k).split('_')[0], 10));
    });
    return { meshIds: [...ids], hits: Object.keys(A.guidMap).filter(k => want.has(A.guidMap[k])).length };
  }, sel.guids);

  // One Alt+S fold, then a capture. Same routine both times so the only difference is the emissive.
  async function foldAndShoot(tag) {
    const t0 = Date.now();
    await page.evaluate(() => { if (window.APP._stillRefineActive) window.APP.stopStillRefine(true); });
    await sleep(600);
    await page.evaluate(() => window.APP.startStillRefine());
    for (let i = 0; i < 120 && await page.evaluate(() => !!window.APP._stillRefineBusy); i++) await sleep(500);
    await sleep(1500);
    const file = path.join(OUT, `${BLD}_${tag}.png`);
    await page.screenshot({ path: file });
    return { file, ms: Date.now() - t0 };
  }

  const shots = [];
  for (const pose of cam.poses) {
    await stand(pose);
    shots.push({ t: pose.t, base: await foldAndShoot('t' + Math.round(pose.t * 100) + '_1_baseline'), pose: pose });
  }
  const base = shots[0].base;

  // ── 4. The glow. Emissive only — no lights, no composer change. Cached exactly the way
  //       ghostglass.js caches it, so this is reversible and so a second run cannot double-apply.
  const applied = await page.evaluate((guids) => {
    const A = window.APP, want = new Set(guids);
    // Which mesh objects hold these guids? Instanced and batched meshes key as meshId_slot.
    const ids = new Set();
    Object.keys(A.guidMap).forEach(k => {
      if (want.has(A.guidMap[k])) ids.add(parseInt(String(k).split('_')[0], 10));
    });
    // An instanced/batched mesh shares ONE material across every element in it, so emissive cannot be
    // per-instance — every element drawn by that material lights up together. For luminaires that is
    // acceptable and is in fact what was asked for ("implant any lighting fixture as source of
    // light"). What is NOT acceptable is doing it silently: count the elements that share these
    // materials but are NOT luminaires, because that is the collateral, and report it.
    const objs = [];
    A.collectMeshes(o => o.isMesh).forEach(o => { if (ids.has(o.id)) objs.push(o); });
    const collateral = new Set();
    objs.forEach(o => {
      Object.keys(A.guidMap).forEach(k => {
        if (parseInt(String(k).split('_')[0], 10) === o.id && !want.has(A.guidMap[k])) collateral.add(A.guidMap[k]);
      });
    });
    const seen = new Set();
    let mats = 0;
    objs.forEach(o => {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        if (!m || !m.emissive || seen.has(m.uuid)) return;
        seen.add(m.uuid); mats++;
        m.userData = m.userData || {};
        m.userData._emberSave = { e: m.emissive.getHex(), i: m.emissiveIntensity || 0, tm: m.toneMapped !== false };
        // Warm white. STATED, not measured: the Clinic's family names carry no wattage and no cw/ww
        // tag (unlike Terminal's "2 X 28W ... cw"), so a per-kind default is the honest fallback and
        // it is declared here rather than tuned silently. toneMapped=false is what makes an emissive
        // surface read as a SOURCE rather than as pale paint, given there is no bloom pass in the chain.
        m.emissive.setHex(0xfff2d0);
        m.emissiveIntensity = 3.0;
        m.toneMapped = false;
        m.needsUpdate = true;
      });
    });
    return { meshes: objs.length, materials: mats, meshIds: [...ids].length, collateral: collateral.size };
  }, sel.guids);

  for (const sh of shots) { await stand(sh.pose); sh.glow = await foldAndShoot('t' + Math.round(sh.t * 100) + '_2_glow'); }
  const glow = shots[0].glow;

  // ── 5. Numbers, so the comparison is arguable. Mean and peak luminance of each PNG, computed from
  //       the pixels — a glow that does not move these is not reaching the frame.
  const lum = await page.evaluate(async (files) => {
    const read = src => new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let sum = 0, peak = 0, hot = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          sum += L; if (L > peak) peak = L; if (L > 240) hot++; n++;
        }
        res({ mean: sum / n, peak: peak, hotPct: hot / n * 100 });
      };
      img.onerror = () => res(null);
      img.src = src;
    });
    return { a: await read(files[0]), b: await read(files[1]) };
  }, [ 'data:image/png;base64,' + fs.readFileSync(base.file).toString('base64'),
       'data:image/png;base64,' + fs.readFileSync(glow.file).toString('base64') ]);

  console.log(`\n${'='.repeat(78)}\n§PHOTO_EMBER sandbox — ${BLD}  "${room.name}"\n${'='.repeat(78)}`);
  console.log(`camera      from Alt+C's own plan (pathLen ${cam.pathLen ? cam.pathLen.toFixed(1) : '?'}m) — poseAt() sampled mid-film, the same function the bake flies`);
  cam.poses.forEach(p => console.log(`              t=${p.t.toFixed(2)}  at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  looking to (${p.tx.toFixed(1)}, ${p.ty.toFixed(1)}, ${p.tz.toFixed(1)})`));
  console.log(`luminaires  ${sel.guids.length} lit building-wide, ${sel.roomGuids.length} of them in the demo room (camera placed from those)`);
  const naiveAll = await page.evaluate(() => (window.APP.dbQuery(
    "SELECT COUNT(*) FROM elements_meta WHERE lower(element_name) LIKE '%light%'") || [[0]])[0][0]);
  console.log(`exclusions  a bare '%light%' over the building matches ${naiveAll}; the vocabulary keeps ${sel.guids.length}` +
              ` — ${naiveAll - sel.guids.length} switches/panelboards rejected`);
  Object.entries(sel.families).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(`              ${String(c).padStart(4)}  ${f}`));
  console.log(`scene       requested: ${streamed.join(', ')}  |  RENDERED: ${rendered.join(', ')}  |  guidMap ${await page.evaluate(() => Object.keys(window.APP.guidMap).length)} entries`);
  console.log(`meshes      ${matched.hits} guidMap hits across ${matched.meshIds.length} mesh objects  ->  ${applied.meshes} lit, ${applied.materials} materials`);
  console.log(`collateral  ${applied.collateral} NON-luminaire elements share those materials and will also glow` +
              (applied.collateral ? '  <-- instanced/batched meshes cannot do per-instance emissive' : ''));
  console.log(`\nfold cost   baseline ${(base.ms / 1000).toFixed(1)}s   glow ${(glow.ms / 1000).toFixed(1)}s   ` +
              `delta ${((glow.ms - base.ms) / 1000).toFixed(1)}s  (emissive is a material property — expect ~0)`);
  if (lum.a && lum.b) {
    console.log(`\nluminance   mean ${lum.a.mean.toFixed(1)} -> ${lum.b.mean.toFixed(1)}  (${((lum.b.mean / Math.max(0.01, lum.a.mean) - 1) * 100).toFixed(1)}%)`);
    console.log(`            peak ${lum.a.peak.toFixed(0)} -> ${lum.b.peak.toFixed(0)}`);
    console.log(`            pixels >240 ("hot", i.e. reading as a source): ${lum.a.hotPct.toFixed(3)}% -> ${lum.b.hotPct.toFixed(3)}%`);
    // The first cut of this probe printed "the glow IS reaching the frame" while ZERO meshes had been
    // lit — it was reading fold-to-fold TAA noise. A verdict that can pass with nothing applied is
    // worse than no verdict, so the applied count gates it before any pixel is consulted.
    const reaching = applied.materials > 0 &&
                     (lum.b.hotPct > lum.a.hotPct * 1.5 || lum.b.mean > lum.a.mean * 1.02);
    console.log(`\nVERDICT     ${applied.materials === 0
      ? 'NOTHING WAS LIT — 0 materials touched. Any pixel difference below is fold noise, not glow.'
      : reaching ? 'the glow IS reaching the frame'
                 : 'applied to ' + applied.materials + ' materials but NOT moving the frame — intensity or occlusion, not taste'}`);
  }
  console.log('\nstills');
  shots.forEach(sh => console.log(`   t=${sh.t.toFixed(2)}  ${sh.base.file}\n           ${sh.glow.file}`));
  const errs = logs.filter(l => /PAGEERROR|Uncaught/.test(l));
  if (errs.length) console.log(`\npage errors ${errs.slice(0, 3).join('\n            ')}`);

  await browser.close();
})();
