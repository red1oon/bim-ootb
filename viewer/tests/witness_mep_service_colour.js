// ⚠ DO NOT REMOVE — Scope guard
// W-MEP-SERVICE-COLOUR — bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §MEP_SERVICE_COLOUR. Read the log after every run.
//
// THE ISSUE THIS TEST EXPOSES. red1 2026-10-01: MEP colours are "cartoonish" (a green duct on HHS). Cause: §MEP_COLOR_SURVIVES_PHOTOREAL
// painted colourless MEP with the HUD palette A.DISC_COLORS (HHS: every one of its 3,390 colourless MEP elements -> 0x44cc44 green).
// The fix paints by SERVICE with BS 1710 identification colours (RAL 3000 fire red, RAL 6010 water green, RAL 9005 drainage black),
// ducts bare galvanised, and leaves anything with no known service on its class material.
// WHAT IT MUST PROVE, each able to fail on its own:
//   G1 no HUD green left on HHS (albedo == DISC_COLORS.MEP count 0) and its ducts are galvanised grey.
//   G2 Hospital FP pipes are fire red and PLB pipes water green, counts = the DB census of that population.
//   G3 Terminal (authored materials) stays untouched: 0 elements painted.
//   G4 RED CONTROL: &mephue=disc (A._mepHueDisc = true) must bring the HHS green back — else G1 proves nothing.
// Runs the SHIPPED owner (A._mepDiscAlbedo) in a headless page over the real elements_meta rows; no render, no GPU.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const LOGF = path.join(__dirname, 'witness_mep_service_colour.log');
const log = []; let fails = 0, judged = 0;
const S = m => { log.push(m); console.log(m); };
const V = (ok, l, d) => { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + l + (d ? ' — ' + d : '')); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); });
const rows = f => cp.execFileSync('sqlite3', ['-json', path.join(ROOT, 'buildings', f),
  "SELECT ifc_class c, discipline d, material_rgba r, material_name m, element_name n FROM elements_meta"], { maxBuffer: 1 << 30 }).toString();
