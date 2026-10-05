// ⚠ DO NOT REMOVE — Scope: W-PILOT-GROUP-RELAY, ERP_PARALLEL_RUN_PILOT.md §9 Phase A (relay + fold integrity).
// THE ISSUE: do three stations (own context/IDB/signer, own org+warehouse) each ringing POS sales, persisted on three
// different hosts (here / OCI dev / GH), fold at an admin with every op present, signed by its station, gid intact,
// no DocumentNo/id clash — and does the admin tip equal when the folded log is re-read from each host?
// READ pilot_out/<run>/run.log after every run. Exit code is not evidence. No screenshots.
// Run: node erp/tests/pilot_group_relay_live.js   (env PILOT_SALES=5, PILOT_NET=0 to skip OCI/GH writes)
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const L = require('./pilot_lib.js'), H = require('./pilot_hosts.js');
const RELAY = require(process.env.RELAY_SERVER || '/home/red1/bim-compiler/build/erp/erp_relay_server.js');
const SQLJS = require('/home/red1/bim-ootb/tests/node_modules/sql.js');
const SALES = Number(process.env.PILOT_SALES || 5), NET = process.env.PILOT_NET !== '0';
const RUN = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const OUT = path.join(__dirname, 'pilot_out', RUN); fs.mkdirSync(OUT, { recursive: true });
const LOG = []; const say = s => { LOG.push(s); console.log(s); };
const QTYS = [1, 2, 1, 3, 2];
const STATIONS = [
  { id: 'north', org: 50002, wh: 50003, host: 'here', port: 29201 },
  { id: 'south', org: 50004, wh: 50004, host: 'OCI', port: 29202 },
  { id: 'east',  org: 50005, wh: 50005, host: 'GH', port: 29203 } ];
const ADMIN_PORT = 29204;

