// ⚠ DO NOT REMOVE — Witness: W-VIEWER-SESSION (HISTORY_SESSION_EVENTS.md A2 [VIEWER])
// Issue PROVED/DISPROVED: the viewer W list should be a FLAT per-SESSION chooser — one card per open,
//   and clicking a card RE-HOMES to that session's Z (read-only), not just reopens the building. Two visits
//   to the same building = two cards. This proves the W card carries the session into its deep-link url
//   (clicking re-homes via ?sess=), and source-verifies the session-keying + read-only re-home gates.
// Deterministic: injected session ids + ts, no Date.now in the assert path.

var store = {};
global.localStorage = { getItem:function(k){return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null;},
  setItem:function(k,v){store[k]=String(v);}, removeItem:function(k){delete store[k];},
  key:function(i){return Object.keys(store)[i];}, get length(){return Object.keys(store).length;} };

var WH = require('../../common/whole_history.js');
var fail = 0;
function ok(c,m){ console.log((c?'§W-VIEWER-SESSION PASS ':'§W-VIEWER-SESSION FAIL ')+m); if(!c) fail++; }

var DB = 'https://oci.example/o/buildings/SampleCastle_extracted.db';
// Two SESSIONS of the same building (morning + afternoon) → must be TWO cards with DISTINCT deep-links.
WH.record({ page:'viewer', ts:1700000000000, label:'SampleCastle', kind:'op', ref:{ building:'SampleCastle', db:DB, session:'s1700000000000' } });
WH.record({ page:'viewer', ts:1700050000000, label:'SampleCastle', kind:'op', ref:{ building:'SampleCastle', db:DB, session:'s1700050000000' } });

var items = WH.buildItems('whole', 'landing');
var cards = items.filter(function(i){ return i.label === 'SampleCastle'; });
ok(cards.length === 2, 'two visits → TWO W cards (flat per-session list): ' + cards.length);

ok(cards[0].url === 'viewer/viewer.html?db=' + DB + '&sess=s1700000000000&ghost=1', 'card 1 deep-links to its session: ' + cards[0].url);
ok(cards[1].url === 'viewer/viewer.html?db=' + DB + '&sess=s1700050000000&ghost=1', 'card 2 deep-links to its session');
ok(cards[0].url !== cards[1].url, 'the two cards RE-HOME to DISTINCT sessions');

// A viewer entry WITHOUT a session (pre-A2 / legacy) still deep-links by db (no &sess) — back-compat.
WH.record({ page:'viewer', ts:1700060000000, label:'OldBldg', kind:'op', ref:{ building:'OldBldg', db:DB } });
var old = WH.buildItems('whole','landing').filter(function(i){return i.label==='OldBldg';})[0];
ok(old.url === 'viewer/viewer.html?db=' + DB + '&ghost=1', 'legacy entry w/o session → no &sess (back-compat): ' + old.url);

// ── source wiring (browser-coupled paths verified by source) ──
var fs = require('fs'), path = require('path');
var uh = fs.readFileSync(path.join(__dirname,'../universal_history.js'),'utf8');
ok(/function _sessionId\(\)/.test(uh) && /sessionStorage/.test(uh), '_sessionId uses sessionStorage (reload continues / new tab = new session)');
ok(/sp\.get\('sess'\)/.test(uh) && /_REHOME\s*=\s*true/.test(uh), '?sess= triggers read-only RE-HOME');
ok(/bim\.hist\.tree\.'[^\n]*\+ _sessionId\(\)/.test(uh), 'tree key is scoped to (building, SESSION)');
ok(/session:\s*_sessionId\(\)/.test(uh), 'BUILDING_OPEN ref carries the session');
ok((uh.match(/if \(_isReHome\(\)\) return/g)||[]).length >= 1 && /_isReHome\(\)\) return;\s*\/\/ A2/.test(uh.replace(/\n/g,' ')) , 're-home gates recording (_recordOp)');
ok(/_isReHome\(\)\) return;.*read-only re-home never records/.test(uh.replace(/\n/g,' ')), 're-home gates recordEvent + pushView');

console.log(fail===0 ? '§W-VIEWER-SESSION ALL PASS' : ('§W-VIEWER-SESSION '+fail+' FAILED'));
process.exit(fail===0?0:1);
