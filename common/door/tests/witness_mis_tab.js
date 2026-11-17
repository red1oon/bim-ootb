// ⚠ DO NOT REMOVE — W-MIS-TAB (bim-compiler prompts/CLI_ERP_IVR.md §18: one tab picker). READ THE LOG; an exit code is not evidence.
//   P1 ISSUE (describe reads its fields from one tab and the write path opens another: the Edit form shows what mis.update then refuses, or hides what it allows)
//   P2 ISSUE (the kinds whose tabs tie were never judged, so P1 passes on kinds with one tab only) · P3 ISSUE (a second tab-picking query comes back, for a table's tabs or for a window's)
//   N = every kind of the dictionary with an active tab and a key. Falsifier: TAB_BREAK=noid (the picker drops the tab id) must FAIL P1 and P2.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT } = require('./_kit');
const k = kit('W-MIS-TAB');
(async () => {
  const EC = require('../erp_cli.js'), OC = require('../object_cli.js'), SEED = path.join(ROOT, 'erp/ad_seed.db');
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', SEED, q], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || '[]');
  const err = process.stderr.write; process.stderr.write = () => true;   // 855 describes: their § lines are not this witness's evidence
  let O; try { O = await EC.boot({ oplog: tmp('mt_') }); } finally { process.stderr.write = err; }
  // independent: the tab per table in the stated order (tab level, sequence, tab id), and under the OLD order (no tab id: SQLite's row order among ties)
  const want = {}, old = {}, disp = {};
  sq("SELECT ad_table_id AS t, ad_tab_id AS id FROM ad_tab WHERE isactive='Y' ORDER BY ad_table_id, tablevel, seqno, ad_tab_id").forEach(r => { if (!(r.t in want)) want[r.t] = r.id; });
  sq("SELECT t.ad_table_id AS t, (SELECT x.ad_tab_id FROM ad_tab x WHERE x.ad_table_id=t.ad_table_id AND x.isactive='Y' ORDER BY x.tablevel, x.seqno LIMIT 1) AS id FROM ad_table t").forEach(r => { if (r.id != null) old[r.t] = r.id; });
  // the fields are read from the model the door SERVES (the seed, its patch and the started core plugins, erp_cli boot §29.6 P3a), not from the seed file: legacy reads a tab's fields from AD_Field_v WHERE AD_Tab_ID=?
  // (GridFieldVO.getSQL L71), which holds the rows a plugin's 2Pack added to a core tab as well. Read from the seed file, the BIM Document fields on Project Phase/Task were "not that tab's".
  O.rows("SELECT f.ad_tab_id AS tab, lower(c.columnname) AS c FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.isactive='Y' AND f.isdisplayed='Y' AND c.isactive='Y'").forEach(r => { (disp[r.tab] = disp[r.tab] || {})[r.c] = 1; });
  const kinds = sq("SELECT t.ad_table_id AS id, t.tablename AS tn FROM ad_table t WHERE t.isactive='Y' AND EXISTS (SELECT 1 FROM ad_tab b WHERE b.ad_table_id=t.ad_table_id AND b.isactive='Y') AND EXISTS (SELECT 1 FROM ad_column c WHERE c.ad_table_id=t.ad_table_id AND c.isactive='Y' AND c.iskey='Y') ORDER BY 1");
  let n = 0, okTab = 0, okDisp = 0, tied = 0, tiedOk = 0, skipped = 0; const bad = [];
  process.stderr.write = () => true;
  try {
    for (const kd of kinds) {
      let K, d; try { K = EC.kindRef(O, kd.tn); d = OC.describe(O, { kind: kd.tn }); } catch (e) { skipped++; continue; }   // a name two tables share, or a kind describe refuses: counted, not judged
      if (K.id !== kd.id) { skipped++; continue; }
      n++;
      const w = EC.tabFor(O, K).id, got = d.properties.filter(p => p.displayed).map(p => p.name.toLowerCase()).sort().join(','), exp = Object.keys(disp[want[kd.id]] || {}).sort().join(',');
      const a = w === want[kd.id], b = got === exp; if (a) okTab++; if (b) okDisp++;
      if (old[kd.id] !== want[kd.id]) { tied++; if (a && b) tiedOk++; }
      if ((!a || !b) && bad.length < 5) bad.push(kd.tn + ' write=' + w + ' want=' + want[kd.id] + ' displayed ' + got.split(',').length + '/' + exp.split(',').length);
    }
  } finally { process.stderr.write = err; }
  k.L('kinds with a tab and a key=' + kinds.length + ' judged N=' + n + ' skipped=' + skipped + ' write-path tab ok=' + okTab + ' describe fields ok=' + okDisp + ' tied kinds=' + tied + ' ok=' + tiedOk + (bad.length ? ' first bad: ' + bad.join(' | ') : ''));
  if (!n) k.incon('P1', 'VACUOUS: no kind was judged');
  else k.chk('P1 one answer: for ' + okTab + ' of ' + n + ' kinds the write path opens the tab the independent query names, and for ' + okDisp + ' of ' + n + ' describe\'s displayed fields are that tab\'s', okTab === n && okDisp === n, bad.join(' | '));
  if (!tied) k.incon('P2', 'VACUOUS: no kind has tied tabs under the old order, so the defect cannot show');
  else k.chk('P2 the tied kinds are judged: ' + tiedOk + ' of ' + tied + ' kinds whose old order (no tab id) named another tab now give one tab to describe and to the write path', tiedOk === tied, 'tied=' + tied);
  // P3: two relations, one owner each, both in object_cli.js: a TABLE's tabs (tabsOf: tab level, sequence, tab id) and a WINDOW's tabs (windowTabs: sequence, as legacy GridTabVO.getSQL L536 ORDER BY SeqNo).
  //   Any other query in common/door that orders AD_Tab rows by tab level or sequence is a second picker.
  const dir = path.join(ROOT, 'common/door'), hits = [];
  fs.readdirSync(dir).filter(f => /\.js$/.test(f)).forEach(f => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l, i) => { if (/FROM ad_tab\b.*ORDER BY[^'"]*(tablevel|seqno)/i.test(l)) hits.push(f + ':' + (i + 1)); }));
  const src = fs.readFileSync(path.join(dir, 'object_cli.js'), 'utf8').split('\n'), owner = (h) => { const m = /^object_cli\.js:(\d+)$/.exec(h), d = m && /^function (tabsOf|windowTabs)\(/.exec(src[Number(m[1]) - 2]); return d ? d[1] : null; };
  const owners = hits.map(owner);
  k.chk('P3 one picker per relation: the only queries in common/door that order AD_Tab rows by tab level or sequence are tabsOf (a table\'s tabs) and windowTabs (a window\'s tabs)', hits.length === 2 && owners.indexOf('tabsOf') >= 0 && owners.indexOf('windowTabs') >= 0, 'hits=' + JSON.stringify(hits) + ' owners=' + JSON.stringify(owners));
  return k.end();
})().catch(e => { console.log('§W-MIS-TAB ERROR ' + e.stack); process.exit(2); });
