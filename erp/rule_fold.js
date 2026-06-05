// BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
//
// rule_fold.js — THE ONE GESTURE (window.RuleFold): edit ONE rule → K records re-fold live, signed +
//   reversible, on the migrated Odoo Client-12 tenant. Implements docs/RULE_EDIT_SPEC.md (and
//   bim-compiler prompts/RULE_EDIT_ONE_GESTURE.md). Engine-as-data: the rule is DATA (a SET_RULE op on
//   the genuinely-signed W-CHAIN/W-SIGN op-log), the "K reflow" is the re-FOLD of a derived classification
//   — NOT a per-record rewrite. NON-INVENT (real Odoo data), §-log first.
//
//   TWO rules share ONE engine (rule registry):
//     • L2 premium     — a CLASSIFICATION guard: a product is PREMIUM iff PriceStd ≥ T.
//     • L1 maycomplete — a LIFECYCLE guard on the wfmc Complete(CO) transition: an order may Complete
//                        without approval iff GrandTotal ≤ T. Editing T = lifecycle-as-data.
//
//   Consumes (does NOT fork): window.KernelOps (commitOp/sealChain/verifyChain/replayOps), window.ErpSigner
//   (ECDSA P-256), window.BigDecimal (exact compare — never raw Number). No new applyOne op_type, so the
//   seam's erp_kernel frozen-effects replay is untouched. Honesty boundary: attests the rule edit + the
//   re-folded classification, signed + reversible — NOT a GL posting (§I-K/§13.6).
(function (global) {
  'use strict';

  function bd(v) { return global.BigDecimal.of(String(v)); }
  function rows(adDb, sql) {
    var r; try { r = adDb.exec(sql); } catch (e) { return []; }
    if (!r.length) return [];
    return r[0].values.map(function (x) { return { id: String(x[0]), name: x[1], v: String(x[2]) }; });
  }

  // ── rule registry: each rule = a real population + an editable threshold predicate ──
  var RULES = {
    premium: {
      id: 'premium', layer: 'L2', title: 'L2 · PREMIUM (products)', gate: 'PREMIUM-tag', cmp: 'gte',
      T0: 100, T1: 500, attr: 'PriceStd',
      desc: 'a product is PREMIUM iff PriceStd ≥ T  (a classification guard)',
      load: function (adDb) { return rows(adDb,
        'SELECT p.M_Product_ID id, p.Name name, pp.PriceStd v FROM M_ProductPrice pp ' +
        'JOIN M_Product p ON p.M_Product_ID = pp.M_Product_ID WHERE p.AD_Client_ID = 12 ORDER BY pp.PriceStd DESC'); },
      badge: function (k, n, T) { return '⚖ PREMIUM: ' + k + ' of ' + n + '   (T = ' + T + ')'; }
    },
    maycomplete: {
      id: 'maycomplete', layer: 'L1', title: 'L1 · May Complete (orders)', gate: 'Complete(CO)', cmp: 'lte',
      T0: 1500, T1: 3000, attr: 'GrandTotal',
      desc: 'an order (DR/IP) may Complete (CO) without approval iff GrandTotal ≤ T  — a LIFECYCLE guard on the wfmc transition',
      load: function (adDb) { return rows(adDb,
        "SELECT C_Order_ID id, DocumentNo name, GrandTotal v FROM C_Order " +
        "WHERE AD_Client_ID = 12 AND DocStatus IN ('DR','IP') ORDER BY GrandTotal DESC"); },
      badge: function (k, n, T) { return '⚖ MAY COMPLETE: ' + k + ' of ' + n + '   (approval limit T = ' + T + ')'; }
    }
  };

  // ── fold: the set (ids) passing the rule predicate at threshold T — BigDecimal exact, never raw Number ──
  function fold(pop, T, cmp) {
    var bt = bd(T), ids = [];
    pop.forEach(function (p) { var c = bd(p.v).compareTo(bt); if (cmp === 'gte' ? c >= 0 : c <= 0) ids.push(p.id); });
    return ids;
  }
  function setEquals(a, b) { if (a.length !== b.length) return false; var s = {}; a.forEach(function (x) { s[x] = 1; }); return b.every(function (x) { return !!s[x]; }); }
  function symdiffIds(a, b) {
    var sa = {}, sb = {}, out = []; a.forEach(function (x) { sa[x] = 1; }); b.forEach(function (x) { sb[x] = 1; });
    a.forEach(function (x) { if (!sb[x]) out.push(x); }); b.forEach(function (x) { if (!sa[x]) out.push(x); }); return out;
  }

  // ── the genuinely-signed op-log (W-CHAIN hash + W-SIGN ECDSA), shared by both rules ──
  // I-4 (prompts/I4_OPLOG_RECONCILE.md): when the seam is live (window.ERP.opDb), append to THAT chain so
  // rule edits + doc transitions share ONE signed log; else a dedicated standalone db (the pure gesture).
  var _opDb = null, _ts = 5000, _signed = false;
  function nextTs() { return ++_ts; }      // deterministic monotone stamp — NO Date.now in the op path
  async function ensureOpLog(SQL) {
    if (_opDb) return _opDb;
    if (global.ERP && global.ERP.opDb) {                         // shared chain (seam live) — signer already installed
      _opDb = global.ERP.opDb; _signed = !!(global.ERP.ctx && global.ERP.ctx.pubKey);
      console.log('§RULE-CHAIN shared=window.ERP.opDb signed=' + (_signed ? 'Y' : 'N'));
      return _opDb;
    }
    _opDb = new SQL.Database();
    global.KernelOps.ensureTable(_opDb);
    try { await global.ErpSigner.installSigner(global.KernelOps, { dbName: 'bim_erp_signer' }); _signed = true; }
    catch (e) { console.log('§RULE-SIGN skip ' + e.message); _signed = false; }
    return _opDb;
  }
  // commit ONE SET_RULE op (the edit), then seal (sign) + verify the whole chain.
  async function commitEdit(opDb, R, fromT, toT, crossedIds) {
    var uuid = (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID() : ('rule:' + nextTs());
    global.KernelOps.commitOp(opDb, 'SET_RULE',
      { rule: R.id, layer: R.layer, attribute: R.attr, op: R.cmp, gate: R.gate, T: toT, from: fromT },
      crossedIds || [], 'RULE:' + R.id, uuid, nextTs());
    await global.KernelOps.sealChain(opDb);            // hash-chain + ECDSA sign each op
    var v = await global.KernelOps.verifyChain(opDb);  // recompute every op_hash + prev-link + signature
    return { uuid: uuid, chainOk: !!v.ok, len: v.len };
  }
  // rebuild THIS rule's current T from the op-log ALONE (event sourcing — last SET_RULE for the rule wins).
  function rebuildT(opDb, ruleId) {
    var ops = global.KernelOps.replayOps(opDb, 'SET_RULE').filter(function (o) { return o.parameters.rule === ruleId; });
    if (!ops.length) return null;
    return ops[ops.length - 1].parameters.T;
  }

  function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ── runGesture — the full witnessed gesture for one rule; emits the §-line contract (RULE_EDIT_SPEC §8) ──
  // opts: { rule?, db, SQL, render?(pop,hitIds,T), animate? }
  async function runGesture(opts) {
    opts = opts || {};
    var R = RULES[opts.rule || 'premium'];
    var adDb = opts.db || global.__idmpDb, SQL = opts.SQL || global.SQL;
    var pop = R.load(adDb), N = pop.length;
    if (N === 0) { console.log('§RULE-GESTURE layer=' + R.layer + ' rule=' + R.id + ' FAIL no-population'); return { pass: false, reason: 'no-population' }; }

    var opDb = await ensureOpLog(SQL);
    await commitEdit(opDb, R, null, R.T0, []);          // seed the rule as DATA at the default threshold

    // 1) fold @ default T0
    var set0 = fold(pop, R.T0, R.cmp);
    console.log('§RULE-FOLD layer=' + R.layer + ' rule=' + R.id + ' gate=' + R.gate + ' T=' + R.T0 + ' population=' + N + ' affected=' + set0.length);
    if (opts.render) opts.render(pop, set0, R.T0); if (opts.animate) await _sleep(700);

    // 2) forward edit T0 → T1 (one signed op) → re-fold → K cross the boundary
    var set1 = fold(pop, R.T1, R.cmp);
    var crossFwd = symdiffIds(set0, set1);
    var fwd = await commitEdit(opDb, R, R.T0, R.T1, crossFwd);
    if (opts.render) opts.render(pop, set1, R.T1); if (opts.animate) await _sleep(700);

    // 3) acceptance oracle — rebuild THIS rule from the op-log ALONE at the tip (T1), assert rebuilt == live
    var rt1 = rebuildT(opDb, R.id), rebuilt1 = fold(pop, rt1, R.cmp);
    var oracleOk = setEquals(rebuilt1, set1);
    var ov = await global.KernelOps.verifyChain(opDb);

    // 4) reverse T1 → T0 (inverse op) → re-fold from the log tip → must restore set0
    var crossRev = symdiffIds(set1, set0);
    var rev = await commitEdit(opDb, R, R.T1, R.T0, crossRev);
    var rt2 = rebuildT(opDb, R.id), set2 = fold(pop, rt2, R.cmp);
    var reversible = setEquals(set0, set2);
    if (opts.render) opts.render(pop, set2, R.T0); if (opts.animate) await _sleep(400);

    // ── emit the witness contract (reversibility PROVEN by step 4 before these lines print) ──
    var tag = 'layer=' + R.layer + ' rule=' + R.id + ' tenant=Odoo(12) gate=' + R.gate;
    console.log('§RULE-EDIT ' + tag + ' edit=T:' + R.T0 + '→' + R.T1 + ' population=' + N + ' affected=' + crossFwd.length +
      ' refold=ok signedOp=' + fwd.uuid.slice(0, 8) + ' chainOk=' + (fwd.chainOk ? 'Y' : 'N') + ' reversible=' + (reversible ? 'Y' : 'N'));
    console.log('§RULE-EDIT-ORACLE layer=' + R.layer + ' rule=' + R.id + ' rebuilt==' + (oracleOk ? 'live' : 'DIFF') + ' K=' + rebuilt1.length + ' chainOk=' + (ov.ok ? 'Y' : 'N'));
    console.log('§RULE-EDIT ' + tag + ' edit=T:' + R.T1 + '→' + R.T0 + ' population=' + N + ' affected=' + crossRev.length +
      ' refold=ok signedOp=' + rev.uuid.slice(0, 8) + ' chainOk=' + (rev.chainOk ? 'Y' : 'N') + ' reversible=' + (reversible ? 'Y' : 'N'));

    var pass = set0.length > 0 && set0.length < N && crossFwd.length > 0 &&
               fwd.chainOk && oracleOk && rev.chainOk && reversible && _signed;
    console.log('§RULE-GESTURE layer=' + R.layer + ' rule=' + R.id + ' ' + (pass ? 'PASS' : 'FAIL') + ' N=' + N +
      ' K0=' + set0.length + ' K1=' + set1.length + ' affected=' + crossFwd.length + ' signed=' + (_signed ? 'Y' : 'N'));
    return { pass: pass, layer: R.layer, rule: R.id, N: N, K0: set0.length, K1: set1.length,
             affected: crossFwd.length, oracleOk: oracleOk, reversible: reversible, signed: _signed };
  }

  // ── open — the interactive overlay (rule switch + population list + live badge + ▶ Run gesture) ──
  function _el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
  function open(opts) {
    opts = opts || {};
    var adDb = opts.db || global.__idmpDb, SQL = opts.SQL || global.SQL, status = opts.status || function () {};
    if (!global.BigDecimal || !global.KernelOps || !global.ErpSigner) { status('Rule gesture: engine/signer/bigdecimal not loaded'); return; }

    var cur = 'premium';
    var wrap = _el('div', 'font-family:system-ui,sans-serif');
    var tabs = _el('div', 'display:flex;gap:6px;margin-bottom:10px');
    var badge = _el('div', 'font-size:20px;font-weight:700;margin:0 0 6px;color:#b8860b');
    var sub = _el('div', 'font-size:12px;color:#667085;margin-bottom:10px');
    var list = _el('div', 'max-height:48vh;overflow:auto;border:1px solid #e4e7ec;border-radius:8px');
    var bar = _el('div', 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap');
    var run = _el('button', 'padding:8px 14px;border:0;border-radius:8px;background:#b8860b;color:#fff;font-weight:600;cursor:pointer', '▶ Run gesture (edit → reflow → reverse, signed)');
    run.id = 'rule-run';

    function render(p, hitIds, T) {
      var R = RULES[cur], set = {}; hitIds.forEach(function (x) { set[x] = 1; });
      badge.textContent = R.badge(hitIds.length, p.length, T);
      list.innerHTML = '';
      p.forEach(function (r) {
        var hot = !!set[r.id];
        var row = _el('div', 'display:flex;justify-content:space-between;padding:5px 10px;border-bottom:1px solid #f2f4f7;' +
          (hot ? 'background:#fffbe6;font-weight:600;color:#7a5c00' : 'color:#475467'));
        row.appendChild(_el('span', '', (hot ? '★ ' : '   ') + r.name));
        row.appendChild(_el('span', 'font-variant-numeric:tabular-nums', r.v));
        list.appendChild(row);
      });
    }
    function select(id) {
      cur = id; var R = RULES[id];
      Array.prototype.forEach.call(tabs.children, function (b) {
        var on = b.getAttribute('data-rule') === id;
        b.style.cssText = 'padding:6px 12px;border-radius:8px;cursor:pointer;font-weight:600;border:1px solid #d0d5dd;' +
          (on ? 'background:#b8860b;color:#fff;border-color:#b8860b' : 'background:#fff;color:#475467');
      });
      sub.textContent = R.desc + '  ·  Editing T is one signed op; the K reflow is a re-fold of the rule.';
      var pop = R.load(adDb);
      if (!pop.length) { badge.textContent = '(no ' + R.id + ' population — need the Odoo tenant)'; list.innerHTML = ''; return; }
      render(pop, fold(pop, R.T0, R.cmp), R.T0);
    }
    ['premium', 'maycomplete'].forEach(function (id) {
      var b = _el('button', '', RULES[id].title); b.setAttribute('data-rule', id);
      b.addEventListener('click', function () { select(id); }); tabs.appendChild(b);
    });

    run.addEventListener('click', function () {
      run.disabled = true; status('Running signed rule-edit gesture (' + RULES[cur].layer + ')…');
      runGesture({ rule: cur, db: adDb, SQL: SQL, render: render, animate: true }).then(function (res) {
        run.disabled = false;
        status(res.pass ? ('§RULE-GESTURE ' + res.layer + ' PASS — ' + res.affected + ' of ' + res.N + ' reflowed, signed + reversible') : 'Rule gesture: see console §-log');
      });
    });

    wrap.appendChild(tabs); wrap.appendChild(badge); wrap.appendChild(sub); wrap.appendChild(list);
    bar.appendChild(run); wrap.appendChild(bar);
    select('premium');
    if (opts.mount) opts.mount('Rule edit — Odoo (signed, reversible re-fold)', wrap);
    console.log('§RULE-OPEN rules=[premium(L2),maycomplete(L1)] tenant=Odoo(12)');
  }

  global.RuleFold = { open: open, runGesture: runGesture, fold: fold, _RULES: RULES };
  console.log('§RULE_FOLD_LOADED rule_fold.js (the ONE gesture — L2 premium + L1 may-complete, signed, reversible)');
})(typeof window !== 'undefined' ? window : this);
