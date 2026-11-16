// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — the door's side of "Fold from BIM" (bim-compiler prompts/CLI_ERP_IVR.md §29.6 P3b). Read the §BIM_ORDER_HOST lines after every run.
// The process class (erp/plugins/bim_document.mjs) has no BIM data of its own: it asks the host, through globalThis.BimOrderHost, for
//   inputs({building, selection}) -> { key, rows, classes, env, now, cur, selected, elements, scheduleSource }
// and gets the engine modules it calls (ProjOrderState, WriteCapture) and the raw ERP db handle + sql.js constructor for the scratch copy.
// NOTHING is derived here: the rows are ProjOrderState.pricedRowsFor over the selection `viewer.cost` uses (viewer/tools/schedule_verbs.js selectionOf, ONE selection + pricing code),
// split per 4D task by ProjFold.pricedPerTask exactly as the Viewer's "› ERP" does; the schedule is the PERSISTED 4D run (scheduleFromRun: its tasks, days from CACHE.PROJECT_START);
// the building's key is ProjOrderState.projectKey. The currency is the Find panel's own default (nf_highlight_cost.js _cur() 'RM'), as the Viewer's push passes it.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BREAK = process.env.POST_BREAK || '';   // W-RED1-VO falsifier: novo (the difference is lost: must FAIL V2) · W-POST-FOLD falsifiers: retag (the model differs at every post: F2 must FAIL) · shift (the schedule is a day late: F4 must FAIL) · droprow (one priced row is lost: F3 must FAIL)
const say = (s) => process.stderr.write('§BIM_ORDER_HOST ' + s + '\n');
// "discipline=ARC storey=*1" or 'storey="Level 1"' -> ['discipline=ARC', 'storey=*1']  (the same col=glob words `viewer.cost` takes)
function selectionWords(text) { const out = [], re = /([A-Za-z_]\w*)=("([^"]*)"|\S+)/g; let m; while ((m = re.exec(String(text || '')))) out.push(m[1] + '=' + (m[3] != null ? m[3] : m[2])); return out; }
function install(O, now) {
  globalThis.BimOrderHost = {
    hostDb: O.db, Database: O.SQL.Database,
    get ProjOrderState() { return require(path.join(ROOT, 'viewer', 'proj_order_state.js')); },
    get WriteCapture() { return require(path.join(ROOT, 'erp', 'write_capture.js')); },
    get ProjClaim() { return require(path.join(ROOT, 'viewer', 'proj_claim.js')); },
    clock: () => process.env.BIM_ORDER_NOW || now(),   // the door's one local clock (also the posts')
    inputs(a) {
      const t0 = Date.now(), V = path.join(ROOT, 'viewer'), SV = require(path.join(V, 'tools', 'schedule_verbs.js')), CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
      const log = console.log; console.log = () => {};   // the pipeline modules' own § lines are re-said below, on stderr, not lost
      try {
        const S = SV.selectionOf({ building: a.building, where: selectionWords(a.selection) }, O.SQL);
        if (S.inconclusive) throw new Error('Fold from BIM: ' + S.inconclusive);
        if (!S.guids.length) throw new Error('Fold from BIM: the selection matched no element of ' + a.building);
        const PF = require(path.join(V, 'proj_fold.js')), PS = require(path.join(V, 'proj_order_state.js')), tpl = require(path.join(V, 'rates', '4D_template.json'));
        const sched = PF.scheduleFromRun(S.c.run, tpl, CACHE.PROJECT_START);
        if (BREAK === 'shift' && sched) sched.tasks.forEach((t) => { t.sDays += 1; t.eDays += 1; });
        const price = (g) => PS.pricedRowsFor(S.bdb, g, S.env, null);
        const priced = sched ? PF.pricedPerTask(S.guids, sched, price) : price(S.guids);
        const env = Object.assign({}, S.env, { ProjFold: PF, VoFold: require(path.join(V, 'vo_fold.js')), ProjControl: require(path.join(V, 'proj_control.js')), BigDecimal: require(path.join(ROOT, 'erp', 'bigdecimal.js')), SEQUENCE_RULES: S.rt.SEQUENCE_RULES, schedule: sched });
        if (BREAK === 'droprow') priced.rows.pop();
        if (BREAK === 'retag' && priced.rows.length) priced.rows[0].qty += Date.now() % 1000 + 1;   // a different model every call
        const key = PS.projectKey(a.building, S.bdb);
        const classes = Array.from(new Set(priced.rows.map((r) => r.cls)));
        say('inputs building=' + a.building + ' key=' + key + ' selection=' + JSON.stringify(selectionWords(a.selection)) + ' selected=' + S.guids.length + ' priced=' + priced.elements + ' rows=' + priced.rows.length + ' schedule=' + (sched ? sched.tasks.length + ' tasks from ' + sched.source : 'none') + ' run=' + S.c.status + ' ms=' + (Date.now() - t0));
        return { key, rows: priced.rows, classes, env, now: process.env.BIM_ORDER_NOW || now(), cur: 'RM', selected: S.guids.length, elements: priced.elements, scheduleSource: sched ? sched.source : null };
      } finally { console.log = log; }
    },
    // §29.4 P6 (the Variation Order): what the MODEL now prices at, against what the Project Order HOLDS, class by class. The model's side is the SAME fold the post runs (the same rows per 4D task,
    //   the same line rules), run on a SCRATCH copy under a probe key, so the two sides are on ONE basis and an unchanged model gives a difference of exactly 0 (no second pricing, no rounding gap).
    //   voRows = one signed CHANGED row per class whose total differs, the shape ProjOrderState.issueVO folds (rate = the priced difference, count 1; vo_fold.js with the neutral config).
    voInputs(a, inp0) {
      const inp = inp0 || this.inputs(a), PS = this.ProjOrderState, BD = inp.env.BigDecimal, log = console.log;
      console.log = () => {};
      try {
        const state = PS.readState(O.db, inp.key, inp.classes, inp.env), probe = inp.key + ' (probe)';
        const total = (st) => { const m = {}; (st.lines || []).forEach((l) => { m[l.cls] = (m[l.cls] || BD.ZERO).add(BD.of(String(l.amt))); }); return m; };
        const orderBy = total(state);
        // what the order holds is its lines AND the Variation Orders already issued on it (a pending or approved VO; not a reversed or voided one): a change a VO already carries is not a new difference
        const voBy = {}; (state.vos || []).filter((v) => v.status !== 'RE' && v.status !== 'VO').forEach((v) => {
          const r = O.db.exec('SELECT p.Value, ol.LineNetAmt FROM C_OrderLine ol JOIN M_Product p ON p.M_Product_ID=ol.M_Product_ID WHERE ol.C_Order_ID=' + Number(v.orderId));
          (r.length ? r[0].values : []).forEach((x) => { voBy[x[0]] = (voBy[x[0]] || BD.ZERO).add(BD.of(String(x[1]))); });
        });
        Object.keys(voBy).forEach((c) => { orderBy[c] = (orderBy[c] || BD.ZERO).add(voBy[c]); });
        const scratch = new O.SQL.Database(O.db.export()); let modelBy = {}, modelTotal = '0', ok = false;
        try { PS.generate(scratch, probe, inp.rows, inp.env, inp.now, inp.cur); const ms = PS.readState(scratch, probe, inp.classes, inp.env); modelBy = total(ms); modelTotal = ms.plannedAmt; ok = true; } finally { scratch.close(); }
        const disc = {}; inp.rows.forEach((r) => { if (disc[r.cls] == null) disc[r.cls] = r.disc; });
        const voRows = [];
        Object.keys(modelBy).concat(Object.keys(orderBy)).filter((c, i, arr) => arr.indexOf(c) === i).sort().forEach((c) => {
          let d = (modelBy[c] || BD.ZERO).subtract(orderBy[c] || BD.ZERO); if (BREAK === 'novo') d = BD.ZERO;
          if (d.abs().compareTo(BD.of('0.005')) > 0)   // a difference of half a cent or less is nothing: a VO line is a cent amount, so the cent rounding of a VO already issued leaves up to that much
            voRows.push({ status: 'CHANGED', cls: c, disc: disc[c] || '_', count: 1, rate: d.toString(), unit: 'EA' });
        });
        say('vo-inputs building=' + a.building + ' key=' + inp.key + ' generated=' + state.generated + ' orderTotal=' + state.plannedAmt + ' modelTotal=' + modelTotal + ' classes=' + Object.keys(modelBy).length + ' delta=' + voRows.length + (ok ? '' : ' MODEL-FOLD-FAILED'));
        return { key: inp.key, state, voRows, env: inp.env, now: inp.now, cur: inp.cur, selected: inp.selected, elements: inp.elements, orderTotal: state.plannedAmt || '0', modelTotal };
      } finally { console.log = log; }
    }
  };
}
module.exports = { install, selectionWords };
