// ⚠ DO NOT REMOVE — W-RED1-LOGIN (bim-compiler prompts/CLI_ERP_IVR.md §30 LOGIN, owner 2026-11-16: "we need not have login but we can flag if it is a multi user
//   (AD_User.email > 1 of AD_Client_ID > 11 (new client)) then a login is needed"). READ THE LOG; an exit code is not evidence.
//   G1 ISSUE (a login asked where the owner said none is needed): `role 102` (client 11) and `role 12000` (client 12, one user with an email) ask nothing and the next line runs
//   G2 ISSUE (a multi-user client is entered and lines run as nobody): `role 1300102` (client 13) says a login is needed ONCE, and `cd "Business Partner"` + `ls` are refused:
//      the journal holds no line but the role's own two reads
//   G3 ISSUE (the login does not reach the record): `role 103`, `login GardenUser`, then `new` in Business Partner -> the op's createdby is 102 (not the default 101), and the
//      journal's started row of that line carries user 102
//   G4 ISSUE (a user logs in with a role that is not theirs): under role 1300102, `login GardenUser` is refused naming its role 1300103, and lines stay refused
//   G5 ISSUE (the ask decision is not the owner's rule): for one active role of every client > 11, red1 asks exactly when an independent SQL count on the seed of that client's
//      AD_User rows with an EMail is > 1
//   Falsifiers: LOGIN_BREAK=nogate (the gate is off: must FAIL G2) · LOGIN_BREAK=nostamp (the user is not handed to the engines: must FAIL G3).
//   Every run has its OWN op-log and journal in a temp folder (never the owner's).
//   Run: node common/door/tests/witness_red1_login.js > common/door/tests/logs/red1_login.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT } = require('./_kit');
const k = kit('W-RED1-LOGIN'), RED1 = path.join(ROOT, 'common/door/red1.js');
const NEEDED = /a login is needed/, FIRST = /^login first/m;
const session = (name, lines) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'w-red1-login-' + name + '-')), env = Object.assign({}, process.env, { BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'journal.jsonl'), RED1_WARM: 'off' });
  delete env.BIM_DOOR_USER;
  const r = cp.spawnSync(process.execPath, [RED1], { input: lines.concat(['exit']).join('\n') + '\n', encoding: 'utf8', env, timeout: 300000 });
  const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };
  const out = { name, out: r.stdout || '', err: r.stderr || '', journal: read(env.BIM_DOOR_JOURNAL), ops: (() => { try { return require('../ledger_sign.js').parseOps(fs.readFileSync(env.BIM_OBJECT_OPLOG, 'utf8')); } catch (e) { return []; } })() };   // the OPS of the log (§52: a line is a signed row)
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (x) { /* kept */ }
  k.L('session ' + name + ' lines=' + JSON.stringify(lines) + ' journal=' + out.journal.filter(j => j.state === 'started').map(j => j.verb + (j.user ? '@' + j.user : '')).join(',') + ' ops=' + out.ops.length);
  return out;
};
const started = (s) => s.journal.filter(j => j.state === 'started');
(async () => {
  // G1
  const a = session('g1-102', ['role 102', 'cd "Business Partner"', 'count']), b = session('g1-12000', ['role 12000', 'cd "Business Partner"', 'count']);
  const ran = (s) => started(s).some(j => j.verb === 'mis.describe');
  k.chk('G1 role 102 (client 11) and role 12000 (client 12) ask nothing and the next line runs', !NEEDED.test(a.out) && !FIRST.test(a.out) && ran(a) && !NEEDED.test(b.out) && !FIRST.test(b.out) && ran(b),
    'asked 102=' + NEEDED.test(a.out) + ' 12000=' + NEEDED.test(b.out) + ' ran 102=' + ran(a) + ' 12000=' + ran(b));
  // G2
  const c = session('g2', ['role 1300102', 'cd "Business Partner"', 'ls']), asks = (c.out.match(/a login is needed/g) || []).length, refused = (c.out.match(/^login first/mg) || []).length;
  const others = started(c).filter(j => !/^mis\.list kind=(AD_Role|AD_User) /.test(j.line || ''));
  k.chk('G2 role 1300102 (client 13) says a login is needed once, and cd + ls are refused with nothing journalled but the role\'s two reads', asks === 1 && refused === 2 && started(c).length === 2 && !others.length,
    'asks=' + asks + ' refused=' + refused + ' journalled=' + started(c).length + ' other=' + others.map(j => j.line).join(' | '));
  // G3
  const d = session('g3', ['role 103', 'login GardenUser', 'cd "Business Partner"', 'new Value=LGW' + Date.now() % 100000 + ' Name="Login Witness"']);
  const create = d.ops.map(o => JSON.stringify(o)).filter(t => /c_bpartner/i.test(t) && /CRUD_CREATE/.test(t))[0], cb = create && /"createdby":(\d+)/.exec(create), newJ = started(d).filter(j => j.verb === 'mis.new')[0];
  k.L('G3 create=' + (create ? create.slice(0, 160) : 'none') + ' journal mis.new user=' + (newJ && newJ.user));
  if (!create) k.incon('G3', 'the new Business Partner was not created: ' + (d.out.split('\n').filter(l => /refused|ok · mis.new/.test(l)).join(' | ') || 'no answer'));
  else k.chk('G3 after login GardenUser (102) the new record\'s createdby is 102, not the default 101, and the journal row of the line says user 102', !!cb && cb[1] === '102' && !!newJ && newJ.user === 102,
    'createdby=' + (cb && cb[1]) + ' journal user=' + (newJ && newJ.user));
  // G4
  const e = session('g4', ['role 1300102', 'login GardenUser', 'cd "Business Partner"']);
  k.chk('G4 under role 1300102, login GardenUser is refused naming its role 1300103, and the next line stays refused', /GardenUser has no role 1300102; their roles: 1300103/.test(e.out) && FIRST.test(e.out) && !started(e).some(j => j.verb === 'mis.describe'),
    'out=' + JSON.stringify(e.out.split('\n').filter(l => /GardenUser|login first/.test(l))));
  // G5 the owner's rule against an independent SQL count, every client > 11
  const SQL = await require(path.join(ROOT, 'modeller/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller/lib/sql-wasm.wasm')) }), seed = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db')));
  const q = (s) => { const r = seed.exec(s); return r.length ? r[0].values : []; };
  const clients = q("SELECT c.AD_Client_ID, (SELECT count(*) FROM AD_User u WHERE u.AD_Client_ID=c.AD_Client_ID AND u.EMail IS NOT NULL AND trim(u.EMail)<>''), (SELECT min(r.AD_Role_ID) FROM AD_Role r WHERE r.AD_Client_ID=c.AD_Client_ID AND r.IsActive='Y') FROM AD_Client c WHERE c.AD_Client_ID>11 ORDER BY 1");
  const bad = [];
  clients.forEach(([cl, n, role]) => { if (role == null) { k.L('G5 client ' + cl + ' has no active role: not judged'); return; }
    const s = session('g5-' + cl, ['role ' + role]), asked = NEEDED.test(s.out), want = n > 1; k.L('G5 client=' + cl + ' role=' + role + ' users with email (SQL)=' + n + ' want ask=' + want + ' red1 asked=' + asked);
    if (asked !== want) bad.push(cl + ': sql ' + n + ' asked ' + asked); });
  k.chk('G5 red1 asks exactly where the seed\'s count of users with an email is > 1 (' + clients.length + ' clients > 11)', clients.length > 0 && !bad.length, bad.join(' | '));
  k.end();
})().catch(e => { console.log('§W-RED1-LOGIN FAIL ' + (e && e.stack || e)); process.exit(1); });