(async () => {
  global.window = global.window || {}; if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
  require(path.join(L.REPO, 'erp', 'kernel_ops.js')); const K = global.window.KernelOps;
  const SIGN = require(path.join(L.REPO, 'erp', 'erp_snapshot_sign.js')), EP = require(path.join(L.REPO, 'erp', 'erp_key_epochs.js'));
  const srv = await L.serveRepo(); const base = 'http://localhost:' + srv.address().port + '/erp';
  say('§PILOT-RUN id=' + RUN + ' sales_per_station=' + SALES + ' net_writes=' + NET + ' served=' + L.REPO);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const relays = {};
  for (const st of STATIONS) { relays[st.id] = RELAY.createRelayServer({ port: st.port }); await relays[st.id].listen(); st.relay = 'http://localhost:' + st.port; }
  const aRelay = RELAY.createRelayServer({ port: ADMIN_PORT }); await aRelay.listen();
  const ADMIN_URL = 'http://localhost:' + ADMIN_PORT;
  // ── 1. stations ring sales in parallel (own context each) ──
  await Promise.all(STATIONS.map(async st => {
    await L.openStation(browser, st, base, st.relay, 143);
    await L.sleep(500);
    st.id_key = await st.page.evaluate(() => ({ hex: window.ErpSigner && window.ErpSigner.pubKeyHex, jwk: window.ErpSigner && window.ErpSigner.pubKeyJwk }));
    st.sales = [];
    for (let i = 0; i < SALES; i++) {
      const r = await L.ringSale(st, base, st.relay, QTYS[i % QTYS.length]); st.sales.push(r);
      say('§PILOT-SALE station=' + st.id + ' n=' + (i + 1) + ' qty=' + QTYS[i % QTYS.length] + ' local_order_id=' + r.oid + ' completed=' + r.co + ' posted=' + r.gl);
    }
    st.rows = (await L.readRows(st.page)).rows;
    st.head = (await (await fetch(st.relay + '/health')).json()).head;
    const snap = await (await fetch(st.relay + '/snapshot')).json(); st.snap = snap.ops;
  }));
  fs.writeFileSync(path.join(OUT, 'station_pagelogs.txt'), STATIONS.map(s => '##### ' + s.id + '\n' + s.L.filter(l => /^§|PAGEERR/.test(l)).join('\n')).join('\n'));
  // ── 2. publish each station's log to its host, admin pulls it back ──
  const pulled = {};
  for (const st of STATIONS) {
    const payload = JSON.stringify({ kind: 'pilot-station-oplog', station: st.id, org: st.org, wh: st.wh, signer_kid: st.id_key.hex, head: st.head, ops: st.snap });
    const f = path.join(OUT, st.id + '_relay_snapshot.json'); fs.writeFileSync(f, payload);
    let got, hostReal = 'REAL';
    if (st.host === 'here') { got = { url: st.relay + '/snapshot', body: JSON.stringify(Object.assign(JSON.parse(payload), { ops: (await (await fetch(st.relay + '/snapshot')).json()).ops })), backMd5: null }; }
    else if (!NET) { st.host += '(net-off)'; hostReal = 'SKIPPED'; got = { url: 'file', body: payload, backMd5: H.md5(payload) }; }
    else if (st.host === 'OCI') got = await H.ociPut('pilot_phaseA/' + RUN + '/' + st.id + '/relay_snapshot.json', f);
    else got = await H.ghPut('pilot_phaseA/' + RUN + '/' + st.id + '/relay_snapshot.json', f);
    const j = JSON.parse(got.body);
    const wire = got.backMd5 == null ? 'live-relay' : (got.backMd5 === H.md5(payload) ? 'md5-match' : 'MD5-MISMATCH');
    say('§PILOT-HOST station=' + st.id + ' host=' + st.host + ' role=' + hostReal + ' url=' + got.url + ' bytes=' + got.body.length + ' fetchback=' + wire);
    pulled[st.id] = j.ops;
  }
  // ── 3. admin folds: push the pulled logs into the admin relay (dumb transport), then real Sync click ──
  for (const st of STATIONS) {
    const res = await (await fetch(ADMIN_URL + '/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: pulled[st.id] }) })).json();
    say('§PILOT-ADMIN-PULL station=' + st.id + ' pushed=' + pulled[st.id].length + ' accepted=' + res.accepted + ' skipped=' + res.skipped + ' head=' + res.head);
  }
  const adm = { id: 'admin', L: [] };
  await L.openStation(browser, adm, base, ADMIN_URL, 146);
  for (let k = 0; k < 2; k++) { await adm.page.click('#erp-sync-pill'); await L.waitLog(adm, /§SYNC_RELAY syncNow applied=/, 0, 30000); await L.sleep(1500); adm.L.length = 0; }
  const A = (await L.readRows(adm.page)).rows;
  const ver = await adm.page.evaluate(async () => { const K = window.__crud.kernelDb(); const v = await window.KernelOps.verifyChain(K); return { ok: v.ok, why: v.why, opFail: v.opFail, len: v.len, tip: v.tip }; });
  const tipRow = A.filter(r => r.op_hash).pop(); const adminTip = tipRow ? tipRow.op_hash : 'GENESIS';
  say('§PILOT-ADMIN-FOLD rows=' + A.length + ' tip=' + String(adminTip).slice(0, 16) + ' verifyChain(single-signer)=' + JSON.stringify(ver));
  // ── 4. per-station relay witness ──
  const roster = {}; STATIONS.forEach(s => roster[s.id_key.hex] = s.id_key.jwk);
  const mdv = await EP.verifyMultiDeviceOps(A, { roster, verify: (m, s, p) => SIGN.verifyTip(m, s, p) });
  say('§PILOT-MULTIDEVICE-VERIFY ok=' + mdv.ok + ' len=' + mdv.len + ' attributed=' + Object.keys(mdv.attributed || {}).length + ' anonymous=' + (mdv.anonymous || []).length + ' why=' + (mdv.why || ''));
  const byUuid = {}; A.forEach(r => byUuid[r.op_uuid] = r);
  const docnos = {}, tgt = {};
  A.forEach(r => { let p = {}; try { p = JSON.parse(r.parameters); } catch (e) {}
    if (p.table === 'c_order' && p.fields && p.fields.documentno) { (docnos[p.fields.documentno] = docnos[p.fields.documentno] || []).push(r.op_uuid); }
    if (p.op_type === 'SET_STATUS' || p.action === 'CO') { const k = p.table + ':' + p.id; (tgt[k] = tgt[k] || []).push(r.op_uuid); } });
  for (const st of STATIONS) {
    let atAdmin = 0, sigOk = 0, gidOk = 0;
    for (const o of st.rows) { const a = byUuid[o.op_uuid]; if (!a) continue; atAdmin++;
      if (a.sig === o.sig && mdv.ok && mdv.attributed && mdv.attributed[a.id] === st.id_key.hex) sigOk++;
      if (a.gid === o.gid) gidOk++; }
    const mine = new Set(st.rows.map(r => r.op_uuid));
    const dup = Object.keys(docnos).filter(d => docnos[d].length > 1 && docnos[d].some(u => mine.has(u))).length;
    say('§PILOT-GROUP-RELAY station=' + st.id + ' host=' + st.host + ' org=' + st.org + ' wh=' + st.wh + ' sales=' + st.sales.filter(s => s.co && s.gl).length + '/' + SALES +
      ' ops_sent=' + st.rows.length + ' ops_at_relay=' + st.head + ' ops_at_admin=' + atAdmin + ' sig_ok=' + sigOk + ' gid_intact=' + gidOk + ' docno_dup=' + dup +
      ' verdict=' + (atAdmin === st.rows.length && sigOk === atAdmin && gidOk === atAdmin && dup === 0 && st.rows.length > 0 ? 'PASS' : (st.rows.length === 0 ? 'INCONCLUSIVE' : 'FAIL')));
  }
  const clash = Object.keys(tgt).filter(k => new Set(tgt[k]).size > 1);
  say('§PILOT-ID-CLASH doc_targets=' + Object.keys(tgt).length + ' targets_hit_by_multiple_ops=' + clash.length + ' (same table:id completed by >1 station => local negative ids collide) sample=' + clash.slice(0, 4).join(','));
  say('§PILOT-DOCNO-CLASH distinct_docnos=' + Object.keys(docnos).length + ' dup_docnos=' + Object.keys(docnos).filter(d => docnos[d].length > 1).join(','));
  // ── 5. admin chain tip re-read from every reachable host ──
  const adminOps = (await (await fetch(ADMIN_URL + '/snapshot')).json()).ops;
  const SQL = await SQLJS();
  async function replayTip(ops) {
    const db = new SQL.Database(); K.ensureTable(db); db.run('DELETE FROM kernel_ops');
    ops.forEach(op => db.run('INSERT INTO kernel_ops (op_uuid,timestamp,op_type,parameters,input_guids,output_guid) VALUES (?,?,?,?,?,?)', [op.op_uuid, op.timestamp, op.op_type, op.parameters, op.input_guids || null, op.output_guid || null]));
    await K.sealChain(db); const v = await K.verifyChain(db); return { tip: v.tip, len: v.len };
  }
  const fp = path.join(OUT, 'admin_folded_relay_snapshot.json'); const apay = JSON.stringify({ kind: 'pilot-admin-folded', browser_tip: adminTip, ops: adminOps }); fs.writeFileSync(fp, apay);
  const tips = [{ host: 'here', ...(await replayTip(adminOps)) }];
  if (NET) {
    for (const [h, fn] of [['OCI', H.ociPut], ['GH', H.ghPut]]) {
      const got = await fn('pilot_phaseA/' + RUN + '/admin/relay_snapshot.json', fp);
      tips.push({ host: h, url: got.url, md5: got.backMd5 === H.md5(apay) ? 'match' : 'MISMATCH', ...(await replayTip(JSON.parse(got.body).ops)) });
    }
  }
  tips.forEach(t => say('§PILOT-ADMIN-TIP host=' + t.host + ' replay_tip=' + String(t.tip).slice(0, 16) + ' len=' + t.len + ' fetchback=' + (t.md5 || 'n/a') + ' equals_admin_browser_tip=' + (t.tip === adminTip)));
  say('§PILOT-ADMIN-TIP-VERDICT hosts=' + tips.length + ' all_equal=' + tips.every(t => t.tip === tips[0].tip) + (tips.length < 3 ? ' INCONCLUSIVE(<3 hosts)' : ''));
  // ── 6. report inputs: dump admin rows + folded-db views for pilot_report.js ──
  fs.writeFileSync(path.join(OUT, 'admin_rows.json'), JSON.stringify(A));
  await adm.page.goto(base + '/idempiere.html?login=GardenAdmin&window=146&relay=' + encodeURIComponent(ADMIN_URL), { waitUntil: 'load' });
  await adm.page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 40000 }); await L.sleep(2500);
  const q = s => adm.page.evaluate(s => { try { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; } catch (e) { return 'ERR ' + e.message; } }, s);
  fs.writeFileSync(path.join(OUT, 'admin_views.json'), JSON.stringify({
    orders: await q("select c_order_id,documentno,docstatus,ad_org_id,m_warehouse_id,grandtotal from c_order where c_order_id<0 or documentno like '1000%' order by c_order_id"),
    inout: await q('select m_inout_id,documentno,docstatus,ad_org_id,m_warehouse_id from m_inout where m_inout_id<0 order by m_inout_id'),
    invoice: await q('select c_invoice_id,documentno,docstatus,ad_org_id,grandtotal from c_invoice where c_invoice_id<0 order by c_invoice_id') }));
  say('§PILOT-OBJECTS-PUT ' + (H.PUT.length ? H.PUT.join(' ; ') : 'none'));
  fs.writeFileSync(path.join(OUT, 'run.log'), LOG.join('\n') + '\n');
  await browser.close(); srv.close(); for (const k in relays) await relays[k].close(); await aRelay.close();
  say('§PILOT-DONE out=' + OUT); process.exit(0);
})().catch(e => { console.log('THREW ' + e.stack); try { fs.writeFileSync(path.join(OUT, 'run.log'), LOG.join('\n') + '\nTHREW ' + e.stack); } catch (x) {} process.exit(1); });
