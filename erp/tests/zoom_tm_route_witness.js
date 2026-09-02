// zoom_tm_route_witness.js — W-ZOOM-TM-ROUTE (FUSED_4D5D_WEDGE_LANE §ARCH-OWNERSHIP)
//
// ISSUE PROVED: ZoomAcross/Connect scope routing is "TM-if-open, else Find" — when the Time Machine
// is OPEN it consumes the pinpoint (jumps to the element's moment via tmJumpToElement); else Find is
// the default floor. applyFindScope is DOM-bound (Find panel), so the value proof is the live
// §ZOOM-SCOPE route= log; here we prove the WIRING is in place + the consumer API it depends on
// exists. (whitebox §-log first, per docs/TestArchitecture.)

var fs = require('fs');
var path = require('path');
var VIEWER = path.resolve(__dirname, '..', '..', 'viewer');

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-ZTM PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-ZTM FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function read(f) { return fs.readFileSync(path.join(VIEWER, f), 'utf8'); }

var nf = read('navigate_find.js');
var tm = read('time_machine.js');

// Router branches present in applyFindScope (whole function body).
var _s = nf.indexOf('A.applyFindScope = function');
var scope = nf.slice(_s, nf.indexOf('\n    };', _s) + 6);
check('router-reads-tmstate', /tmGetState\(\)/.test(scope) && /\.active/.test(scope), 'tmGetState().active');
check('router-tmopen-flag', /var tmOpen =/.test(scope), 'tmOpen computed');
check('router-tm-consume', /tmOpen[\s\S]{0,200}tmJumpToElement/.test(scope), 'TM-open → tmJumpToElement');
check('router-logs-tm', /route=tm/.test(scope), '§ZOOM-SCOPE route=tm');
check('router-logs-find', /route=find/.test(scope), '§ZOOM-SCOPE route=find (the floor)');
check('router-both-kinds', (scope.match(/route=tm/g) || []).length >= 2, 'guid + class branches both routed');

// Consumer API the router depends on must exist + behave (jump to element moment, state getter).
check('tm-exposes-jump', /window\.tmJumpToElement = function/.test(tm), 'tmJumpToElement');
check('tm-jump-sets-cursor', /tmJumpToElement[\s\S]{0,800}_cursor = op\.end_ts/.test(tm), 'jump → cursor at element moment');
check('tm-exposes-state', /window\.tmGetState = function/.test(tm) && /active: _active/.test(tm), 'tmGetState().active');

console.log('§W-ZOOM-TM-ROUTE RESULT ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
