#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ONE-FOLD (bim-compiler prompts/CLI_ERP_IVR.md §49, the ERP one-ledger study §48 step 1). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: the page's fold (erp/crud_core.js listTip) gave every new record the key -opId, overwriting the key a door op carries, so a door order read by the page lost its lines
 *   (§48 probe: c_project 990001 -> -1 while c_projectphase.c_project_id stayed 990001). One ledger needs the door and the page to fold the same op-log to the same rows.
 * Model: the ERP seed through the door (erp.new / erp.complete), op-log and journal in a temp folder. The door's fold = object_cli.applyOp over a fresh seed copy (what the door replays at
 *   every boot); the page's fold = crud_core.listTip over the same ops as a kernel_ops table (what the page's tip shadow reads).
 *   K1 every door CRUD_CREATE on a table with a physical key carries keyKept:true and a positive key; K1b the same for object_cli.persist (the object.attach path), two creates -> two keys
 *   K2 the page's fold gives each created row the door's key, for every table the log creates into
 *   K3 every FK of a created row that names another created row finds that row in the page's fold (the lines find their order)
 *   K4 every column the ops wrote on a created row has the same value in the page's fold and the door's database
 *   K5 a page op (no keyKept) that carries a key still folds to -opId: the old rule holds for every page module
 *   K6 the door's change log (crud_core.changeLog, as object.history runs it): the order's DocStatus change starts from the value the create wrote
 * Falsifier: ONE_FOLD_BREAK=strip removes keyKept before the page folds -> K2, K3 must FAIL (today's behaviour before §49).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { kit, run, DOOR, ROOT } = require('./_kit');
const k = kit('W-ONE-FOLD');
const BREAK = process.env.ONE_FOLD_BREAK || '';
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onefold_')), OPS = path.join(dir, 'ops.jsonl'), J = path.join(dir, 'journal.jsonl'), env = { BIM_OBJECT_OPLOG: OPS, BIM_DOOR_JOURNAL: J };
  let seq = 0;
  const door = async (line) => { const r = await run(DOOR, ['--actor', 'human', '--request', 'of-' + (++seq), '--journal', J, line], env); let j = null; try { j = JSON.parse(r.out.trim()); } catch (e) {} return j; };
  // the door writes: an order, two lines, complete (facts = erp_draft.js's GardenWorld defaults: bp 112, product 137, doctype 132)
  const h = await door('erp.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id=112 salesrep_id=101'), no = h && h.answer && h.answer.number;
  if (!no) { k.incon('K1-K6', 'the door did not create the order: ' + JSON.stringify(h).slice(0, 200)); return k.end(); }
  await door('erp.new kind=C_OrderLine order=' + no + ' m_product_id=137 qtyentered=2');
  await door('erp.new kind=C_OrderLine order=' + no + ' m_product_id=137 qtyentered=3');
  const c = await door('erp.complete kind=Order number=' + no);
  k.L('door order=' + no + ' complete=' + (c && c.status) + ' ' + (c && c.answer && c.answer.after ? c.answer.after.docStatus : ''));
  const ops = fs.readFileSync(OPS, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const SQL = await require(path.join(ROOT, 'common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common/lib/sql-wasm.wasm')) });
  const seed = fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db'));
  const rowsOf = (db) => (sql, p) => { const st = db.prepare(sql); if (p) st.bind(p); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; };
  // the door's fold = the door's own boot (patch, plugins, then the op-log replayed by applyOp), in-process over the same op-log
  const ERP = require(path.join(ROOT, 'common/door/erp_cli.js')), errOut = process.stderr.write.bind(process.stderr), logOut0 = console.log;
  let DO; process.stderr.write = () => true; console.log = () => {}; try { DO = await ERP.boot({ oplog: OPS }); } finally { process.stderr.write = errOut; console.log = logOut0; }
  const D = DO.db, Drows = DO.rows, cols = {}, colsOf = (t) => cols[t] || (cols[t] = Drows('PRAGMA table_info(' + t + ')').map(x => String(x.name).toLowerCase()));
  const creates = ops.filter(o => o.op_type === 'CRUD_CREATE'), phys = creates.filter(o => !o.keyless && colsOf(o.table).indexOf(o.idCol || o.table + '_id') >= 0);   // keyless = a composite/UU-keyed table (erp_cli resolveOne): created whole, no single key to keep
  const kinds = {}; ops.forEach(o => { const x = o.op_type.replace('CRUD_', '').toLowerCase() + ':' + o.table; kinds[x] = (kinds[x] || 0) + 1; });
  k.L('ops=' + ops.length + ' creates=' + creates.length + ' physical-key creates=' + phys.length + ' kinds=' + JSON.stringify(kinds));
  if (!phys.length) { k.incon('K1-K4', 'the door log has no create on a table with a physical key: nothing to judge'); return k.end(); }
  // K1
  const bad1 = phys.filter(o => !(o.keyKept === true && Number.isInteger(Number(o.fields[o.idCol || o.table + '_id'])) && Number(o.fields[o.idCol || o.table + '_id']) > 0));
  k.chk('K1 every door create on a physical-key table carries keyKept and a positive key (' + phys.length + ' creates)', bad1.length === 0, bad1.length ? bad1.map(o => o.table + ' keyKept=' + o.keyKept + ' key=' + o.fields[o.idCol || o.table + '_id']).join('; ') : phys.map(o => o.table + '=' + o.fields[o.idCol || o.table + '_id']).join(' '));
  // K1b: object_cli.persist (the object.attach path) over a scratch copy of the seed, two creates of one kind with no key given
  const OC = require(path.join(ROOT, 'common/door/object_cli.js'));
  { const P = new SQL.Database(seed), O = { db: P, rows: rowsOf(P), opfile: path.join(dir, 'persist.ops.jsonl'), ops: [] };
    const mk = (n) => ({ op_type: 'CRUD_CREATE', key: 'ad_attachment', table: 'ad_attachment', verb: 'create', fields: { ad_client_id: 11, ad_org_id: 11, isactive: 'Y', ad_table_id: 259, record_id: 990000 + n, title: 'W-ONE-FOLD ' + n, ad_attachment_uu: 'onefold-' + n } });
    const logOut = console.log; console.log = () => {}; try { OC.persist ? OC.persist(O, [mk(1), mk(2)]) : null; } finally { console.log = logOut; }
    const got = fs.existsSync(O.opfile) ? fs.readFileSync(O.opfile, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
    if (!OC.persist) k.incon('K1b', 'object_cli does not export persist; the attach path cannot be judged in-process');
    else { const ks = got.map(o => o.fields.ad_attachment_id);
      k.chk('K1b object_cli.persist logs each create WITH its key and keyKept; two creates -> two different keys', got.length === 2 && got.every(o => o.keyKept === true && Number(o.fields.ad_attachment_id) > 0) && ks[0] !== ks[1], 'keys=' + JSON.stringify(ks) + ' keyKept=' + JSON.stringify(got.map(o => o.keyKept))); } }
  // the page's fold
  const CORE = require(path.join(ROOT, 'erp/crud_core.js'));
  const S = new SQL.Database(); S.run('CREATE TABLE kernel_ops (id INTEGER PRIMARY KEY, op_uuid TEXT, op_type TEXT, parameters TEXT, timestamp TEXT, undone INTEGER DEFAULT 0, branch_id TEXT, gid TEXT)');
  ops.forEach((o, i) => { const p = JSON.parse(JSON.stringify(o)); if (BREAK === 'strip') delete p.keyKept; S.run('INSERT INTO kernel_ops (id, op_type, parameters, timestamp) VALUES (?,?,?,?)', [i + 1, p.op_type, JSON.stringify(p), p.t || '']); });
  const quiet = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
  const tables = [...new Set(phys.map(o => o.table))], page = {};
  tables.forEach(t => { const pk = phys.find(o => o.table === t).idCol || t + '_id'; page[t] = { pk, rows: (quiet(() => CORE.listTip(S, t, pk, [], null)) || {}).rows || [] }; });
  // K2
  const miss2 = [];
  tables.forEach(t => { const pk = page[t].pk, want = phys.filter(o => o.table === t).map(o => String(o.fields[pk])).sort(), have = page[t].rows.map(r => String(r[pk])).sort();
    k.L('K2 table=' + t + ' door_keys=' + JSON.stringify(want) + ' page_keys=' + JSON.stringify(have));
    if (JSON.stringify(want) !== JSON.stringify(have)) miss2.push(t); });
  k.chk('K2 the page\'s fold keeps the door\'s key on every created row (' + tables.length + ' tables)', miss2.length === 0, miss2.length ? 'differ: ' + miss2.join(',') : tables.join(','));
  // K3: FKs between created rows
  const made = {}; tables.forEach(t => phys.filter(o => o.table === t).forEach(o => { made[page[t].pk + '=' + o.fields[page[t].pk]] = t; }));
  let links = 0; const broken = [];
  tables.forEach(t => page[t].rows.forEach(r => Object.keys(r).forEach(c => {
    if (c === page[t].pk || !/_id$/.test(c)) return; const tag = c + '=' + r[c], pt = made[tag]; if (!pt) return;
    links++; if (!page[pt].rows.some(x => String(x[page[pt].pk]) === String(r[c]))) broken.push(t + '.' + tag); })));
  // with the falsifier the page keys are -opId, so the FKs (door keys) name rows the page fold does not have: count those as broken too
  if (BREAK === 'strip') tables.forEach(t => phys.filter(o => o.table === t).forEach(o => Object.keys(o.fields).forEach(c => { const pt = made[c + '=' + o.fields[c]]; if (pt && c !== page[t].pk && !page[pt].rows.some(x => String(x[page[pt].pk]) === String(o.fields[c]))) broken.push(t + '.' + c + '=' + o.fields[c]); })));
  if (!links && !broken.length) k.incon('K3', 'no created row names another created row: nothing to join');
  else k.chk('K3 every FK between created rows finds its row in the page\'s fold (' + links + ' links)', broken.length === 0, broken.length ? 'broken: ' + broken.slice(0, 6).join('; ') : 'e.g. c_orderline.c_order_id -> c_order');
  // K4: every written column, door database vs page fold
  const wrote = {}; ops.forEach(o => { const t = o.table; if (!page[t]) return; const pk = page[t].pk;
    if (o.op_type === 'CRUD_CREATE' && o.fields[pk] != null) { const key = String(o.fields[pk]); (wrote[t + '|' + key] = wrote[t + '|' + key] || new Set()); Object.keys(o.fields).forEach(c => wrote[t + '|' + key].add(c.toLowerCase())); }
    else if (o.op_type === 'CRUD_UPDATE' && wrote[t + '|' + String(o.id)]) Object.keys(o.changes || {}).forEach(c => wrote[t + '|' + String(o.id)].add(c.toLowerCase())); });
  let cells = 0; const diff4 = [];
  Object.keys(wrote).forEach(x => { const [t, key] = x.split('|'), pk = page[t].pk, dr = Drows('SELECT * FROM ' + t + ' WHERE ' + pk + '=?', [Number(key)])[0], pr = page[t].rows.find(r => String(r[pk]) === key);
    if (!dr || !pr) { diff4.push(x + ' missing ' + (!dr ? 'door' : 'page')); return; }
    const lc = (o) => { const m = {}; Object.keys(o).forEach(c => { m[c.toLowerCase()] = o[c]; }); return m; }, d = lc(dr), p = lc(pr);
    wrote[x].forEach(c => { if (colsOf(t).indexOf(c) < 0) return; cells++; const a = d[c] == null ? null : String(d[c]), b = p[c] == null ? null : String(p[c]); if (a !== b && !(a !== null && b !== null && Number(a) === Number(b))) diff4.push(x + '.' + c + ' door=' + a + ' page=' + b); }); });
  k.chk('K4 every column the ops wrote has the same value in both folds (' + Object.keys(wrote).length + ' rows, ' + cells + ' cells)', diff4.length === 0 && cells > 0, diff4.length ? diff4.slice(0, 6).join('; ') : 'all equal');
  // K5: a page op without keyKept keeps the old rule
  { const T = new SQL.Database(); T.run('CREATE TABLE kernel_ops (id INTEGER PRIMARY KEY, op_uuid TEXT, op_type TEXT, parameters TEXT, timestamp TEXT, undone INTEGER DEFAULT 0, branch_id TEXT, gid TEXT)');
    T.run('INSERT INTO kernel_ops (id, op_type, parameters) VALUES (7, ?, ?)', ['CRUD_CREATE', JSON.stringify({ op_type: 'CRUD_CREATE', table: 'c_order', fields: { c_order_id: 777, documentno: 'K5' } })]);
    const r = (quiet(() => CORE.listTip(T, 'c_order', 'c_order_id', [], null)) || {}).rows || [];
    k.chk('K5 a page op without keyKept that carries a key folds to -opId, as before', r.length === 1 && Number(r[0].c_order_id) === -7, 'key=' + (r[0] && r[0].c_order_id)); }
  // K6: the door's change log over its own ops (object.history's call: changeLog over sideDbOf, insertLog N)
  { const oid = Number((phys.find(o => o.table === 'c_order') || { fields: {} }).fields.c_order_id), upd = ops.filter(o => o.op_type === 'CRUD_UPDATE' && o.table === 'c_order' && String(o.id) === String(oid) && o.changes && o.changes.docstatus);
    const created = (phys.find(o => o.table === 'c_order') || { fields: {} }).fields.docstatus;
    let L = null; try { L = quiet(() => CORE.changeLog(S, 'c_order', oid, { dictDb: D, insertLog: 'N' })); } catch (e) { L = null; k.L('K6 changeLog error ' + e.message); }
    const ents = Array.isArray(L) ? L : (L && (L.rows || L.entries)) || [], ds = ents.filter(e => String(e.column || e.columnName || '').toLowerCase() === 'docstatus');
    k.L('K6 order=' + oid + ' docstatus updates in the log=' + upd.length + ' change-log entries=' + ents.length + ' docstatus entries=' + ds.length + (ds[0] ? ' first old=' + ds[0].old + ' new=' + ds[0]['new'] : ''));
    if (!upd.length || !ds.length) k.incon('K6', 'no DocStatus change-log entry to judge (updates=' + upd.length + ', entries=' + ds.length + '; the seed may not log c_order.DocStatus)');
    else k.chk('K6 the change log\'s first DocStatus entry starts from the value the create wrote (' + created + ')', String(ds[0].old) === String(created), 'old=' + ds[0].old + ' created=' + created); }
  k.L('break=' + (BREAK || 'none') + ' dir=' + dir);
  k.end();
})().catch(e => { console.log('§W-ONE-FOLD ERROR ' + (e && e.stack)); process.exit(1); });
