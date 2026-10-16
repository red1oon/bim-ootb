// ⚠ DO NOT REMOVE — Scope guard
// W-MEP-COLOR-PHOTOREAL — bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §MEP_COLOR_SURVIVES_PHOTOREAL
//
// THE ISSUE THIS TEST EXPOSES. §MEP_DISC_TINT (streaming.js, 2026-08-14) gives MEP a trade colour
// only when `!rgbaStr` — "the element has no colour" — and only for the 3 IFC2x3 generic classes.
// MEASURED against the shipped meta DBs: on 4 of the 5 buildings 100% of MEP elements DO carry a
// colour, and it is an ACHROMATIC off-white default (Hospital `0.920,0.900,0.850` x 40,563 with
// material_name NULL; Clinic the same value x 11,712 as `≈ Off-White`; Terminal white/`Silver`).
// `_TRI_METAL` then multiplies over that off-white (`diffuseColor.rgb *= triContrasted` — the
// triplanar shader already tints rather than replaces) and the photoreal frame reads exactly as the
// user described it: "greyish metallic". And 0 of Hospital's 41,987 MEP elements are even in
// DISC_TINT_CLASSES, because Hospital exports IFC4-style IfcPipeSegment/IfcDuctFitting/...
//
// WHAT IS AND IS NOT CLAIMED (PRIME RULE). ⚠ THE PALETTE IS AN AUTHORED CHOICE, NOT A PUBLISHED
// STANDARD. No MEP colour convention exists anywhere in the model data — there is no IfcSystem /
// `system` column on any shipped building DB, and the colour columns that do exist are either one
// undifferentiated default or the extractor's own `≈`-prefixed approximations. EXTRACTED: the keys
// (`discipline`, `material_rgba`, `material_name`, `element_name`). AUTHORED: the discipline→hue
// assignment, which reuses A.DISC_COLORS (config.js:43-49) VERBATIM — no new colour value exists.
// This witness does NOT claim the palette is an industry standard, and it does not judge whether
// the result is attractive; it counts hues.
//
// WHAT IT MUST PROVE, each able to fail on its own:
//   0. THE RIGHT POPULATION MOVED. the tinted count equals the census count for that building.
//   1. MEP COLOUR GAINED, COUNTED. distinct MEP hues and/or hue-bearing elements go UP, and neither
//      goes down, on the buildings the census says are achromatic. Two-sided because a building can
//      gain colour WITHOUT gaining a distinct hue (HHS's 1,768 ducts moved off the DUCT hint's
//      galvanized grey onto a hue other elements already had) — counting hues alone would score a
//      real gain as a no-op. Never above the 12-entry legend ceiling (A.DISC_COLORS).
//   2. AGREEMENT, over the tinted population alone: distinct hues PAINTED == trade codes that
//      painted one. A rule that "applied colour" but collapsed two trades onto one hue, or split one
//      trade across two, fails here.
//   3. RED CONTROL. With A._mepHueOff = true (and A._matCache cleared, since the flag is
//      deliberately NOT part of the cache key) gate 1 must FAIL. If it can still pass, nothing here
//      proves anything and the run says so.
//   4. TIER-1 BYTE-IDENTITY. Every element the owner returns null for — a real authored IFC material
//      name (not `≈`-prefixed), or an rgba that already carries a hue — must render a material whose
//      `color` is IDENTICAL with the rule on and off. This is the gate that protects the user's fire-
//      red lever: Hospital IfcPipeFitting|FP|0.843,0.137,0.102 x 1,298 (saturation 0.879), plus
//      Terminal's 11,844 authored-name MEP elements, asserted element-for-element.
//   5. THE THRESHOLD IS NOT KNIFE-EDGE. T = A.MEP_HUE_ACHROMATIC_MAX (0.344) is the midpoint of the
//      widest EMPTY band in the fleet's tier-2 saturation distribution (0.100 → 0.588). The witness
//      re-measures the minimum distance to T over the elements that ACTUALLY CONSULT IT (an element
//      with a real authored material name is settled at tier 1a before T is ever read) and fails if
//      one lands inside ±0.1. It reports VACUOUS, not PASS, when no element consults T at all.
//   6. THE LIVE PATH REALLY DOES IT. Tier B streams the user's own building for real and reads the
//      SHIPPED §MEP_HUE_TALLY / §MEP_HUE_CODE lines off the console (PRIMAL LAW 3 — the app's own
//      §-log is the primary evidence, not a re-derivation).
//
// NOT JUDGED BY LOOKING AT ANYTHING. No frame, no screenshot, no film is rendered or inspected
// (CLAUDE.md FUNDAMENTAL LAW) — every verdict is a number read off real THREE.Material objects
// built by the shipped factory.
//
// SELF-FAILURE (PRIMAL LAW 4): VACUOUS when a building's MEP population is empty (its 0 means
// nothing), NO-OP when the rule moved no element, and INCONCLUSIVE — never PASS — when the page
// never booted or the owner was never published.
//
// §-log first — READ viewer/tests/witness_mep_color_photoreal.log before any conclusion.
// Run:  timeout 2400 node viewer/tests/witness_mep_color_photoreal.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA_ROOT = process.env.DATA_ROOT || (require('os').homedir() + '/bim-ootb');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream',
  '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  const send = b => { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); };
  fs.readFile(path.join(ROOT, p), (e, b) => { if (!e) return send(b);
    fs.readFile(path.join(DATA_ROOT, p), (e2, b2) => { if (!e2) return send(b2); res.writeHead(404); res.end('404 ' + p); }); });
});
const LOGF = path.join(__dirname, 'witness_mep_color_photoreal.log');
const log = []; let fails = 0, judged = 0;
const S = m => { log.push(m); console.log(m); };
const V = (ok, l, d) => { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + l + (d ? ' — ' + d : '')); };
const save = () => fs.writeFileSync(LOGF, log.join('\n') + '\n');

