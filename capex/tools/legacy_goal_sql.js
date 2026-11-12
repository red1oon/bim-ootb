// capex/tools/legacy_goal_sql.js — the CAPEX goals of the LOCAL pilot and legacy's own measure SQL for each (MMeasureCalc.getSqlPI :153-189; SYSDATE → statement_timestamp() as legacy's converter does). READ-ONLY.
// One owner for W-G6A-HOME and W-DASH-SYNC (prompts/CAPEX_DASHBOARD.md §5.25, §5.26). The session runs in this machine's time zone, as legacy's DB session runs in its JVM's (§5.24).
'use strict';
const { execFileSync } = require('child_process');
const psqlRaw = s => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere_pilot', '-v', 'ON_ERROR_STOP=1', '-qtA'], { input: 'SET search_path=adempiere;\nSET TIME ZONE ' + "'" + Intl.DateTimeFormat().resolvedOptions().timeZone + "';\n" + s, maxBuffer: 256 << 20 }).toString().trim();
const pj = (t, w) => JSON.parse(psqlRaw("SELECT COALESCE(json_agg(x),'[]') FROM " + t + ' x WHERE ' + w + ';') || '[]');
const pilotGoals = () => JSON.parse(psqlRaw("SELECT COALESCE(json_agg(x),'[]') FROM (SELECT g.pa_goal_id AS id, g.name, g.measureactual AS stored, g.measuretarget AS target, g.pa_colorschema_id AS schema, g.measurescope AS scope, g.datelastrun::date = current_date AS fresh, m.measuredatatype AS dt, m.measuretype AS mt, c.selectclause AS sel, c.whereclause AS wh, c.datecolumn AS dc FROM pa_goal g JOIN pa_measure m ON m.pa_measure_id=g.pa_measure_id LEFT JOIN pa_measurecalc c ON c.pa_measurecalc_id=m.pa_measurecalc_id WHERE g.ad_client_id=11 AND g.isactive='Y' AND g.name LIKE 'CAPEX %' ORDER BY g.seqno, g.pa_goal_id) x;"));
const TRUNC = { 1: 'Y', 3: 'Q', 5: 'MM', 7: 'D', 8: 'DD' };
// Env.parseContext as MMeasureCalc.getSqlPI :183-184 runs it: the login tags a CAPEX row uses, from the session legacy would build — $C_Currency_ID = the client's accounting-schema currency (Login.java:569). An unknown tag empties the SQL (legacy), which the caller sees as an error. (§5.68)
let _cur = null; const loginCurrency = () => _cur != null ? _cur : (_cur = psqlRaw('SELECT s.C_Currency_ID FROM AD_ClientInfo ci JOIN C_AcctSchema s ON s.C_AcctSchema_ID=ci.C_AcctSchema1_ID WHERE ci.AD_Client_ID=11;'));
const parseCtx = sql => { if (sql.indexOf('@') < 0) return sql; const CTX = { '$C_Currency_ID': loginCurrency() }; let bad = false; const out = sql.replace(/@([^@]+)@/g, (m, t) => { if (CTX[t] == null) { bad = true; return m; } return CTX[t]; }); return bad ? 'SELECT NULL WHERE FALSE /* unparsable tag: legacy empties the SQL */' : out; };
const sqlOf = g => { const a = (g.sel.match(/FROM\s+\w+\s+(\w+)\s*$/i) || [])[1], pre = a ? a + '.' : ''; let s = g.sel + ' ' + g.wh; if (g.dc && g.dt === 'T' && String(g.scope) !== '0') { const t = TRUNC[g.scope] || 'DD'; s += ' AND TRUNC(' + g.dc + ",'" + t + "')=TRUNC(statement_timestamp(),'" + t + "')"; } return parseCtx((s + ' AND ' + pre + 'AD_Client_ID IN (0,11)').replace(/\bSYSDATE\b/gi, 'statement_timestamp()')); };
const selects = (goals, tag) => goals.filter(g => g.mt === 'C' && g.sel).map(g => "SELECT '" + tag + "|" + g.id + "|' || COALESCE((" + sqlOf(g) + ")::text,'0');").join('\n');
const parse = lines => { const R = {}; lines.split('\n').forEach(l => { const m = l.match(/^([A-Z])\|(\d+)\|(.*)$/); if (m) (R[m[1]] = R[m[1]] || {})[m[2]] = m[3]; }); return R; };
// recomputeGoals: legacy's own engine computes every goal NOW, its target kept: a target save t+1 → t (MGoal.afterSave :594-603 → updateGoal(true) scores against the PREVIOUS target), then GoalPerformance per MGoal.setGoalPerformance :428-436 (§5.27).
async function recomputeGoals(ws, buildCrudXml, login, log) {
  for (const g of pilotGoals()) {
    const save = v => ws('update_data', buildCrudXml(login, { serviceType: 'BridgeUpdatePAGoal', tableName: 'PA_Goal', action: 'Update', recordId: g.id, fields: [{ column: 'MeasureTarget', val: String(v) }] }));
    const a = await save(Number(g.target) + 1), b = await save(g.target);
    if (a.isError || b.isError) (log || console.log)('goal ' + g.name + ' recompute refused: ' + (a.error || b.error));
  }
  psqlRaw("UPDATE PA_Goal SET GoalPerformance = CASE WHEN MeasureTarget=0 THEN 0 ELSE ROUND(MeasureActual/MeasureTarget,6) END WHERE AD_Client_ID=11 AND Name LIKE 'CAPEX %';");
}
// titleOf: the stock caption (WPerformanceIndicator.init): "<Name>: <percent>%" with a target (MGoal.getPercent = GoalPerformance x 100, whole part), else "<Name>: <value #,##0>"; fmt = the page's formatter
const titleOf = async (g, value, fmt) => Number(g.target) !== 0 ? g.name + ': ' + Math.trunc(Math.round(Number(value) / Number(g.target) * 1e6) / 1e4) + '%' : g.name + ': ' + await fmt(value);
module.exports = { psqlRaw, pj, pilotGoals, sqlOf, selects, parse, recomputeGoals, titleOf };
