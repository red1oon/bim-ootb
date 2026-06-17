// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
'use strict';
/**
 * genesis.js — Layer-1 GENESIS WF (SYSTEM_ADMIN_LANE.md §5 Layer 1). Witness: W-GENESIS-MINIMAL.
 *
 * SPEC (the contract; spec-first):
 *   The Initial Client Setup (iDempiere `InitialClientSetup` → `MSetup`, distilled in SYSTEM_ADMIN_LANE §1)
 *   re-expressed as an OP-LOGGED birth: a tenant is BORN by appending an ordered, hash-chained list of signed
 *   CREATE-op groups (G1..G6), which FOLD into a fresh tenant DB. "Minimal" = minimal INPUT (default CoA, ~3
 *   fields) — NOT a stripped OUTPUT: G3 folds iDempiere's full default chart of accounts.
 *
 *   birthTenant(input) -> { input, groups:[{seq,label,ops:[{op:'CREATE',table,row}],parent,tip}], tip, refs }
 *     input = { clientName, currencyId, currencyPrecision, adminUser, dateAcct }
 *     Each group's tip = sha256(parent.tip + JSON(ops)) — op-log = git-for-data (replay/branch/reverse).
 *   foldGenesis(groups, db) -> apply every CREATE op into `db` (better-sqlite3 OR sql.js facade); schema inferred.
 *   signHead(groups) -> ECDSA-sign the head tip (the signed genesis bundle). [async; webcrypto, node + browser]
 *
 *   ACCEPTANCE (W-GENESIS-MINIMAL): a born tenant can CREATE -> COMPLETE -> POST one sales invoice whose GL ==
 *   the iDempiere oracle to the cent (DR 12110 Receivable / CR 41000 Revenue / CR 21610 Tax-due, balanced),
 *   posted via the SHIPPED doc_poster.derivePostings + post_resolver (consume the seam, never fork a verb).
 *
 * ISOMORPHIC (node + browser, ONE code path): no fs/path; seeds via genesis_seed (require | global.GenesisSeed);
 *   sha256 = an embedded SYNC implementation (the witness recomputes every tip with node's crypto and asserts
 *   equality → that check PROVES the embedded sha256 == node's over the real payloads); signing via webcrypto.
 *
 * NON-INVENT: chart + default-account wiring from genesis_seed (311 real accounts / 73 real col→value maps,
 *   extracted from idempiere_test, incl. c_receivable_acct->12110 / p_revenue_acct->41000 / t_due_acct->21610).
 *   No Date.now / no Math.random — ids are a deterministic monotonic counter; dateAcct is an explicit input.
 *
 * SEPARATION (SYSTEM_ADMIN_LANE §4): this module ONLY composes CREATE ops. It never re-implements a write/commit
 *   verb (CRUD/Process sessions own those) nor the posting fold (doc_poster). It produces the rows those read.
 */
