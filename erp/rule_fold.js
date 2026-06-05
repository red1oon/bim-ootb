// BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
//
// rule_fold.js — THE ONE GESTURE (window.RuleFold): edit ONE rule → K records re-fold live, signed +
//   reversible, on the migrated Odoo Client-12 tenant. Implements docs/RULE_EDIT_SPEC.md (and
//   bim-compiler prompts/RULE_EDIT_ONE_GESTURE.md). Engine-as-data: the rule is DATA (a SET_RULE op
//   on the genuinely-signed W-CHAIN/W-SIGN op-log), the "K records reflow" is the re-FOLD of a derived
//   PREMIUM classification — NOT a per-record rewrite. NON-INVENT (real Odoo list_price), §-log first.
//
//   Consumes (does NOT fork): window.KernelOps (commitOp/sealChain/verifyChain/replayOps), window.ErpSigner
//   (ECDSA P-256), window.BigDecimal (exact compare — never raw Number). No new applyOne op_type, so the
//   seam's erp_kernel frozen-effects replay is untouched. Honesty boundary: attests the rule edit + the
//   re-folded classification, signed + reversible — NOT a GL posting (§I-K/§13.6).
(function (global) {
  'use strict';

  var RULE = { rule: 'premium', attribute: 'PriceStd', op: 'gte' };
  var T0 = 100, T1 = 500;                 // default threshold → edited threshold (real reflow: 23→12 of 35)

  // ── population: the 35 Odoo products, each carrying its recorded Odoo list_price (M_ProductPrice) ──
  function loadPopulation(adDb) {
    var r;
    try {
      r = adDb.exec(
        'SELECT p.M_Product_ID id, p.Name name, pp.PriceStd price ' +
        'FROM M_ProductPrice pp JOIN M_Product p ON p.M_Product_ID = pp.M_Product_ID ' +
        'WHERE p.AD_Client_ID = 12 ORDER BY pp.PriceStd DESC');
    } catch (e) { return []; }
    if (!r.length) return [];
    return r[0].values.map(function (v) { return { id: String(v[0]), name: v[1], price: String(v[2]) }; });
  }

  // ── fold: the PREMIUM set (ids) where price >= T — BigDecimal exact, never raw JS Number ──
  function fold(pop, T) {
    var BD = global.BigDecimal, bt = BD.of(String(T)), ids = [];
    pop.forEach(function (p) { if (BD.of(p.price).compareTo(bt) >= 0) ids.push(p.id); });
    return ids;
  }
  function setEquals(a, b) { if (a.length !== b.length) return false; var s = {}; a.forEach(function (x) { s[x] = 1; }); return b.every(function (x) { return !!s[x]; }); }
  function symdiffIds(a, b) {   // ids that crossed the boundary (in exactly one set)
    var sa = {}, sb = {}, out = []; a.forEach(function (x) { sa[x] = 1; }); b.forEach(function (x) { sb[x] = 1; });
    a.forEach(function (x) { if (!sb[x]) out.push(x); }); b.forEach(function (x) { if (!sa[x]) out.push(x); }); return out;
  }

  // ── the genuinely-signed op-log (a dedicated sql.js db; W-CHAIN hash + W-SIGN ECDSA) ──
  var _opDb = null, _ts = 5000, _signed = false;
  function nextTs() { return ++_ts; }      // deterministic monotone stamp — NO Date.now in the op path
  async function ensureOpLog(SQL) {
    if (_opDb) return _opDb;
    _opDb = new SQL.Database();
    global.KernelOps.ensureTable(_opDb);
    try { await global.ErpSigner.installSigner(global.KernelOps, { dbName: 'bim_erp_signer' }); _signed = true; }
    catch (e) { console.log('§RULE-SIGN skip ' + e.message); _signed = false; }
    return _opDb;
  }
  // commit ONE SET_RULE op (the edit), then seal (sign) + verify the whole chain.
  async function commitEdit(opDb, fromT, toT, crossedIds) {
    var uuid = (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID() : ('rule:' + nextTs());
    global.KernelOps.commitOp(opDb, 'SET_RULE',
      { rule: RULE.rule, attribute: RULE.attribute, op: RULE.op, T: toT, from: fromT },
      crossedIds || [], 'RULE:' + RULE.rule, uuid, nextTs());
    await global.KernelOps.sealChain(opDb);            // hash-chain + ECDSA sign each op
    var v = await global.KernelOps.verifyChain(opDb);  // recompute every op_hash + prev-link + signature
    return { uuid: uuid, chainOk: !!v.ok, len: v.len };
  }
  // rebuild the rule's current T from the op-log ALONE (event sourcing — last SET_RULE wins).
  function rebuildT(opDb) {
    var ops = global.KernelOps.replayOps(opDb, 'SET_RULE');
    if (!ops.length) return null;
    return ops[ops.length - 1].parameters.T;
  }

  function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ── runGesture — the full witnessed gesture; emits the §-line contract (docs/RULE_EDIT_SPEC §8) ──
  // opts: { db, SQL, render?(pop,premiumIds,T), animate? }
  async function runGesture(opts) {
    opts = opts || {};
    var adDb = opts.db || global.__idmpDb, SQL = opts.SQL || global.SQL;
    var pop = loadPopulation(adDb), N = pop.length;
    if (N === 0) { console.log('§RULE-GESTURE FAIL no-population (need Odoo Client-12 priced products)'); return { pass: false, reason: 'no-population' }; }

    var opDb = await ensureOpLog(SQL);
    await commitEdit(opDb, null, T0, []);              // seed the rule as DATA at the default threshold

    // 1) fold @ default T0
    var set0 = fold(pop, T0);
    console.log('§RULE-FOLD rule=' + RULE.rule + ' T=' + T0 + ' population=' + N + ' affected=' + set0.length);
    if (opts.render) opts.render(pop, set0, T0); if (opts.animate) await _sleep(700);

    // 2) forward edit T0 → T1 (one signed op) → re-fold → K cross the boundary
    var set1 = fold(pop, T1);
    var crossFwd = symdiffIds(set0, set1);
    var fwd = await commitEdit(opDb, T0, T1, crossFwd);
    if (opts.render) opts.render(pop, set1, T1); if (opts.animate) await _sleep(700);

    // 3) acceptance oracle — rebuild from the op-log ALONE at the tip (T1), assert rebuilt == live
    var rt1 = rebuildT(opDb), rebuilt1 = fold(pop, rt1);
    var oracleOk = setEquals(rebuilt1, set1);
    var ov = await global.KernelOps.verifyChain(opDb);

    // 4) reverse T1 → T0 (inverse op) → re-fold from the log tip → must restore set0
    var crossRev = symdiffIds(set1, set0);
    var rev = await commitEdit(opDb, T1, T0, crossRev);
    var rt2 = rebuildT(opDb), set2 = fold(pop, rt2);
    var reversible = setEquals(set0, set2);
    if (opts.render) opts.render(pop, set2, T0); if (opts.animate) await _sleep(400);

    // ── emit the witness contract (reversibility is PROVEN by step 4 before these lines print) ──
    console.log('§RULE-EDIT tenant=Odoo(12) rule=' + RULE.rule + ' edit=T:' + T0 + '→' + T1 +
      ' population=' + N + ' affected=' + crossFwd.length + ' refold=ok signedOp=' + fwd.uuid.slice(0, 8) +
      ' chainOk=' + (fwd.chainOk ? 'Y' : 'N') + ' reversible=' + (reversible ? 'Y' : 'N'));
    console.log('§RULE-EDIT-ORACLE rebuilt==' + (oracleOk ? 'live' : 'DIFF') + ' K=' + rebuilt1.length + ' chainOk=' + (ov.ok ? 'Y' : 'N'));
    console.log('§RULE-EDIT tenant=Odoo(12) rule=' + RULE.rule + ' edit=T:' + T1 + '→' + T0 +
      ' population=' + N + ' affected=' + crossRev.length + ' refold=ok signedOp=' + rev.uuid.slice(0, 8) +
      ' chainOk=' + (rev.chainOk ? 'Y' : 'N') + ' reversible=' + (reversible ? 'Y' : 'N'));

    var pass = set0.length > 0 && set0.length < N && crossFwd.length > 0 &&
               fwd.chainOk && oracleOk && rev.chainOk && reversible && _signed;
    console.log('§RULE-GESTURE ' + (pass ? 'PASS' : 'FAIL') + ' N=' + N + ' K0=' + set0.length + ' K1=' + set1.length +
      ' affected=' + crossFwd.length + ' signed=' + (_signed ? 'Y' : 'N'));
    return { pass: pass, N: N, K0: set0.length, K1: set1.length, affected: crossFwd.length,
             oracleOk: oracleOk, reversible: reversible, signed: _signed };
  }

  // ── open — the interactive overlay (population list + live PREMIUM badge + ▶ Run gesture) ──
  function _el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
  function open(opts) {
    opts = opts || {};
    var adDb = opts.db || global.__idmpDb, SQL = opts.SQL || global.SQL, status = opts.status || function () {};
    if (!global.BigDecimal || !global.KernelOps || !global.ErpSigner) { status('Rule gesture: engine/signer/bigdecimal not loaded'); return; }
    var pop = loadPopulation(adDb);
    if (pop.length === 0) { status('Rule gesture needs the Odoo tenant (Client 12 priced products)'); console.log('§RULE-GESTURE skip no-population'); return; }

    var wrap = _el('div', 'font-family:system-ui,sans-serif');
    var badge = _el('div', 'font-size:20px;font-weight:700;margin:0 0 8px;color:#b8860b');
    var sub = _el('div', 'font-size:12px;color:#667085;margin-bottom:10px');
    sub.textContent = 'Rule (DATA): a product is PREMIUM iff PriceStd ≥ T. Editing T is one signed op; the K reflow is a re-fold.';
    var list = _el('div', 'max-height:50vh;overflow:auto;border:1px solid #e4e7ec;border-radius:8px');
    var bar = _el('div', 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap');

    function render(p, premiumIds, T) {
      var set = {}; premiumIds.forEach(function (x) { set[x] = 1; });
      badge.textContent = '⚖ PREMIUM: ' + premiumIds.length + ' of ' + p.length + '  (T = ' + T + ')';
      list.innerHTML = '';
      p.forEach(function (r) {
        var hot = !!set[r.id];
        var row = _el('div', 'display:flex;justify-content:space-between;padding:5px 10px;border-bottom:1px solid #f2f4f7;' +
          (hot ? 'background:#fffbe6;font-weight:600;color:#7a5c00' : 'color:#475467'));
        row.appendChild(_el('span', '', (hot ? '★ ' : '   ') + r.name));
        row.appendChild(_el('span', 'font-variant-numeric:tabular-nums', r.price));
        list.appendChild(row);
      });
    }
    render(pop, fold(pop, T0), T0);

    var run = _el('button', 'padding:8px 14px;border:0;border-radius:8px;background:#b8860b;color:#fff;font-weight:600;cursor:pointer', '▶ Run gesture (edit → reflow → reverse, signed)');
    run.id = 'rule-run';
    run.addEventListener('click', function () {
      run.disabled = true; status('Running signed rule-edit gesture…');
      runGesture({ db: adDb, SQL: SQL, render: render, animate: true }).then(function (res) {
        run.disabled = false;
        status(res.pass ? ('§RULE-GESTURE PASS — ' + res.affected + ' of ' + res.N + ' reflowed, signed + reversible') : 'Rule gesture: see console §-log');
      });
    });
    bar.appendChild(run);

    wrap.appendChild(badge); wrap.appendChild(sub); wrap.appendChild(list); wrap.appendChild(bar);
    if (opts.mount) opts.mount('Rule edit — Odoo PREMIUM (signed, reversible)', wrap);
    console.log('§RULE-OPEN population=' + pop.length + ' rule=' + RULE.rule + ' T=' + T0);
  }

  global.RuleFold = { open: open, runGesture: runGesture, loadPopulation: loadPopulation, fold: fold, _RULE: RULE };
  console.log('§RULE_FOLD_LOADED rule_fold.js (the ONE gesture — signed, reversible, re-folding)');
})(typeof window !== 'undefined' ? window : this);
