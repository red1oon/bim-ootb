#!/usr/bin/env node
/**
 * §FINDINGS_CEASE — DO THE MEASURE / SANITY / CLASH OVERLAYS ACTUALLY STOP?
 *
 * red1, 2026-09-20: "cease those overlays during ending orbit, as user has seen enough", from the
 * onset of the storey reveal. And, on this specific check: "WITNESS logging must be present for
 * those big request ie ceasing of M/C/S overlays during storey reveal start."
 *
 * WHY IT IS NOT A LIST CHECK. The first implementation named two layers of nine and was correct
 * only by luck: the stale "Floor area" box red1 chased all morning is `measure.box`, which was not
 * in that list and went quiet only because its source was cleared elsewhere. A list-based witness
 * cannot catch a tenth layer added later — which is exactly how §75 rotted into a half-applied fix.
 * So this witness DISCOVERS the layer names from cinema_maxq.js itself and runs the LIVE predicate
 * over every one of them. A layer added tomorrow is judged the day it is added.
 *
 * And the two flags that drive the gate are exercised, not read: cpe_storey_reveal.js is required
 * and driven across a real tNorm sweep, so "it is true for the rest of the film" is measured frame
 * by frame rather than asserted from the shape of an if.
 *
 * RUN: node viewer/tests/witness_findings_cease.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const mq = fs.readFileSync(path.join(ROOT, 'viewer/cinema_maxq.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, x) => { (c ? pass++ : fail++); console.log('  §CEASE ' + (c ? 'ok    ' : 'WRONG ') + n + (x ? '   ' + x : '')); };

// ── 1. THE PREDICATE, READ LIVE, APPLIED TO EVERY LAYER THE FILM ACTUALLY DRAWS ──────────────
const rxSrc = /var ESC_SUPPRESS_RX = (\/[^;]+\/);/.exec(mq);
ck('the gate is a PREDICATE, not a named list — a tenth layer is covered by decision, not accident',
   !!rxSrc, rxSrc ? rxSrc[1] : 'no ESC_SUPPRESS_RX found');
if (!rxSrc) { console.log('§FINDINGS_CEASE INCONCLUSIVE — no predicate to test'); process.exit(2); }
const RX = eval(rxSrc[1]);
const layers = Array.from(new Set(
  (mq.match(/_(?:drawUnlessHold|hudHold)\('([a-z0-9_.]+)'/g) || [])
    .map((m) => /'([a-z0-9_.]+)'/.exec(m)[1])));
ck('every layer the bake draws was discovered from the source, not typed here',
   layers.length >= 12, layers.length + ' layers: ' + layers.join(' '));
const mustCease = layers.filter((n) => /^(measure|clash)\./.test(n));
const mustStay = layers.filter((n) => !/^(measure|clash)\./.test(n));
ck('EVERY measure.* and clash.* layer is ceased — all ' + mustCease.length + ' of them',
   mustCease.length >= 9 && mustCease.every((n) => RX.test(n)),
   mustCease.filter((n) => !RX.test(n)).join(',') || mustCease.join(' '));
ck('…including measure.box, the stale "Floor area" panel red1 chased — it was NOT in the old list',
   mustCease.indexOf('measure.box') >= 0 && RX.test('measure.box'));
ck('and NOTHING else is ceased — the sun clock, the compass, the day counter, the pie, the panels stay',
   mustStay.every((n) => !RX.test(n)),
   mustStay.filter((n) => RX.test(n)).join(',') || mustStay.join(' '));

// ── 1b. THE OTHER HALF — WHAT THE BEATS DRAW **ON THE BUILDING** ─────────────────────────────
// red1 after the 12:25 clip: "Make the overlay shine thru of beams cease then. They are showing
// and disturbing the scene which now has other new stuff to do."
// The 2D gate above said §FINDINGS_CEASE layer=measure.datum and meant it — while flythruDatumAt
// kept setting `_grp.visible` from its own life curve every frame, so the datum's depthTest:false
// uprights and storey bands shone through the building to the final frame. The chips ceasing made
// that MORE obvious, not less: the geometry was left with nothing on screen to explain it.
// DISCOVERED, NOT LISTED. Every measure-family module is scanned for the group it adds to the
// scene, and each one found must be in the cease set — so a fifth beat is caught the day it lands
// rather than the next time somebody watches a clip.
{
  const MEASURE_MODULES = fs.readdirSync(path.join(ROOT, 'viewer'))
    .filter((f) => /^cpe_(flythru_|indoor_beats|slab_beat|linear_beat)/.test(f) && f.endsWith('.js'));
  const found = [];
  MEASURE_MODULES.forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, 'viewer', f), 'utf8');
    if (!/A\.scene\.add\(/.test(src)) return;                      // no scene geometry, nothing to cease
    const m = src.match(/_gr(?:p|oup)\.name = '([A-Za-z0-9_]+)'/);
    found.push({ file: f, name: m ? m[1] : null });
  });
  const setM = /var CEASE_3D_GROUPS = \[([^\]]*)\]/.exec(mq);
  const SET = setM ? setM[1].split(',').map((x) => x.trim().replace(/'/g, '')) : [];
  ck('every measure beat that puts geometry in the SCENE was discovered, not typed here',
     found.length >= 4, found.map((f) => f.file + '->' + f.name).join(' '));
  ck('…and every one of them names its group, so the gate can find it',
     found.every((f) => !!f.name), found.filter((f) => !f.name).map((f) => f.file).join(',') || 'all named');
  ck('…and every one is in CEASE_3D_GROUPS — a fifth beat fails HERE, not in a clip',
     found.every((f) => SET.indexOf(f.name) >= 0),
     'set=[' + SET.join(' ') + ']  missing=' + (found.filter((f) => SET.indexOf(f.name) < 0).map((f) => f.name).join(',') || 'none'));
  ck('the gate HIDES rather than disposes — the beat comes straight back if the rule ever lifts',
     /o\.visible = false;/.test(mq) && !/CEASE_3D[\s\S]{0,600}dispose\(/.test(mq),
     'same non-destructive shape clashFilm.setVisible already uses');
  // ── ARM 2, added 2026-09-20. ISSUE: red1 watched a clip that CONTAINED the four-name gate and
  // said "the glow thru beams still persists!". A list of four can never catch the fifth, and his
  // ruling on going and measuring it instead was "why such measures? It is GIGO.. if u dont stop
  // the code from emitting." So the second arm is the DRAW CONTRACT itself: anything in the scene
  // still drawing with depthTest:false once the closing beats open is switched off, whoever added
  // it. These claims prove the arm exists, that it is a predicate and not another list, and that
  // it cannot switch off the beat that is actually on screen.
  const ceaseFn = (mq.match(/function _cease3D\(\) \{[\s\S]*?\n  \}/) || [''])[0];
  ck('ARM 2 exists: the gate also sweeps by the draw contract, not only by name',
     /function _ceaseShinesThrough\(o\)/.test(mq) &&
     /depthTest === false/.test(mq) &&
     /traverseVisible/.test(ceaseFn) && /o\.visible = false;/.test(ceaseFn),
     ceaseFn ? '_cease3D is ' + ceaseFn.split('\n').length + ' lines and sweeps scene.traverseVisible' : 'NOT FOUND');
  const shinesFn = (mq.match(/function _ceaseShinesThrough\(o\) \{[\s\S]*?\n  \}/) || [''])[0];
  ck('…and arm 2 judges by the MATERIAL alone — not one module name appears in its test',
     /depthTest === false/.test(shinesFn) && !/'/.test(shinesFn) && !/indexOf\(/.test(shinesFn),
     shinesFn ? '_ceaseShinesThrough is ' + shinesFn.split('\n').length + ' lines and carries no string literal' : 'NOT FOUND');
  // The one exemption. A blind sweep would switch off the escape route's own room glow, which is
  // depthTest:false BY DESIGN — cpe_escape_route.js §ESCAPE_ROUTE_NO_XRAY depends on it reading
  // through the building. Exactly one exemption, and it must be that beat's.
  const esc = fs.readFileSync(path.join(ROOT, 'viewer/cpe_escape_route.js'), 'utf8');
  const exRx = /var CEASE_3D_EXEMPT_RX = \/\^([A-Za-z0-9_]+)\//.exec(mq);
  const escNames = (esc.match(/\.name = '(escapeRoute[A-Za-z0-9_]*)'/g) || []);
  ck('exactly ONE exemption exists, and it is the beat that is actually on screen',
     !!exRx && (mq.match(/CEASE_3D_EXEMPT_RX = /g) || []).length === 1 &&
     escNames.length >= 2 && escNames.every((n) => n.indexOf(exRx[1]) > 0),
     'exempt=/^' + (exRx ? exRx[1] : '?') + '/  named in cpe_escape_route.js: ' +
     (escNames.join(' ') || 'NONE — the sweep would switch the room glow off'));
  ck('…and the glow it exempts really is drawn depthTest:false, so the exemption is load-bearing',
     /depthTest: false[\s\S]{0,400}name = 'escapeRouteGlow'/.test(esc) ||
     /name = 'escapeRouteGlow'[\s\S]{0,400}depthTest: false/.test(esc),
     'without it the sweep would hide the escape beat\'s own room boxes');
  ck('…it runs AFTER every beat writes its own visibility, and before the capture',
     /_cease3D\(\);\s*\n\s*var _escInfo = null/.test(mq),
     'last word on what reaches the frame is the cease rule\'s');
  ck('…and it does not log once per frame — one line per CHANGE, or a 193-frame run drowns',
     /if \(!fresh\.length && !keptFirst\) return;/.test(ceaseFn),
     'steady state is silent');
  // ── §FILM_LAYER — THE MECHANISM ITSELF (red1: "it be good to control each layer thru a proper
  //    mechanism"). ISSUE: a layer used to have two unrelated switches — `_drawUnlessHold(name)`
  //    for its chip and its own life curve for its geometry — so it could half-cease and the log
  //    would still read clean. These claims prove there is now ONE switch per layer, that the
  //    beats are actually wired to it, and that the name it registers under is the SAME name its
  //    2D half draws under (a different name would be a second switch wearing a disguise).
  const drawNames = (mq.match(/_drawUnlessHold\('([a-z.]+)'/g) || []).map((x) => x.replace(/.*'([a-z.]+)'/, '$1'));
  ck('§FILM_LAYER exists and only ever SUPPRESSES — a beat still owns when it APPEARS',
     /function _filmLayerRegister\(name, obj\)/.test(mq) &&
     /A\.filmLayer = _filmLayerRegister;/.test(mq) &&
     /function _ceaseRegistered\(\)/.test(mq) &&
     !/_ceaseRegistered[\s\S]{0,700}visible = true/.test(mq),
     'the registry writes visible=false and never true');
  // ⚠ WHERE it is attached is load-bearing, not style. cinema_maxq.js is a bare IIFE with no `A`
  // at its top level; `A.filmLayer = ...` written THERE throws at module load, the module never
  // finishes, and the bake parks at §IDLE_GATE with no error naming the cause. It happened on
  // 2026-09-20 and cost a bake. witness_module_loads.js is the general guard; this is the local one.
  ck('…and it is attached where `A` actually exists, not at the module\'s IIFE scope',
     /A\._flythruDatumOn = !!_measure;\s*\n\s*A\.filmLayer = _filmLayerRegister;/.test(mq) &&
     !/^\s{2}A\.filmLayer\s*=/m.test(mq) && !/^\s{2}A\._filmLayers\s*=/m.test(mq),
     'an undeclared read at IIFE scope is valid syntax — node --check cannot see it');
  ck('…and the gate consults the registry FIRST, before either safety net',
     /hidNow \+= _ceaseRegistered\(\);[\s\S]{0,400}CEASE_3D_GROUPS\[g\]/.test(mq),
     'arm 0 is the mechanism; arms 1 and 2 are the net');
  {
    const REG = {};
    ['cpe_flythru_datum.js', 'cpe_flythru_cues.js', 'cpe_indoor_beats.js', 'cpe_slab_beat.js', 'clash_film.js']
      .forEach((f) => {
        const src = fs.readFileSync(path.join(ROOT, 'viewer', f), 'utf8');
        const m = src.match(/A\.filmLayer\('([a-z.]+)'/g) || [];
        REG[f] = m.map((x) => x.replace(/.*'([a-z.]+)'/, '$1'));
      });
    const files = Object.keys(REG);
    ck('every beat that puts geometry in the scene is WIRED to its own layer switch',
       files.every((f) => REG[f].length > 0),
       files.map((f) => f.replace('.js', '') + '->' + (REG[f].join(',') || 'NOT WIRED')).join('  '));
    const allReg = files.reduce((a, f) => a.concat(REG[f]), []);
    ck('…under the SAME name its 2D half draws under — one name, one switch, both halves',
       allReg.every((n) => drawNames.indexOf(n) >= 0),
       'registered=[' + allReg.join(' ') + ']  unknown=' +
       (allReg.filter((n) => drawNames.indexOf(n) < 0).join(',') || 'none'));
    ck('…and every registered name is one the cease rule actually governs',
       allReg.every((n) => RX.test(n)),
       allReg.filter((n) => !RX.test(n)).join(',') || 'all governed by /^(measure\\.|clash\\.)/');
  }
  ck('an offender the NET catches is reported as UNREGISTERED, with enough to identify it',
     /UNREGISTERED/.test(mq) && /renderOrder=/.test(ceaseFn) && /unregistered=/.test(mq),
     'the sweep line carries the ancestor chain, renderOrder and material colour');
  ck('…and the bake SAYS which group it hid',
     /§FINDINGS_CEASE_3D group="/.test(mq) &&
     /FINDINGS_CEASE_3D/.test(fs.readFileSync(path.join(ROOT, 'cli_silent_bake.js'), 'utf8')));
}

// ── 2. THE TRIGGER, DRIVEN FRAME BY FRAME ────────────────────────────────────────────────────
global.THREE = { Color: class { constructor(h) { this.h = h >>> 0; } setHex(h) { this.h = h >>> 0; return this; } getHex() { return this.h; } } };
global.window = global.window || {};
const setupCpeStoreyReveal = require(path.join(ROOT, 'viewer/cpe_storey_reveal.js'));
function sweep(storeyOn) {
  const A = { activeBuilding: 'W', _metaGen: 0, dbQuery: () => [], collectMeshes: () => [] };
  setupCpeStoreyReveal(A);
  const plan = { durationSec: 195.8, beats: { rise: 0.9590 },
                 storeyReveal: { on: storeyOn, windowFrac: 0.1245 } };
  const out = [];
  const _log = console.log; console.log = () => {};
  for (let k = 0; k <= 2000; k++) {
    const tn = k / 2000;
    try { A.storeyRevealApplyVisual(plan, tn); } catch (e) { /* tint/markers need a scene; the flag does not */ }
    out.push({ tn, sec: tn * plan.durationSec, on: !!A._findingsHudSuppress });
  }
  console.log = _log;
  return { plan, out };
}
{
  const { plan, out } = sweep(true);
  const first = out.find((r) => r.on);
  const revealStartSec = (plan.beats.rise - plan.storeyReveal.windowFrac) * plan.durationSec;
  ck('WITH the storey reveal on: the cease begins ~2 s BEFORE the reveal opens',
     !!first && Math.abs((revealStartSec - first.sec) - 2) < 0.3,
     first ? 'cease at ' + first.sec.toFixed(1) + 's, reveal opens ' + revealStartSec.toFixed(1) + 's' : 'never ceased');
  // ONE-SIDED: _storeyRevealArmed ends at beats.rise and the escape window does not open until
  // ~0.965, so a two-sided test would let every chip flash back on for the ~1.2 s between beats.
  const gap = out.filter((r) => first && r.tn > first.tn && !r.on);
  ck('…and it NEVER lifts again — no gap between the reveal and the escape beat',
     gap.length === 0, gap.length ? gap.length + ' frames un-ceased, first at ' + gap[0].sec.toFixed(1) + 's' : 'held to the final frame');
}
{
  const { plan, out } = sweep(false);
  const first = out.find((r) => r.on);
  const orbitSec = plan.beats.rise * plan.durationSec;
  ck('WITHOUT a storey reveal: they get a 2 s tail from the closing orbit, and no more',
     !!first && Math.abs((first.sec - orbitSec) - 2) < 0.3,
     first ? 'orbit ' + orbitSec.toFixed(1) + 's, cease at ' + first.sec.toFixed(1) + 's' : 'never ceased');
  ck('…and that bound exists in CODE, not by accident on a film that happens to have the reveal on',
     /FINDINGS_OFF_TAIL_SEC/.test(fs.readFileSync(path.join(ROOT, 'viewer/cpe_storey_reveal.js'), 'utf8')));
}

// ── 3. THE BAKE ITSELF SAYS SO ───────────────────────────────────────────────────────────────
// A gate that is only provable by this file is not provable from the film that shipped.
ck('the bake logs §FINDINGS_CEASE per layer, naming the layer and which trigger fired',
   /§FINDINGS_CEASE layer=/.test(mq) && /trigger=/.test(mq) &&
   /storey-reveal-onset/.test(mq) && /escape-route-window/.test(mq));
ck('…and the CLI relays it, so it reaches out\\/<db>.log and not only the firehose',
   /FINDINGS_CEASE/.test(fs.readFileSync(path.join(ROOT, 'cli_silent_bake.js'), 'utf8')));

console.log('§FINDINGS_CEASE ' + (fail ? 'FAIL' : 'PASS') + ' pass=' + pass + ' fail=' + fail +
  ' layers=' + layers.length);
process.exit(fail ? 1 : 0);
