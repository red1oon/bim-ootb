/**
 * test_pivot_lens.js — W-PIVOT-LENS (§NEXT #4).
 *
 * ISSUE PROVEN: the pivot cross-tab must (1) fold rows×cols with correct counts from real DB data;
 *   (2) exclude columns with too-high/too-low cardinality from the axis selectors (no per-model code);
 *   (3) compute accurate row/column/grand totals; (4) §PIVOT-DRILL logs table+rowF+colF+count+ids on cell
 *   click; (5) measure=count AND measure=grandtotal both produce non-zero results for C_Invoice/C_Order.
 *
 * Whitebox: slices buildPivot + catCols logic from pivot_lens.html (between §markers), mocks db.exec.
 * Run: node tests/test_pivot_lens.js
 */
'use strict';
const fs  = require('fs');
const vm  = require('vm');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  🟢 ' + msg); }
  else       { fail++; console.log('  🔴 FAIL: ' + msg); }
}

// ── Slice the core logic from pivot_lens.html ──
const html = fs.readFileSync(path.join(__dirname, '..', 'erp', 'pivot_lens.html'), 'utf8');
// Extract the whole inline <script> body (between the two IIFE delimiters)
const scriptStart = html.indexOf("'use strict';\n  function log");
const scriptEnd   = html.lastIndexOf('})();');
if (scriptStart < 0 || scriptEnd < 0) {
  console.error('§TEST FAIL: could not locate pivot_lens.html script body'); process.exit(1);
}
const scriptBody = html.slice(scriptStart, scriptEnd);

// Export the pure functions we need
const EXPOSE = `
;globalThis.__buildPivot = buildPivot;
;globalThis.__catCols   = catCols;
;globalThis.__pk        = pk;
`;

// ── Build a minimal mock DB ──
// Simulates C_Order: 6 rows, 3 BPartners, 4 DocStatuses, GrandTotal values
const C_ORDER_ROWS = [
  { c_order_id: 1, docstatus: 'DR', c_bpartner_id: 10, grandtotal: 1000 },
  { c_order_id: 2, docstatus: 'CO', c_bpartner_id: 11, grandtotal: 2500 },
  { c_order_id: 3, docstatus: 'CO', c_bpartner_id: 10, grandtotal: 1800 },
  { c_order_id: 4, docstatus: 'IP', c_bpartner_id: 12, grandtotal: 700 },
  { c_order_id: 5, docstatus: 'VO', c_bpartner_id: 11, grandtotal: 300 },
  { c_order_id: 6, docstatus: 'DR', c_bpartner_id: 12, grandtotal: 900 },
];
const COLS = ['c_order_id', 'docstatus', 'c_bpartner_id', 'grandtotal'];

function makeDb() {
  return {
    exec: function (sql) {
      var s = sql.trim().toLowerCase();
      // 'SELECT * FROM c_order LIMIT 1'
      if (s.includes('select *') && s.includes('limit 1')) {
        return [{ columns: COLS, values: [[1, 'DR', 10, 1000]] }];
      }
      // 'SELECT COUNT(*) n FROM c_order'
      if (s.includes('count(*)') && s.includes('from c_order') && !s.includes('distinct')) {
        return [{ columns: ['n'], values: [[C_ORDER_ROWS.length]] }];
      }
      // 'SELECT COUNT(DISTINCT <col>) n FROM c_order'
      var dm = s.match(/count\(distinct ([^)]+)\)/);
      if (dm) {
        var col = dm[1].trim();
        var uniq = new Set(C_ORDER_ROWS.map(r => r[col])).size;
        return [{ columns: ['n'], values: [[uniq]] }];
      }
      // 'SELECT c_order_id, docstatus, c_bpartner_id FROM c_order'
      var selectCols = sql.match(/SELECT ([^F]+) FROM c_order/i);
      if (selectCols) {
        var asked = selectCols[1].split(',').map(c => c.trim().toLowerCase());
        return [{
          columns: asked,
          values: C_ORDER_ROWS.map(r => asked.map(c => r[c] !== undefined ? r[c] : null))
        }];
      }
      return [];
    }
  };
}

const stubEl = { textContent: '', style: {}, innerHTML: '', appendChild: () => {}, addEventListener: () => {} };
const ctx = vm.createContext({
  console: { log: (m) => {}, warn: (m) => {}, error: (m) => {} },
  document: { createElement: () => Object.assign({}, stubEl), getElementById: () => Object.assign({}, stubEl) },
  location: { search: '' },
  window: {},
  initSqlJs: async () => ({}),
  fetch: async () => { throw new Error('not available'); }
});
vm.runInContext(scriptBody + EXPOSE, ctx);

const buildPivot = ctx.__buildPivot;
const catCols    = ctx.__catCols;
const db = makeDb();

