// ⚠ DO NOT REMOVE — Scope guard
// W-CPE-MATERIAL-KEY — bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_MATERIAL_KEY
//
// THE ISSUE THIS TEST EXPOSES: viewer/streaming.js chose an element's triplanar photo texture from
// `TRIPLANAR_MAT[ifc_class]` ALONE. Terminal carries a real authored IFC material name on
// 48,428/48,428 of its elements (41 distinct) and NONE of it reached that decision. Same defect
// family as §GLASS_NOT_METAL (2026-08-30), which fixed the *alpha* half of "class alone decides".
//
// WHAT IT MUST PROVE, and what it must refuse to call a pass:
//   1. Terminal GAINS: how many distinct material_name values now resolve a texture by NAME, and
//      how many elements they cover — counted, not asserted by eye.
//   2. Hospital and Clinic are UNCHANGED, element for element, over 100% of their elements — the
//      texture each one resolves to before (class-only) equals the texture after (name-first).
//   3. The ROW SHAPE did not move: slots 0-15 of the stream row are byte-identical to the pre-change
//      query on all three buildings (§BBOX_ROW_SHIFT reads bbox at 13-15 and a shift there silently
//      squashes every placeholder), and material_name lands at the new fixed slot 16.
//   4. THE TRAP: `Basic Wall:A_Wall_Ext_150mm_BrickPlaster_V1` is a Revit wall-TYPE name that has
//      leaked onto 7,387 hosted non-wall elements (IfcPipeFitting 4,243, IfcDuctFitting 713 …).
//      Keying it to plaster would strip the metal texture §TRIPLANAR_MEP_GAPS deliberately gave that
//      MEP. It must stay class-resolved.
//   5. `≈ `-prefixed names (Hospital 6,664/6,664, Clinic 16,071/16,071, HHS 2,388/2,388) are
//      SYNTHETIC colour approximations, not authored materials. None may ever key a texture.
//   6. The live render path really consults the new key — a material built by the real streaming
//      run must carry userData._triSrc === 'name'.
//   7. The §SUNGLASS palette was OFF while measuring. §SUNGLASS_TRIPLANAR_TINT (concurrent palette
//      lane, measured 2026-09-01) found material.clone() in _recolorMesh DROPS the triplanar
//      onBeforeCompile hook on 347/347 sampled originals — an ACTIVE palette REPLACES the texture
//      with a flat colour rather than tinting it, which could score this fix a false no-op.
//
// SELF-FAILURE (PRIMAL LAW 4): the run prints NO-OP when no element resolved by name, VACUOUS when
// a building's population was empty, and INCONCLUSIVE — never PASS — when nothing was judged. The
// witness_kit contract's redControl proves the invariants can actually fail.
//
// §-log first — READ tests/witness_cpe_material_key_2026-09-01.log before any conclusion.
// Run:  timeout 2400 node viewer/tests/witness_cpe_material_key_2026-09-01.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const { Witness } = require(require('path').join(__dirname, '..', '..', 'witness_kit', 'contract.js'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA_ROOT = '/home/red1/bim-ootb';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream',
  '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm', '.bin':'application/octet-stream', '.jpg':'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  const send = b => { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); };
  fs.readFile(path.join(ROOT, p), (e, b) => { if (!e) return send(b);
    fs.readFile(path.join(DATA_ROOT, p), (e2, b2) => { if (!e2) return send(b2); res.writeHead(404); res.end('404 ' + p); }); });
});
const LOGF = path.join(__dirname, 'witness_cpe_material_key_2026-09-01.log');
const log = []; let fails = 0;
const S = m => { log.push(m); console.log(m); };
const V = (ok, l, d) => { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + l + (d ? ' — ' + d : '')); };
const save = () => fs.writeFileSync(LOGF, log.join('\n') + '\n');

// The three texture sets that EXIST in viewer/textures/materials/. Nothing else may be resolved.
const TEX_ON_DISK = ['concrete_color_1k.jpg', 'plaster_color_1k.jpg', 'metal_color_1k.jpg']
  .filter(f => fs.existsSync(path.join(ROOT, 'viewer', 'textures', 'materials', f)))
  .map(f => 'textures/materials/' + f);

