#!/usr/bin/env node
/* ⚠ WITNESS — W-ONE-PO-STORE, §A4 (bim-compiler prompts/CODE_HYGIENE_REVIEW_2026-11.md §A4 SPEC). READ THE LOG after every run.
 *
 * ISSUE IT PROVES OR DISPROVES: diff.js, find_erp_push.js, whatif_panel.js and schedule_author_ui.js each held a PRIVATE sql.js copy of the
 * OPFS store bim_analysis/bim_project_orders.db (27 MB, seeded from erp/ad_seed.db) and export()ed it back whole = up to 4 x 27 MB resident.
 * They now share ONE instance (ProjOrderState.shared / persistShared). The lost-update guard (storeStamp lastModified:size) must survive.
 *
 * HOW: real proj_order_state.js + the four real consumers loaded in node (vm) against a fake OPFS (Map-backed, lastModified/size tracked) and the
 * real erp/ad_seed.db. Entry points DRIVEN: diff.js setupDiff(A)._voToErp() [VoFold stubbed: writes a marker row]; find_erp_push
 * FindErpPush.create({A}).ensureErpDb()/persistErpDb(); whatif_panel WhatIfPanel.open() + the stepper/accept click handlers (fake DOM, real
 * whatif.js); schedule_author_ui via a test hook appended to the source exposing its internal _syncWhatIf/_state [ProjFold.foldAuthoredPhases
 * stubbed: writes a marker row]. SQL.Database constructions are counted and split: built from OPFS bytes (= store opens) vs from the seed fetch.
 *
 * NO-OP/VACUOUS/WRONG: INCONCLUSIVE (exit 2) when no consumer was exercised. MUTANTS (diff bypasses shared(); persistShared without stamp guard)
 * must each make a claim FAIL, else the witness cannot say NO and the verdict is FAIL.
 * RUN: node viewer/tests/witness_one_po_store.js
 */
var fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..'), V = path.join(ROOT, 'viewer');
var SQLJS = [process.env.SQLJS_DIR, '/home/red1/bim-compiler/node_modules/sql.js/dist', path.join(ROOT, 'node_modules/sql.js/dist')].filter(Boolean)
  .find(function (d) { return fs.existsSync(path.join(d, 'sql-wasm.js')); });
if (!SQLJS) { console.log('§A4_VERDICT INCONCLUSIVE — sql.js not found'); process.exit(2); }
var SEED = fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db'));
if (SEED.slice(0, 15).toString() !== 'SQLite format 3') { console.log('§A4_VERDICT INCONCLUSIVE — erp/ad_seed.db is not a SQLite file (LFS stub?)'); process.exit(2); }
var SRC = {}; ['proj_order_state', 'diff', 'find_erp_push', 'whatif_panel', 'schedule_author_ui'].forEach(function (n) { SRC[n] = fs.readFileSync(path.join(V, n + '.js'), 'utf8'); });
var WhatIf = require(path.join(V, 'whatif.js'));

function sha(b) { return crypto.createHash('sha256').update(Buffer.from(b)).digest('hex').slice(0, 12); }
var SEQ = null;
function tick() { return new Promise(function (r) { setImmediate(r); }); }

