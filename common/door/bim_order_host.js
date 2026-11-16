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
const BREAK = process.env.POST_BREAK || '';   // W-POST-FOLD falsifiers: retag (the model differs at every post: F2 must FAIL) · shift (the schedule is a day late: F4 must FAIL) · droprow (one priced row is lost: F3 must FAIL)
const say = (s) => process.stderr.write('§BIM_ORDER_HOST ' + s + '\n');
// "discipline=ARC storey=*1" or 'storey="Level 1"' -> ['discipline=ARC', 'storey=*1']  (the same col=glob words `viewer.cost` takes)
function selectionWords(text) { const out = [], re = /([A-Za-z_]\w*)=("([^"]*)"|\S+)/g; let m; while ((m = re.exec(String(text || '')))) out.push(m[1] + '=' + (m[3] != null ? m[3] : m[2])); return out; }
function install(O, now) {
  globalThis.BimOrderHost = {
    hostDb: O.db, Database: O.SQL.Database,
    get ProjOrderState() { return require(path.join(ROOT, 'viewer', 'proj_order_state.js')); },
    get WriteCapture() { return require(path.join(ROOT, 'erp', 'write_capture.js')); },
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
    }
  };
}
module.exports = { install, selectionWords };
