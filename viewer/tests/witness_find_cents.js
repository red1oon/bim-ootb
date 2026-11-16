// ⚠ DO NOT REMOVE — W-FIND-CENTS (bim-compiler prompts/CLI_ERP_IVR.md §32: the Find panel's cost bar in cents, on its own push's basis; owner 2026-11-17 "Same as its push"). READ THE LOG; an exit code is not evidence.
//   B1 ISSUE (the bar is not what its push posts): on the shipped db (no 4D schedule) the bar's exact total == the PlannedAmt ProjFold.foldProjectOrder writes from the push's own rows (a seed copy)
//   B2 ISSUE (the bar ignores the page's 4D schedule): on the building db right after materializeZones the bar's exact total == red1 cost's totalExact (the door's viewer.cost answer), basis = tasks
//   B3 ISSUE (the bar shows whole units): the text is "RM d,ddd.dd" and its figure == B1's PlannedAmt rounded HALF_UP to C_Currency.StdPrecision (an independent BigInt rounding here)
//   Instrument: the SHIPPED pipeline, scripts/cache_4d_run.js build() with its read-only onDb hook (as W-FOLD-SCHEDULE-FROM-DB); FindErpPush.create with selectionPriced = ProjOrderState.pricedRowsFor
//   (pinned equal to the page's _selectionPriced SQL by W-S9-PURE S1). Falsifiers: FIND_COST_BREAK=nosplit must FAIL B2 · FIND_COST_BREAK=introws must FAIL B1 and B3.
// Run: NODE_PATH=<bim-ootb>/node_modules node viewer/tests/witness_find_cents.js [building=Duplex]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), V = path.join(ROOT, 'viewer'), SEED = path.join(ROOT, 'erp', 'ad_seed.db');
const { kit, run, DOOR } = require(path.join(ROOT, 'common', 'door', 'tests', '_kit.js'));
const k = kit('W-FIND-CENTS'), BLD = process.argv[2] || 'Duplex';
const quiet = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };
// an independent HALF_UP of a decimal string to p places (BigInt, no BigDecimal): the B3 oracle
function halfUp(s, p) { const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(s)); if (!m) return null; const f = (m[3] || '') + '0'.repeat(p + 1); let v = BigInt(m[2] + f.slice(0, p)); if (Number(f[p]) >= 5) v += 1n; const t = v.toString().padStart(p + 1, '0'); return m[1] + (p ? t.slice(0, -p) + '.' + t.slice(-p) : t); }
(async () => {
  const SV = require(path.join(V, 'tools', 'schedule_verbs.js')), SQL = await SV.getSQL();
  const S = SV.selectionOf({ building: BLD, where: [] }, SQL); if (S.inconclusive) { k.incon('B1-B3', S.inconclusive); return k.end(); }
  const BD = require(path.join(ROOT, 'erp', 'bigdecimal.js'));
  const mkPush = (db, env) => { global.ProjFold = quiet(() => require(path.join(V, 'proj_fold.js'))); delete require.cache[require.resolve(path.join(V, 'find_erp_push.js'))];
    const FEP = require(path.join(V, 'find_erp_push.js'));
    return FEP.create({ A: { db, _SQL: SQL, activeBuilding: BLD, cachedFetch: () => Promise.resolve(fs.readFileSync(SEED)) }, selectionPriced: (set) => S.PS.pricedRowsFor(db, Array.from(set), env, null), cur: () => 'RM', getLastSelSet: () => null, getLastSelLabel: () => '' }); };

  // ── B1 + B3: the shipped db (no schedule)
  delete global.ScheduleAuthor; delete global._4dTemplate;
  const P1 = mkPush(S.bdb, S.env), set1 = new Set(S.guids), a1 = quiet(() => P1.basisAmount(set1)), basis1 = quiet(() => P1.pushBasis(set1));
  const erp = new SQL.Database(fs.readFileSync(SEED)), rt = {};
  require('vm').runInNewContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8') + '\n;__o.SEQ=typeof SEQUENCE_RULES!=="undefined"?SEQUENCE_RULES:{};', { __o: rt, console: { log() {}, warn() {} }, window: undefined });
  const fold = quiet(() => global.ProjFold.foldProjectOrder(erp, BLD, basis1.priced.rows, { seqRules: rt.SEQ, schedule: basis1.sched4D, hierarchy: {}, packCurrencyISO: 'RM', now: '2026-11-17 00:00:00' }));
  const prec = await P1.precision('RM'), text = a1 ? P1.centsText('RM', a1.totalExact, prec) : '';
  k.L('B1 shipped db: schedule=' + (basis1.sched4D ? basis1.sched4D.tasks.length + ' tasks' : 'none') + ' bar totalExact=' + (a1 && a1.totalExact) + ' lines=' + (a1 && a1.lines) + ' | fold plannedAmt=' + fold.plannedAmt + ' lines=+' + (fold.created && fold.created.lines) + ' | precision=' + prec + ' text="' + text + '"');
  if (!a1 || a1.capped || !S.guids.length) k.incon('B1', 'VACUOUS: nothing priced (' + JSON.stringify(a1) + ')');
  else k.chk('B1 with no 4D schedule the bar\'s exact total equals the PlannedAmt the push\'s fold writes from the same rows', !basis1.sched4D && BD.of(a1.totalExact).compareTo(BD.of(String(fold.plannedAmt))) === 0, a1.totalExact + ' vs ' + fold.plannedAmt);
  const want = prec == null ? null : halfUp(String(fold.plannedAmt), prec), fig = text.replace(/^RM /, '').replace(/,/g, '');
  if (prec == null) k.incon('B3', 'VACUOUS: no C_Currency precision found for RM');
  else k.chk('B3 the bar reads "RM d,ddd.dd": ' + prec + ' decimals, thousands separators, and its figure == the PlannedAmt rounded HALF_UP (independent BigInt)', /^RM -?\d{1,3}(,\d{3})*\.\d{2}$/.test(text) && fig === want, '"' + text + '" want ' + want);

  // ── B2: the building db right after materializeZones (the page after 4D is generated)
  let a2 = null, t2 = null;
  await CACHE().build(BLD, true, undefined, { onDb: (db, res, ctx) => {
    global.ScheduleAuthor = ctx.SA; global._4dTemplate = ctx.template;
    const guids = (db.exec('SELECT guid FROM elements_meta')[0] || { values: [] }).values.map(r => r[0]);
    const P2 = mkPush(db, S.env); a2 = quiet(() => P2.basisAmount(new Set(guids))); t2 = (res && res.tasks || []).length;
  } });
  const door = await run(DOOR, ['--actor', 'human', 'viewer.cost building=' + BLD], { BIM_OBJECT_OPLOG: path.join(require('os').tmpdir(), 'wfc_' + process.pid + '.ops.jsonl'), BIM_DOOR_JOURNAL: path.join(require('os').tmpdir(), 'wfc_' + process.pid + '.j.jsonl') });
  let dc = null; try { dc = JSON.parse(door.out).answer; } catch (e) { dc = null; }
  k.L('B2 after materializeZones: tasks=' + t2 + ' bar totalExact=' + (a2 && a2.totalExact) + ' basis tasks=' + (a2 && a2.tasks) + ' lines=' + (a2 && a2.lines) + ' | red1 cost totalExact=' + (dc && dc.totalExact) + ' total=' + (dc && dc.total) + ' lines=' + (dc && dc.lines));
  if (!t2 || !a2 || !dc || dc.totalExact == null) k.incon('B2', 'VACUOUS: no tasks, no bar amount or no door answer (' + String(door.out).slice(0, 120) + ')');
  else k.chk('B2 once 4D is generated the bar splits per its tasks and its exact total equals red1 cost\'s totalExact', a2.tasks === t2 && BD.of(a2.totalExact).compareTo(BD.of(String(dc.totalExact))) === 0, a2.totalExact + ' vs ' + dc.totalExact);
  k.end();
})().catch(e => { console.log('§W-FIND-CENTS ERROR ' + (e && e.stack || e)); process.exit(2); });
function CACHE() { return require(path.join(ROOT, 'scripts', 'cache_4d_run.js')); }