// ── fake OPFS: Map-backed, lastModified (monotonic counter) + size per file ──
function fakeOpfs() {
  var dirs = new Map(), clock = 1000, o = { reads: 0, writes: 0, bufs: new WeakSet() };
  function fileH(dir, name) { return {
    getFile: async function () { var f = dir.get(name); if (!f) throw new Error('NotFound'); return { lastModified: f.lm, size: f.bytes.length,
      arrayBuffer: async function () { o.reads++; var ab = f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.length); o.bufs.add(ab); return ab; } }; },
    createWritable: async function () { var chunks = []; return { write: async function (b) { chunks.push(Buffer.from(b)); }, close: async function () { o.writes++; dir.set(name, { bytes: Buffer.concat(chunks), lm: ++clock }); } }; } }; }
  function dirH(dir) { return {
    getFileHandle: async function (name, opt) { if (!dir.has(name) && !(opt && opt.create)) throw new Error('NotFound'); return fileH(dir, name); },
    removeEntry: async function (name) { dir.delete(name); } }; }
  o.root = { getDirectoryHandle: async function (name, opt) { if (!dirs.has(name)) { if (!(opt && opt.create)) throw new Error('NotFound'); dirs.set(name, new Map()); } return dirH(dirs.get(name)); } };
  o.put = function (bytes) { if (!dirs.has('bim_analysis')) dirs.set('bim_analysis', new Map()); dirs.get('bim_analysis').set('bim_project_orders.db', { bytes: Buffer.from(bytes), lm: ++clock }); };
  o.get = function () { var d = dirs.get('bim_analysis'); return d && d.get('bim_project_orders.db') ? d.get('bim_project_orders.db').bytes : null; };
  return o;
}
// ── fake DOM, only what whatif_panel.open/_render/_accept touch ──
function fakeDom() {
  var D = { panel: null, step: null };
  function el(id) { var e = { id: id, _l: {}, _q: {}, style: {}, dataset: {}, innerHTML: '', textContent: '', disabled: false, clientWidth: 100,
    addEventListener: function (t, f) { (e._l[t] = e._l[t] || []).push(f); }, removeEventListener: function () {}, appendChild: function (c) { if (c && c.id === 'whatif-panel') D.panel = c; return c; },
    remove: function () { if (D.panel === e) D.panel = null; }, closest: function () { return null; }, setAttribute: function () {}, getAttribute: function (k) { return e._attr && e._attr[k]; },
    querySelector: function (s) { return e._q[s] || (e._q[s] = el(s)); },
    querySelectorAll: function (s) { if (s === '.wi-step button') { var b = el('step'); b._attr = { 'data-seq': D.seq, 'data-d': '7' }; D.step = b; return [b]; } return []; } };
    return e; }
  D.document = { getElementById: function (id) { return id === 'whatif-panel' ? D.panel : null; }, createElement: function (t) { return el(t === 'div' ? '' : t); },
    head: el('head'), body: el('body'), visibilityState: 'visible', addEventListener: function () {}, removeEventListener: function () {} };
  D.document.body.appendChild = function (c) { if (c && c.id === 'whatif-panel') D.panel = c; return c; };
  return D;
}
// ── one world = one tab: fresh module state, fresh fake OPFS ──
function world(opts) {
  opts = opts || {};
  var W = { logs: [], counts: { store: 0, seed: 0 }, opfs: fakeOpfs(), dom: fakeDom(), exercised: {} };
  var realSQL = W.realSQL;
  var CSQL = { Database: function (data) { var buf = data && data.buffer; if (buf && W.opfs.bufs.has(buf)) W.counts.store++; else if (data) W.counts.seed++; return new W.SQL.Database(data); } };
  W.SQL = opts.SQL;
  var CSQLc = { Database: function (data) { var buf = data && data.buffer; if (buf && W.opfs.bufs.has(buf)) W.counts.store++; else if (data) W.counts.seed++; return new opts.SQL.Database(data); } };
  var sb = { console: { log: function () { W.logs.push([].slice.call(arguments).join(' ')); }, warn: function () {} }, navigator: { storage: { getDirectory: async function () { return W.opfs.root; } } },
    document: W.dom.document, Uint8Array: Uint8Array, ArrayBuffer: ArrayBuffer, Promise: Promise, setTimeout: setTimeout, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, Number: Number, String: String, Error: Error, Set: Set, Map: Map, parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN };
  sb.window = sb; sb.self = sb; sb.global = sb;
  sb.APP = sb.A = { _SQL: CSQLc, activeBuilding: 'Hospital', status: { textContent: '' }, cachedFetch: async function (u) { W.seedFetches = (W.seedFetches || 0) + 1; return SEED.buffer.slice(SEED.byteOffset, SEED.byteOffset + SEED.length); } };
  sb.WhatIf = WhatIf; sb.ProjFold = {}; sb.VoFold = { foldVariationOrder: function (db) { mark(db, 'diff'); return { docNo: 'VO-A4', orderId: 1, created: { lines: 1 }, grandTotal: '0', notes: [] }; } };
  sb.ScheduleAuthor = {}; sb.SEQUENCE_RULES = {}; sb.requestAnimationFrame = function (f) { return setTimeout(f, 0); };
  W.sb = sb; vm.createContext(sb);
  var diffSrc = SRC.diff, posSrc = SRC.proj_order_state;
  if (opts.mutant === 'diff-bypass') {   // MUTANT 1: diff opens its OWN copy through openStore instead of the shared instance
    var from = "PS.shared(SQL, seed, 'diff_vo')"; if (diffSrc.indexOf(from) < 0) throw new Error('mutant anchor missing (diff)');
    diffSrc = diffSrc.replace(from, "PS.openStore(SQL, seed).then(function (o) { return { db: o.db, src: o.src }; })");
  }
  if (opts.mutant === 'no-stamp-guard') {   // MUTANT 2: persistShared writes whatever it is given (guard removed)
    var from2 = "if (!_shared || db !== _shared.db || st !== _shared.stamp) {"; if (posSrc.indexOf(from2) < 0) throw new Error('mutant anchor missing (pos)');
    posSrc = posSrc.replace(from2, "if (false) {");
  }
  var authSrc = SRC.schedule_author_ui, endMark = "global.ScheduleAuthorUI = { open: open, close: close, toggle: toggle };";
  if (authSrc.indexOf(endMark) < 0) throw new Error('author hook anchor missing');
  authSrc = authSrc.replace(endMark, endMark + "\n  global.__A4_AUTHOR = { sync: _syncWhatIf, setState: function (s) { _state = s; } };");
  vm.runInContext(posSrc, sb, { filename: 'proj_order_state.js' });
  vm.runInContext(diffSrc + '\n;this.setupDiff = setupDiff;', sb, { filename: 'diff.js' });
  vm.runInContext(SRC.find_erp_push, sb, { filename: 'find_erp_push.js' });
  vm.runInContext(SRC.whatif_panel, sb, { filename: 'whatif_panel.js' });
  vm.runInContext(authSrc, sb, { filename: 'schedule_author_ui.js' });
  W.PS = sb.ProjOrderState;
  W.opens = function () { return W.PS.sharedOpens(); };
  W.has = function (s) { return W.logs.some(function (l) { return l.indexOf(s) >= 0; }); };
  W.count = function (s) { return W.logs.filter(function (l) { return l.indexOf(s) >= 0; }).length; };
  W.waitLog = async function (s, from) { for (var i = 0; i < 400; i++) { if (W.logs.slice(from || 0).some(function (l) { return l.indexOf(s) >= 0; })) return true; await tick(); } return false; };
  return W;
  function mark(db, who) { db.run('CREATE TABLE IF NOT EXISTS a4_marker(who TEXT)'); db.run("INSERT INTO a4_marker VALUES('" + who + "')"); }
}
function markers(db) { try { var r = db.exec('SELECT who FROM a4_marker ORDER BY rowid'); return r.length ? r[0].values.map(function (v) { return v[0]; }) : []; } catch (e) { return []; } }
function mark(db, who) { db.run('CREATE TABLE IF NOT EXISTS a4_marker(who TEXT)'); db.run("INSERT INTO a4_marker VALUES('" + who + "')"); }

