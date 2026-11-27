#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS W-SEND-HQ-GITHUB-LIVE (2026-11-28, bim-compiler prompts/MOBILE_PERF.md §2026-11-28 CHECKS)
// ISSUE THIS PROVES OR DISPROVES: every team-folder witness (W-SEND-HQ-TEAM, W-HQ-VIEW) ran on a local folder or the GitHub
// STAND-IN (common/tests/gh_standin.js); the real GitHub API (refs, Git Data API, auth, pacing) was never exercised. This runs the
// SAME comm_store.js / comm_pipe.js ghPipe / team_drop.js the browser loads, against the real API, in a FRESH space of the
// private trial relay red1oon/bim-teams-trial (the repo common/comm/team_defaults.js names):
//   L1 HQ founds the space + enrols the site phone, both sync over GitHub, the phone then holds a team key
//   L2 the phone's drop (report + photo) goes up in exactly ONE commit
//   L3 HQ (own pipe, own sync) lists exactly 1 drop and opens it byte-equal
//   L4 a write into HQ's drawer from the phone's pipe is refused (not under my prefix)
//   L5 every stored file of the drop, read back raw from GitHub, holds none of the plaintext needles
//   L6 requests used, logged against the published 5,000/hour per token
//   RED control: one byte of a stored part flipped (read-only wrapper over the live pipe) → DROP.open must refuse it
// Cleanup: the run's two device branches (dev/<kid>) are deleted at the end (§GH_LIVE_CLEANUP).
// Opt-in: GH_LIVE=1, token from GH_TOKEN or `gh auth token`. Without them → INCONCLUSIVE (never PASS). Read the log after every run.
// Run:  GH_LIVE=1 node viewer/tests/witness_send_hq_github_live.js
'use strict';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = require('crypto').webcrypto;
const os = require('os'), fs = require('fs'), path = require('path'), cp = require('child_process'), nodeCrypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..'), COMM = path.join(ROOT, 'common', 'comm'), NM = os.homedir() + '/bim-ootb/tests/node_modules/';
const STORE = require(path.join(COMM, 'comm_store.js')), PIPE = require(path.join(COMM, 'comm_pipe.js')), DROP = require(path.join(COMM, 'team_drop.js'));
const OWNER = process.env.GH_OWNER || 'red1oon', REPO = process.env.GH_REPO || 'bim-teams-trial';
const LOGF = path.join(__dirname, 'witness_send_hq_github_live.log'), LOG = [];
let judged = 0, fails = 0;
const S = m => { LOG.push(m); console.log(m); };
const verdict = (ok, label, detail) => { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; };
const finish = (v) => { S(v); fs.writeFileSync(LOGF, LOG.join('\n') + '\n'); process.exit(/ PASS /.test(v) ? 0 : 1); };

