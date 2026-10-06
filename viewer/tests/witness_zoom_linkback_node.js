// ⚠ DO NOT REMOVE — Scope: NODE witness (no browser) for the Zoom Across LINK-BACK: a Project Order pushed from a viewer
// model carries (db url, GUID set); the ERP red pill opens THAT db and the viewer parses find= to exactly those GUIDs.
// Issue it proves/disproves: ZoomAcross opened '../buildings/<bld>_extracted.db' (404 for CivilWorks: Value="Civil Works").
// Slices the SHIPPED functions out of source (no copies): erp/idempiere.html _linkBack/_viewerUrl, viewer/find_erp_push.js
// _linkBackStore, viewer/main.js find= parse, viewer/nf_panel_search.js applyFindScope guid branch.
// READ viewer/tests/witness_zoom_linkback_node.log after every run.
// Run: node tests/witness_zoom_linkback_node.js     (CivilWorks.db read-only; skips civil legs -> INCONCLUSIVE if absent)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const R = path.join(__dirname, '..', '..');
const Database = require('/home/red1/bim-compiler/node_modules/better-sqlite3');
const log = []; let fails = 0, vacuous = false;
const S = m => { log.push(m); console.log(m); };
const ok = (c, l, d) => { if (!c) fails++; S('   ' + (c ? 'OK  ' : 'FAIL') + ' ' + l + (d ? ' — ' + d : '')); };
function slice(src, startRe) {                      // brace-matched function text starting at startRe
  const m = startRe.exec(src); if (!m) throw new Error('slice miss ' + startRe);
  let i = src.indexOf('{', m.index), d = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; }
  return src.slice(m.index, j + 1);
}
const NEW_ERP = fs.readFileSync(path.join(R, 'erp/idempiere.html'), 'utf8');
const OLD_ERP = cp.execSync('git show origin/main:erp/idempiere.html', { cwd: R, maxBuffer: 1 << 28 }).toString();
const PUSH = fs.readFileSync(path.join(R, 'viewer/find_erp_push.js'), 'utf8');
const MAIN = fs.readFileSync(path.join(R, 'viewer/main.js'), 'utf8');
const NFS = fs.readFileSync(path.join(R, 'viewer/nf_panel_search.js'), 'utf8');