// The five shipped buildings. `expectTinted` is the CENSUS number (sat_census.log / gap2.log), asserted rather than reported:
// a DB or rule change that silently moves a different population fails here instead of passing
// quietly. Terminal's 0 is the load-bearing one — 48,428/48,428 of its elements carry a REAL
// authored material name, so every one of its MEP elements is tier 1a and must not move at all.
const BUILDINGS = [
  { key: 'Hospital',   meta: '/buildings/Hospital_meta.db',                    expectTinted: 40634 },
  { key: 'Clinic',     meta: '/buildings/Clinic_meta.db',                      expectTinted: 12467 },
  { key: 'Terminal',   meta: '/buildings/Terminal_meta.db',                    expectTinted: 0     },
  { key: 'LTU_AHouse', meta: '/buildings/LTU_AHouse_meta.db',                  expectTinted: 102   }, // 84,573/84,675 are tier 1 already
  { key: 'HHS',        meta: '/buildings/HHS_Office_Federated_extracted.db',   expectTinted: 3391  }
];
const LIVE_DB = process.env.LIVE_DB || '/buildings/HHS_Office_Federated_extracted.db';

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=8192'] });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const con = [];
  page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) con.push(t); });

  S('── W-MEP-COLOR-PHOTOREAL — witness_mep_color_photoreal ──');
  S('   ISSUE: does an MEP element whose only colour is an ACHROMATIC default reach the photoreal');
  S('          frame with its trade hue, while an element that carries a real material or a real');
  S('          hue of its own (the user\'s fire-red lever) stays byte-identical?');
  S('   ⚠ the discipline→hue assignment is an AUTHORED choice reusing A.DISC_COLORS verbatim,');
  S('     NOT a published MEP standard — no such convention exists in the model data.');

  // ── Tier B · the live render path, on the user's own building ──────────────────────────────────
  S('\n── Tier B · live stream of ' + LIVE_DB + ', shipped §-log read off the console ──');
  const t0 = Date.now();
  let booted = false;
  try {
    await page.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + LIVE_DB,
      { waitUntil: 'domcontentloaded', timeout: 300000 });
    for (let i = 0; i < 1200 && !booted; i++) { await page.waitForTimeout(1000);
      booted = await page.evaluate(() => !!(window.APP && window.APP.streaming === false
        && Object.keys(window.APP.guidMap || {}).length > 0)).catch(() => false); }
  } catch (e) { S('   nav failed: ' + e.message); }
  S('   load+stream wall clock = ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  if (!booted) {
    S('   §MEP_HUE_TALLY INCONCLUSIVE — the page never finished streaming, nothing was judged');
    S('\n══ VERDICT: INCONCLUSIVE — 0 gates judged ══'); save();
    await browser.close(); server.close(); process.exit(1);
  }
  V(true, LIVE_DB + ' loaded and finished streaming');

  const tally = con.filter(t => t.indexOf('§MEP_HUE_TALLY') === 0);
  const codeLines = con.filter(t => t.indexOf('§MEP_HUE_CODE') === 0);
  S('   [shipped §-log — PRIMARY EVIDENCE]');
  tally.forEach(t => S('       ' + t));
  codeLines.forEach(t => S('       ' + t));
  V(tally.length > 0, 'the shipped §MEP_HUE_TALLY rollup fired on stream-complete', tally.length + ' line(s)');
  const liveTinted = tally.length ? Number((tally[0].match(/ tinted=(\d+)/) || [0, -1])[1]) : -1;
  const liveHues = tally.length ? Number((tally[0].match(/distinct_hues=(\d+)/) || [0, -1])[1]) : -1;
  const liveCeil = tally.length ? Number((tally[0].match(/legend_ceiling=(\d+)/) || [0, -1])[1]) : -1;
  V(liveTinted > 0, 'the LIVE render path really tinted MEP elements (not a no-op on the user\'s building)',
    'tinted=' + liveTinted);
  V(liveHues > 0 && liveHues <= liveCeil, 'live distinct hues are within the legend ceiling',
    'hues=' + liveHues + ' ceiling=' + liveCeil);
  // The InstancedMesh branch buckets by GEOMETRY HASH ALONE, so a set can span an MEP and a
  // non-MEP class. MEASURED (hash_mix.log): Hospital 0/20,609 and Clinic 0/8,459 such hashes,
  // LTU_AHouse 108/51,393 (1,386 elements). A mixed set must be SUPPRESSED, not painted.
  const instU = tally.length ? Number((tally[0].match(/inst_mep_uniform=(\d+)/) || [0, -1])[1]) : -1;
  const instM = tally.length ? Number((tally[0].match(/inst_mep_mixed=(\d+)/) || [0, -1])[1]) : -1;
  V(instU >= 0 && instM >= 0,
    'the live run reports its InstancedMesh MEP-uniformity split (a mixed set is suppressed, never painted)',
    'uniform=' + instU + ' mixed=' + instM + (instU + instM === 0 ? '  VACUOUS — no InstancedMesh built' : ''));
  const bucketGuard = await page.evaluate(() => {
    // Every merge/batch bucket key must be homogeneous on MEP-ness — that is what the new key bit
    // buys. Re-derived here from the live queue rather than trusted: group the real stream rows by
    // the SHIPPED key shape and assert no bucket holds both an MEP and a non-MEP class.
    const A = window.APP, q = A.streamQueue || [];
    const seen = new Map(); let mixed = 0;
    for (const row of q) {
      const cls = row[11] || '';
      const k = (row[10] || '_') + '|' + (row[3] || '_') + '|' + (row[2] || '_default') + '|' +
        (A._entourageVariant(cls, row[12]) || '') + '|' +
        ((A._mepNameHint(row[12]) || {}).code || '') + '|' + (A._mepHueClasses[cls] ? 'M' : '-');
      const isMep = !!A._mepHueClasses[cls];
      if (!seen.has(k)) seen.set(k, isMep); else if (seen.get(k) !== isMep) mixed++;
    }
    return { buckets: seen.size, mixed, rows: q.length };
  });
  V(bucketGuard.rows > 0 && bucketGuard.mixed === 0,
    'no merge/batch bucket mixes an MEP class with a non-MEP one (the key bit holds on real rows)',
    bucketGuard.buckets + ' buckets over ' + bucketGuard.rows + ' rows, mixed=' + bucketGuard.mixed);

  const palState = await page.evaluate(() => ({ tick: window.APP._ambienceTick || 0,
    recoloured: (window.APP._sunglassBackups && window.APP._sunglassBackups.length) || 0 }));
  V(palState.tick === 0 && palState.recoloured === 0,
    'the §SUNGLASS palette was OFF while measuring (an active palette REPLACES the material, §SUNGLASS_TRIPLANAR_TINT)',
    'tick=' + palState.tick + ' recoloured=' + palState.recoloured);

  // ── Tier A · every element of every shipped building, through the SHIPPED factory ──────────────
  S('\n── Tier A · A/B over 100% of elements_meta on all five buildings ──');
  S('   THREE columns per element, all built by the real A._getMaterial():');
  S('     pre-change = the rule as it shipped before this change (quoted from the diff, and');
  S('                  cross-checked below: it must EQUAL hue-off on every building whose MEP has');
  S('                  an rgba, which is where the old `!rgbaStr` gate could never fire)');
  S('     hue-off    = A._mepHueOff = true — the RED CONTROL');
  S('     shipped    = the new rule');

  const results = {};   // per-building Tier A result, kept for the verdict summary
  for (const b of BUILDINGS) {
    const r = await page.evaluate(async (arg) => {
      const A = window.APP;
      if (!A._mepDiscAlbedo || !A._mepHueClasses) return { err: 'owner-not-published' };
      const SQLm = window.SQL || A._SQL;
      if (!SQLm) return { err: 'sql.js-not-available' };
      let db;
      try { db = new SQLm.Database(new Uint8Array(await (await fetch(arg.meta)).arrayBuffer())); }
      catch (e) { return { err: 'db-open: ' + e.message }; }
      let res;
      try {
        res = db.exec(`SELECT ifc_class, COALESCE(discipline,''), COALESCE(material_rgba,''),
                              COALESCE(material_name,''), COALESCE(element_name,'')
                       FROM elements_meta`);
      } catch (e) { db.close(); return { err: 'query: ' + e.message }; }
      const rows = res.length ? res[0].values : [];
      db.close();
      if (!rows.length) return { err: 'no-rows' };

      // Collapse to the material-identity tuple (exactly _getMaterial's own cacheKey dimensions),
      // so the shipped factory is called once per distinct material, not once per element.
      const groups = new Map();
      let mepPop = 0, minDistT = 1, tConsulted = 0;
      const T = A.MEP_HUE_ACHROMATIC_MAX;
      for (const [cls, disc, rgba, mname, ename] of rows) {
        if (!cls || !A._mepHueClasses[cls]) continue;
        mepPop++;
        // T is consulted ONLY for an element with no real authored material name — tier 1a settles
        // before T is read. Folding an authored-name element's saturation in here would report a
        // knife-edge that no decision depends on.
        const ch = A._chromaOf(rgba);
        if (ch !== null && !A._isAuthoredMatName(mname)) { tConsulted++; minDistT = Math.min(minDistT, Math.abs(ch - T)); }
        const hint = A._mepNameHint(ename);
        const variant = A._entourageVariant(cls, ename);
        const k = cls + '' + disc + '' + rgba + '' + mname + '' + (hint ? hint.code : '') + '' + (variant || '');
        const gr = groups.get(k);
        if (gr) { gr.n++; continue; }
        groups.set(k, { cls, disc, rgba, mname, hint, variant, n: 1 });
      }
      if (!mepPop) return { mepPop: 0, vacuous: true, total: rows.length };

      // Build each group's material with the rule OFF and ON. A._mepHueOff is deliberately NOT a
      // cacheKey dimension, so the cache MUST be cleared between the two passes or the second pass
      // would silently hand back the first pass's material.
      function measure(off) {
        A._mepHueOff = off;
        A._matCache = {};
        const out = new Map();
        for (const [k, gr] of groups) {
          const m = A._getMaterial(gr.rgba || null, gr.cls, gr.variant, gr.disc, gr.hint, gr.mname);
          out.set(k, m.color.getHex());
        }
        A._matCache = {};
        return out;
      }
      const off = measure(true);
      const on = measure(false);
      A._mepHueOff = false;

      // pre-change: the rule as it shipped. It only ever fired when the element had NO rgba AND its
      // class was one of the 3 IFC2x3 generic classes; otherwise it is byte-identical to hue-off.
      const PRE_CLASSES = { IfcFlowSegment: 1, IfcFlowFitting: 1, IfcFlowTerminal: 1 };
      const pre = new Map();
      for (const [k, gr] of groups) {
        if (gr.rgba || !PRE_CLASSES[gr.cls]) { pre.set(k, off.get(k)); continue; }
        let c = null;
        if (gr.hint) c = { r: gr.hint.r, g: gr.hint.g, b: gr.hint.b };
        else if (gr.disc && A.DISC_COLORS && A.DISC_COLORS[gr.disc] != null) {
          const h = A.DISC_COLORS[gr.disc];
          c = { r: ((h >> 16) & 255) / 255, g: ((h >> 8) & 255) / 255, b: (h & 255) / 255 };
        }
        if (!c) { pre.set(k, off.get(k)); continue; }
        let { r, g, b } = c;
        if (r > 0.85 && g > 0.85 && b > 0.85) { r *= 0.92; g *= 0.92; b *= 0.92; }   // §S260d taming, as it stood
        pre.set(k, new window.THREE.Color(r, g, b).getHex());
      }

      // Hues are COUNTED off the real material colours. A colour whose own saturation is below T
      // carries no hue and is counted as achromatic instead — otherwise every grey would register
      // as "hue 0" and collide with red.
      function hueStats(m) {
        const hues = new Map(); let achro = 0, els = 0;
        const c = new window.THREE.Color();
        for (const [k, gr] of groups) {
          els += gr.n;
          c.setHex(m.get(k));
          const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
          const sat = mx <= 0 ? 0 : (mx - mn) / mx;
          if (sat < T) { achro += gr.n; continue; }
          let h = 0;
          if (mx > mn) {
            if (mx === c.r) h = 60 * (((c.g - c.b) / (mx - mn)) % 6);
            else if (mx === c.g) h = 60 * ((c.b - c.r) / (mx - mn) + 2);
            else h = 60 * ((c.r - c.g) / (mx - mn) + 4);
            if (h < 0) h += 360;
          }
          const key = h.toFixed(1);
          hues.set(key, (hues.get(key) || 0) + gr.n);
        }
        return { nHues: hues.size, achro, els, top: [...hues.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 14) };
      }

      // Tier-1 element-for-element identity, and the trade codes that actually reached tier 2.
      let tier1n = 0, tier1els = 0, tier1same = 0, tier1sameEls = 0, tier2els = 0, tier2zeroV = 0;
      const codes = new Map(); const tier1diff = [];
      const tier2Hues = new Set(); const codesWithHue = new Set();
      const _c = new window.THREE.Color();
      for (const [k, gr] of groups) {
        let r0 = 0.7, g0 = 0.7, b0 = 0.7;
        if (gr.rgba && gr.rgba.indexOf(',') !== -1) { const p = gr.rgba.split(',').map(Number); r0 = p[0]; g0 = p[1]; b0 = p[2]; }
        const alb = A._mepDiscAlbedo(r0, g0, b0, gr.rgba || null, gr.cls, gr.disc, gr.hint, gr.mname);
        if (!alb) {
          tier1n++; tier1els += gr.n;
          if (off.get(k) === on.get(k)) { tier1same++; tier1sameEls += gr.n; }
          else if (tier1diff.length < 6) tier1diff.push({ cls: gr.cls, disc: gr.disc, rgba: gr.rgba, mname: gr.mname,
            off: off.get(k).toString(16), on: on.get(k).toString(16), n: gr.n });
        } else {
          tier2els += gr.n;
          codes.set(alb.code, (codes.get(alb.code) || 0) + gr.n);
          // The hue this trade code actually PAINTED, read back off the real material. An element
          // whose own V is 0 (LTU's 86 `0.000,0.000,0.000` MEP rows) keeps the trade hue in the
          // rule but renders black — it carries no hue and is counted separately, never as one.
          _c.setHex(on.get(k));
          const mx2 = Math.max(_c.r, _c.g, _c.b), mn2 = Math.min(_c.r, _c.g, _c.b);
          const s2 = mx2 <= 0 ? 0 : (mx2 - mn2) / mx2;
          if (s2 < T) { tier2zeroV += gr.n; continue; }
          let h2 = 0;
          if (mx2 === _c.r) h2 = 60 * (((_c.g - _c.b) / (mx2 - mn2)) % 6);
          else if (mx2 === _c.g) h2 = 60 * ((_c.b - _c.r) / (mx2 - mn2) + 2);
          else h2 = 60 * ((_c.r - _c.g) / (mx2 - mn2) + 4);
          if (h2 < 0) h2 += 360;
          tier2Hues.add(h2.toFixed(1));
          codesWithHue.add(alb.code);
        }
      }

      // The user's own control element: the fire-red lever, by its exact measured colour.
      const RED = '0.843,0.137,0.102,1.000';
      let redEls = 0, redSame = 0;
      for (const [k, gr] of groups) if (gr.rgba === RED) { redEls += gr.n; if (off.get(k) === on.get(k)) redSame += gr.n; }

      return {
        total: rows.length, mepPop, groups: groups.size, minDistT, T, tConsulted,
        pre: hueStats(pre), off: hueStats(off), on: hueStats(on),
        tier1n, tier1els, tier1same, tier1sameEls, tier1diff, tier2els, tier2zeroV,
        tier2Hues: tier2Hues.size, codesWithHue: codesWithHue.size,
        codes: [...codes.entries()].sort((a, b2) => b2[1] - a[1]),
        legendSize: Object.keys(A.DISC_COLORS || {}).length,
        preEqOff: [...groups.keys()].every(k => pre.get(k) === off.get(k)),
        preEqOffCount: [...groups.keys()].filter(k => pre.get(k) === off.get(k)).length
      };
    }, b);

    results[b.key] = r;
    S('\n   ════ ' + b.key + ' ════');
    if (r.err) { V(false, b.key + ' — could not be judged: ' + r.err); continue; }
    if (r.vacuous) {
      S('   §MEP_HUE_AB VACUOUS bld=' + b.key + ' rows=' + r.total + ' mep_elements=0 — no MEP class present, its 0 means nothing');
      continue;
    }
    S('   §MEP_HUE_AB bld=' + b.key + ' elements=' + r.total + ' mep_elements=' + r.mepPop +
      ' material_groups=' + r.groups + ' tier1_untouched=' + r.tier1els + ' tier2_tinted=' + r.tier2els);
    S('   §MEP_HUE_AB bld=' + b.key + ' distinct_hues pre=' + r.pre.nHues + ' hue_off=' + r.off.nHues +
      ' shipped=' + r.on.nHues + '  achromatic_elements pre=' + r.pre.achro + ' shipped=' + r.on.achro +
      ' legend_ceiling=' + r.legendSize);
    S('   §MEP_HUE_AB bld=' + b.key + ' trade_codes=' + JSON.stringify(r.codes) +
      ' hues_painted=' + r.tier2Hues + ' codes_with_hue=' + r.codesWithHue + ' tinted_but_V0=' + r.tier2zeroV);
    S('   §MEP_HUE_AB bld=' + b.key + ' T=' + r.T + ' elements_that_consulted_T=' + r.tConsulted +
      ' min_dist_to_T=' + (r.tConsulted ? r.minDistT.toFixed(4) : 'VACUOUS — no element on this building ever consults T'));
    S('       shipped top hues (deg → elements): ' + JSON.stringify(r.on.top));

    // Gate: the pre-change re-derivation is faithful wherever the old gate could not fire.
    V(r.preEqOff || b.key === 'HHS',
      b.key + ': the re-derived pre-change rule equals hue-off (the old `!rgbaStr` gate could not fire here)',
      r.preEqOffCount + '/' + r.groups + ' groups identical');

    // Gate 0 — the population that moved is the one the census says should move.
    V(r.tier2els === b.expectTinted,
      b.key + ': GATE 0 — the tinted population equals the census count for this building',
      'tinted=' + r.tier2els + ' expected=' + b.expectTinted);

    // Gate 1 — the frame gained MEP colour. Two-sided on purpose: a building can gain colour
    // WITHOUT gaining a distinct hue (HHS's 1,768 ducts went from the DUCT hint's galvanized grey
    // to a hue that was already present on other elements), so counting hues alone would score a
    // real gain as a no-op. Direction is asserted on both axes and NO-OP is printed when neither
    // moved. `achro` is the count of MEP ELEMENTS whose rendered albedo carries no hue at all.
    if (b.expectTinted > 0) {
      const gained = r.on.nHues > r.pre.nHues || r.on.achro < r.pre.achro;
      V(gained && r.on.nHues >= r.pre.nHues,
        b.key + ': GATE 1 — MEP colour INCREASED vs the pre-change rule (distinct hues and/or hue-bearing elements)',
        'hues ' + r.pre.nHues + ' → ' + r.on.nHues + ', colourless elements ' + r.pre.achro + ' → ' + r.on.achro +
        (gained ? '' : '  NO-OP — nothing moved'));
      V(r.tier2els > 0, b.key + ': the rule actually reached elements (not vacuous)', 'tinted=' + r.tier2els);
    } else {
      V(r.on.nHues === r.pre.nHues && r.on.achro === r.pre.achro && r.tier2els === 0,
        b.key + ': GATE 1b — a building whose MEP is ALL tier-1 is untouched on every axis',
        'hues ' + r.pre.nHues + ' → ' + r.on.nHues + ', colourless ' + r.pre.achro + ' → ' + r.on.achro + ', tinted=' + r.tier2els);
    }
    V(r.on.nHues <= r.legendSize, b.key + ': distinct hues never exceed the 12-entry legend ceiling',
      r.on.nHues + ' <= ' + r.legendSize);

    // Gate 2 — AGREEMENT, over the tinted population alone: the number of distinct hues actually
    // painted equals the number of trade codes that painted one. A rule that "applied colour" but
    // collapsed two trades onto one hue, or split one trade across two, fails here.
    if (r.tier2els > 0) {
      V(r.codes.length > 0, b.key + ': GATE 2 — at least one trade code reached tier 2', 'codes=' + r.codes.length);
      V(r.tier2Hues === r.codesWithHue && r.codesWithHue > 0,
        b.key + ': GATE 2 — distinct hues PAINTED == trade codes that painted one (one hue per trade, no collisions)',
        'hues=' + r.tier2Hues + ' codes_with_hue=' + r.codesWithHue + ' of ' + r.codes.length + ' codes; ' +
        r.tier2zeroV + ' tinted element(s) render colourless because their own V is 0');
    }

    // Gate 3 — RED CONTROL.
    V(r.off.nHues < r.on.nHues || r.tier2els === 0,
      b.key + ': GATE 3 RED CONTROL — with A._mepHueOff the hue gain DISAPPEARS (the gates can fail)',
      'hue_off=' + r.off.nHues + ' shipped=' + r.on.nHues);

    // Gate 4 — TIER-1 byte-identity.
    V(r.tier1same === r.tier1n && r.tier1sameEls === r.tier1els,
      b.key + ': GATE 4 — every tier-1 element (real authored material, or an rgba that already carries a hue) is BYTE-IDENTICAL',
      r.tier1sameEls + '/' + r.tier1els + ' elements, ' + r.tier1same + '/' + r.tier1n + ' material groups');
    if (r.tier1diff.length) r.tier1diff.forEach(d => S('       🔴 tier-1 DRIFT: ' + JSON.stringify(d)));

    // Gate 5 — the threshold is not knife-edge.
    if (r.tConsulted === 0) {
      S('   ⚪ ' + b.key + ': GATE 5 VACUOUS — 0 elements consult T here (every MEP element carries a real');
      S('        authored material name and is settled at tier 1a), so a min-distance would mean nothing.');
    } else {
      V(r.minDistT >= 0.1, b.key + ': GATE 5 — no element\'s saturation lands within ±0.1 of T',
        'min_dist=' + r.minDistT.toFixed(4) + ' over ' + r.tConsulted + ' element(s) that consult it, T=' + r.T);
    }
  }

  // ── The user's own control element, called out by name ─────────────────────────────────────────
  S('\n── The user\'s fire-red lever — the control element they named ──');
  const redRes = await page.evaluate(async (meta) => {
    const A = window.APP;
    const SQLm = window.SQL || A._SQL;
    const db = new SQLm.Database(new Uint8Array(await (await fetch(meta)).arrayBuffer()));
    const RED = '0.843,0.137,0.102,1.000';
    const res = db.exec(`SELECT ifc_class, COALESCE(discipline,''), COALESCE(material_name,''),
                                COALESCE(element_name,''), COUNT(*)
                         FROM elements_meta WHERE material_rgba = '${RED}' GROUP BY 1,2,3,4`);
    db.close();
    const rows = res.length ? res[0].values : [];
    let n = 0, same = 0; const detail = [];
    for (const [cls, disc, mname, ename, c] of rows) {
      const hint = A._mepNameHint(ename), variant = A._entourageVariant(cls, ename);
      A._mepHueOff = true; A._matCache = {};
      const a = A._getMaterial(RED, cls, variant, disc, hint, mname).color.getHex();
      A._mepHueOff = false; A._matCache = {};
      const b = A._getMaterial(RED, cls, variant, disc, hint, mname).color.getHex();
      A._matCache = {};
      n += c; if (a === b) same += c;
      if (detail.length < 6) detail.push({ cls, disc, n: c, off: '#' + a.toString(16).padStart(6, '0'), on: '#' + b.toString(16).padStart(6, '0') });
    }
    return { n, same, detail, sat: A._chromaOf(RED), T: A.MEP_HUE_ACHROMATIC_MAX };
  }, '/buildings/Hospital_meta.db');
  S('   Hospital material_rgba=0.843,0.137,0.102,1.000  saturation=' + (redRes.sat != null ? redRes.sat.toFixed(3) : '?') +
    '  T=' + redRes.T + '  → tier 1b, the owner returns null');
  redRes.detail.forEach(d => S('       ' + JSON.stringify(d)));
  V(redRes.n > 0, 'the fire-red control population is not empty (a 0 here would make the next gate vacuous)', 'n=' + redRes.n);
  V(redRes.n > 0 && redRes.same === redRes.n,
    'THE USER\'S FIRE-RED LEVER IS BYTE-IDENTICAL with the rule on and off',
    redRes.same + '/' + redRes.n + ' elements');

  // ── Verdict ───────────────────────────────────────────────────────────────────────────────────
  S('\n══ ' + (judged === 0 ? 'VERDICT: INCONCLUSIVE — nothing was judged'
    : (fails === 0 ? 'VERDICT: PASS' : 'VERDICT: FAIL')) + ' — ' + (judged - fails) + '/' + judged + ' gates ══');
  save();
  await browser.close(); server.close();
  process.exit(judged === 0 || fails > 0 ? 1 : 0);
})().catch(e => { S('   🔴 witness crashed: ' + (e && e.stack || e)); S('\n══ VERDICT: INCONCLUSIVE ══'); save(); process.exit(1); });
