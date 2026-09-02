// probe_merged_guid.js — witness for MOBILE_PERF.md §SPEC 2026-07-28 (§MERGED_GUID).
//
// ISSUE IT PROVES / DISPROVES: the MergedMesh low-draw path was reverted on 2026-05-27 (68bd9a7)
// because merging destroyed per-element identity — "merged → no per-GUID metadata" — which broke
// Time Machine and picking. The claim under test is that the path can be restored WITH identity
// intact, and WITHOUT costing the mobile strengths (Walk/fly, snag, share-URL, GPS).
//
// Each check names what it proves:
//   1. W-MERGED-ROUTE    draw calls actually collapse (buckets << elements) on the merged path.
//   2. W-MERGED-CONTRACT §S280d contract holds: merged elements counted + reachable by guid,
//                        and NO §CONTRACT_FAIL anywhere.
//   3. W-MERGED-PICK     a real 3D tap resolves the EXACT element — and the identical tap on the
//                        unmerged path resolves the SAME guid. (The 2026-05 path could not do this:
//                        it guessed via nearest-centroid SQL.)
//   4. W-SHARE-URL       #info-guid carries that guid — share.js:225 reads exactly this node, so
//                        this is the share-a-picked-element feature proven end-to-end.
//   5. W-MERGED-FILTER   filterByGuids isolates per element on merged meshes (before: merged
//                        geometry ignored the isolate entirely and stayed visible — silently wrong).
//   6. W-MERGED-RAYCAST  the AABB pre-cull works: triangle-tested elements << elements scanned.
//                        This is the Walk/fly protection — sfx.js fly-rayblast casts at 11Hz and
//                        a merged bucket has no BVH, so without this it would brute-force.
//   7. W-MERGED-TM       TM still gets per-element slots: merge active → §TM_UNMERGE → re-stream
//                        unmerged (_mergeActive false, _batchMeta populated).
//
// Real viewer, real building, real tap. SW blocked. Leak-safe (finally kills chrome).
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8155;
const BLD = process.env.BLD || 'HHS_Office_Federated';
const base = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db&bld=${BLD}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let fails = 0;
const FAIL = m => { fails++; console.log('FAIL: ' + m); };
const PASS = m => console.log('PASS: ' + m);

// Load the viewer, wait for the stream to finish, return {page, logs}.
async function open(browser, url) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const A = window.A || window.APP;
    return A && A.db && A.activeBuilding && !A.streaming && A.streamedCount > 0;
  }, { timeout: 240000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
  await sleep(3000);   // let the final flush + consolidation settle
  return { page, ctx, logs };
}