let store;                                          // C_Project row (in-memory sqlite) the ERP side reads
const _sqlRows = q => store.prepare(q.replace(/\bc_project\b/i, 'C_Project')).all();
const mk = eval('(function(_sqlRows, localStorage){' + slice(NEW_ERP, /function _linkBack\(/) + slice(NEW_ERP, /function _viewerUrl\(/) + ' return {_linkBack:_linkBack,_viewerUrl:_viewerUrl}; })');
const lsData = {}; const ls = { setItem: (k, v) => { lsData[k] = v; }, getItem: k => lsData[k] };
const mkStore = eval('(function(){' + slice(PUSH, /function _linkBackStore\(/) + ' return _linkBackStore; })')();
// OLD launch URL expression (origin/main), the Hospital control
const oldLine = /var url = '\.\.\/viewer\/viewer\.html\?db=[^\n]*\n\s*if \(sc\.find\)[^\n]*\n/.exec(OLD_ERP)[0];
const oldUrl = new Function('sc', 'homeUrl', oldLine + ' return url;');
function viewerParse(search) {                       // main.js find= extraction + guid branch of applyFindScope
  const mm = slice(MAIN, /\(function \(\) \{\s*\n\s*try \{\s*\n\s*var _zm/);
  const pre = /var _zm = [^\n]*\n[^\n]*\n\s*var scope = [^\n]*\n[^\n]*\n/.exec(MAIN)[0];
  const f = new Function('location', 'localStorage', 'decodeURIComponent', pre.replace('if (!_zm) return;', 'if (!_zm) return null;').replace(/return;/g, 'return null;') + ' return scope;');
  const scope = f({ search }, ls, decodeURIComponent);
  const cond = /if \((scope\.indexOf\(','\)[^\n]*)\) \{/.exec(NFS.slice(NFS.indexOf('A.applyFindScope')))[1];
  const isGuid = new Function('scope', 'return ' + cond + ';')(scope);
  const split = /var guids = ([^\n]*);/.exec(NFS.slice(NFS.indexOf('A.applyFindScope')))[1];
  const guids = isGuid ? new Function('scope', 'return ' + split + ';')(scope) : null;
  return { scope, isGuid, guids };
}
S('§W-ZOOM-LINKBACK-NODE');
const HOME = encodeURIComponent('http://h/erp/idempiere.html');
const E = mk(_sqlRows, ls);

// ── Hospital control: no tag → identical URL old vs new (header + line shapes)
store = new Database(':memory:'); store.exec("CREATE TABLE C_Project(c_project_id,description,note)"); store.prepare("INSERT INTO C_Project VALUES(990000,NULL,NULL)").run();
for (const sc of [{ bld: 'Hospital', find: null }, { bld: 'Hospital', find: 'IfcWall' }]) {
  const sc2 = E._linkBack(Object.assign({}, sc), 990000, true);
  ok(E._viewerUrl(sc2, HOME) === oldUrl(sc, HOME), 'Hospital find=' + sc.find + ': new URL === origin/main URL', E._viewerUrl(sc2, HOME));
}

// ── Civil: real GUIDs from CivilWorks.db
const dbp = process.env.DB || path.join(R, 'viewer/buildings/CivilWorks.db');
if (!fs.existsSync(dbp)) { vacuous = true; S('   §VACUOUS CivilWorks.db absent'); }
else {
  const cdb = new Database(dbp, { readonly: true });
  const discs = ['LIGHTING', 'DRAINAGE', 'SIGNAGE', 'MARKING'];
  const guids = cdb.prepare("SELECT guid FROM elements_meta WHERE discipline IN (" + discs.map(() => '?').join(',') + ")").all(...discs).map(r => r.guid);
  S('   §PUSHED_SET disciplines=' + discs.join('+') + ' guids=' + guids.length);
  if (!guids.length) { vacuous = true; S('   §VACUOUS empty pushed set'); }
  else {
    const DBURL = 'buildings/CivilWorks.db';
    // push twice (second = same set) → union stable, count == pushed qty
    let st = mkStore('', new Set(guids), DBURL); st = mkStore(st.note, new Set(guids), DBURL);
    ok(st.count === guids.length, 'store: Note carries exactly the pushed GUIDs (idempotent union)', st.count + ' vs ' + guids.length);
    store = new Database(':memory:'); store.exec("CREATE TABLE C_Project(c_project_id,description,note)");
    store.prepare("INSERT INTO C_Project VALUES(990001,?,?)").run(st.description, st.note);
    const sc = E._linkBack({ bld: 'Civil Works', find: null }, 990001, true);
    ok(sc.db === DBURL, 'ERP resolves the source db from the order', sc.db);
    const url = E._viewerUrl(sc, HOME);
    ok(/[?&]db=buildings\/CivilWorks\.db&/.test(url), 'URL opens the SOURCE db (not "Civil Works_extracted.db")', url.slice(0, 120));
    const oldU = oldUrl({ bld: 'Civil Works', find: null }, HOME);
    ok(/Civil%20Works_extracted\.db/.test(oldU), 'RED control: origin/main URL points at the non-existent Civil Works_extracted.db', oldU.slice(0, 90));
    ok(url.length < 1e4 && /find=@z/.test(url) && !/guid/.test(url), 'long GUID set handed off via localStorage token, URL short', url.length + ' chars');
    const vp = viewerParse(url.slice(url.indexOf('?')));
    ok(vp.isGuid && vp.guids.length === guids.length, 'viewer parses find= into the GUID branch with n == pushed', (vp.guids || []).length + ' vs ' + guids.length);
    ok(vp.guids && vp.guids.every(g => guids.includes(g)) && new Set(vp.guids).size === guids.length, 'parsed GUID set == pushed GUID set (exact)');
    const inDb = cdb.prepare("SELECT COUNT(*) c FROM elements_meta WHERE guid IN (" + vp.guids.slice(0, 900).map(() => '?').join(',') + ")").get(...vp.guids.slice(0, 900)).c;
    ok(inDb === Math.min(900, guids.length), 'sampled parsed GUIDs resolve to real elements in CivilWorks.db', inDb + '/' + Math.min(900, guids.length));
    // small set → inline find= (no token), same as Hospital shape
    const small = mkStore('', new Set(guids.slice(0, 3)), DBURL);
    store.prepare("UPDATE C_Project SET description=?, note=?").run(small.description, small.note);
    const u3 = E._viewerUrl(E._linkBack({ bld: 'Civil Works', find: null }, 990001, true), HOME);
    ok(viewerParse(u3.slice(u3.indexOf('?'))).guids.length === 3 && /find=[^@]/.test(u3), 'small set rides inline in find= (Hospital shape)');
  }
}
const verdict = vacuous ? 'INCONCLUSIVE (vacuous)' : fails ? 'FAIL (fails=' + fails + ')' : 'PASS';
S('\n§W-ZOOM-LINKBACK-NODE ' + verdict);
fs.writeFileSync(path.join(__dirname, 'witness_zoom_linkback_node.log'), log.join('\n'));
process.exit(vacuous ? 2 : fails ? 1 : 0);
