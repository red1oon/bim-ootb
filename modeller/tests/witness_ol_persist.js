#!/usr/bin/env node
/**
 * W-OL-PERSIST — §P9 (prompts/RESUME_MODELLER_POLISH_BATCH.md): Outliner collapsed-state persists across a
 * reload (localStorage), against the REAL bonsai_outliner.js module.
 *
 * Issue under test: `_collapsed` was in-memory only — every reload re-expanded every group the user had
 * deliberately folded away (thousands-of-rows buildings make this a real annoyance, not a nicety).
 *
 * Checks:
 *   P1 save    — toggling writes the JSON state under dagevu_modeller_ol_collapsed (same mutation+save the
 *                click handlers run)
 *   P2 restore — a "new session" (cleared _collapsed + _loadCollapsed, what mount() runs) restores the state
 *   P3 corrupt — corrupted stored JSON neither throws nor clobbers (falls back to in-memory {})
 *   P4 no-ls   — absent localStorage (headless/node hosts) both helpers no-op silently (in-memory as before)
 */
'use strict';
global.window = global.window || {};

var _store = {};
global.localStorage = { getItem: k => (k in _store ? _store[k] : null), setItem: (k, v) => { _store[k] = String(v); }, removeItem: k => { delete _store[k]; } };

var path = require('path');
require(path.join(__dirname, '..', 'bonsai_outliner.js'));   // → window.Bonsai.outliner (REAL module)
var OL = window.Bonsai.outliner;

var pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}

console.log('═══ W-OL-PERSIST — §P9 collapsed-state persistence (REAL bonsai_outliner, node) ═══');

// P1 — the exact mutation+save the three click handlers run
OL._collapsed['tcat|bomtree'] = true;
OL._collapsed['bn|storey-1'] = true;
OL._saveCollapsed();
var stored = JSON.parse(_store[OL._CKEY] || 'null');
chk('P1 save writes the JSON state', stored && stored['tcat|bomtree'] === true && stored['bn|storey-1'] === true,
  _store[OL._CKEY]);

// P2 — new session: fresh in-memory state, then the mount()-time load
OL._collapsed = {};
OL._loadCollapsed();
chk('P2 restore on a fresh session', OL._collapsed['tcat|bomtree'] === true && OL._collapsed['bn|storey-1'] === true,
  JSON.stringify(OL._collapsed));

// P3 — corrupted JSON: no throw, no clobber
_store[OL._CKEY] = '{not json';
OL._collapsed = { keepme: true };
var threw = false;
try { OL._loadCollapsed(); } catch (e) { threw = true; }
chk('P3 corrupt store → no throw, state kept', !threw && OL._collapsed.keepme === true, JSON.stringify(OL._collapsed));

// P4 — no localStorage at all (node hosts without the stub): silent no-ops
delete global.localStorage;
threw = false;
try { OL._loadCollapsed(); OL._saveCollapsed(); } catch (e) { threw = true; }
chk('P4 absent localStorage → silent no-op', !threw);

console.log('W-OL-PERSIST ' + (fail ? 'FAIL' : 'PASS') + '  pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