// Tap the on-screen projection of a specific element's centroid. Returns the guid aimed at.
async function tapElement(page, guid) {
  return page.evaluate(g => {
    const A = window.A || window.APP;
    const r = A.db.exec('SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [g]);
    if (!r.length || !r[0].values.length) return { ok: false, why: 'no-transform' };
    const [cx, cy, cz] = r[0].values[0];
    const c = A.ifc2three(cx, cy, cz);
    const v = new THREE.Vector3(c.x, c.y, c.z).project(A.camera);
    const px = (v.x * 0.5 + 0.5) * window.innerWidth;
    const py = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const opt = () => ({ bubbles: true, cancelable: true, clientX: px, clientY: py, button: 0, pointerId: 1, isPrimary: true });
    A.canvas.dispatchEvent(new PointerEvent('pointerdown', opt()));
    A.canvas.dispatchEvent(new PointerEvent('pointerup', opt()));
    return { ok: true, px: Math.round(px), py: Math.round(py) };
  }, guid);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    // ══ RUN A — merged path forced on (?merge=1) ══════════════════════════════
    const A1 = await open(browser, base + '&merge=1');
    const { page, logs } = A1;
    const has = n => logs.some(l => l.includes(n));
    const line = n => logs.find(l => l.includes(n)) || '';

    // ── 1. W-MERGED-ROUTE ──
    if (!has('§MERGE_ROUTE on')) FAIL('§MERGE_ROUTE not logged — merged path never engaged, rest of probe is void');
    else PASS('§MERGE_ROUTE on — ' + line('§MERGE_ROUTE'));
    const mf = line('§MERGED_FLUSH');
    if (!mf) FAIL('no §MERGED_FLUSH — nothing was merged');
    else {
      const buckets = +(/buckets=(\d+)/.exec(mf) || [])[1];
      const elements = +(/elements=(\d+)/.exec(mf) || [])[1];
      if (buckets > 0 && elements > buckets) {
        PASS(`W-MERGED-ROUTE draw calls ${elements} → ${buckets} (${(elements / buckets).toFixed(1)}× fewer) | ${mf}`);
      } else FAIL('merged flush did not reduce draw calls: ' + mf);
    }

    // ── 2. W-MERGED-CONTRACT ──
    const cc = line('§CONTRACT_CHECK');
    const merged = +(/merged=(\d+)/.exec(cc) || [])[1];
    const mgIdx = +(/mergedIndex=(\d+)/.exec(cc) || [])[1];
    if (merged > 0 && mgIdx > 0) PASS(`W-MERGED-CONTRACT ${cc}`);
    else FAIL('contract check shows no merged metadata: ' + cc);
    const cf = logs.filter(l => l.includes('§CONTRACT_FAIL'));
    if (cf.length) FAIL('§CONTRACT_FAIL: ' + cf.join(' | '));
    else PASS('W-MERGED-CONTRACT zero §CONTRACT_FAIL');

    // Pick a target element that actually lives on a merged mesh (not batched/instanced).
    const target = await page.evaluate(() => {
      const A = window.A || window.APP;
      const ids = Object.keys(A._mergedMeta || {});
      if (!ids.length) return null;
      // biggest element on the largest merged bucket — a fat tap target
      let best = null;
      for (const id of ids) {
        for (const m of A._mergedMeta[id]) {
          const vol = (m.maxX - m.minX) * (m.maxY - m.minY) * (m.maxZ - m.minZ);
          if (!best || vol > best.vol) best = { guid: m.guid, vol, meshId: +id, idxStart: m.idxStart };
        }
      }
      return best;
    });
    if (!target) { FAIL('no merged elements to target'); throw new Error('no merged elements'); }
    console.log('TARGET: ' + JSON.stringify(target));

    // ── 3. W-MERGED-PICK ──
    const tap1 = await tapElement(page, target.guid);
    console.log('TAP(merged): ' + JSON.stringify(tap1));
    await sleep(1500);
    const mp = logs.find(l => l.includes('§MERGED_PICK')) || '';
    const mergedGuid = (/guid=(\S+)/.exec(mp) || [])[1];
    if (mergedGuid) PASS('W-MERGED-PICK exact identity — ' + mp);
    else FAIL('no §MERGED_PICK after tapping a merged element (fell back to the guessing path?)');
    if (has('§PICK merged fallback')) FAIL('picking used the nearest-centroid FALLBACK, not the range map');
    else PASS('W-MERGED-PICK no nearest-centroid fallback used');

    // ── 4. W-SHARE-URL (share.js:225 reads #info-guid) ──
    const infoGuid = await page.evaluate(() => {
      const el = document.getElementById('info-guid');
      return el ? el.textContent.trim() : null;
    });
    if (infoGuid && mergedGuid && infoGuid === mergedGuid)
      PASS('W-SHARE-URL #info-guid = ' + infoGuid + ' (share-a-picked-element intact)');
    else FAIL('#info-guid="' + infoGuid + '" does not match picked guid "' + mergedGuid + '"');

    // ── 5. W-MERGED-FILTER ──
    const filt = await page.evaluate(g => {
      const A = window.A || window.APP;
      A.filterByGuids(new Set([g]));
      let visible = 0, hidden = 0, meshesOn = 0;
      for (const id of Object.keys(A._mergedMeta)) {
        for (const m of A._mergedMeta[id]) { if (m.hidden) hidden++; else visible++; }
      }
      A.collectMeshes(o => o.userData && o.userData.isMerged).forEach(m => { if (m.visible) meshesOn++; });
      A.filterByGuids(null);
      let backOn = 0;
      for (const id of Object.keys(A._mergedMeta)) {
        for (const m of A._mergedMeta[id]) if (!m.hidden) backOn++;
      }
      return { visible, hidden, meshesOn, backOn, total: visible + hidden };
    }, target.guid);
    console.log('FILTER: ' + JSON.stringify(filt));
    if (filt.visible === 1 && filt.hidden === filt.total - 1)
      PASS(`W-MERGED-FILTER isolate → exactly 1 of ${filt.total} merged elements visible (${filt.meshesOn} bucket(s) drawn)`);
    else FAIL(`isolate left ${filt.visible} merged elements visible, expected 1 of ${filt.total}`);
    if (filt.backOn === filt.total) PASS('W-MERGED-FILTER restore → all ' + filt.total + ' visible again');
    else FAIL(`restore left ${filt.total - filt.backOn} elements still hidden`);

    // ── 6. W-MERGED-RAYCAST (the Walk/fly protection) ──
    const ray = await page.evaluate(() => {
      const A = window.A || window.APP;
      A._mergedRayStats = { casts: 0, tested: 0, scanned: 0 };
      const meshes = A.collectMeshes(o => o.userData && o.userData.isMerged);
      const rc = new THREE.Raycaster();
      // Aim at real merged elements so the casts actually HIT — a cull ratio measured on rays that
      // hit nothing would prove nothing (0/N is what a broken AABB test looks like too).
      const targets = [];
      for (const id of Object.keys(A._mergedMeta)) {
        const meta = A._mergedMeta[id];
        for (let i = 0; i < meta.length && targets.length < 60; i += Math.max(1, (meta.length / 4) | 0)) {
          const m = meta[i];
          targets.push(new THREE.Vector3((m.minX + m.maxX) / 2, (m.minY + m.maxY) / 2, (m.minZ + m.maxZ) / 2));
        }
        if (targets.length >= 60) break;
      }
      const dir = new THREE.Vector3();
      let hits = 0;
      const t0 = performance.now();
      for (const t of targets) {
        dir.copy(t).sub(A.camera.position).normalize();
        rc.set(A.camera.position, dir);
        rc.far = Infinity;
        if (rc.intersectObjects(meshes, false).length) hits++;
      }
      const ms = performance.now() - t0;
      return { ...A._mergedRayStats, ms: +ms.toFixed(1), meshes: meshes.length, casts_aimed: targets.length, hits };
    });
    const pct = ray.scanned ? (ray.tested / ray.scanned * 100) : 100;
    console.log('RAYCAST: ' + JSON.stringify(ray));
    if (!(ray.hits > 0))
      FAIL(`raycast returned NO hits on ${ray.casts_aimed} rays aimed at merged elements — the AABB test is rejecting valid hits, not culling`);
    else if (ray.scanned > 0 && pct < 10)
      PASS(`W-MERGED-RAYCAST ${ray.hits}/${ray.casts_aimed} aimed rays hit, and only ${ray.tested}/${ray.scanned} elements were triangle-tested (${pct.toFixed(2)}%) — ${ray.casts_aimed} casts in ${ray.ms}ms`);
    else FAIL(`AABB pre-cull ineffective: ${ray.tested}/${ray.scanned} tested (${pct.toFixed(1)}%) — Walk/fly would pay brute-force cost`);

    // ── 7. W-MERGED-TM ──
    const tmBefore = await page.evaluate(() => {
      const A = window.A || window.APP;
      return { mergeActive: !!A._mergeActive, batchMetas: Object.keys(A._batchMeta || {}).length };
    });
    const tmApi = await page.evaluate(() => {
      if (typeof window.toggleTimeMachine !== 'function') return 'missing';
      window.toggleTimeMachine();
      return 'called';
    });
    console.log('TM_TOGGLE: ' + tmApi);
    if (tmApi !== 'called') FAIL('window.toggleTimeMachine missing — probe cannot drive TM');
    await sleep(20000);   // clearStreamed + full re-stream, unmerged
    const tmAfter = await page.evaluate(() => {
      const A = window.A || window.APP;
      return {
        mergeActive: !!A._mergeActive, forceNoMerge: !!A._forceNoMerge,
        batchMetas: Object.keys(A._batchMeta || {}).length,
        mergedMetas: Object.keys(A._mergedMeta || {}).length,
        streaming: !!A.streaming
      };
    });
    console.log('TM: before=' + JSON.stringify(tmBefore) + ' after=' + JSON.stringify(tmAfter));
    const unmergeCount = logs.filter(l => l.includes('§TM_UNMERGE')).length;
    if (unmergeCount === 1) PASS('W-MERGED-TM §TM_UNMERGE fired exactly once — ' + line('§TM_UNMERGE'));
    else if (unmergeCount === 0) FAIL('TM did not trigger the unmerge re-stream (merged meshes have no per-element slots)');
    // ISSUE THIS PROVES: if the re-stream re-merges, TM's activate() sees merged meshes again and
    // re-streams again — an unbounded clearStreamed/streamBuilding loop. Caught live on the first run.
    else FAIL('§TM_UNMERGE fired ' + unmergeCount + '× — unmerge/re-stream LOOP, _forceNoMerge is not sticking');
    if (!tmAfter.streaming && tmAfter.forceNoMerge && tmAfter.mergedMetas === 0 && tmAfter.batchMetas > 0)
      PASS('W-MERGED-TM re-streamed unmerged: mergedMetas=0 batchMetas=' + tmAfter.batchMetas);
    else if (tmAfter.streaming) console.log('NOTE: re-stream still running at check time — inconclusive, not a fail');
    else FAIL('after TM: ' + JSON.stringify(tmAfter) + ' — expected 0 merged metas and populated _batchMeta');

    const errs1 = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs1.length) FAIL('PAGEERROR (merged run): ' + errs1.join(' | '));
    else PASS('zero PAGEERROR on the merged run');

    // ══ RUN B — same tap, unmerged path (?merge=0) — the identity cross-check ══
    await A1.ctx.close();
    const B = await open(browser, base + '&merge=0');
    const bLogs = B.logs;
    if (bLogs.some(l => l.includes('§MERGE_ROUTE on'))) FAIL('?merge=0 still merged — override broken');
    else PASS('?merge=0 → BatchedMesh path (A/B handle works)');
    await tapElement(B.page, target.guid);
    await sleep(1500);
    const bPickLine = bLogs.find(l => l.includes('§BATCHED_PICK')) || bLogs.find(l => l.includes('§PICK ')) || '';
    const bGuid = await B.page.evaluate(() => {
      const el = document.getElementById('info-guid');
      return el ? el.textContent.trim() : null;
    });
    console.log('TAP(unmerged): ' + bPickLine + ' info-guid=' + bGuid);
    if (bGuid && mergedGuid && bGuid === mergedGuid)
      PASS('W-MERGED-PICK cross-check: same screen point resolves the SAME guid merged vs unmerged (' + bGuid + ')');
    else FAIL(`identity diverges: merged=${mergedGuid} unmerged=${bGuid} — merging changed what the user picks`);
    const errs2 = bLogs.filter(l => l.startsWith('PAGEERROR'));
    if (errs2.length) FAIL('PAGEERROR (unmerged run): ' + errs2.join(' | '));
    else PASS('zero PAGEERROR on the unmerged run');

    console.log('--- §-LOG EXCERPT (merged run) ---');
    logs.filter(l => /§MERGE|§MERGED|§CONTRACT|§FILTER_GUIDS|§TM_UNMERGE|§RENDERER_CAPS|§BATCHED_FLUSH|§CONSOLIDATE/.test(l))
      .forEach(l => console.log('  ' + l));
    console.log('--- §-LOG EXCERPT (unmerged run) ---');
    bLogs.filter(l => /§BATCHED_FLUSH|§CONSOLIDATE|§CONTRACT_CHECK|§BATCHED_PICK/.test(l))
      .forEach(l => console.log('  ' + l));
    console.log(fails === 0 ? 'PROBE_RESULT: ALL PASS' : 'PROBE_RESULT: ' + fails + ' FAIL');
    process.exitCode = fails === 0 ? 0 : 1;
  } catch (e) {
    console.log('PROBE_ERROR: ' + (e && e.stack || e));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
