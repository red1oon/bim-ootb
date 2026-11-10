#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-OBJ-VIEWER-OPEN (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.8). READ THE §-LOG after every run. Headless Viewer on SwiftShader (CPU); no GPU, no screenshot.
 * ISSUE: a patch that adds the model's dictionary breaking the Viewer's open. The Viewer opens the public Duplex WITH buildings/patches/Duplex_extracted.db.sql served beside it (the loader's own convention),
 *   and the Viewer's own log says the patch applied and no §PATCH_APPLY_FAIL; the Viewer's live database then holds the dictionary (5 kinds) and the generated key, and its element count equals the file's.
 *   Falsifier: the same open WITHOUT the patch shows no dictionary (so the dictionary seen above came from the patch, not from the file).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { kit, ROOT } = require('./_kit');
const VD = require(path.join(ROOT, 'viewer', 'tools', 'viewer_driver.js'));
const k = kit('W-OBJ-VIEWER-OPEN');
const DB = [process.env.FIXTURE_DB, path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db'), path.join(ROOT, 'buildings', 'Duplex_extracted.db')].filter(Boolean).filter(f => fs.existsSync(f))[0];
const PATCH = path.join(ROOT, 'buildings', 'patches', 'Duplex_extracted.db.sql');
async function openOnce(patch) {
  const log = [], d = await VD.start({ db: DB, pageLog: log, patch });
  try {
    await d.open(); await d.waitLoaded();
    const st = await d.page.evaluate(() => {
      const q = (s) => { try { const r = window.APP.db.exec(s); return r.length ? r[0].values : []; } catch (e) { return 'ERR ' + e.message; } };
      return { tables: q("SELECT count(*) FROM ad_table"), cols: q("SELECT count(*) FROM ad_column"), gen: q("SELECT count(*), sum(elements_meta_uu = guid) FROM elements_meta"), elems: q("SELECT count(*) FROM elements_meta"), kinds: q("SELECT name FROM ad_table ORDER BY ad_table_id") };
    });
    return { log, st, errs: d.pageErrors.slice() };
  } finally { await d.close(); }
}
(async () => {
  if (!DB) { k.incon('FIXTURE', 'no Duplex_extracted.db'); return k.end(); }
  const SQL = await require(path.join(ROOT, 'common', 'lib', 'sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common', 'lib', 'sql-wasm.wasm')) }), nFile = new SQL.Database(fs.readFileSync(DB)).exec('SELECT count(*) FROM elements_meta')[0].values[0][0];
  const a = await openOnce(PATCH), applyLines = a.log.filter(l => /§PATCH_APPLY|§PATCH_ADDCOL|§PATCH_NONE/.test(l));
  applyLines.forEach(l => k.L('viewer says: ' + l.slice(0, 200)));
  k.L('with patch: ' + JSON.stringify(a.st) + ' pageErrors=' + a.errs.length);
  k.chk('VIEWER-OPEN the Viewer applied the patch (§PATCH_APPLY) and logged no §PATCH_APPLY_FAIL', a.log.some(l => /§PATCH_APPLY model\.db applied/.test(l)) && !a.log.some(l => /PATCH_APPLY_FAIL/.test(l)), applyLines.join(' | ').slice(0, 160));
  k.chk('VIEWER-OPEN the live database holds the dictionary: 5 kinds, their columns, and the generated key equals guid on every element', Array.isArray(a.st.tables) && a.st.tables[0][0] === 5 && a.st.cols[0][0] > 20 && a.st.gen[0][0] > 0 && a.st.gen[0][0] === a.st.gen[0][1], JSON.stringify(a.st.kinds));
  k.chk('VIEWER-OPEN the element count in the Viewer equals the file\'s', nFile > 0 && a.st.elems[0][0] === nFile, 'file=' + nFile + ' viewer=' + a.st.elems[0][0]);
  const b = await openOnce(null);
  k.L('without patch: ' + JSON.stringify(b.st).slice(0, 200));
  k.chk('VIEWER-OPEN falsifier: with no patch served, the Viewer has no dictionary (it came from the patch)', typeof b.st.tables === 'string' && /ERR/.test(b.st.tables), String(b.st.tables));
  k.chk('VIEWER-OPEN same element count with and without the patch', a.st.elems[0][0] === b.st.elems[0][0], a.st.elems[0][0] + ' vs ' + b.st.elems[0][0]);
  k.end();
})().catch(e => { console.log('§W-OBJ-VIEWER-OPEN INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
