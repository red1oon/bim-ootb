// ⚠ DO NOT REMOVE — Scope guard
// W-SUNGLASS-GROUPING-RULES — bim-compiler prompts/CINEMA_PATH_EDITOR.md §SESSION_2026-09-01C
//
// THE ISSUE THIS TEST EXPOSES: the §SUNGLASS palette coloured ORDINAL groupings (storey) with the
// same unordered cycling list it uses for CATEGORICAL groupings (class/disc) — storey bands keyed
// `palette[i % len]` on ALPHABETIC rank (tools.js pre-fix: `Object.keys(g).sort()`), which throws
// away the building's vertical order. On Clinic, alphabetic order puts "First Floor" 1st and
// "TOF Footing" 7th when the real vertical order is TOF Footing < Level 1 < First Floor < ….
// The fix keys storey bands on the GEOMETRIC ordinal (median world-Y per group) and colours them
// with a monotonic ramp (lightness AND hue strictly increase with elevation). Class/disc bands
// must be byte-identical to the pinned origin/main formula (no regression).
// Also §SUNGLASS_BROWN_TRACK: the palette scrub's last segment (ticks 98-100 → 97%..100%) must be
// saddle-brown rgb(139,69,19) — the material-injection-tip affordance.
// Also run-confirms two claims that were only code-read (§SESSION_2026-09-01 "Palette"):
// Alt+S does not bake over the palette (startStillRefine/stopStillRefine leaves the palette's
// cloned materials + colours in place — behavioural proof that _setTriplanarActive, effects.js
// §TRIPLANAR comment block, swaps nothing), and the palette clone's relationship to the
// triplanar onBeforeCompile hook is MEASURED, not assumed.
//
// SELF-FAILURE: prints VACUOUS if <2 storey groups (nothing to judge), INCONCLUSIVE (never PASS)
// for any sub-check whose population could not be judged, NO-OP if the new mapping produced the
// identical colours the old formula would have. RED CONTROL: the monotonicity checker is run
// against the OLD alphabetic-cycle colours — it MUST fail there, or this witness cannot fail.
//
// §-log first — READ viewer/tests/witness_sunglass_grouping_rules.log before any conclusion.
// Run:  timeout 900 node viewer/tests/witness_sunglass_grouping_rules.js
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
const log = []; let fails = 0, judged = 0;
const S = m => { log.push(m); console.log(m); };
const V = (ok, l, d) => { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + l + (d ? ' — ' + d : '')); };
const save = () => fs.writeFileSync(path.join(__dirname, 'witness_sunglass_grouping_rules.log'), log.join('\n') + '\n');

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=4096'] });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  S('── W-SUNGLASS-GROUPING-RULES — witness_sunglass_grouping_rules ──');
  S('   ISSUE: does an ordinal grouping (storey) get an ordinal-keyed monotonic ramp, while');
  S('   categorical groupings (class/disc) keep their exact pre-fix distinct-hue behaviour?');
  await page.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=buildings/Clinic_extracted.db',
    { waitUntil: 'domcontentloaded', timeout: 180000 });
  let ready = false;
  for (let i = 0; i < 600 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && window.APP.streaming === false
      && Object.keys(window.APP.guidMap || {}).length > 0)); }
  if (!ready) { S('\n§SUNGLASS_GROUPING INCONCLUSIVE — Clinic never finished streaming, nothing judged'); save(); await browser.close(); server.close(); process.exit(1); }
  V(ready, 'Clinic loaded and finished streaming');

  // ── 1. ORDINAL: tick 38 (Storey warm, sub=7) — ramp keyed on geometric ordinal ──
  const ord = await page.evaluate(() => {
    const A = window.APP;
    A.updateAmbience(38);
    const g = A._groupBy(A._collectAllMeshes(), 'storey');
    const o = A._storeyOrdinalKeys(g);
    const rows = o.keys.map(k => {
      const m = g[k].find(x => x.material && x.material.color);
      const hsl = m ? m.material.color.getHSL({}) : null;
      return { storey: k, n: g[k].length, elev: o.elev[k],
               h: hsl ? +hsl.h.toFixed(4) : null, s: hsl ? +hsl.s.toFixed(4) : null, l: hsl ? +hsl.l.toFixed(4) : null };
    });
    return { rows, alpha: Object.keys(g).sort(), size: Object.keys(g).sort((a, b) => g[b].length - g[a].length) };
  });
  if (ord.rows.length < 2) {
    S('\n§SUNGLASS_GROUPING VACUOUS — ' + ord.rows.length + ' storey group(s), monotonicity has no population');
    save(); await browser.close(); server.close(); process.exit(1);
  }
  S('\n   [§SUNGLASS_ORDINAL] storeys ascending by median world-Y (elev | H S L | count):');
  ord.rows.forEach(r => S('       ' + r.storey + '  elev=' + (isFinite(r.elev) ? r.elev.toFixed(2) : 'inf')
    + '  H=' + r.h + ' S=' + r.s + ' L=' + r.l + '  n=' + r.n));
  const judgedRows = ord.rows.filter(r => r.l !== null);
  const mono = seq => seq.every((v, i) => i === 0 || v > seq[i - 1] + 1e-6);
  const Ls = judgedRows.map(r => r.l), Hs = judgedRows.map(r => r.h);
  V(mono(Ls), '§SUNGLASS_RAMP_MONOTONIC lightness strictly increases with elevation', 'L: ' + Ls.join(' < '));
  V(mono(Hs), '§SUNGLASS_RAMP_MONOTONIC hue strictly increases with elevation', 'H: ' + Hs.join(' < '));

  // ── 2. NOT alphabetic, NOT size rank — on a building where the orders disagree ──
  const ordinalOrder = ord.rows.map(r => r.storey);
  const disagreeAlpha = JSON.stringify(ordinalOrder) !== JSON.stringify(ord.alpha);
  const disagreeSize = JSON.stringify(ordinalOrder) !== JSON.stringify(ord.size);
  S('   [orders] ordinal:    ' + ordinalOrder.join(' < '));
  S('   [orders] alphabetic: ' + ord.alpha.join(' < '));
  S('   [orders] size-rank:  ' + ord.size.join(' > '));
  if (!disagreeAlpha || !disagreeSize) {
    S('   §SUNGLASS_NOT_SIZE_NOT_ALPHA INCONCLUSIVE — orders agree on this building, pick another');
  } else {
    const lOf = {}; judgedRows.forEach(r => { lOf[r.storey] = r.l; });
    const alphaL = ord.alpha.filter(k => lOf[k] !== undefined).map(k => lOf[k]);
    const sizeL = ord.size.filter(k => lOf[k] !== undefined).map(k => lOf[k]);
    V(!mono(alphaL), '§SUNGLASS_NOT_SIZE_NOT_ALPHA lightness is NOT monotonic in alphabetic order', 'L-by-alpha: ' + alphaL.join(', '));
    V(!mono(sizeL), '§SUNGLASS_NOT_SIZE_NOT_ALPHA lightness is NOT monotonic in size-rank order', 'L-by-size: ' + sizeL.join(', '));
  }

  // ── 3. OLD vs NEW: the pre-fix formula (alphabetic keys + warmPastel cycle, sub=7) ──
  // warmPastel PINNED from origin/main tools.js (§SUNGLASS palette table) — the red-control
  // population: the monotonicity checker MUST fail on these, or this witness cannot fail.
  const oldVsNew = await page.evaluate(() => {
    const A = window.APP, THREE = window.THREE;
    const warmPastel = [
      [0.05, 0.25, 0.82], [0.12, 0.25, 0.78], [0.08, 0.30, 0.75],
      [0.55, 0.20, 0.80], [0.42, 0.25, 0.76], [0.15, 0.22, 0.84],
      [0.02, 0.20, 0.70], [0.58, 0.28, 0.72], [0.10, 0.35, 0.68],
      [0.48, 0.22, 0.78]];
    const g = A._groupBy(A._collectAllMeshes(), 'storey');
    const alpha = Object.keys(g).sort();
    const sub = 38 - 31;
    const old = {};
    alpha.forEach((k, i) => {
      const p = warmPastel[i % warmPastel.length];
      const c = new THREE.Color().setHSL(p[0], p[1] + sub * 0.05, p[2] - sub * 0.03);
      const hsl = c.getHSL({});
      old[k] = { hex: c.getHexString(), l: +hsl.l.toFixed(4) };
    });
    const now = {};
    alpha.forEach(k => {
      const m = g[k].find(x => x.material && x.material.color);
      now[k] = m ? m.material.color.getHexString() : null;
    });
    return { alpha, old, now };
  });
  let changed = 0;
  oldVsNew.alpha.forEach(k => {
    const o = oldVsNew.old[k].hex, n = oldVsNew.now[k];
    if (n !== null && n !== o) changed++;
    S('       ' + k + '  old=#' + o + '  new=#' + (n || '?') + (n !== null && n !== o ? '  CHANGED' : ''));
  });
  if (changed === 0) {
    S('   §SUNGLASS_OLD_VS_NEW NO-OP — new mapping produced the identical colours the old formula would have');
    fails++; judged++;
  } else {
    V(changed >= 1, '§SUNGLASS_OLD_VS_NEW ' + changed + '/' + oldVsNew.alpha.length + ' storey colours differ from the old alphabetic-cycle formula');
  }
  // RED CONTROL: old colours in ordinal order must NOT be monotonic (checker can fail).
  const oldLByOrdinal = ordinalOrder.filter(k => oldVsNew.old[k]).map(k => oldVsNew.old[k].l);
  V(!mono(oldLByOrdinal), 'redControl — monotonicity checker FAILS on the old cycling colours', 'old L by ordinal: ' + oldLByOrdinal.join(', '));

  // ── 4. CATEGORICAL FROZEN: tick 5 (class warm, sub=4) + tick 60 (disc earth, sub=4) ──
  const cat = await page.evaluate(() => {
    const A = window.APP, THREE = window.THREE;
    const warmPastel = [
      [0.05, 0.25, 0.82], [0.12, 0.25, 0.78], [0.08, 0.30, 0.75],
      [0.55, 0.20, 0.80], [0.42, 0.25, 0.76], [0.15, 0.22, 0.84],
      [0.02, 0.20, 0.70], [0.58, 0.28, 0.72], [0.10, 0.35, 0.68],
      [0.48, 0.22, 0.78]];
    const earthTone = [
      [0.08, 0.45, 0.65], [0.05, 0.50, 0.55], [0.10, 0.40, 0.70],
      [0.12, 0.55, 0.50], [0.15, 0.38, 0.60], [0.03, 0.48, 0.58],
      [0.07, 0.42, 0.62], [0.55, 0.35, 0.58], [0.20, 0.50, 0.52],
      [0.02, 0.60, 0.45]];
    function check(tick, key, palette, sortFn) {
      A.updateAmbience(tick);
      const g = A._groupBy(A._collectAllMeshes(), key);
      const keys = Object.keys(g).sort(sortFn ? (a, b) => sortFn(g, a, b) : undefined);
      const sub = tick <= 10 ? tick - 1 : tick - 56;
      return keys.map((k, i) => {
        const p = palette[i % palette.length];
        const exp = new THREE.Color().setHSL(p[0], p[1] + sub * 0.05, p[2] - sub * 0.03);
        const m = g[k].find(x => x.material && x.material.color);
        const got = m ? m.material.color : null;
        return { k, i, hue: p[0], exp: exp.getHexString(), got: got ? got.getHexString() : null,
                 dist: got ? Math.hypot(got.r - exp.r, got.g - exp.g, got.b - exp.b) : null };
      });
    }
    return {
      cls: check(5, 'ifcClass', warmPastel, (g, a, b) => g[b].length - g[a].length),
      dsc: check(60, 'disc', earthTone, null)
    };
  });
  const frozen = rows => rows.filter(r => r.got !== null).every(r => r.dist < 1e-6);
  S('\n   [§SUNGLASS_CATEGORICAL_FROZEN] tick 5 by ifcClass (expected vs applied):');
  cat.cls.forEach(r => S('       [' + r.i + '] ' + r.k + '  exp=#' + r.exp + ' got=#' + (r.got || '?') + ' dist=' + (r.dist === null ? 'n/a' : r.dist.toExponential(2))));
  V(frozen(cat.cls), '§SUNGLASS_CATEGORICAL_FROZEN tick 5 class colours equal the pinned origin/main formula', cat.cls.length + ' classes');
  S('   [§SUNGLASS_CATEGORICAL_FROZEN] tick 60 by disc:');
  cat.dsc.forEach(r => S('       [' + r.i + '] ' + r.k + '  exp=#' + r.exp + ' got=#' + (r.got || '?') + ' dist=' + (r.dist === null ? 'n/a' : r.dist.toExponential(2))));
  V(frozen(cat.dsc), '§SUNGLASS_CATEGORICAL_FROZEN tick 60 disc colours equal the pinned origin/main formula', cat.dsc.length + ' discs');

  // ── 5. HUE SEPARATION among the distinct palette entries actually applied ──
  const hueSep = rows => {
    const used = rows.slice(0, Math.min(rows.length, 10));
    let minH = 1, minRGB = 10;
    for (let i = 0; i < used.length; i++) for (let j = i + 1; j < used.length; j++) {
      const dh = Math.abs(used[i].hue - used[j].hue);
      minH = Math.min(minH, Math.min(dh, 1 - dh));
      const a = parseInt(used[i].exp, 16), b = parseInt(used[j].exp, 16);
      const dr = ((a >> 16) & 255) - ((b >> 16) & 255), dg = ((a >> 8) & 255) - ((b >> 8) & 255), db = (a & 255) - (b & 255);
      minRGB = Math.min(minRGB, Math.hypot(dr / 255, dg / 255, db / 255));
    }
    return { minH, minRGB, n: used.length };
  };
  const hc = hueSep(cat.cls), hd = hueSep(cat.dsc);
  S('   [§SUNGLASS_HUE_SEP] class: minPairHue=' + hc.minH.toFixed(4) + ' (' + (hc.minH * 360).toFixed(1) + ' deg) minPairRGB=' + hc.minRGB.toFixed(4) + ' over first ' + hc.n
    + ' | disc: minPairHue=' + hd.minH.toFixed(4) + ' (' + (hd.minH * 360).toFixed(1) + ' deg) minPairRGB=' + hd.minRGB.toFixed(4) + ' over first ' + hd.n);
  V(hc.minH >= 0.02 - 1e-9 && hc.minRGB > 0, '§SUNGLASS_HUE_SEP class groups keep >= 0.02 hue separation (palette table minimum) and distinct RGB');
  V(hd.minRGB > 0, '§SUNGLASS_HUE_SEP disc groups all distinct in RGB');

  // ── 6. BROWN TRACK: last segment 97%..100% is rgb(139,69,19), asserted from the CSSOM ──
  const track = await page.evaluate(() => {
    const el = document.getElementById('sunglass-slider');
    if (!el) return { err: 'no #sunglass-slider element' };
    // open the panel so the slider has layout — extent must be a real px number, not 0
    const panel = document.getElementById('sunglass-slider-panel');
    if (panel && panel.style.display === 'none' && typeof window.toggleSunglass === 'function') window.toggleSunglass();
    const w = el.getBoundingClientRect().width;
    let bg = '';
    try { bg = getComputedStyle(el, '::-webkit-slider-runnable-track').backgroundImage || ''; } catch (e) {}
    if (bg.indexOf('gradient') < 0) {
      // fall back to the CSSOM rule — same numbers, same origin
      for (const sh of document.styleSheets) {
        let rules; try { rules = sh.cssRules; } catch (e) { continue; }
        for (const r of rules || []) {
          if (r.selectorText && r.selectorText.indexOf('#sunglass-slider::-webkit-slider-runnable-track') >= 0) {
            bg = r.style.background || r.style.backgroundImage || '';
          }
        }
      }
    }
    const m = bg.match(/rgb\(139,\s*69,\s*19\)\s*([\d.]+)%\s*,\s*rgb\(139,\s*69,\s*19\)\s*([\d.]+)%/);
    return { bg, width: w, from: m ? +m[1] : null, to: m ? +m[2] : null };
  });
  if (track.err || track.from === null) {
    S('   §SUNGLASS_BROWN_TRACK INCONCLUSIVE — ' + (track.err || 'gradient not resolvable: ' + track.bg));
    fails++; judged++;
  } else {
    const extentPx = track.width * (track.to - track.from) / 100;
    S('   [§SUNGLASS_BROWN_TRACK] colour=rgb(139,69,19) stops=' + track.from + '%..' + track.to + '% trackWidth=' + track.width.toFixed(1) + 'px extent=' + extentPx.toFixed(1) + 'px');
    V(track.from === 97 && track.to === 100 && extentPx > 0, '§SUNGLASS_BROWN_TRACK brown segment spans exactly 97%..100% (ticks 98-100) with real rendered extent');
  }

  // ── 7. ALT+S SURVIVES: palette-recoloured materials must not be swapped by the still pass ──
  await page.evaluate(() => window.APP.updateAmbience(38));
  const before = await page.evaluate(() => {
    const A = window.APP;
    if (!A._sunglassBackups || !A._sunglassBackups.length) return [];
    const noop = Object.getPrototypeOf(A._sunglassBackups[0].origMat).onBeforeCompile; // Material.prototype default
    return A._sunglassBackups.slice(0, 400).map(b => ({
      uuid: b.mesh.material.uuid, hex: b.mesh.material.color ? b.mesh.material.color.getHexString() : null,
      origTri: !!b.origMat._triplanarShader,
      cloneKeptHook: b.mesh.material.onBeforeCompile !== noop
    }));
  });
  let altsVerdict = 'INCONCLUSIVE', altsDetail = '';
  if (before.length === 0) { altsDetail = 'VACUOUS — 0 palette backups, no population to judge'; }
  else try {
    const started = await page.evaluate(() => {
      const A = window.APP;
      if (typeof A.startStillRefine !== 'function') return false;
      A.startStillRefine(); return A._stillRefineActive === true;
    });
    await page.waitForTimeout(8000);
    await page.evaluate(() => { const A = window.APP; if (typeof A.stopStillRefine === 'function') A.stopStillRefine(); });
    const after = await page.evaluate(() => {
      const A = window.APP;
      return { tri: (A._triplanarMaterials || []).length,
               mats: A._sunglassBackups.slice(0, 400).map(b => ({
                 uuid: b.mesh.material.uuid, hex: b.mesh.material.color ? b.mesh.material.color.getHexString() : null })) };
    });
    if (!started) { altsDetail = 'startStillRefine unavailable or did not activate'; }
    else {
      let swapped = 0, recoloured = 0;
      before.forEach((b, i) => {
        if (after.mats[i] && after.mats[i].uuid !== b.uuid) swapped++;
        if (after.mats[i] && after.mats[i].hex !== b.hex) recoloured++;
      });
      altsVerdict = (swapped === 0 && recoloured === 0) ? 'CONFIRMED' : 'REFUTED';
      altsDetail = 'sampled=' + before.length + ' swapped=' + swapped + ' recoloured=' + recoloured + ' triplanarMaterials=' + after.tri;
      V(swapped === 0 && recoloured === 0, '§SUNGLASS_ALTS_SURVIVES Alt+S still pass left every palette material + colour in place', altsDetail);
    }
  } catch (e) { altsDetail = String(e).slice(0, 120); }
  if (altsVerdict === 'INCONCLUSIVE') { S('   §SUNGLASS_ALTS_SURVIVES INCONCLUSIVE — ' + altsDetail); }
  S('   [§SETTRIPLANAR_NOOP_BEHAVIOR] ' + altsVerdict + ' — the still pass swaps no palette material (behavioural proof the effects.js _setTriplanarActive stub swaps nothing); ' + altsDetail);
  const triBefore = before.filter(b => b.origTri);
  if (triBefore.length === 0) {
    S('   [§SUNGLASS_TRIPLANAR_TINT] INCONCLUSIVE — 0 sampled palette meshes had a compiled triplanar original in this headless run (population empty)');
  } else {
    const kept = triBefore.filter(b => b.cloneKeptHook).length;
    S('   [§SUNGLASS_TRIPLANAR_TINT] triplanar originals sampled=' + triBefore.length + ' clones keeping onBeforeCompile hook=' + kept
      + (kept === triBefore.length ? ' — palette TINTS the texture (clone keeps the hook)' : ' — clone DROPS the hook on ' + (triBefore.length - kept) + ' (palette REPLACES texture with flat colour there)'));
  }

  // ── verdict ──
  const verdict = judged === 0 ? 'INCONCLUSIVE' : (fails === 0 ? 'PASS' : 'FAIL');
  S('\n§WITNESS_SUNGLASS_GROUPING_RULES pass=' + (judged - fails) + ' fail=' + fails + ' ran=' + judged + ' verdict=' + verdict);
  save();
  await browser.close(); server.close();
  process.exit(fails > 0 ? 1 : 0);
})().catch(e => { S('§SUNGLASS_GROUPING INCONCLUSIVE — witness crashed: ' + e.stack); save(); process.exit(1); });