const BLD = { HHS: 'HHS_Office_Federated_extracted.db', Hospital: 'Hospital_extracted.db', Terminal: 'Terminal_extracted.db', Clinic: 'Clinic_extracted.db' };

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  S('── W-MEP-SERVICE-COLOUR ──');
  await page.goto('http://127.0.0.1:' + server.address().port + '/viewer/viewer.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
  let ok = false; for (let i = 0; i < 120 && !ok; i++) { await page.waitForTimeout(500); ok = await page.evaluate(() => !!(window.APP && window.APP._mepDiscAlbedo && window.APP._mepServiceColour)).catch(() => false); }
  if (!ok) { S('   INCONCLUSIVE — owner A._mepDiscAlbedo / A._mepServiceColour not published'); S('══ VERDICT: INCONCLUSIVE ══'); fs.writeFileSync(LOGF, log.join('\n') + '\n'); process.exit(1); }
  const tally = async (key, disc) => page.evaluate(([R, disc]) => {
    const A = window.APP; A._mepHueDisc = disc; const out = { pop: 0, painted: 0, codes: {}, green: 0, fpPipeRed: 0, plbPipeGreen: 0, ductGrey: 0, ductNames: 0, fpPipeT2: 0, plbPipeT2: 0, t2: 0 };
    const G = A.DISC_COLORS.MEP, gr = ((G >> 16) & 255) / 255, gg = ((G >> 8) & 255) / 255, gb = (G & 255) / 255;
    out.proxy = { nocol: 0, equip: 0, steel: 0, porcelain: 0, teal: 0 };
    for (const e of R) {
      if (e.c === 'IfcBuildingElementProxy' && !A._isAuthoredMatName(e.m || '') && (!e.r || A._isExporterPlaceholder(e.r, e.m || ''))) {
        out.proxy.nocol++; const v = A._elementVariant(e.c, e.n, e.m || '');
        if (v === 'proxy:equip') out.proxy.equip++; else if (v === 'proxy:steel') out.proxy.steel++; else if (v === 'porcelain') out.proxy.porcelain++; else if (!v) out.proxy.teal++; }
      if (!A._mepHueEligible(e.c, e.d || '', e.r, e.m || '')) continue;
      if (A._proxyVariant(e.c, e.n, e.m || '')) continue;   // §PROXY_NAME_MAT wins over the MEP rule (_getMaterial passes no albedo to it)
      out.pop++;
      let r0 = 0.7, g0 = 0.7, b0 = 0.7; if (e.r && e.r.indexOf(',') >= 0) { const p = e.r.split(',').map(Number); r0 = p[0]; g0 = p[1]; b0 = p[2]; }
      const a = A._mepDiscAlbedo(r0, g0, b0, e.r, e.c, e.d || '', A._mepNameHint(e.n), e.m || '');
      if (/duct/i.test(e.n || '')) out.ductNames++;
      // the tier-2 population, judged by the tier OWNERS (authored name 1a, own hue 1b), not by the paint rule under test
      const t2 = !A._isAuthoredMatName(e.m || '') && !(A._chromaOf(e.r) !== null && A._chromaOf(e.r) >= A.MEP_HUE_ACHROMATIC_MAX);
      if (t2) { out.t2++; if (/^IfcPipe/.test(e.c) && e.d === 'FP') out.fpPipeT2++; if (/^IfcPipe/.test(e.c) && e.d === 'PLB' && !/dwv|sanitary/i.test(e.n || '')) out.plbPipeT2++; }
      if (!a) continue; out.painted++; out.codes[a.code] = (out.codes[a.code] || 0) + 1;
      if (Math.abs(a.r - gr) < 1e-6 && Math.abs(a.g - gg) < 1e-6 && Math.abs(a.b - gb) < 1e-6) out.green++;
      const pipe = /^IfcPipe/.test(e.c);
      if (pipe && e.d === 'FP' && (a.code === 'FP' || a.code === 'FP_FIT')) out.fpPipeRed++;
      if (pipe && e.d === 'PLB' && (a.code === 'WATER' || a.code === 'WATER_FIT')) out.plbPipeGreen++;
      if (/duct/i.test(e.n || '') && a.code === 'DUCT') out.ductGrey++;
    }
    A._mepHueDisc = false; return out; }, [JSON.parse(rows(BLD[key]) || '[]'), disc]);
  const T = {};
  for (const k of Object.keys(BLD)) { T[k] = await tally(k, false); S('   §MEP_SERVICE_COLOUR bld=' + k + ' ' + JSON.stringify(T[k])); }
  const vac = Object.keys(T).filter(k => k !== 'Terminal' && T[k].pop === 0);
  V(vac.length === 0, 'population judged on every building', vac.length ? 'VACUOUS: ' + vac.join(',') : '');
  V(T.HHS.green === 0 && T.HHS.ductNames > 0 && T.HHS.ductGrey === T.HHS.ductNames, 'G1 HHS: no HUD green, every named duct galvanised grey',
    'green=' + T.HHS.green + ' ducts ' + T.HHS.ductGrey + '/' + T.HHS.ductNames);
  V(T.Hospital.fpPipeT2 > 0 && T.Hospital.fpPipeRed === T.Hospital.fpPipeT2, 'G2a Hospital FP pipes with no colour of their own ALL painted fire (red segments / orange fittings; own-hue fittings stay theirs)', T.Hospital.fpPipeRed + ' / ' + T.Hospital.fpPipeT2);
  V(T.Hospital.plbPipeT2 > 0 && T.Hospital.plbPipeGreen === T.Hospital.plbPipeT2, 'G2b Hospital PLB supply pipes ALL water-painted (green segments / galvanised fittings; DWV/sanitary -> drainage black)', T.Hospital.plbPipeGreen + ' / ' + T.Hospital.plbPipeT2 + ', drain=' + (T.Hospital.codes.DRAIN || 0));
  V(T.Terminal.painted === (T.Terminal.codes.DUCT || 0) && T.Terminal.painted <= T.Terminal.t2 && T.Terminal.pop - T.Terminal.t2 > 0, 'G3 Terminal: only its colourless ducts painted (galvanised); every authored element untouched', 'painted=' + T.Terminal.painted + ' tier2=' + T.Terminal.t2 + ' authored/own-hue=' + (T.Terminal.pop - T.Terminal.t2));
  V((T.Hospital.codes.FP || 0) > 0 && (T.Hospital.codes.FP_FIT || 0) > 0 && (T.Hospital.codes.SPRINKLER || 0) > 0, 'G5 parts distinguishable on the fire line: red segments, orange fittings, brass heads all present',
    'FP=' + (T.Hospital.codes.FP || 0) + ' FP_FIT=' + (T.Hospital.codes.FP_FIT || 0) + ' SPRINKLER=' + (T.Hospital.codes.SPRINKLER || 0) + ' | HHS SPRINKLER=' + (T.HHS.codes.SPRINKLER || 0));
  const hp = T.HHS.proxy;
  V(hp.nocol > 0 && hp.equip >= 43 + 24 + 54 + 4 && hp.steel >= 81 && hp.teal < hp.nocol * 0.1, 'G6 P1 HHS colourless proxies take their name material (equip RAL 7035 / steel / ceramic), teal only when unmatched',
    JSON.stringify(hp));
  V((T.HHS.codes.LUMINAIRE || 0) > 0 && (T.Hospital.codes.LUMINAIRE || 0) > 0, 'G7 P2 light housings RAL 9016 white (HHS pendants/recessed, Hospital IfcLightFixture)',
    'HHS=' + (T.HHS.codes.LUMINAIRE || 0) + ' Hospital=' + (T.Hospital.codes.LUMINAIRE || 0) + ' Clinic=' + (T.Clinic.codes.LUMINAIRE || 0));
  Object.keys(T).forEach(k => S('   no-own-colour share bld=' + k + ' MEP tier2=' + T[k].t2 + '/' + T[k].pop + ' = ' + (T[k].pop ? (100 * T[k].t2 / T[k].pop).toFixed(1) : '-') + ' %'));
  const red = await tally('HHS', true);
  S('   RED CONTROL (&mephue=disc) HHS ' + JSON.stringify(red));
  V(red.green > 0, 'G4 RED CONTROL: the 09-02 HUD palette brings the green back (G1 can fail)', 'green=' + red.green);
  S('\n══ VERDICT: ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL ' + fails + '/' + judged : 'PASS ' + judged + '/' + judged) + ' ══');
  fs.writeFileSync(LOGF, log.join('\n') + '\n');
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})().catch(e => { S('ERROR ' + e.message); fs.writeFileSync(LOGF, log.join('\n') + '\n'); process.exit(2); });
