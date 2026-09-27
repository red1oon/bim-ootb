// ⚠ DO NOT REMOVE — §ALTS_ALL judge (pure, no browser). Scope: turn persisted raw records (still presses, film bake logs) into
// verdict rows with explicit states. Read the log after every run. Spec: bim-compiler PHOTOREAL_STILL_RENDER.md "### ALTS-ALL BUILD".
// STATES: PASS | FAIL | INCONCLUSIVE (instrument failed or data missing) | VACUOUS (population judged = 0) | NO-OP (fix line present,
// on == off) | SCOPE-BLIND (a spatially local fix acted, but not where this pose looks) | WARN (listed, not blocking) | INFO (a number
// reported where the fix is not expected to act by physics — e.g. the 900 cd torch at 9 m; ### ALTS-ALL FIX 4 — not blocking).
// A verdict is never PASS when nothing was judged.
'use strict';
const BLOCKING = new Set(['FAIL', 'INCONCLUSIVE', 'VACUOUS', 'NO-OP']);
const num = (s, re) => { const m = re.exec(s || ''); return m ? +m[1] : null; };
const grepAll = (L, re) => (L || []).filter(l => re.test(l) && !/^§CLAIM /.test(l));
const grep1 = (L, re) => grepAll(L, re)[0] || null;
const grepLast = (L, re) => { const a = grepAll(L, re); return a.length ? a[a.length - 1] : null; };
function row(group, id, state, detail, extra) { return Object.assign({ group, id, state, detail: String(detail) }, extra || {}); }