const BUILDINGS = [
  { key: 'Terminal', meta: '/buildings/Terminal_meta.db', expectChange: true },
  { key: 'Hospital', meta: '/buildings/Hospital_meta.db', expectChange: false },
  { key: 'Clinic',   meta: '/buildings/Clinic_meta.db',   expectChange: false }
];

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=8192'] });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const con = [];
  page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) con.push(t); });

  S('── W-CPE-MATERIAL-KEY — witness_cpe_material_key_2026-09-01 ──');
  S('   ISSUE: does the element\'s own authored material_name decide its triplanar texture,');
  S('          and does keying on it leave the buildings that have no such names untouched?');
  S('   textures that exist on disk: ' + JSON.stringify(TEX_ON_DISK));
  V(TEX_ON_DISK.length === 3, 'all three shipped triplanar texture sets are present on disk',
    TEX_ON_DISK.length + '/3');

  // ── Load Terminal for real. This is the ONLY full stream: it is the building that gains, and it
  // is where the live render path (Tier B) is observed. Hospital/Clinic are judged over 100% of
  // their elements by Tier A below, which is stronger than a partial stream, not weaker.
  S('\n── Tier B · live render path, Terminal streamed for real ──');
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/Terminal_extracted.db',
    { waitUntil: 'domcontentloaded', timeout: 300000 });
  let ready = false;
  for (let i = 0; i < 1500 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && window.APP.streaming === false
      && Object.keys(window.APP.guidMap || {}).length > 0)); }
  S('   load+stream wall clock = ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  V(ready, 'Terminal loaded and finished streaming');

  let live = null;
  if (ready) {
    live = await page.evaluate(() => {
      const A = window.APP;
      const mats = Object.keys(A._matCache || {}).map(k => ({ k,
        src: A._matCache[k].userData ? A._matCache[k].userData._triSrc : undefined,
        tex: A._matCache[k].userData ? A._matCache[k].userData._triTex : undefined,
        name: A._matCache[k].userData ? A._matCache[k].userData._matName : undefined }));
      return { mats, streamed: A.streamedCount || 0, rowLen: (A.streamQueue && A.streamQueue[0]) ? A.streamQueue[0].length : 0,
               palTick: A._ambienceTick || 0, palMeshes: (A._sunglassBackups && A._sunglassBackups.length) || 0 };
    });
    const byName = live.mats.filter(m => m.src === 'name');
    const byClass = live.mats.filter(m => m.src === 'class');
    S('   materials in _matCache = ' + live.mats.length + '  (src=name ' + byName.length +
      ', src=class ' + byClass.length + ', src=none ' + live.mats.filter(m => m.src === 'none').length +
      ', src=alpha-none ' + live.mats.filter(m => m.src === 'alpha-none').length + ')');
    byName.slice(0, 8).forEach(m => S('       by-name material: name="' + m.name + '" tex=' + m.tex));
    V(live.mats.length > 0, 'the live run really built materials (not vacuous)', 'n=' + live.mats.length);
    V(live.rowLen === 17, 'stream row is the new 17-slot shape (material_name at fixed slot 16)',
      'len=' + live.rowLen);
    V(byName.length > 0, 'THE FIX IS LIVE: at least one material on the real render path was decided by material_name',
      byName.length + ' of ' + live.mats.length + ' materials' + (byName.length === 0 ? ' — NO-OP' : ''));
    V(live.mats.every(m => m.src !== undefined), 'every cached material records WHICH key decided it');
    // §SUNGLASS_TRIPLANAR_TINT (concurrent palette lane, measured 2026-09-01): _recolorMesh's
    // material.clone() DROPS the triplanar onBeforeCompile hook, so an ACTIVE palette REPLACES the
    // texture with a flat colour instead of tinting it. A palette left on during this run would make
    // the screen disagree with the resolver and could score this fix a false no-op — so the palette
    // state is asserted OFF, not assumed off.
    S('   §MATKEY_PALETTE_STATE tick=' + live.palTick + ' recoloured_meshes=' + live.palMeshes +
      (live.palTick === 0 ? '  (Off — resolved texture is what is on screen)' : '  ⚠ ACTIVE'));
    V(live.palTick === 0 && live.palMeshes === 0,
      'the §SUNGLASS palette was OFF for this measurement (an active palette REPLACES the triplanar texture, §SUNGLASS_TRIPLANAR_TINT)',
      'tick=' + live.palTick + ' recoloured=' + live.palMeshes);
  } else {
    S('   ⚠ Tier B INCONCLUSIVE — Terminal never finished streaming, nothing was judged on the live path');
  }

  const tally = con.filter(t => t.indexOf('§TRI_SRC_TALLY') === 0);
  const tallyNames = con.filter(t => t.indexOf('§TRI_SRC_NAME') === 0);
  S('\n   [shipped §-log, primary evidence]');
  con.filter(t => /§MATNAME_COL|§TRI_SRC_TALLY/.test(t)).forEach(t => S('       ' + t));
  tallyNames.slice(0, 12).forEach(t => S('       ' + t));
  V(tally.length > 0, 'the shipped §TRI_SRC_TALLY rollup fired on stream-complete', tally.length + ' line(s)');
  const tallyByName = tally.length ? Number((tally[0].match(/by_name=(\d+)/) || [0, -1])[1]) : -1;

  // ── Tier A · the full-fleet resolution A/B, over 100% of elements, using the SHIPPED resolver ──
  S('\n── Tier A · resolution A/B over every element of Terminal / Hospital / Clinic ──');
  S('   before = TRIPLANAR_MAT[ifc_class] (the pre-change rule), after = A._triResolve (shipped).');
  const rows = [];
  const perBld = {};
  for (const b of BUILDINGS) {
    const r = await page.evaluate(async (arg) => {
      const A = window.APP;
      // Publish the maps by asking the SHIPPED factory for one material — never a copy of the rule.
      A._getMaterial('0.5,0.5,0.5', 'IfcWall', '', '', null, '');
      if (!A._TRIPLANAR_MAT || !A._TRIPLANAR_BY_NAME) return { err: 'maps-not-published' };
      const buf = await (await fetch(arg.meta)).arrayBuffer();
      const SQLm = window.SQL || (window.APP && window.APP._SQL);
      if (!SQLm) return { err: 'sql.js-not-available' };
      const db = new SQLm.Database(new Uint8Array(buf));
      // The EXACT new stream SELECT (bbox always emitted, material_name at slot 16) and the EXACT
      // old one, run side by side so the row-shape claim is measured, not asserted.
      const NEWQ = `SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline,
               t.center_x, t.center_y, t.center_z, t.rotation_x, t.rotation_y, t.rotation_z,
               m.storey, m.ifc_class, m.element_name, t.bbox_x, t.bbox_y, t.bbox_z, m.material_name
        FROM elements_meta m JOIN element_instances i ON m.guid = i.guid
        JOIN element_transforms t ON t.guid = m.guid
        WHERE i.geometry_hash IS NOT NULL AND m.ifc_class != 'IfcOpeningElement' ORDER BY m.guid`;
      const OLDQ = NEWQ.replace(', m.material_name\n', '\n').replace(', m.material_name ', ' ');
      const nres = db.exec(NEWQ), ores = db.exec(OLDQ);
      const nv = nres.length ? nres[0].values : [], ov = ores.length ? ores[0].values : [];
      let shapeSame = nv.length === ov.length, slot16 = 0;
      for (let i = 0; shapeSame && i < nv.length; i++) {
        if (nv[i].length !== 17 || ov[i].length !== 16) { shapeSame = false; break; }
        for (let s = 0; s < 16; s++) if (nv[i][s] !== ov[i][s]) { shapeSame = false; break; }
      }
      for (let i = 0; i < nv.length; i++) if (nv[i][16]) slot16++;
      // Group by (name, class, transparent) and resolve both ways through the shipped owner.
      const groups = {};
      let named = 0, approx = 0;
      for (let i = 0; i < nv.length; i++) {
        const rgba = nv[i][2], cls = nv[i][11] || '', nm = nv[i][16] || '';
        if (nm) { named++; if (nm.charAt(0) === '≈') approx++; }
        const a = A._alphaOf(rgba);
        const g = nm + '' + cls + '' + (a < 1 ? 'T' : 'O');
        if (!groups[g]) {
          const after = A._triResolve(a, cls, nm);
          const beforeMat = (a < 1.0) ? null : ((cls && A._TRIPLANAR_MAT[cls]) ? A._TRIPLANAR_MAT[cls] : null);
          groups[g] = { building: arg.key, name: nm, cls: cls, transparent: a < 1,
            texBefore: beforeMat ? beforeMat.diffuse : '', texAfter: after.mat ? after.mat.diffuse : '',
            src: after.src, n: 0 };
        }
        groups[g].n++;
      }
      db.close();
      return { rows: Object.keys(groups).map(k => groups[k]), total: nv.length,
               oldTotal: ov.length, shapeSame, slot16, named, approx };
    }, b);
    if (r.err) { V(false, 'Tier A ' + b.key + ' — ' + r.err); continue; }
    perBld[b.key] = r;
    r.rows.forEach(x => rows.push(x));
    const changed = r.rows.filter(x => x.texBefore !== x.texAfter);
    const changedEls = changed.reduce((s, x) => s + x.n, 0);
    const byNameEls = r.rows.filter(x => x.src === 'name').reduce((s, x) => s + x.n, 0);
    const byNameDistinct = new Set(r.rows.filter(x => x.src === 'name').map(x => x.name)).size;
    r._changedEls = changedEls; r._byNameEls = byNameEls; r._byNameDistinct = byNameDistinct;
    S('\n   §MATKEY_AB bld=' + b.key + ' elements=' + r.total + ' named=' + r.named +
      ' approx_named=' + r.approx + ' groups=' + r.rows.length +
      ' distinct_names_resolved=' + byNameDistinct + ' elements_by_name=' + byNameEls +
      ' elements_changed=' + changedEls +
      (r.total === 0 ? '  VACUOUS — no element judged' : '') +
      (r.total > 0 && changedEls === 0 ? '  NO-OP — not one element changed texture' : ''));
    V(r.total > 0, b.key + ' — the population judged is non-empty (not VACUOUS)', 'elements=' + r.total);
    V(r.shapeSame, b.key + ' — §BBOX_ROW_SHIFT held: slots 0-15 identical to the pre-change query, row is 17 long',
      'rows old=' + r.oldTotal + ' new=' + r.total);
    changed.sort((x, y) => y.n - x.n).slice(0, 10).forEach(x => S('       CHANGED name="' + x.name +
      '" class=' + x.cls + ' n=' + x.n + '  ' + (x.texBefore || '(none)') + ' → ' + (x.texAfter || '(none)')));
    if (b.expectChange) {
      V(changedEls > 0, b.key + ' GAINS: elements whose resolved texture actually changed',
        changedEls + ' elements, ' + changed.length + ' groups');
      V(byNameDistinct > 0, b.key + ': distinct material_name values that now resolve a texture BY NAME',
        byNameDistinct + ' names covering ' + byNameEls + ' elements');
      if (tallyByName >= 0)
        V(tallyByName === byNameEls, 'the shipped §TRI_SRC_TALLY by_name agrees with the recomputed A/B',
          'log=' + tallyByName + ' vs computed=' + byNameEls);
    } else {
      V(changedEls === 0, b.key + ' UNCHANGED: not one element resolves a different texture than before',
        changedEls + ' of ' + r.total + ' elements changed');
      V(byNameEls === 0, b.key + ': no element is decided by material_name (all its names are `≈ ` colour labels)',
        byNameEls + ' by name, ' + r.approx + ' of ' + r.named + ' names are `≈ `-prefixed');
    }
  }

  // ── The contract: schema + invariants + a redControl that proves they can fail ──
  S('\n── witness_kit contract (schema · invariants · redControl) ──');
  const contractLog = [];
  const _cl = console.log; console.log = (...a) => { contractLog.push(a.join(' ')); _cl(...a); };
  let res = { pass: 0, fail: 0, ran: 0 };
  try {
    res = Witness('CPE_MATERIAL_KEY')
      .population(() => rows)
      .schema({ type: 'object', required: ['building', 'name', 'cls', 'transparent', 'texBefore', 'texAfter', 'src', 'n'],
        properties: {
          building: { type: 'string', enum: ['Terminal', 'Hospital', 'Clinic'] },
          name: { type: 'string' }, cls: { type: 'string' }, transparent: { type: 'boolean' },
          texBefore: { type: 'string', enum: [''].concat(TEX_ON_DISK) },
          texAfter: { type: 'string', enum: [''].concat(TEX_ON_DISK) },
          src: { type: 'string', enum: ['name', 'class', 'none', 'alpha-none'] },
          n: { type: 'integer', minimum: 1 } } })
      .invariant('Terminal gains at least one by-name texture',
        rs => rs.some(r => r.building === 'Terminal' && r.src === 'name'))
      .invariant('Hospital resolves exactly what it resolved before, every element',
        rs => rs.filter(r => r.building === 'Hospital').every(r => r.texBefore === r.texAfter))
      .invariant('Clinic resolves exactly what it resolved before, every element',
        rs => rs.filter(r => r.building === 'Clinic').every(r => r.texBefore === r.texAfter))
      .invariant('no `≈ ` synthetic colour label ever keys a texture',
        rs => rs.every(r => !(r.name.charAt(0) === '≈' && r.src === 'name')))
      .invariant('THE TRAP: the leaked Revit wall-TYPE name never keys a texture',
        rs => rs.every(r => r.name.indexOf('Basic Wall:') !== 0 || r.src !== 'name'))
      .invariant('the leaked wall-TYPE name keeps its MEP on metal (no texture stripped)',
        rs => rs.filter(r => r.name.indexOf('Basic Wall:') === 0).every(r => r.texBefore === r.texAfter))
      .invariant('name-first never REMOVES a texture an element already had',
        rs => rs.every(r => !(r.texBefore !== '' && r.texAfter === '')))
      .invariant('every resolved texture is one of the three that exist on disk',
        rs => rs.every(r => r.texAfter === '' || TEX_ON_DISK.indexOf(r.texAfter) >= 0))
      .invariant('a transparent surface still never gets an opaque wear texture (§GLASS_NOT_METAL)',
        rs => rs.every(r => !r.transparent || r.texAfter === ''))
      .redControl(rs => rs.map(r => Object.assign({}, r, r.building === 'Hospital'
        ? { texAfter: TEX_ON_DISK[2], src: 'name' }   // break "Hospital unchanged" on purpose
        : {})))
      .run();
  } catch (e) {
    V(false, 'witness_kit contract threw', e.message);
  }
  console.log = _cl;
  contractLog.forEach(l => log.push(l));
  V(res.ran > 0, 'the contract actually judged a population (not INCONCLUSIVE)', 'rows=' + rows.length);
  V(res.fail === 0, 'contract: schema + 9 invariants + redControl', 'pass=' + res.pass + ' fail=' + res.fail);
  fails += res.fail;

  S('\n── VERDICT ──');
  if (rows.length === 0 || !ready) {
    S('   🔴 W-CPE-MATERIAL-KEY INCONCLUSIVE — nothing was judged (population=' + rows.length +
      ', terminal_streamed=' + ready + ')');
    fails = fails || 1;
  } else {
    const T = perBld.Terminal || {};
    S('   §MATKEY_VERDICT terminal_names_by_name=' + (T._byNameDistinct || 0) +
      ' terminal_elements_by_name=' + (T._byNameEls || 0) +
      ' terminal_elements_changed=' + (T._changedEls || 0) +
      ' hospital_changed=' + ((perBld.Hospital || {})._changedEls) +
      ' clinic_changed=' + ((perBld.Clinic || {})._changedEls));
    S('   ' + (fails === 0 ? '🟢 W-CPE-MATERIAL-KEY PASS' : '🔴 W-CPE-MATERIAL-KEY FAIL (' + fails + ')'));
  }
  save(); await browser.close(); server.close();
  process.exit(fails === 0 ? 0 : 1);
})();