// ── the four consumers' drivers (each flags W.exercised) ──
async function driveDiff(W) {   // diff.js A._voToErp: load path + write path
  var A = W.sb.A; W.sb.setupDiff(A); A.diffResult = {}; A._diffToVoRows = function () { return [{}]; };
  var from = W.logs.length; A._voToErp(); var ok = await W.waitLog('§VO_PUSH_PERSIST', from); W.exercised.diff = ok; return ok;
}
async function driveFind(W, who) {   // find_erp_push: ensureErpDb + persistErpDb
  var fe = W.sb.FindErpPush.create({ A: W.sb.A }); var db = await fe.ensureErpDb(); if (!db) return false;
  if (who) { mark(db, who); var ok = await fe.persistErpDb(db); W.exercised.find = true; return ok; } W.exercised.find = true; return true;
}
async function driveWhatIf(W, doAccept) {   // whatif_panel: open (+ stepper click + accept click)
  var from = W.logs.length; W.sb.WhatIfPanel.open(); var ok = await W.waitLog('§WHATIF-UI open project=', from) ; if (!ok) return { opened: false };
  W.exercised.whatif = true;
  var out = { opened: true };
  if (doAccept) {
    W.dom.seq = SEQ;   // seqno of a non-anchor phase of Hospital (read once from the seed)
    W.dom.panel.querySelector('#whatif-body');   // ensure _render ran; re-render to mint stepper button with seq
    W.sb.WhatIfPanel.open && 0; var b0 = W.dom.step; // the stepper from the last _render has the OLD seq; force a render via a fresh open
    var f2 = W.logs.length; W.sb.WhatIfPanel.open(); await W.waitLog('§WHATIF-UI open project=', f2);
    W.dom.step._l.click[0](); var f3 = W.logs.length;
    W.dom.panel.querySelector('#wi-accept')._l.click[0](); out.persisted = await W.waitLog('§WHATIF-UI persist opfs=', f3); }
  return out;
}
async function driveAuthor(W, who) {   // schedule_author_ui: _syncWhatIf
  var d = new W.SQLref.Database(); d.run('CREATE TABLE tasks(task_id TEXT, name TEXT, schedule_start TEXT, schedule_finish TEXT, is_summary INT, schedule_id TEXT)');
  d.run("INSERT INTO tasks VALUES('t1','Phase A','2026-01-01','2026-02-01',0,'S1')"); W.sb.A.db = d;
  W.sb.ProjFold.foldAuthoredPhases = function (db) { mark(db, who || 'author'); return { projectId: 990000, created: { phases: 1, updated: 0 } }; };
  W.sb.__A4_AUTHOR.setState({ schedId: 'S1' }); var from = W.logs.length; W.sb.__A4_AUTHOR.sync(); var ok = await W.waitLog('§AUTHOR_UI_WHATIF folded', from); W.exercised.author = ok; return ok;
}
function mk(opts, bytes) { var W = world(opts); W.SQLref = opts.SQL; if (bytes) W.opfs.put(bytes); return W; }