// ── fix table: each off-switch arm, its on-line in the base arm, its off-line in the arm, population regex, local or global
const FIXES = {
  torch0:        { q: '&torch=0', on: /§CAM_TORCH on peakCd=/, off: /§CAM_TORCH (off|VACUOUS)|^(?![\s\S]*§CAM_TORCH on)/, offMustLine: false, pop: null, local: false, name: 'L1b camera torch', judgedAt: ['inner_close'] },
  srgbfix0:      { q: '&srgbfix=0', on: /§ALBEDO_SRGB srgbfix=1/, off: /§ALBEDO_SRGB srgbfix=0/, offMustLine: true, pop: /§ALBEDO_SRGB srgbfix=1 .*converted=(\d+)/, local: false, name: 'Z9 albedo sRGB' },
  groundlaw0:    { q: '&groundlaw=0', on: /§GROUND_HALF rho=/, off: /§GROUND_HALF off/, offMustLine: true, pop: null, local: false, name: 'Z12 ground half' },
  aoindirect0:   { q: '&aoindirect=0', on: /§AO_INDIRECT done mode=shader/, off: /§AO_INDIRECT mode=legacy/, offMustLine: true, pop: /§AO_INDIRECT done mode=shader boundMats=(\d+)/, local: false, name: 'Z10 AO indirect' },
  gialb0:        { q: '&gialb=0', on: /§GI_RECEIVER_ALBEDO real=/, off: /§GI_RECEIVER_ALBEDO off/, offMustLine: true, pop: /§GI_RECEIVER_ALBEDO real=(\d+)/, local: false, name: 'Z11 receiver albedo' },
  skyshell0:     { q: '&skyshell=0', on: /§SKY_SHELL_RAYS .* on shellCells=/, off: /§SKY_SHELL_RAYS .*off \(&skyshell=0/, offMustLine: true, pop: /§SKY_SHELL_RAYS .* recomputed=(\d+)/, local: true, name: 'B1 sky shell rays' },
  shellreach2:   { q: '&shellreach=2', on: /§SKY_SHELL_RAYS .*reach=air/, off: /§SKY_SHELL_RAYS .*reach=r2/, offMustLine: true, pop: /§SKY_SHELL_RAYS .* recomputedAirOnly=(\d+)/, local: true, name: 'Z8 radius-free reach' },
  gridblend1:    { q: '&gridblend=1', on: /§GRID_BLEND off/, off: /§GRID_BLEND on/, offMustLine: true, pop: null, local: true, name: 'Z18 grid blend (arm = ON)', invert: true },
  specsmooth0:   { q: '&specsmooth=0', on: /§SPEC_SMOOTH on/, off: /§SPEC_SMOOTH off/, offMustLine: true, pop: null, local: true, name: 'Z18 spec smooth (mirror gate)' },
  gibound0:      { q: '&gibound=0', on: /§GI_BOUND on/, off: /§GI_BOUND off \(&gibound=0/, offMustLine: true, pop: null, local: false, name: 'FIX 13 GI energy bound' },
  metalpbr0:     { q: '&metalpbr=0', on: /§METAL_PBR on/, off: /§METAL_PBR off/, offMustLine: true, pop: null, local: true, name: 'FIX 11 MEP trade hue + PBR metalness' },
  csmsides0:     { q: '&csmsides=0', on: /readbackSides=asDrawn/, off: /readbackSides=double/, offMustLine: true, pop: null, local: false, name: 'FIX 16 cascade readback sides as drawn' },
  normrepair0:   { q: '&normrepair=0', on: /§NORMAL_REPAIR meshesScanned=/, off: /§NORMAL_REPAIR off/, offMustLine: true, pop: /§NORMAL_REPAIR meshesScanned=\d+ meshesAffected=(\d+)/, local: true, name: 'FIX 14 zero-normal repair' },
  meterband7095: { q: '&meterband=70,95', on: /§METER camera=/, off: /§METER camera=/, offMustLine: true, pop: /§METER camera=.* pixels=(\d+)/, local: false, name: 'meter band 40/90 vs 70/95' }
};
const REFS = {   // p50 / le15 / clip: §ALTS_COMBINED RESULT (torch build, first press) else §METER_EV v2 40/90 (evD), else B1
  night: { src: 'ALTS_COMBINED', p50: 76.1, le15: 1.04, clip: 0 }, a616: { src: 'ALTS_COMBINED', p50: 43.1, le15: 15.21, clip: 0 },
  clinic: { src: 'ALTS_COMBINED', p50: 63.3, le15: 0.07, clip: 0 }, inner: { src: 'ALTS_COMBINED', p50: 131.4, le15: 0.02, clip: 0 },
  term: { src: 'ALTS_COMBINED', p50: 140.4, le15: 0.34, clip: 0.45 }, p672: { src: 'ALTS_COMBINED', p50: 76.5, le15: 1.36, clip: 0.12 },
  plenum: { src: 'ALTS_COMBINED', p50: 69.4, le15: 20.23, clip: 0.26 }, p2: { src: 'METER_EV v2 40/90', p50: 55.6, le15: 0.81, clip: 0.27 },
  p698: { src: 'METER_EV v2 40/90', p50: 42.1, le15: 1.66, clip: 0.04 }, p614: { src: 'METER_EV v2 40/90', p50: 67.4, le15: 0.41, clip: 0 },
  a202: { src: 'B1 RESULT W2 (le15 only)', p50: null, le15: 1.47, clip: null }
};
const BAND = { p50Lo: 40, p50Hi: 200, clipMax: 2 };

// ── G1 instrument sanity for one still record (rec.tree = node facts of the tree)
function g1(rec, T) {
  const out = [], L = rec.lines || [], E = rec.eval || {};
  const add = (id, ok, detail, inconc) => out.push(row('G1', id, ok ? 'PASS' : (inconc ? 'INCONCLUSIVE' : 'INCONCLUSIVE'), detail));
  if (rec.fatal) { add('run', false, 'runner fatal: ' + rec.fatal); return out; }
  add('sw version served == tree', E.swServed === T.sw, 'served ' + E.swServed + ' tree ' + T.sw);
  const miss = Object.keys(T.versions).filter(f => !(E.scripts || []).some(s => s === f + '?v=' + T.versions[f]));
  add('edited files ?v= in DOM', !miss.length, miss.length ? 'missing ' + miss.join(',') : Object.keys(T.versions).map(f => f + '?v=' + T.versions[f]).join(' '));
  const bad = Object.keys(T.hashes).filter(f => (E.fileHash || {})[f] !== T.hashes[f]);
  add('served file bytes == tree', !bad.length, bad.length ? 'differ ' + bad.join(',') : 'all ' + Object.keys(T.hashes).length + ' match');
  add('lawHash page == node', E.lawHash === T.lawHash, 'page ' + E.lawHash + ' node ' + T.lawHash);
  add('LightZones SRC page == node', E.lzSrc === T.lzSrc, 'page ' + E.lzSrc + ' node ' + T.lzSrc);
  const errs = grepAll(L, /^PAGEERROR|§LOAD_FAIL|Shader Error|CONTEXT_LOST|Context Lost|GPUOutOfMemory/);
  const gpu = rec.gpu ? ' | GPU peak ' + rec.gpu.peakUsed + '/' + rec.gpu.total + ' MiB (this press ' + rec.gpu.pressPeakMB + ' MiB, baseline ' + rec.gpu.baseline + ')' : '';
  add('zero page errors / §LOAD_FAIL', !errs.length, errs.length + (errs.length ? ' e.g. ' + errs[0].slice(0, 120) : '') + gpu);
  // instrument (GPU run 2026-09-27, p2/base): the three-mesh-bvh CDN import failed (§BVH_INIT_FAIL) -> §SKY_SHELL_RAYS "no BVH",
  // recomputed=0: the press ran without the B1/Z8 shell pass, and no other G1 row noticed. A missing dependency = the press is not the build.
  const bvh = grepAll(L, /§BVH_INIT_FAIL/);
  add('BVH loaded (no §BVH_INIT_FAIL: shell pass needs it)', !bvh.length, bvh.length ? bvh[0].slice(0, 140) : 'ok');
  add('fresh profile (no SW controller at load)', E.swCtlAtLoad === false, 'controllerAtLoad=' + E.swCtlAtLoad);
  const zc = grepAll(L, /§ZONE_IDB_CACHE (prime|hit|miss|saved)/).map(l => l.replace(/^.*§ZONE_IDB_CACHE /, '').slice(0, 40)).join(' | ');
  const sh = grep1(L, /§SKY_SHELL_RAYS .*cache=(built|hit)/);
  out.push(row('G1', 'zone/field cache', /cache=(built|hit)/.test(sh || '') ? 'PASS' : 'INCONCLUSIVE', 'shell ' + ((/cache=(built|hit)/.exec(sh || '') || [])[1] || 'none') + ' | ' + (zc || 'no §ZONE_IDB_CACHE line')));
  const pc = E.pose && E.pose.cam, pt = E.pose && E.pose.tgt, near = (a, b) => a && b && a.length === 3 && a.every((v, i) => Math.abs(v - b[i]) < 2e-3);
  add('staged pose == requested', near(pc, rec.cam) && near(pt, rec.tgt), 'cam ' + JSON.stringify(pc) + ' tgt ' + JSON.stringify(pt));
  if (rec.png) add('PNG tEXt pose == requested', near(rec.png.pose && rec.png.pose.cam, rec.cam) && near(rec.png.pose && rec.png.pose.tgt, rec.tgt), rec.png.err || ('png cam ' + JSON.stringify(rec.png.pose && rec.png.pose.cam)));
  else add('PNG tEXt pose == requested', false, 'no PNG saved');
  const m = grepLast(L, /§METER camera=/), px = num(m, /pixels=(\d+)/), sky = num(m, /skyPx=(\d+)/), ev = num(m, /EV100=(-?[\d.]+)/);
  add('meter readback finite, non-empty, not all sky', m && px > 0 && sky < px && isFinite(ev), m ? 'EV100=' + ev + ' skyPx=' + sky + '/' + px : 'no §METER camera line');
  const done = grep1(L, /§GI_STILL result|§STILL_REFINE done/);
  add('press finished', !!done && !grep1(L, /§GI_STILL_FAIL/), done ? done.slice(0, 80) : 'no end marker (timeout?)');
  return out;
}
// ── G3 VACUOUS guards (per record)
function g3(rec) {
  const L = rec.lines || [], out = [], pop = (id, re, label) => { const l = grep1(L, re); if (!l) { out.push(row('G3', id, 'INCONCLUSIVE', 'no line ' + re)); return; } const v = num(l, /=(\d+)/.exec(l) ? new RegExp(label + '=(\\d+)') : /x/); out.push(row('G3', id, v > 0 ? 'PASS' : 'VACUOUS', label + '=' + v)); };
  const q = rec.q || '';
  if (!/cove=0/.test(q)) pop('§COVE_QUAL qualified > 0', /§COVE_QUAL/, 'qualified');
  if (!/srgbfix=0/.test(q)) pop('§ALBEDO_SRGB converted > 0', /§ALBEDO_SRGB srgbfix=1/, 'converted');
  if (!/skyshell=0/.test(q)) pop('shell cells recomputed > 0', /§SKY_SHELL_RAYS/, 'recomputed');
  if (!/aoindirect=0/.test(q)) pop('AO bound materials > 0', /§AO_INDIRECT done/, 'boundMats');
  if (!/gialb=0/.test(q)) pop('receiver albedo real px > 0', /§GI_RECEIVER_ALBEDO real=/, 'real');
  const gl = grep1(L, /§GLARE bld=/);
  if (!gl) out.push(row('G3', '§GLARE populations', 'INCONCLUSIVE', 'no §GLARE line'));
  else { const ef = num(gl, /exteriorFaces=(\d+)/), jt = num(gl, /junctionTested=(\d+)/); out.push(row('G3', '§GLARE populations', (ef > 0 && jt > 0) ? 'PASS' : 'VACUOUS', 'exteriorFaces=' + ef + ' junctionTested=' + jt)); }
  const rv = grepAll(L, /§METER (remeter|final) VACUOUS/), ms = grepAll(L, /§METER camera=/);
  const allSky = ms.filter(l => /camera=inside/.test(l) && num(l, /skyPx=(\d+)\//) === num(l, /skyPx=\d+\/(\d+)/));
  out.push(row('G3', 'no inside §METER reads an all-sky frame', !ms.length ? 'INCONCLUSIVE' : ((allSky.length || rv.length) ? 'VACUOUS' : 'PASS'), (allSky[0] || rv[0] || ms.length + ' meter lines, none all-sky').slice(0, 160)));
  // ### ALTS-ALL FIX 1: ONE §METER reading per still, on the final staged scene (after the lamp rebuild + ground reassert + torch)
  const iM = L.findIndex(l => /§METER camera=/.test(l)), iG = L.findIndex(l => /§GROUND_COLOR_ORDER_FIX/.test(l)), iT = L.findIndex(l => /§CAM_TORCH on/.test(l)), iS = L.findIndex(l => /§STILL_REFINE start/.test(l));
  const iLamp = (() => { let k = -1; L.forEach((l, i) => { if (/§NIGHT_STILL_LIGHTS raised|§STILL_DIALS_LAMPS|§LIGHT_STACK/.test(l) && (iS < 0 || i < iS)) k = i; }); return k; })();
  const order = iM >= 0 && (iG < 0 || iG < iM) && (iLamp < 0 || iLamp < iM) && (iS < 0 || iM < iS) && (/torch=0/.test(q) || (iT >= 0 && iT < iM));
  out.push(row('G3', 'ONE §METER per still, on the final scene (after lamps/ground/torch, before §STILL_REFINE start)', !ms.length ? 'INCONCLUSIVE' : (ms.length === 1 && order ? 'PASS' : 'FAIL'),
    ms.length + ' §METER camera= line(s); order torch ' + iT + ' ground ' + iG + ' lamps ' + iLamp + ' meter ' + iM + ' refine ' + iS + (/tag=final/.test(ms[0] || '') ? '' : ' (no tag=final)')));
  const bl = grepLast(L, /§METER_BIND/), dum = num(bl, /dummyAtRead=(\d+)/);
  out.push(row('G3', 'meter read on BOUND uniforms (§METER_BIND dummyAtRead == 0)', !bl ? 'INCONCLUSIVE' : (dum === 0 && num(bl, /stagedLit=(\d+)/) > 0 ? 'PASS' : (num(bl, /stagedLit=(\d+)/) > 0 ? 'FAIL' : 'VACUOUS')), (bl || 'no §METER_BIND line').replace(/^.*§METER_BIND /, '').slice(0, 140)));
  // coordinator 2026-09-27: the <= 1 EV row was blind to an IDENTICAL re-read — the final meter must prove it rendered (frame advanced,
  // draw calls > 0); a final buffer byte-identical to the diag buffer while the §METER_STATE changed is flagged (WARN: legit only if
  // every change is off-screen).
  const binds = grepAll(L, /§METER_BIND/), bf = binds[binds.length - 1] || '', bd = binds.length >= 2 ? binds[0] : '';
  out.push(row('G3', 'final meter re-rendered the scene (rendered=1, calls > 0)', !bf ? 'INCONCLUSIVE' : (/rendered=1/.test(bf) && num(bf, /calls=(\d+)/) > 0 ? 'PASS' : 'FAIL'), 'rendered=' + num(bf, /rendered=(\d)/) + ' calls=' + num(bf, /calls=(-?\d+)/) + ' bufHash ' + ((/bufHash=(\w+)/.exec(bd) || [])[1] || '-') + ' -> ' + ((/bufHash=(\w+)/.exec(bf) || [])[1] || '-')));
  const dg = grep1(L, /§METER_DIAG camera=/);
  if (dg && ms.length) { const e0 = num(dg, /EV100=(-?[\d.]+)/), e1 = num(ms[ms.length - 1], /EV100=(-?[\d.]+)/), st = grepAll(L, /§METER_STATE/);
    const kv = l => Object.fromEntries((l.match(/(\w+)=(\S+)/g) || []).map(x => x.split('='))), sd = st.find(l => /tag=diag/.test(l)), sf = [...st].reverse().find(l => /tag=final/.test(l));
    const diff = sd && sf ? (() => { const a = kv(sd), b = kv(sf); return Object.keys(b).filter(k => a[k] !== b[k] && !/^bandL$|^noGround|^groundShare|^tag$/.test(k)).map(k => k + ' ' + a[k] + '->' + b[k]).join(' '); })() : 'no §METER_STATE diag/final pair';
    const gsh = st.map(l => num(l, /groundShare=(-?[\d.]+)/)).filter(v => v != null);
    const hd = (/bufHash=(\w+)/.exec(bd) || [])[1], hf = (/bufHash=(\w+)/.exec(bf) || [])[1];
    if (hd && hf && hd === hf && diff && diff !== 'nothing logged' && !/^no /.test(diff)) out.push(row('G3', 'final buffer identical to the diag buffer while the scene state changed', 'WARN', 'bufHash ' + hf + ' both | changed: ' + diff.slice(0, 120)));
    out.push(row('G3', 'stage diag -> final EV (diagnostic only; the exposure is the final reading)', 'INFO', 'EV ' + e0 + ' -> ' + e1 + ' | state changed: ' + (diff || 'nothing logged') + (gsh.length ? ' | groundShare ' + gsh.join(' -> ') : ''))); }
  const rb = grepAll(L, /§SOURCED_REBIND n=/); if (rb.length) out.push(row('G3', 'app frames drawn with re-keyed (dummy) sourced uniforms', 'WARN', rb.length + ' event(s) e.g. ' + rb[0].slice(0, 100)));
  return out;
}
// ── G4 look metrics
function g4(rec) {
  const E = rec.eval || {}, c = E.comp, L = rec.lines || [], out = [];
  if (!c) return [row('G4', 'look metrics', 'INCONCLUSIVE', 'no composite stats')];
  const gl = grep1(L, /§GLARE bld=/), g = (/black_exterior=(\d+) junction_zone_flip=(\d+) covered_open_side_black=(\d+)/.exec(gl || '') || []).slice(1).join('/');
  // ### ALTS-ALL FIX 10 (D1, red1 ruling 2): from an INSIDE camera the band counts clipping only on INTERIOR opaque surfaces; exterior
  // seen through glass/openings (eye adaptation, WANTED) and emitters (the source itself) print as INFO. Outside camera: all clipping.
  const mline = grepLast(L, /§METER camera=/), inside = /camera=inside/.test(mline || ''), K = rec.clip;
  const kOk = K && !K.err && K.interiorPct != null;
  const clipJ = (inside && kOk) ? K.interiorPct : c.ge250pct;
  const inBand = c.p50 >= BAND.p50Lo && c.p50 <= BAND.p50Hi && clipJ < BAND.clipMax;
  const src = E.compSrc === 'bounce' ? 'composite' : 'APP FRAME (no bounce canvas: not the saved image)';
  const noCls = inside && !kOk && c.ge250pct >= BAND.clipMax;   // never PASS on a missing readback
  out.push(row('G4', 'p50 40..200 & clipped < 2%', noCls ? 'INCONCLUSIVE' : (!inBand ? 'FAIL' : (E.compSrc === 'bounce' ? 'PASS' : 'SCOPE-BLIND')),
    'p5/p50/p95 ' + c.p5 + '/' + c.p50 + '/' + c.p95 + ' le15 ' + c.le15pct + '% clip ' + (inside ? (kOk ? 'interior-opaque ' + K.interiorPct + '% (whole frame ' + c.ge250pct + '%)' : c.ge250pct + '% (whole frame: clip classification ' + (K ? K.err : 'missing') + ')') : c.ge250pct + '% (outside camera: all counted)') + ' [' + src + ']', { metrics: c, clipJudged: clipJ }));
  if (kOk && K.clipped) out.push(row('G4', 'clip by surface (D1: exterior through openings = WANTED eye adaptation; emitters = sources)', 'INFO',
    'camera ' + (inside ? 'inside' : 'outside') + ' clipped ' + K.clipPct + '% = interior ' + K.interiorPct + '% + exterior ' + K.exteriorPct + '% (glass-backed ' + K.glassBackedPct + '%) + emitter ' + K.emitterPct + '% + unclassified ' + K.unclassifiedPct + '%' + (K.topZones && K.topZones.length ? ' | interior zones ' + JSON.stringify(K.topZones) : '')));
  if (kOk && K.unclassifiedPct > 0.2) out.push(row('G4', 'clip classification readback exact (unclassified <= 0.2 %)', 'INCONCLUSIVE', 'unclassified ' + K.unclassifiedPct + '% of the frame'));
  out.push(row('G4', '§GLARE 0/0/0', g === '0/0/0' ? 'PASS' : (g ? 'FAIL' : 'INCONCLUSIVE'), g || 'no line'));
  out.push(row('G4', 'programs / press time', 'WARN', 'programs=' + E.programs + ' pressSecs=' + rec.pressSecs + ' stageTotal=' + num(grep1(L, /§STILL_STAGE_MS/), /total=(\d+)/)));
  return out;
}
// ── G5 regression refs
function g5(rec) {
  const R = REFS[rec.pose], c = rec.eval && rec.eval.comp; if (!R) return [row('G5', 'ref delta', 'WARN', 'no recorded ref for ' + rec.pose)];
  if (!c) return [row('G5', 'ref delta', 'INCONCLUSIVE', 'no stats')];
  const d = (a, b) => (a == null || b == null) ? '-' : (a - b >= 0 ? '+' : '') + (a - b).toFixed(2);
  return [row('G5', 'ref delta vs ' + R.src, 'WARN', 'p50 ' + c.p50 + ' (' + d(c.p50, R.p50) + ') le15 ' + c.le15pct + ' (' + d(c.le15pct, R.le15) + ') clip ' + c.ge250pct + ' (' + d(c.ge250pct, R.clip) + ')')];
}
// ── pose-specific rows (Z8 cells, Z18 steps)
function gz(rec) {
  const E = rec.eval || {}, out = [];
  if (rec.pose === 'a202' && E.z8cells) {
    const cs = E.z8cells, ok = cs.every(c => c.F != null && c.F >= 0.33), inv = cs.some(c => c.F == null);
    out.push(row('GZ', 'Z8 facade cells 9911662/3 F >= 0.33 (truth 0.43/0.40)', inv ? 'INCONCLUSIVE' : (ok ? 'PASS' : 'FAIL'), JSON.stringify(cs)));
  }
  if (E.steps) out.push(row('GZ', 'Z18 step proxy (isolated >=4-code jumps per 1000 px, lower half)', 'WARN', E.steps.per1000 + ' (n=' + E.steps.n + ')', { steps: E.steps.per1000 }));
  return out;
}
// ── G2: per fix, base vs off arm at one pose (noise = |base rep1 - rep2| if available)
function g2(base, arm, armId, noise) {
  const F = FIXES[armId]; if (!F) return [row('G2', armId, 'INCONCLUSIVE', 'unknown arm')];
  if (!base || !arm) return [row('G2', F.name, 'INCONCLUSIVE', 'missing ' + (!base ? 'base' : 'arm') + ' record')];
  const onRec = F.invert ? arm : base, offRec = F.invert ? base : arm, out = [];
  const onL = grep1(base.lines, F.on), offL = F.offMustLine ? grep1(arm.lines, F.off) : true;
  if (!onL) return [row('G2', F.name, 'FAIL', 'fix line absent in the default arm (' + F.on + ') — fix not active')];
  if (!offL) return [row('G2', F.name, 'FAIL', 'off-switch ' + F.q + ' did not produce its off line (' + F.off + ') — switch dead')];
  if (F.pop) { const p = num(grep1(onRec.lines, F.pop), F.pop); if (!(p > 0)) return [row('G2', F.name, 'VACUOUS', 'population ' + F.pop + ' = ' + p)]; }
  const a = base.eval && base.eval.comp, b = arm.eval && arm.eval.comp; if (!a || !b) return [row('G2', F.name, 'INCONCLUSIVE', 'no stats in one arm')];
  const evA = num(grepLast(base.lines, /§METER camera=/), /EV100=(-?[\d.]+)/), evB = num(grepLast(arm.lines, /§METER camera=/), /EV100=(-?[\d.]+)/);
  const dm = Math.abs(a.mean - b.mean), dp = Math.abs(a.p50 - b.p50), de = (evA != null && evB != null) ? Math.abs(evA - evB) : 0;
  const tol = Math.max(0.05, noise ? 2 * noise : 0);
  const moved = dm > tol || dp > tol || de > 0.005;
  const far = F.judgedAt && !F.judgedAt.includes(arm.pose);   // ### ALTS-ALL FIX 4: e.g. the torch judged only at a close pose
  const st = far ? 'INFO' : (moved ? 'PASS' : (F.local ? 'SCOPE-BLIND' : 'NO-OP'));
  out.push(row('G2', F.name + ' (' + F.q + ')' + (far ? ' [far pose: judged at ' + F.judgedAt.join(',') + ']' : ''), st, 'mean ' + a.mean + ' vs ' + b.mean + ' p50 ' + a.p50 + ' vs ' + b.p50 + ' EV ' + evA + ' vs ' + evB + ' tol ' + tol.toFixed(3) + (noise != null ? ' (noise ' + noise + ')' : ' (noise not measured)')));
  return out;
}

// ═════ FILM judge (one bake log, optional control logs) ═════
function sliceAfterPurge(L) { let k = -1; L.forEach((l, i) => { if (/§CLI_BAKE_SW_PURGE/.test(l)) k = i; }); return k >= 0 ? L.slice(k + 1) : L; }
function stripPrefix(l) { return l.replace(/^\S+ \+\s*[\d.]+s /, '').replace(/^\[con\] /, ''); }
function fe(L) { return grepAll(L, /§FILM_EXPOSURE f=\d+/).map(l => { const d = { f: num(l, /f=(\d+)/) }; (l.match(/(\w+)=(\[[^\]]*\]|\S+)/g) || []).forEach(kv => { const i = kv.indexOf('='); d[kv.slice(0, i)] = kv.slice(i + 1); }); return d; }); }
function swRace(Lraw) {
  const L = Lraw.map(stripPrefix), k = L.findIndex(l => /§CLI_BAKE_SW_PURGE/.test(l)); if (k < 0) return { purge: false };
  const unreg = num(L[k], /unregistered=(\d+)/), ctl = num(L[k], /controllerAtLoad=(-?\d+)/), tag = l => (/^(§[A-Z_0-9]+_INIT)\b/.exec(l) || [])[1];
  const before = new Set(L.slice(0, k).map(tag).filter(Boolean)), after = new Set(L.slice(k + 1).filter(l => !/^§CLAIM/.test(l)).map(tag).filter(Boolean));
  const dup = [...before].filter(t => after.has(t) && !/^§(SFX|GRID|TRIPLANAR)_INIT$/.test(t));
  // ### ALTS-ALL FIX 15 (F12): a race needs a SW-CONTROLLED pre-purge page; controllerAtLoad=0 = served by the network (this tree)
  return { purge: true, unregistered: unreg, dupInit: dup, controllerAtLoad: ctl, race: unreg > 0 && dup.length > 0 && ctl !== 0 };
}
function filmJudge(bake, T, ctl) {
  // bake = { arm, lines, frames: [{i, yavg, md5}] (ffprobe, optional), tap: {...} }, ctl = { C, E, Tt, B } optional other arms
  const out = [], Lr = bake.lines || [], L = sliceAfterPurge(Lr).map(stripPrefix), add = (g, id, st, d) => out.push(row(g, id, st, d));
  const sr = swRace(Lr);
  if (!sr.purge && bake.arm === 'altc') {
    // instrument (GPU run 2026-09-27): the in-browser Alt+C channel has no CLI purge by design (fresh puppeteer profile per run), so the
    // purge row was INCONCLUSIVE by construction. Its race question is "did the page initialise twice" — each §X_INIT exactly once
    // (SFX/GRID/TRIPLANAR re-init by design, as in swRace) and no SW controller at the end tap from a stale install is not judged here.
    const ic = {}; Lr.map(stripPrefix).forEach(l => { const t = (/^(§[A-Z_0-9]+_INIT)\b/.exec(l) || [])[1]; if (t && !/^§(SFX|GRID|TRIPLANAR)_INIT$/.test(t)) ic[t] = (ic[t] || 0) + 1; });
    const dup = Object.keys(ic).filter(t => ic[t] > 1), n = Object.keys(ic).length;
    add('F-G1', 'SW purge / reload race', !n ? 'INCONCLUSIVE' : (dup.length ? 'INCONCLUSIVE' : 'PASS'), 'in-browser channel, fresh profile, no purge: ' + n + ' _INIT tags, duplicated: ' + (dup.join(',') || 'none'));
  } else
  add('F-G1', 'SW purge / reload race', !sr.purge ? 'INCONCLUSIVE' : (sr.race ? 'INCONCLUSIVE' : (sr.unregistered > 0 && sr.controllerAtLoad !== 0 ? 'WARN' : 'PASS')),
    !sr.purge ? 'no §CLI_BAKE_SW_PURGE line (in-browser channel: see tap)' : 'unregistered=' + sr.unregistered + ' controllerAtLoad=' + (sr.controllerAtLoad == null ? 'n/a (old CLI)' : sr.controllerAtLoad) + ' pre-purge _INIT also after: ' + (sr.dupInit.join(',') || 'none') + (sr.unregistered > 0 && sr.controllerAtLoad === 0 ? ' (pre-purge page came from the network = this tree: its own fresh SW install was unregistered, not stale JS)' : '') + (sr.race ? ' => INCONCLUSIVE-instrument (a stale SW page initialised before the purge)' : ''));
  // ### ALTS-ALL FIX 2: the building must load (pass 1: HospitalAjaibPath.db absent from the tree's git-ignored buildings/ -> 404 in 3 s)
  const nf = grepAll(Lr.map(stripPrefix), /§DB_404|§CLI_BAKE_LOAD_FATAL|§ALTS_FILM_DB MISSING/);
  add('F-G1', 'building loaded (no §DB_404 / §CLI_BAKE_LOAD_FATAL)', nf.length ? 'INCONCLUSIVE' : 'PASS', nf.length ? nf[0].slice(0, 140) : 'no 404 / load-fatal line');
  const env = grep1(Lr.map(stripPrefix), /§CLI_BAKE_ENV/); if (env) add('F-G1', 'bake env sw == tree', num(env, /sw=v(\d+)/) === +String(T.sw).slice(1) ? 'PASS' : 'INCONCLUSIVE', env.slice(0, 160));
  const tap = bake.tap; if (tap) {
    const miss = Object.keys(T.versions).filter(f => !(tap.scripts || []).includes(f + '?v=' + T.versions[f]));
    add('F-G1', 'tap: edited files ?v= in the baked page', miss.length ? 'INCONCLUSIVE' : 'PASS', miss.length ? 'missing ' + miss.join(',') : 'all present');
    add('F-G1', 'tap: page lawHash == node', tap.lawHash === T.lawHash ? 'PASS' : 'INCONCLUSIVE', tap.lawHash + ' vs ' + T.lawHash);
  } else add('F-G1', 'tap report', 'INCONCLUSIVE', 'no tap report (?v= / lawHash of the baked page not verified)');
  const errs = grepAll(L, /^PAGEERROR|§LOAD_FAIL|Shader Error|CONTEXT_LOST|GPUOutOfMemory|§CLI_BAKE_LOAD_FATAL/); add('F-G1', 'zero page errors', errs.length ? 'INCONCLUSIVE' : 'PASS', errs.length + (errs[0] ? ' ' + errs[0].slice(0, 100) : ''));
  const parity = bake.arm === 'A' || bake.arm === 'T' || bake.arm === 'altc';
  const a = fe(L), done = num(grep1(L, /§MAXQ_DONE frames=/), /frames=(\d+)/), qa = grepAll(L, /§FRAME_QA i=/), fh = grepAll(L, /§FRAME_HASH i=/);
  add('F-G3', 'frames judged > 0', done > 0 ? 'PASS' : 'VACUOUS', 'MAXQ_DONE frames=' + done + ' FRAME_HASH=' + fh.length + ' FRAME_QA=' + qa.length);
  if (parity && !/filmexp=0/.test(bake.q || '')) {
    const vac = a.filter(d => /VACUOUS/.test(JSON.stringify(d))).length + grepAll(L, /§FILM_EXPOSURE VACUOUS/).length;
    add('F', '§FILM_EXPOSURE on every frame', a.length === 0 ? 'VACUOUS' : (a.length >= (done || 0) && vac <= 0.1 * a.length ? 'PASS' : 'FAIL'), 'lines=' + a.length + ' frames=' + done + ' vacuous=' + vac);
    if (a.length > 1) {
      const ev = a.map(d => +d.EV), tg = a.map(d => +d.targetEV), dt = +a[0].dt || 1 / 15, steps = ev.slice(1).map((v, i) => v - ev[i]);
      const bad = steps.map((s, i) => [s, i + 1]).filter(([s]) => s > 3 * dt + 1.1e-3 || s < -1 * dt - 1.1e-3), capU = a.filter(d => d.capped === 'up').length, capD = a.filter(d => d.capped === 'down').length;
      add('F', 'exposure step within +3/-1 stops/s', bad.length ? 'FAIL' : (capU + capD === 0 ? 'INCONCLUSIVE' : 'PASS'), 'maxUp ' + Math.max(...steps).toFixed(4) + ' maxDown ' + Math.min(...steps).toFixed(4) + ' capped up ' + capU + ' down ' + capD + (bad.length ? ' violations f=' + bad.slice(0, 5).map(x => x[1]) : '') + (capU + capD === 0 ? ' (limit never exercised)' : ''));
      const ov = ev.map((x, i) => i).filter(i => i > 0 && Math.abs(ev[i] - tg[i]) > 1.1e-3 && Math.abs(ev[i - 1] - tg[i]) > 1.1e-3 && Math.sign(ev[i] - tg[i]) !== Math.sign(ev[i - 1] - tg[i]));   // crossed the target it was moving to
      add('F', 'no overshoot', ov.length ? 'FAIL' : 'PASS', ov.length ? 'f=' + ov.slice(0, 5) : 'none');
      const pr = a.map(d => +d.programs), warm = pr.slice(2), uniq = [...new Set(warm)];
      const cen = grepAll(L, /§ALTC_PROGRAM_NEW/).filter(l => num(l, /f=(\d+)/) >= 2 && (m => m && +m[2] > +m[1])(/programs=(\d+)->(\d+)/.exec(l))).map(l => (/names=(\[[^\]]*\])/.exec(l) || [])[1] || '?');
      // ### ALTS-ALL FIX 5 decision (census 2026-09-27: f=84/85 = 2 SpriteMaterial programs — an overlay sprite first on screen late in
      // the orbit, not a staging/lit material): new programs at f>=2 that are ALL non-lit overlay kinds (Sprite/Points/Line/MeshBasic)
      // => WARN with the names; any lit/staging material (Standard/Physical/Lambert/Phong/Shader other than those) => FAIL.
      const litNew = cen.some(n => /MeshStandard|MeshPhysical|MeshLambert|MeshPhong|ShaderMaterial|RawShader/.test(n));
      add('F', 'programs constant after warm-up (f>=2)', uniq.length <= 1 ? 'PASS' : (cen.length && !litNew ? 'WARN' : 'FAIL'), 'f0 ' + pr[0] + ' f1 ' + pr[1] + ' f>=2 ' + uniq.slice(0, 5).join(',') + (cen.length ? ' | new at f>=2: ' + cen.join(' ').slice(0, 160) : ''));
      const tors = [...new Set(a.map(d => d.torch))], tl = grepAll(L, /§CAM_TORCH film on intensityUnits=/);
      if (bake.arm === 'T') add('F', 'torch off arm: torch=off every frame', tors.length === 1 && tors[0] === 'off' ? 'PASS' : 'FAIL', 'torch values ' + tors.join(','));
      else {   // row 12 (coordinator 2026-09-27): the bake stages twice (the first staging is torn down ~125 s) -> exactly ONE §CAM_TORCH film
        // line per CAPTURED staging = between the last §CAM_TORCH off before the first captured frame and that frame; none during capture
        const i0 = L.findIndex(l => /§FRAME_HASH i=/.test(l)); let lo = -1; for (let k = 0; k < (i0 < 0 ? L.length : i0); k++) if (/§CAM_TORCH off/.test(L[k])) lo = k;
        const cap = L.slice(lo + 1, i0 < 0 ? L.length : i0).filter(l => /§CAM_TORCH film on intensityUnits=/.test(l)), during = i0 < 0 ? [] : L.slice(i0).filter(l => /§CAM_TORCH film on/.test(l));
        const X = cap.length ? num(cap[0], /intensityUnits=([\d.e+-]+)/) : null;
        add('F', 'torch: one §CAM_TORCH film line per captured staging, torch= constant == it', cap.length === 1 && !during.length && tors.length === 1 && tors[0] !== 'off' && X != null && (+tors[0]).toExponential(6) === X.toExponential(6) ? 'PASS' : 'FAIL',
          'all film lines ' + tl.length + ', in the captured staging ' + cap.length + ', during capture ' + during.length + ', torch values ' + tors.slice(0, 3).join(','));
      }
      const amb = [...new Set(a.map(d => d.ambient))], drift = grepAll(L, /§FILM_FILL_CHECK/).filter(l => !/drift=none/.test(l));
      add('F', 'fill: ambient 0, §FILM_FILL_CHECK drift=none', !grep1(L, /§FILM_FILL_CHECK/) ? 'INCONCLUSIVE' : (drift.length || amb.join() !== '0.000' ? 'FAIL' : 'PASS'), 'ambient ' + amb.join(',') + ' drift lines ' + drift.length);
    }
    const lh = [...new Set(grepAll(L, /§LIGHT_LAW tag=film/).map(l => (/lawHash=(\w+)/.exec(l) || [])[1]))];
    add('F', 'lawHash film == still/node', !lh.length ? 'INCONCLUSIVE' : (lh.length === 1 && lh[0] === T.lawHash ? 'PASS' : 'FAIL'), 'film ' + lh.join(',') + ' node ' + T.lawHash + (bake.stillLawHash ? ' still ' + bake.stillLawHash : ''));
  }
  // frame luma + reuse (§FRAME_QA in-page; ffprobe on the file when present)
  if (!qa.length && !(bake.frames || []).length) add('F', 'frame luma (black/white/NaN)', 'INCONCLUSIVE', 'no §FRAME_QA and no ffprobe frames');
  else {
    const q = qa.map(l => ({ i: num(l, /i=(\d+)/), m: num(l, /lumaMean=(-?[\d.]+|NaN)/), err: /ERR/.test(l), re: num(l, /reused=(\d)/), cam: (/cam=(\[[^\]]*\])/.exec(l) || [])[1] }));
    const badQ = q.filter(x => x.err || x.m == null || !isFinite(x.m) || x.m < 5 || x.m > 250), badF = (bake.frames || []).filter(x => !isFinite(x.yavg) || x.yavg < 5 || x.yavg > 250);
    add('F', 'frame luma: none < 5 / > 250 / NaN', (badQ.length || badF.length) ? 'FAIL' : 'PASS', 'in-page ' + q.length + ' frames, flagged ' + badQ.slice(0, 5).map(x => 'i' + x.i + '=' + x.m).join(',') + ' | file ' + (bake.frames || []).length + ' frames, flagged ' + badF.slice(0, 5).map(x => 'i' + x.i + '=' + x.yavg).join(','));
    const H = fh.map(l => ({ i: num(l, /i=(\d+)/), sha: (/sha=(\w+)/.exec(l) || [])[1] })), camOf = {}; q.forEach(x => { camOf[x.i] = x; });
    const reuse = [], legit = []; for (let k = 1; k < H.length; k++) if (H[k].sha === H[k - 1].sha) { const x = camOf[H[k].i], y = camOf[H[k - 1].i]; if (x && x.re === 1) legit.push(H[k].i); else if (x && y && x.cam === y.cam) legit.push(H[k].i); else reuse.push(H[k].i); }
    const md = bake.frames || []; for (let k = 1; k < md.length; k++) if (md[k].md5 && md[k].md5 === md[k - 1].md5 && !legit.includes(md[k].i) && !reuse.includes(md[k].i)) { const x = camOf[md[k].i], y = camOf[md[k - 1].i]; if (!(x && y && x.cam === y.cam)) reuse.push(md[k].i); }
    add('F', 'no byte-identical consecutive frames while the camera moved', reuse.length ? 'FAIL' : 'PASS', 'unexpected reuse at ' + (reuse.slice(0, 8).join(',') || 'none') + '; intentional/static ' + legit.length);
  }
  // G2 film NO-OP vs control arms (luma per frame differs?)
  const lumaSeq = B => grepAll(sliceAfterPurge(B.lines || []).map(stripPrefix), /§FRAME_QA i=/).map(l => num(l, /lumaMean=([\d.]+)/));
  const same = (x, y) => x.length && x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 0.01);
  if (bake.arm === 'A' && ctl) {
    const cmp = (armK, id, onRe, offRe) => { const O = ctl[armK]; if (!O) { add('F-G2', id, 'INCONCLUSIVE', 'arm ' + armK + ' not run'); return; }
      const OL = sliceAfterPurge(O.lines).map(stripPrefix), onOk = grep1(L, onRe), offOk = grep1(OL, offRe), la = lumaSeq(bake), lo = lumaSeq(O);
      // coordinator 2026-09-27: a fixed 0.01 threshold passed a 0.28/255 difference. Noise baseline = a repeat bake A2 (same flags as A):
      // d = mean per-frame |A - arm|, noise = mean per-frame |A - A2|; PASS iff d > max(0.05, 2 x noise). Without A2: PASS only when
      // d > 1 code (beyond any bake noise seen), else INCONCLUSIVE (effect too small to judge without a baseline).
      const mad = (x, y) => (x.length && x.length === y.length) ? x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0) / x.length : null;
      const d = mad(la, lo), l2 = ctl.A2 ? lumaSeq(ctl.A2) : null, noise = l2 ? mad(la, l2) : null, tol = noise != null ? Math.max(0.05, 2 * noise) : null;
      const st = !onOk ? 'FAIL' : (!offOk ? 'FAIL' : (d == null ? 'INCONCLUSIVE' : (tol != null ? (d > tol ? 'PASS' : 'NO-OP') : (d > 1 ? 'PASS' : (same(la, lo) ? 'NO-OP' : 'INCONCLUSIVE')))));
      add('F-G2', id, st, (!onOk ? 'on line absent ' + onRe : !offOk ? 'off line absent in ' + armK + ' ' + offRe : 'mean luma A ' + (la.reduce((s, v) => s + v, 0) / (la.length || 1)).toFixed(2) + ' vs ' + armK + ' ' + (lo.reduce((s, v) => s + v, 0) / (lo.length || 1)).toFixed(2) +
        ' | d=' + (d != null ? d.toFixed(3) : '-') + (tol != null ? ' noise(A vs A2)=' + noise.toFixed(3) + ' tol=' + tol.toFixed(3) : ' (no A2 noise baseline: PASS needs d > 1 code)'))); };
    cmp('C', 'film exposure + fill law vs control (--film-exposure 0 --film-fill restore)', /§FILM_EXPOSURE f=0/, /§FILM_EXPOSURE off \(control/);
    cmp('E', 'film parity vs --film-parity 0', /§FILM_PARITY on/, /§CAM_LIGHT on/);
    cmp('T', 'film torch vs --url-query &torch=0', /§CAM_TORCH film on/, /§FILM_EXPOSURE f=0 .*torch=off/);
    const B = ctl.B || ctl.C, BL = B ? sliceAfterPurge(B.lines).map(stripPrefix) : null, lab = ctl.B ? 'base tree' : 'control C (same tree; overlays must not depend on fill/exposure)';
    const OV = /^(§CLASH_\w*|§MEASURE_\w*|§FINDINGS_\w*|§HUD_\w*|§CPE_REVEAL\w*|§CPE_TAIL\w*|§LOADPATH_\w*|§ROOM_TITLE\w*|§CAPTION\w*|§LABEL\w*|§FLYTHRU_\w*|§RULE_FINDINGS\w*|§BILLBOARD\w*|§STOREY_REVEAL\w*|§FILM_BOXES\w*)/;
    const EXCL = /^(§CLASH_MEM|§LOADPATH_PIXEL_DIAG\w*)/;
    const ov = X => X.filter(l => OV.test(l) && !EXCL.test(l)).map(l => l.replace(/\b(\w*[mM]s|msPerPair|secs?|t|elapsed|wall\w*|time)=[0-9.]+/g, '$1=_').replace(/in \d+ ?ms\b/g, 'in _ ms'));   // instrument (GPU run 2026-09-27): '§CLASH_RTREE ready … in 1085ms' (no space) was the only A-vs-B overlay difference
    if (!BL) add('F-G2', 'overlay identity', 'INCONCLUSIVE', 'no base/control log');
    else { const oa = ov(L), ob = ov(BL); add('F-G2', 'overlay identity vs ' + lab, !ob.length ? 'VACUOUS' : (JSON.stringify(oa) === JSON.stringify(ob) ? 'PASS' : 'FAIL'), 'lines A ' + oa.length + ' ref ' + ob.length + ' EXCLUDED: §CLASH_MEM (heap), §LOADPATH_PIXEL_DIAG* (scene pixels before the HUD: exposure-dependent); timings stripped (ms/secs/t/elapsed/time)'); }
  }
  return out;
}
// ── DEFECT 6: glass see-through (per Terminal press) + the one-tab SEQUENCE vs fresh-page presses (S4 carried state)
const GLASS = { minN: 10, inBandPct: 80 }, SEQB = { dp50: 5, dRatio: 0.1, dCompL: 8, dKeep: 4, heapSlope: 20, gpuSlope: 50, texGrow: 2 };
function g6(rec) {
  if (!/^tr\d|^term$/.test(rec.pose)) return [];
  const L = rec.lines || [], out = [];
  // ### ALTS-ALL FIX 9 (blocking): every glazing mesh §GLASS_FRESNEL staged must be left OUT of the GI geometry pass, else the composite
  // shades the pane as a solid wall ("alt-s makes them opaque"). Measured before the fix: 'glass skip: 0' at Terminal, 70 patched.
  const gf = grep1(L, /§GLASS_FRESNEL patched=/), gs = grepLast(L, /§GI_STILL glass skip: \d+/);
  const patched = gf ? Object.values(JSON.parse((/patched=(\{[^}]*\})/.exec(gf) || [, '{}'])[1])).reduce((a, b) => a + b, 0) : null, skip = num(gs, /glass skip: (\d+)/);
  out.push(row('G6', 'every staged glazing mesh left out of the GI geometry pass (glass skip >= §GLASS_FRESNEL patched)', patched == null || skip == null ? 'INCONCLUSIVE' : (patched === 0 ? 'VACUOUS' : (skip >= patched ? 'PASS' : 'FAIL')), 'glass skip ' + skip + ' vs patched ' + patched + (gs ? ' | ' + gs.replace(/^.*glass skip: /, '').slice(0, 90) : '')));
  const G = rec.glass;
  // ### ALTS-ALL FIX 14 (blocking): glass is not NaN-black on THIS press (fresh-page = first press): 0 NaN glass samples in the float probe
  // and < 20 % of glass samples black (<= 2 codes) in the app frame (pass 2: first press 14/14 black, NaN 7/14)
  if (G && !G.err && G.n >= GLASS.minN && G.nanN != null) out.push(row('G6', 'glass see-through on this press (no NaN glass samples, < 20 % black)', G.nanN === 0 && G.appBlackPct < 20 ? 'PASS' : 'FAIL', 'n=' + G.n + ' NaN ' + G.nanN + ' appBlack ' + G.appBlackPct + '% appL p50 ' + G.appL));
  else if (G && !G.err && G.n < GLASS.minN) out.push(row('G6', 'glass see-through on this press', 'INFO', 'n=' + G.n + ' < ' + GLASS.minN + ' glass samples in view — not judged here'));
  if (G && !G.err && G.n >= GLASS.minN) out.push(row('G6', 'glass pixels: composite vs app frame (informational)', 'INFO', 'n=' + G.n + ' keepAbs=' + G.keepAbs + ' bouncePct=' + G.bouncePct + '% (bounce shades the surface BEHIND the pane — legit) compL=' + G.compL + ' appL=' + G.appL + ' L_vis/L_hid p50 ' + G.ratioP50, { glassN: G.n }));
  return out;
}
function slope(ys) { const n = ys.length; if (n < 2) return null; const xm = (n - 1) / 2, ym = ys.reduce((a, b) => a + b, 0) / n; let nu = 0, de = 0; ys.forEach((y, i) => { nu += (i - xm) * (y - ym); de += (i - xm) * (i - xm); }); return de ? nu / de : null; }
function seqJudge(S, recs) {
  const out = [], P = (S && S.presses) || [], by = {}; P.forEach(r => { (by[r.pose] = by[r.pose] || []).push(r); });
  if (!P.length) return [row('G7', 'sequence', 'INCONCLUSIVE', 'no sequence presses' + (S && S.errors && S.errors.length ? ' ' + S.errors[0].slice(0, 100) : ''))];
  const errs = P.reduce((a, r) => a.concat(r.allocFail || []), []);
  out.push(row('G7', 'sequence: no allocation failure / OOM / page error in 12 presses', errs.length ? 'FAIL' : 'PASS', errs.length + (errs[0] ? ' e.g. ' + errs[0].slice(0, 120) : '')));
  Object.keys(by).forEach(pose => { const a = by[pose], r2 = a[a.length - 1], f = recs[pose + '|base'];
    if (!f || !f.eval || !f.eval.comp || !r2.eval || !r2.eval.comp) { out.push(row('G7', 'sequence ' + pose + ': 2nd-round press vs fresh page', 'INCONCLUSIVE', 'missing ' + (!f ? 'fresh press' : 'stats'))); return; }
    const dp = Math.abs(r2.eval.comp.p50 - f.eval.comp.p50), gOk = r2.glass && f.glass && r2.glass.n >= GLASS.minN && f.glass.n >= GLASS.minN;
    const dr = gOk && r2.glass.keepAbs == null ? Math.abs(r2.glass.ratioP50 - f.glass.ratioP50) : null, dc = gOk && r2.glass.compL != null && f.glass.compL != null ? Math.abs(r2.glass.compL - f.glass.compL) : null;
    const ok = dp <= SEQB.dp50 && (dr == null || dr <= SEQB.dRatio) && (dc == null || dc <= SEQB.dCompL);
    out.push(row('G7', 'sequence ' + pose + ': 2nd-round press (k=' + r2.k + ') vs fresh page', ok ? 'PASS' : 'FAIL', 'p50 ' + r2.eval.comp.p50 + ' vs ' + f.eval.comp.p50 + ' (1st round ' + (a[0].eval && a[0].eval.comp ? a[0].eval.comp.p50 : '-') + ')' + (gOk ? ' glass ratioP50 ' + r2.glass.ratioP50 + ' vs ' + f.glass.ratioP50 + ' compL ' + r2.glass.compL + ' vs ' + f.glass.compL : ' glass n ' + (r2.glass ? r2.glass.n : '-') + '/' + (f.glass ? f.glass.n : '-') + ' (not judged)') + ' meter ' + ((/EV100=(-?[\d.]+)/.exec(r2.meter || '') || [])[1] || '-') + ' vs ' + ((/EV100=(-?[\d.]+)/.exec(grepLast(f.lines, /§METER camera=/) || '') || [])[1] || '-'))); });
  const heap = P.map(r => r.mem && r.mem.heapMB).filter(v => v != null), gpu = P.map(r => r.gpu && r.gpu.pressPeakMB).filter(v => v != null), hs = slope(heap), gs = slope(gpu);
  const grow = Object.keys(by).map(pose => { const a = by[pose]; return a.length >= 2 && a[0].mem && a[a.length - 1].mem ? Math.max(a[a.length - 1].mem.textures - a[0].mem.textures, a[a.length - 1].mem.geometries - a[0].mem.geometries) : null; }).filter(v => v != null), gmax = grow.length ? Math.max(...grow) : null;
  out.push(row('G7', 'sequence: growth per press (heap <= ' + SEQB.heapSlope + ' MB, gpu-process <= ' + SEQB.gpuSlope + ' MiB, textures/geometries round2-round1 <= ' + SEQB.texGrow + ')',
    (hs == null || gs == null || gmax == null) ? 'INCONCLUSIVE' : (hs <= SEQB.heapSlope && gs <= SEQB.gpuSlope && gmax <= SEQB.texGrow ? 'PASS' : 'FAIL'),
    'heap slope ' + (hs != null ? hs.toFixed(1) : '-') + ' MB/press [' + heap.join(',') + '] gpu slope ' + (gs != null ? gs.toFixed(1) : '-') + ' MiB/press [' + gpu.join(',') + '] tex/geo growth max ' + gmax + ' clones [' + P.map(r => r.mem && r.mem.glassClones).join(',') + '] programs [' + P.map(r => r.mem && r.mem.programs).join(',') + ']'));
  return out;
}
function gate(rows) { if (!rows.length) return 'INCONCLUSIVE'; if (rows.some(r => r.state === 'INCONCLUSIVE')) return 'INCONCLUSIVE'; return rows.some(r => BLOCKING.has(r.state)) ? 'FAIL' : 'PASS'; }
module.exports = { FIXES, REFS, BAND, BLOCKING, g1, g2, g3, g4, g5, gz, g6, seqJudge, GLASS, SEQB, filmJudge, swRace, gate, grep1, grepAll, num, fe, sliceAfterPurge, stripPrefix };