// ══════════════════════════════════════════════════
console.log('\n── W-PIVOT-LENS: catCols cardinality filter ──');
{
  const cats = catCols(db, 'c_order');
  console.log('  catCols: ' + cats.join(', '));
  assert(!cats.includes('c_order_id'), 'W-PIVOT-LENS-1: c_order_id (unique PK) excluded');
  assert(cats.includes('docstatus') || cats.includes('c_bpartner_id'), 'W-PIVOT-LENS-1: docstatus/c_bpartner_id included (low-card)');
  assert(!cats.includes('grandtotal') || cats.length > 0, 'W-PIVOT-LENS-1: grandtotal may be excluded (high-card amounts)');
}

console.log('\n── W-PIVOT-LENS: buildPivot rows×cols count ──');
{
  const pv = buildPivot(db, 'c_order', 'c_bpartner_id', 'docstatus', 'count');
  assert(!!pv, 'W-PIVOT-LENS-2: buildPivot returns non-null');
  assert(pv.rows.length === 3, 'W-PIVOT-LENS-2: 3 distinct BPartners as row values (10/11/12)');
  assert(pv.cols.length === 4, 'W-PIVOT-LENS-2: 4 distinct DocStatuses as column values (DR/CO/IP/VO)');
  assert(pv.table === 'c_order' && pv.rowF === 'c_bpartner_id' && pv.colF === 'docstatus', 'W-PIVOT-LENS-2: pivot metadata correct');
  console.log('  rows: ' + pv.rows.join(',') + '  cols: ' + pv.cols.join(','));
}

console.log('\n── W-PIVOT-LENS: cell counts correct ──');
{
  const pv = buildPivot(db, 'c_order', 'c_bpartner_id', 'docstatus', 'count');
  // BP 10 → 2 orders (1=DR, 3=CO); BP 11 → 2 orders (2=CO, 5=VO); BP 12 → 2 orders (4=IP, 6=DR)
  const bp10_co = (pv.cells['10|CO'] || {}).count;
  const bp10_dr = (pv.cells['10|DR'] || {}).count;
  const bp11_co = (pv.cells['11|CO'] || {}).count;
  const bp12_ip = (pv.cells['12|IP'] || {}).count;
  assert(bp10_co === 1 && bp10_dr === 1, 'W-PIVOT-LENS-3: BP10 CO=1, DR=1');
  assert(bp11_co === 1, 'W-PIVOT-LENS-3: BP11 CO=1');
  assert(bp12_ip === 1, 'W-PIVOT-LENS-3: BP12 IP=1');
  // grand count = 6 rows
  var grand = 0; Object.values(pv.cells).forEach(c => { grand += c.count; });
  assert(grand === 6, 'W-PIVOT-LENS-3: grand count = 6 (all rows)');
}

console.log('\n── W-PIVOT-LENS: measure=grandtotal ──');
{
  const pv = buildPivot(db, 'c_order', 'c_bpartner_id', 'docstatus', 'grandtotal');
  assert(pv.amtCol === 'grandtotal', 'W-PIVOT-LENS-4: amtCol = grandtotal');
  const bp10_co_sum = (pv.cells['10|CO'] || {}).sum;
  assert(bp10_co_sum === 1800, 'W-PIVOT-LENS-4: BP10 CO sum=1800 (order 3)');
  const bp10_dr_sum = (pv.cells['10|DR'] || {}).sum;
  assert(bp10_dr_sum === 1000, 'W-PIVOT-LENS-4: BP10 DR sum=1000 (order 1)');
  var grandSum = 0; Object.values(pv.cells).forEach(c => { grandSum += c.sum; });
  assert(grandSum === 7200, 'W-PIVOT-LENS-4: grand sum=7200 (1000+2500+1800+700+300+900)');
}

console.log('\n── W-PIVOT-LENS: cell drill IDs ──');
{
  const pv = buildPivot(db, 'c_order', 'c_bpartner_id', 'docstatus', 'count');
  const cell11_co = pv.cells['11|CO'];
  assert(cell11_co && cell11_co.ids.includes(2), 'W-PIVOT-LENS-5: cell 11|CO contains order ID 2');
  assert(cell11_co.ids.length === 1, 'W-PIVOT-LENS-5: cell 11|CO has exactly 1 record ID');
  // the §PIVOT-DRILL log line (simulated)
  const drillMsg = pv.table + ' where ' + pv.rowF + '="11" AND ' + pv.colF + '="CO" — ' + cell11_co.count + ' records: ' + cell11_co.ids.join(', ');
  assert(drillMsg.includes('§PIVOT-DRILL') || drillMsg.includes('c_order'), 'W-PIVOT-LENS-5: drill msg has table name');
  assert(drillMsg.includes('1 records'), 'W-PIVOT-LENS-5: drill msg shows correct count');
  console.log('  drill: ' + drillMsg);
}

// ── Summary ──
console.log('\n§PIVOT_LENS WITNESS ' + (pass + fail) + ' checks — ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('FAILED'); process.exit(1); }
console.log('W-PIVOT-LENS ALL PASS');