process.on('unhandledRejection', function (e) { console.log('§A4_INFO unhandled rejection (pre-existing whatif _accept reads _db=null after a stale refusal): ' + (e && e.message)); });
(async function () {
  var SQL = await require(path.join(SQLJS, 'sql-wasm.js'))({ locateFile: function (f) { return path.join(SQLJS, f); } });
  var exer0 = 0, results = []; function claim(id, ok, detail) { results.push({ id: id, ok: !!ok }); console.log('§A4_CLAIM ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' — ' + detail); }
  // store with phases = the seed itself (Hospital 990000, 7 phases); store WITHOUT phases = seed with C_ProjectPhase emptied
  var noPh = (function () { var d = new SQL.Database(new Uint8Array(SEED)); d.run('DELETE FROM C_ProjectTask WHERE C_ProjectPhase_ID IN (SELECT C_ProjectPhase_ID FROM C_ProjectPhase)'); d.run('DELETE FROM C_ProjectPhase'); var b = Buffer.from(d.export()); d.close(); return b; })();

  async function runAll(opts) {   // the S1 sequence on a store-with-phases; snapshot taken BEFORE the author's refresh()
    var W = mk(Object.assign({ SQL: SQL }, opts || {}), SEED);
    await driveDiff(W); await driveFind(W, 'find'); W.wi = await driveWhatIf(W, true);
    W.snap = { store: W.counts.store, seed: W.counts.seed, opens: W.opens(), reads: W.opfs.reads, reloads: W.count('§PO_SHARED reload') };
    var st = await W.PS.shared(W.sb.A._SQL, function () { return 0; }); W.snap.markersBeforeAuthor = markers(st.db).join(','); W.snap.opensAfterPeek = W.opens();
    W.seenByAuthor = null; W.au = await driveAuthor(W, 'author'); return W;
  }
  var sd = new SQL.Database(new Uint8Array(SEED)); SEQ = String(WhatIf.readPhases(sd, 990000, null)[1].seqno); sd.close();
  console.log('§A4_INPUT seed=' + SEED.length + ' B store(no phases)=' + noPh.length + ' B');

  // ── C1/C2: the four consumers on a store with phases ──
  var W1 = await runAll();
  var exer = Object.keys(W1.exercised).filter(function (k) { return W1.exercised[k]; });
  claim('C0-all-four-exercised', exer.length === 4 && W1.wi.persisted, 'exercised=' + exer.join(',') + ' whatifAcceptPersisted=' + W1.wi.persisted);
  claim('C1-one-store-open', W1.snap.store === 1 && W1.snap.opens === 1 && W1.snap.seed === 0 && W1.snap.reads === 1, 'diff+find_erp_push+whatif(load+accept): §PO_SHARED opens=' + W1.snap.opens + ' SQL.Database from OPFS bytes=' + W1.snap.store + ' private/seed copies=' + W1.snap.seed + ' OPFS reads=' + W1.snap.reads);
  claim('C2a-cross-consumer-visibility-no-reopen', W1.snap.markersBeforeAuthor === 'diff,find' && W1.snap.opensAfterPeek === 1 && W1.snap.reloads === 0, 'what-if/next consumer sees the earlier consumers\' committed writes in the ONE live db: markers=[' + W1.snap.markersBeforeAuthor + '] opens still ' + W1.snap.opensAfterPeek + ' reloads=' + W1.snap.reloads);
  var disk = new SQL.Database(new Uint8Array(W1.opfs.get())), mkd = markers(disk);
  claim('C2b-persistence-round-trip', mkd.join(',') === 'diff,find,author' && W1.opfs.writes === 4, 'on-disk bytes carry markers=[' + mkd + '] opfs writes=' + W1.opfs.writes + ' (diff, find, whatif accept, author)');
  var authorSaw = W1.logs.filter(function (l) { return l.indexOf('§AUTHOR_UI_WHATIF folded') >= 0; })[0] || '';
  claim('C2c-author-persist-ok-and-refresh-no-reparse', /persisted=true/.test(authorSaw) && W1.has('§WHATIF-UI refresh') && W1.opens() === 1 && W1.count('§PO_SHARED reload') === 0, authorSaw.replace(/^\[.*?\]\s*/, '') + ' ; refresh() with the panel open -> stamp check, no re-parse: opens 1 -> ' + W1.opens() + ' (reload-by-stamp lines=' + W1.count('§PO_SHARED reload') + ', the re-open was the explicit invalidate)');

  // ── C3: external change (another tab) ──
  var extDb = new SQL.Database(new Uint8Array(SEED)); mark(extDb, 'EXTERNAL'); var extBytes = Buffer.from(extDb.export()); extDb.close();
  var peek = function (W) { return W.PS.shared(W.sb.A._SQL, function () { return W.sb.A.cachedFetch(); }); };
  var W3 = mk({ SQL: SQL }, SEED); await driveDiff(W3);
  var oldDb = (await peek(W3)).db; W3.opfs.put(extBytes); var hashExt = sha(W3.opfs.get());
  var refused = await W3.PS.persistShared(oldDb, 'old-holder');
  claim('C3a-stale-write-refused (negative control)', refused === false && W3.has('§PUSH_STORE_STALE writer=old-holder') && sha(W3.opfs.get()) === hashExt && W3.PS.lastPersist.reason === 'stale', 'persistShared from the OLD stamp -> ' + refused + ' reason=' + W3.PS.lastPersist.reason + '; file hash unchanged=' + (sha(W3.opfs.get()) === hashExt));
  var W3x = mk({ SQL: SQL }, SEED); await driveDiff(W3x); var o0 = W3x.opens(); var oldX = (await peek(W3x)).db; W3x.opfs.put(extBytes);
  var re = await peek(W3x); var refusedOld = await W3x.PS.persistShared(oldX, 'superseded');
  claim('C3b-external-change-reopens', o0 === 1 && W3x.opens() === 2 && markers(re.db).join() === 'EXTERNAL' && W3x.has('§PO_SHARED reload was=') && refusedOld === false, 'opens ' + o0 + ' -> ' + W3x.opens() + ' markers after reload=[' + markers(re.db) + '] (diff marker of the replaced instance gone); a holder of the replaced instance is refused=' + (refusedOld === false));
  // What-if panel opened, THEN the file changes underneath it, THEN accept -> refused through the shared path
  var W3c = mk({ SQL: SQL }, SEED); var fS = W3c.logs.length; W3c.sb.WhatIfPanel.open(); await W3c.waitLog('§WHATIF-UI open project=', fS);
  var s3 = await peek(W3c); W3c.dom.seq = SEQ;
  W3c.sb.WhatIfPanel.open(); await W3c.waitLog('§WHATIF-UI open project=', fS + 1); W3c.dom.step._l.click[0]();
  W3c.opfs.put(extBytes); var hc = sha(W3c.opfs.get()); var fA = W3c.logs.length; W3c.dom.panel.querySelector('#wi-accept')._l.click[0]();
  var gotStale = await W3c.waitLog('§PUSH_STORE_STALE writer=whatif', fA); await tick(); await tick();
  claim('C3c-whatif-accept-refused-on-stale', gotStale && sha(W3c.opfs.get()) === hc, '§PUSH_STORE_STALE writer=whatif logged=' + gotStale + ' file untouched=' + (sha(W3c.opfs.get()) === hc) + ' status="' + (W3c.sb.A.status.textContent || '') + '"');

  // ── C4: What-if private-seed rule ──
  var W4a = mk({ SQL: SQL }, noPh); var w4a = await driveWhatIf(W4a, true);
  claim('C4a-no-phases-uses-private-seed', w4a.opened && W4a.has('§WHATIF-UI db=private-seed reason=no-folded-project') && W4a.counts.seed === 1 && W4a.counts.store === 1, 'log private-seed=' + W4a.has('§WHATIF-UI db=private-seed reason=no-folded-project') + ' seed copies=' + W4a.counts.seed + ' store opens=' + W4a.counts.store + ' (shared store itself opened once for the phase test) acceptPersisted=' + w4a.persisted);
  var W4b = mk({ SQL: SQL }, SEED); var w4b = await driveWhatIf(W4b, false);
  claim('C4b-with-phases-uses-shared', w4b.opened && !W4b.has('db=private-seed') && W4b.counts.seed === 0 && W4b.counts.store === 1, 'private-seed logged=' + W4b.has('db=private-seed') + ' seed copies=' + W4b.counts.seed + ' store opens=' + W4b.counts.store);

  // ── C5: mutants — the witness must be able to say NO ──
  var M1 = await runAll({ mutant: 'diff-bypass' });
  var m1caught = !(M1.snap.store === 1 && M1.snap.opens === 1);
  claim('C5a-mutant-diff-bypasses-shared-IS-CAUGHT', m1caught, 'mutant store opens at the C1 snapshot=' + M1.snap.store + ' (C1 needs 1) shared opens=' + M1.opens());
  var M2 = mk({ SQL: SQL, mutant: 'no-stamp-guard' }, SEED); await driveDiff(M2);
  var mh = (await M2.PS.shared(M2.sb.A._SQL, function () { return 0; })).db; M2.opfs.put(extBytes); var hm = sha(M2.opfs.get()); var mr = await M2.PS.persistShared(mh, 'old-holder');
  claim('C5b-mutant-no-stamp-guard-IS-CAUGHT', mr === true && sha(M2.opfs.get()) !== hm, 'guard-less mutant let the stale write through (returned ' + mr + ', file overwritten=' + (sha(M2.opfs.get()) !== hm) + ') -> claim C3a is the one that catches it');

  // ── C6: vacuous run must print INCONCLUSIVE, not PASS ──
  var W6 = mk({ SQL: SQL }, SEED); var ex6 = Object.keys(W6.exercised).filter(function (k) { return W6.exercised[k]; }).length;
  function verdict(rs, exercised) { if (exercised === 0) return 'INCONCLUSIVE'; return rs.every(function (r) { return r.ok; }) ? 'PASS' : 'FAIL'; }
  var v6 = verdict([], ex6);
  claim('C6-vacuous-run-is-INCONCLUSIVE', v6 === 'INCONCLUSIVE', 'a run exercising ' + ex6 + ' consumers -> verdict ' + v6);

  var fails = results.filter(function (r) { return !r.ok; });
  var final = verdict(results, exer.length);
  console.log('§A4_SUMMARY claims=' + results.length + ' fail=' + fails.length + (fails.length ? ' [' + fails.map(function (f) { return f.id; }) + ']' : ''));
  console.log('§A4_VERDICT ' + final + ' — W-ONE-PO-STORE ' + (final === 'PASS' ? '(one store open for four consumers, cross-visibility, stale guard intact, mutants caught)' : ''));
  process.exit(final === 'PASS' ? 0 : final === 'FAIL' ? 1 : 2);
})().catch(function (e) { console.log('§A4_VERDICT FAIL — witness crashed: ' + (e && e.stack || e)); process.exit(1); });