(async () => {
  let token = process.env.GH_TOKEN || '';
  if (!token && process.env.GH_LIVE === '1') { try { token = cp.execSync('gh auth token', { encoding: 'utf8' }).trim(); } catch (e) {} }
  if (process.env.GH_LIVE !== '1' || !token) return finish('§WITNESS_SEND_HQ_GITHUB_LIVE INCONCLUSIVE judged=0 fails=0 reason=' + (process.env.GH_LIVE !== '1' ? 'GH_LIVE!=1' : 'no token'));
  const SQL = await require(NM + 'sql.js')();
  const hq = await STORE.newDevice(), site = await STORE.newDevice(); hq.person_uu = nodeCrypto.randomUUID(); site.person_uu = nodeCrypto.randomUUID();
  const sp = await STORE.newSpace('hq-site-gh-live', hq, hq.person_uu, 'HQ', 102);
  const mk = dev => STORE.open(new SQL.Database(), { SQL, space: sp.space, self: dev, access: () => ({ allowed: true }), tableId: () => null, log: () => {} });
  const H = mk(hq), P = mk(site);
  const pH = PIPE.ghPipe({ owner: OWNER, repo: REPO, token, self: hq.kid }), pS = PIPE.ghPipe({ owner: OWNER, repo: REPO, token, self: site.kid });
  S('§GH_LIVE start repo=' + OWNER + '/' + REPO + ' space=' + sp.space.slice(0, 12) + '… hq=' + hq.kid.slice(0, 8) + ' site=' + site.kid.slice(0, 8));
  const t0 = Date.now();
  try {
    // L1
    await H.genesis(sp.params); await H.addPerson({ person_uu: site.person_uu, name: 'Site', ad_role_id: 103, comm_admin: false });
    await H.enroll(site.kid, site.pubJwk, site.person_uu, site.dhPubJwk);
    await H.sync(pH); await P.sync(pS);
    const nk = DROP.newestKey(await P.keyring());
    verdict(!!nk, 'L1 HQ founded + enrolled over GitHub; the phone synced and holds a team key', 'epoch=' + (nk ? nk.epoch : 'none') + ' hq_commits=' + pH.stats.commits);
    if (!nk) throw new Error('no team key on the phone');
    // L2
    const src = [{ name: 'report.json', type: 'application/json', bytes: new Uint8Array(Buffer.from(JSON.stringify({ kind: 'bim-site-report', building: 'Duplex', issues: [{ id: 1, element_class: 'IfcCovering' }] }))) },
                 { name: 'photo.jpg', type: 'image/jpeg', bytes: new Uint8Array(nodeCrypto.randomBytes(2048)) }];
    src[1].bytes[0] = 0xFF; src[1].bytes[1] = 0xD8;
    const d = await DROP.seal(src, { space: sp.space, epoch: nk.epoch, key: nk.key, signer: site, label: 'bim-site-report' });
    const c0 = pS.stats.commits; await pS.putMany(d.entries); const commits = pS.stats.commits - c0;
    verdict(commits === 1, 'L2 the drop went up in exactly one commit', 'commits=' + commits + ' entries=' + d.entries.length + ' bytes=' + d.entries.reduce((a, e) => a + e.bytes.length, 0));
    // L3
    await H.sync(pH); const list = await DROP.list(pH, sp.space);
    const o = list.length === 1 ? await DROP.open(pH, { space: sp.space, kid: list[0].kid, id: list[0].id, roster: (await H.order()).roster, ring: await H.keyring() }) : { ok: false, reason: 'drops=' + list.length };
    const eq = !!o.ok && o.files.length === 2 && o.files.every((f, i) => f.name === src[i].name && Buffer.from(f.bytes).equals(Buffer.from(src[i].bytes)));
    verdict(list.length === 1 && eq, 'L3 HQ (own pipe, own sync) lists 1 drop and opens it byte-equal', 'drops=' + list.length + ' open=' + (o.ok ? 'ok' : o.reason) + ' byte_equal=' + eq);
    // L4
    let refused = '';
    try { await pS.putMany(d.entries.map(e => ({ name: e.name.replace('/pub/' + site.kid + '/', '/pub/' + hq.kid + '/'), bytes: e.bytes }))); refused = 'ACCEPTED'; } catch (e) { refused = String(e.message); }
    verdict(/not under my prefix/.test(refused), 'L4 a write into HQ\'s drawer from the phone is refused', refused.replace(/s\/[0-9a-f]{64}\/pub\/\S+/, '<name>').slice(0, 120));
    // L5 — the raw stored bytes, fetched from GitHub by a fresh pipe (no cache of the writer)
    const pR = PIPE.ghPipe({ owner: OWNER, repo: REPO, token, self: 'reader' }), names = (await pR.list('s/' + sp.space + '/pub/' + site.kid + '/')), needles = ['bim-site-report', 'report.json', 'photo.jpg', 'Duplex', 'IfcCovering'], hits = [];
    for (const n of names) { const b = await pR.get(n); const s = Buffer.from(b || []).toString('latin1'); needles.forEach(w => { if (s.indexOf(w) >= 0) hits.push(n.split('/').slice(-2).join('/') + ':' + w); }); }
    verdict(names.length >= 3 && hits.length === 0, 'L5 no plaintext in any stored file of the drop (read back raw from GitHub)', 'files=' + names.length + ' hits=' + JSON.stringify(hits));
    // RED control: flip one byte of part 0, read through a wrapper over the live HQ pipe
    const wrap = { list: p => pH.list(p), get: async n => { const b = await pH.get(n); if (b && /\/0\.bin$/.test(n)) { const c = new Uint8Array(b); c[c.length - 1] ^= 1; return c; } return b; } };
    const ro = await DROP.open(wrap, { space: sp.space, kid: list[0].kid, id: list[0].id, roster: (await H.order()).roster, ring: await H.keyring() });
    S('§GH_LIVE_RED tampered part → ' + (ro.ok ? 'OPENED (witness blind!)' : 'refused reason=' + ro.reason));
    var redOk = !ro.ok;
    // L6
    const reqs = pH.stats.reqs + pS.stats.reqs + pR.stats.reqs, rem = [pH, pS, pR].map(p => p.stats.rateRemaining).filter(x => x != null);
    verdict(reqs > 0 && reqs < 5000, 'L6 requests used this run, against the published 5,000/hour', 'reqs=' + reqs + ' rate_remaining=' + (rem.length ? Math.min(...rem) : 'n/a') + ' seconds=' + ((Date.now() - t0) / 1000).toFixed(1));
  } catch (e) { verdict(false, 'run aborted', String(e && e.message || e).slice(0, 200)); }
  // cleanup: the two device branches this run made
  const del = [];
  for (const k of [hq.kid, site.kid]) { try { cp.execSync('gh api -X DELETE repos/' + OWNER + '/' + REPO + '/git/refs/heads/dev/' + k, { stdio: 'pipe', env: Object.assign({}, process.env, { GH_TOKEN: token }) }); del.push(k.slice(0, 8) + ':deleted'); } catch (e) { del.push(k.slice(0, 8) + ':' + (/404|Not Found|Reference does not exist/.test(String(e.stderr || e.message)) ? 'absent' : 'ERROR')); } }
  S('§GH_LIVE_CLEANUP branches ' + del.join(' '));
  finish(`§WITNESS_SEND_HQ_GITHUB_LIVE ${!redOk ? (fails ? 'FAIL' : 'INCONCLUSIVE') : fails ? 'FAIL' : 'PASS'} judged=${judged} fails=${fails} red_control=${redOk ? 'detected' : 'not detected'}`);
})().catch(e => finish('§WITNESS_SEND_HQ_GITHUB_LIVE FAIL judged=' + judged + ' fails=' + (fails + 1) + ' fatal=' + String(e && e.stack || e).slice(0, 300)));