(function (global) {

  var SEED = (typeof require === 'function') ? require('./genesis_seed.js') : global.GenesisSeed;

  // ── embedded SYNC sha256 (ASCII payload → hex). One isomorphic code path; cross-checked by the witness. ─────
  function sha256(ascii) {
    function rr(v, n) { return (v >>> n) | (v << (32 - n)); }
    var maxWord = Math.pow(2, 32), result = '', words = [], bitLen = ascii.length * 8, i, j;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], pc = k.length, comp = {};
    for (var cand = 2; pc < 64; cand++) {
      if (!comp[cand]) {
        for (i = 0; i < 313; i += cand) comp[i] = cand;
        hash[pc] = (Math.pow(cand, .5) * maxWord) | 0;
        k[pc++] = (Math.pow(cand, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return null;                                   // non-ASCII → caller/witness sees the break
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] +
            (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) {
      var b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : '') + b.toString(16);
    }
    return result;
  }

  function IdGen(base) { this.n = base || 1000000; }
  IdGen.prototype.next = function () { return ++this.n; };

  // ── the WF builder ───────────────────────────────────────────────────────────────────────────────────────
  function birthTenant(input) {
    input = input || {};
    var clientName = input.clientName || 'NewCo';
    var ccyId = input.currencyId != null ? input.currencyId : 100;          // USD
    var ccyPrec = input.currencyPrecision != null ? input.currencyPrecision : 2;
    var adminUser = input.adminUser || 'admin';
    var dateAcct = input.dateAcct || '2024-01-15';                          // explicit, not Date.now

    var id = new IdGen(1000000), groups = [], parent = '0'.repeat(64);
    function group(label, ops) {
      var tip = sha256(parent + JSON.stringify(ops));
      groups.push({ seq: groups.length + 1, label: label, ops: ops, parent: parent, tip: tip });
      parent = tip;
    }
    function create(table, row) { return { op: 'CREATE', table: table, row: row }; }

    // ── G1 IDENTITY ─────────────────────────────────────────────────────────────────────────────────────────
    var clientId = id.next(), orgId = id.next();
    var roleAdminId = id.next(), roleUserId = id.next(), userId = id.next();
    group('G1 identity', [
      create('ad_client', { ad_client_id: clientId, name: clientName, value: clientName }),
      create('ad_org', { ad_org_id: orgId, ad_client_id: clientId, name: clientName + ' HQ', value: 'HQ' }),
      create('ad_role', { ad_role_id: roleAdminId, ad_client_id: clientId, name: clientName + ' Admin', userlevel: '  C' }),
      create('ad_role', { ad_role_id: roleUserId, ad_client_id: clientId, name: clientName + ' User', userlevel: '   O' }),
      create('ad_user', { ad_user_id: userId, ad_client_id: clientId, name: adminUser }),
      create('ad_user_roles', { ad_user_id: userId, ad_role_id: roleAdminId, ad_client_id: clientId }),
      create('ad_org_info', { ad_org_id: orgId, ad_client_id: clientId })
    ]);

    // ── G2 CALENDAR + PERIOD ─────────────────────────────────────────────────────────────────────────────────
    var calId = id.next(), yearId = id.next(), periodId = id.next(), year = dateAcct.slice(0, 4);
    group('G2 calendar', [
      create('c_calendar', { c_calendar_id: calId, ad_client_id: clientId, name: clientName + ' Calendar' }),
      create('c_year', { c_year_id: yearId, c_calendar_id: calId, ad_client_id: clientId, fiscalyear: year }),
      create('c_period', { c_period_id: periodId, c_year_id: yearId, ad_client_id: clientId,
        name: 'Jan-' + year, startdate: year + '-01-01', enddate: year + '-12-31', periodtype: 'S' })
    ]);

    // ── G3 CHART (fold iDempiere's full default CoA — the data-bearing step) ─────────────────────────────────
    var elementId = id.next(), coa = SEED.coa, evByValue = {};
    var g3 = [create('c_element', { c_element_id: elementId, ad_client_id: clientId, name: 'Account', elementtype: 'A' })];
    coa.forEach(function (a) {
      var evId = id.next(); evByValue[a.value] = evId;
      g3.push(create('c_elementvalue', { c_elementvalue_id: evId, c_element_id: elementId, ad_client_id: clientId,
        value: a.value, name: a.name, accounttype: a.accounttype, accountsign: a.accountsign, issummary: 'N' }));
    });
    group('G3 chart', g3);

    // ── G4 ACCTSCHEMA + default-account wiring (DERIVE: col -> validcombination -> elementvalue) ──────────────
    var asId = id.next();
    var g4 = [create('c_acctschema', { c_acctschema_id: asId, ad_client_id: clientId, name: clientName + ' US/USD',
      c_currency_id: ccyId, c_element_id: elementId })];
    var map = SEED.acctMap, vcByColumn = {};
    Object.keys(map).forEach(function (col) {
      var evId = evByValue[map[col]];
      if (evId == null) return;                                            // value not in CoA -> skip (honest)
      var vcId = id.next(); vcByColumn[col] = vcId;
      g4.push(create('c_validcombination', { c_validcombination_id: vcId, ad_client_id: clientId,
        c_acctschema_id: asId, account_id: evId }));
    });
    var defRow = { c_acctschema_id: asId, ad_client_id: clientId };
    Object.keys(vcByColumn).forEach(function (col) { defRow[col] = vcByColumn[col]; });
    g4.push(create('c_acctschema_default', defRow));
    group('G4 acctschema', g4);

    // ── G5 DOCTYPES (minimal sales spine: AR Invoice) ────────────────────────────────────────────────────────
    var glCatId = id.next(), seqId = id.next(), dtAriId = id.next();
    group('G5 doctypes', [
      create('gl_category', { gl_category_id: glCatId, ad_client_id: clientId, name: 'Standard' }),
      create('ad_sequence', { ad_sequence_id: seqId, ad_client_id: clientId, name: 'AR Invoice', startno: 1000 }),
      create('c_doctype', { c_doctype_id: dtAriId, ad_client_id: clientId, name: 'AR Invoice',
        docbasetype: 'ARI', gl_category_id: glCatId, docnosequence_id: seqId, issotrx: 'Y' })
    ]);

    // ── G6 BASE OPS + default masters (each master emits its acct-mapping row from the schema default) ────────
    var whId = id.next(), locId = id.next(), plId = id.next(), plvId = id.next();
    var bpGroupId = id.next(), bpId = id.next(), pcatId = id.next(), prodId = id.next(), taxId = id.next();
    group('G6 base ops', [
      create('m_warehouse', { m_warehouse_id: whId, ad_client_id: clientId, ad_org_id: orgId, name: 'HQ Warehouse' }),
      create('m_locator', { m_locator_id: locId, m_warehouse_id: whId, ad_client_id: clientId, value: 'Std' }),
      create('m_pricelist', { m_pricelist_id: plId, ad_client_id: clientId, name: 'Standard', c_currency_id: ccyId, issotrx: 'Y' }),
      create('m_pricelist_version', { m_pricelist_version_id: plvId, m_pricelist_id: plId, ad_client_id: clientId, name: 'Std ' + year }),
      create('c_bp_group', { c_bp_group_id: bpGroupId, ad_client_id: clientId, name: 'Standard' }),
      create('c_bpartner', { c_bpartner_id: bpId, ad_client_id: clientId, c_bp_group_id: bpGroupId, name: 'Standard BP', iscustomer: 'Y' }),
      create('c_bp_customer_acct', { c_bpartner_id: bpId, c_acctschema_id: asId, ad_client_id: clientId, c_receivable_acct: vcByColumn['c_receivable_acct'] }),
      create('m_product_category', { m_product_category_id: pcatId, ad_client_id: clientId, name: 'Standard' }),
      create('m_product_category_acct', { m_product_category_id: pcatId, c_acctschema_id: asId, ad_client_id: clientId, p_revenue_acct: vcByColumn['p_revenue_acct'] }),
      create('m_product', { m_product_id: prodId, ad_client_id: clientId, m_product_category_id: pcatId, name: 'Standard Product' }),
      create('c_tax', { c_tax_id: taxId, ad_client_id: clientId, name: 'Standard', rate: 9 }),
      create('c_tax_acct', { c_tax_id: taxId, c_acctschema_id: asId, ad_client_id: clientId, t_due_acct: vcByColumn['t_due_acct'] })
    ]);

    return {
      input: { clientName: clientName, currencyId: ccyId, currencyPrecision: ccyPrec, adminUser: adminUser, dateAcct: dateAcct },
      groups: groups, tip: parent,
      refs: { clientId: clientId, orgId: orgId, roleAdminId: roleAdminId, userId: userId,
              acctSchemaId: asId, bpartnerId: bpId, productId: prodId,
              taxId: taxId, doctypeAriId: dtAriId, warehouseId: whId, periodId: periodId,
              ev: evByValue, vc: vcByColumn }
    };
  }

  // ── foldGenesis — apply CREATE ops into a fresh tenant DB (schema inferred from row keys) ───────────────────
  function foldGenesis(groups, db) {
    var cols = {};
    groups.forEach(function (g) { g.ops.forEach(function (o) {
      if (o.op !== 'CREATE') return;
      var s = cols[o.table] = cols[o.table] || {};
      Object.keys(o.row).forEach(function (k) { s[k] = true; });
    }); });
    Object.keys(cols).forEach(function (t) {
      db.prepare('CREATE TABLE IF NOT EXISTS ' + t + ' (' + Object.keys(cols[t]).join(', ') + ')').run();
    });
    var n = 0;
    groups.forEach(function (g) { g.ops.forEach(function (o) {
      if (o.op !== 'CREATE') return;
      var keys = Object.keys(o.row);
      db.prepare('INSERT INTO ' + o.table + ' (' + keys.join(',') + ') VALUES (' +
        keys.map(function (k) { return '@' + k; }).join(',') + ')').run(o.row);
      n++;
    }); });
    return n;
  }

  // ── rebandGenesis — make a born tenant RESIDENT-safe (GENESIS_RESIDENT_TENANT_SESSION §SPEC). W-GENESIS-RESIDENT ─
  //
  //   A born tenant mints every id from a fixed base (1_000_000) — so two tenants, or a tenant + the resident
  //   ad_seed, collide on PK/id values. Re-band offsets every genesis-minted *_id into a free per-client numeric
  //   band, exactly the convention the demo shards use (clientNum*100000; Odoo[12] → 12_50001, 12_00001, …).
  //
  //   NON-INVENT rule (deterministic, no Date/random):
  //     · idMap is built ONLY from the minted set — every distinct *_id value > genesisBase across all ops. Shared
  //       System references (currencyId=100, etc.) are < genesisBase, so they are never in the map → never remapped.
  //     · clientId          → newClientId (the small free AD_Client_ID; what listClients/scoping key on).
  //     · every other minted → newClientId*stride + (id - genesisBase)   (the high data band).
  //     · isactive:'Y' is injected into any row lacking it — SES.listClients (and most read-site queries) filter
  //       IsActive='Y'; a born row carries none, so without this the resident tenant is invisible. 'Y' is the
  //       canonical active flag every real iDempiere row carries (extract-the-default, not invent).
  //     · the hash chain is recomputed over the re-banded ops so the op-log still verifies (git-for-a-tenant).
  //   bundle = { groups, refs? } (born, optionally with an appended G7 sample-invoice group). Returns the same
  //   shape re-banded, plus { clientId, idMap }.
  function rebandGenesis(bundle, opts) {
    opts = opts || {};
    var newClientId = opts.clientId;
    if (newClientId == null) throw new Error('rebandGenesis: opts.clientId required');
    var base = opts.genesisBase != null ? opts.genesisBase : 1000000;
    var stride = opts.stride != null ? opts.stride : 100000;
    var bandBase = newClientId * stride;
    var groups = bundle.groups || [];
    var clientId = bundle.refs ? bundle.refs.clientId : null;

    // collect the minted set, then build the value→value map
    var minted = {};
    groups.forEach(function (g) { (g.ops || []).forEach(function (o) {
      Object.keys(o.row || {}).forEach(function (k) {
        if (/_id$/i.test(k)) { var v = o.row[k]; if (typeof v === 'number' && v > base) minted[v] = true; }
      });
    }); });
    var map = {};
    Object.keys(minted).forEach(function (s) {
      var v = Number(s);
      map[v] = (v === clientId) ? newClientId : bandBase + (v - base);
    });

    // re-band the ops + inject isactive, rebuild the hash chain
    var parent = '0'.repeat(64), out = [];
    groups.forEach(function (g) {
      var ops = (g.ops || []).map(function (o) {
        var row = {};
        Object.keys(o.row || {}).forEach(function (k) {
          var v = o.row[k];
          // apply by VALUE-membership, not column name: account columns are *_acct (c_receivable_acct,
          // p_revenue_acct, t_due_acct) yet hold minted C_ValidCombination ids. The map holds ONLY genesis-minted
          // ids (all > base), and no genesis amount/rate is > base, so value-membership has no false positive.
          if (typeof v === 'number' && map[v] != null) v = map[v];
          row[k] = v;
        });
        if (row.isactive == null) row.isactive = 'Y';
        return { op: o.op, table: o.table, row: row };
      });
      var tip = sha256(parent + JSON.stringify(ops));
      out.push({ seq: g.seq, label: g.label, ops: ops, parent: parent, tip: tip });
      parent = tip;
    });

    // re-band refs (so callers — the invoice post, the deep link — address the new ids)
    function rm(v) { return (typeof v === 'number' && map[v] != null) ? map[v] : v; }
    var refs = null;
    if (bundle.refs) {
      refs = { clientId: newClientId };
      Object.keys(bundle.refs).forEach(function (k) {
        var v = bundle.refs[k];
        if (k === 'clientId') return;
        if (v && typeof v === 'object') { var m = {}; Object.keys(v).forEach(function (kk) { m[kk] = rm(v[kk]); }); refs[k] = m; }
        else refs[k] = rm(v);
      });
    }
    return { input: bundle.input, groups: out, tip: parent, refs: refs, clientId: newClientId, idMap: map };
  }

  // ── mergeGenesisInto — merge re-banded CREATE ops into an EXISTING (resident) DB, never CREATE a table ────────
  //   The resident ad_seed already holds the System dictionary + other tenants; a born tenant SHARES it (client 0
  //   AD, client N data). So we INTERSECT each row with the resident table's real columns (case-insensitive — born
  //   rows are lowercase, resident tables CamelCase) and INSERT OR IGNORE (idempotent re-install). A table or column
  //   the resident schema does not carry is skipped, never synthesized (NON-INVENT). Mirrors installShard's merge.
  function mergeGenesisInto(groups, db) {
    var schema = {}, n = 0;
    function cols(t) {
      if (schema[t] !== undefined) return schema[t];
      var info; try { info = db.prepare('PRAGMA table_info("' + t + '")').all(); } catch (e) { info = []; }
      var m = null;
      if (info && info.length) { m = {}; info.forEach(function (c) { m[String(c.name).toLowerCase()] = c.name; }); }
      schema[t] = m; return m;
    }
    groups.forEach(function (g) { (g.ops || []).forEach(function (o) {
      if (o.op !== 'CREATE') return;
      var c = cols(o.table); if (!c) return;                                  // resident has no such table → skip
      var keys = Object.keys(o.row).filter(function (k) { return c[k.toLowerCase()]; });
      if (!keys.length) return;
      var canon = keys.map(function (k) { return '"' + c[k.toLowerCase()] + '"'; });
      var sql = 'INSERT OR IGNORE INTO "' + o.table + '" (' + canon.join(',') + ') VALUES (' +
        keys.map(function (k) { return '@' + k; }).join(',') + ')';
      try { db.prepare(sql).run(o.row); n++; } catch (e) { /* honest skip; caller logs the count */ }
    }); });
    return n;
  }

  // ── nextClientId — first free AD_Client_ID for a born tenant, floored at 17 so the 5 demo tenants (12-16, each
  //   data-banded to ≤1.6e6) never collide on either the client number OR the high data band (17→1_700_000). ──────
  function nextClientId(db) {
    var floor = 17, taken = {};
    try {
      var rows = db.prepare('SELECT AD_Client_ID AS id FROM AD_Client').all();
      rows.forEach(function (r) { taken[Number(r.id)] = true; });
    } catch (e) {}
    var n = floor; while (taken[n]) n++;
    return n;
  }

  // ── grantFullAccess — grant the born admin role access to the SHARED (System/client-0) dictionary ────────────
  //   A born tenant SHARES client-0's AD_Window/Process/Form, but the menu is role-scoped via AD_*_Access — with
  //   none, the tenant logs in to an EMPTY menu (can't work). iDempiere's InitialClientSetup grants the new client
  //   admin role access to the dictionary; this replicates that at INSTALL time (where the resident db with the
  //   System dictionary is available — genesis has no db at birth). NON-INVENT: we read the EXISTING System rows
  //   and grant them (IsActive='Y'), exactly the setup default; INSERT OR IGNORE on the composite PK = idempotent.
  function grantFullAccess(db, roleId, clientId, orgId) {
    var n = 0;
    function grant(srcTbl, accTbl, idCol, extra) {
      var src; try { src = db.prepare('SELECT ' + idCol + ' AS id FROM ' + srcTbl + " WHERE IsActive='Y'").all(); } catch (e) { src = []; }
      src.forEach(function (r) {
        if (r.id == null) return;
        var cols = ['AD_Client_ID', 'AD_Org_ID', 'AD_Role_ID', idCol, 'IsActive'].concat(Object.keys(extra || {}));
        var vals = { c: clientId, o: orgId || 0, r: roleId, k: r.id };
        var ph = ['@c', '@o', '@r', '@k', "'Y'"]; Object.keys(extra || {}).forEach(function (e) { ph.push("'" + extra[e] + "'"); });
        try { db.prepare('INSERT OR IGNORE INTO ' + accTbl + ' (' + cols.join(',') + ') VALUES (' + ph.join(',') + ')').run(vals); n++; } catch (e) {}
      });
    }
    grant('AD_Window', 'AD_Window_Access', 'AD_Window_ID', { IsReadWrite: 'Y' });
    grant('AD_Process', 'AD_Process_Access', 'AD_Process_ID', {});
    grant('AD_Form', 'AD_Form_Access', 'AD_Form_ID', {});
    try { db.prepare("INSERT OR IGNORE INTO AD_Role_OrgAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,IsActive) VALUES (@c,@o,@r,'Y')")
      .run({ c: clientId, o: orgId || 0, r: roleId }); } catch (e) {}
    return n;
  }

  // ── signHead — sign the genesis head tip (the signed bundle); isomorphic webcrypto (node + browser) ─────────
  async function signHead(groups) {
    if (typeof global.crypto === 'undefined' || !global.crypto.subtle) {
      try { global.crypto = require('crypto').webcrypto; } catch (e) { /* browser provides crypto */ }
    }
    var S = (typeof require === 'function') ? require('./erp_snapshot_sign.js') : global.ErpSnapshotSign;
    var subtle = global.crypto.subtle;
    var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    var pub = await subtle.exportKey('jwk', kp.publicKey);
    var priv = await subtle.exportKey('jwk', kp.privateKey);
    var head = groups.length ? groups[groups.length - 1].tip : '0'.repeat(64);
    return { tip: head, sig: await S.signTip(priv, head), pub: pub, verify: function (t, s) { return S.verifyTip(t, s, pub); } };
  }

  var _api = { birthTenant: birthTenant, foldGenesis: foldGenesis, signHead: signHead, IdGen: IdGen, sha256: sha256,
    rebandGenesis: rebandGenesis, mergeGenesisInto: mergeGenesisInto, nextClientId: nextClientId,
    grantFullAccess: grantFullAccess };
  if (typeof module !== 'undefined' && module.exports) module.exports = _api;
  else global.Genesis = _api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
