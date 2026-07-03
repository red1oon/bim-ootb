#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-BCF: real-user witness for §Q3 (prompts/RESUME_MODELLER_POLISH2.md).
 * ISSUE IT PROVES: the Modeller had NO real BCF interop — the Teams "BCF deep-links" are an internal JSON
 * digest no external tool can open. This proves a genuine BCF 2.1 .bcfzip leaves the app: the container is
 * validated by an INDEPENDENT tool (Info-ZIP `unzip -t`, not our own writer), and every value inside is read
 * back from the ARTIFACT and compared to the live app state (camera, selection guid) — maths, not eyes.
 *
 * CLAIMS:
 *   B1 ZIP-VALID   — `unzip -t` (independent implementation) exits 0 on the exported bytes.
 *   B2 STRUCTURE   — exactly bcf.version + <topic>/markup.bcf + <topic>/viewpoint.bcfv + <topic>/snapshot.png.
 *   B3 COMPONENT   — viewpoint.bcfv carries the selected element's REAL IfcGuid (the extracted-building guid
 *                    from __arcGuidByFid) inside <Selection>; markup.bcf carries the Topic + Viewpoints refs.
 *   B4 CAMERA      — CameraViewPoint == live camera.position ≤1e-5, CameraDirection is unit-length and points
 *                    at controls.target ≤1e-5, FieldOfView == camera.fov.
 *   B5 SNAPSHOT    — snapshot.png begins with the PNG magic and is >1KB (a real rendered frame).
 *   B6 BUTTON      — the real #b-bcf toolbar click runs the same path (#stat says "BCF exported").
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
runE2E('W-E2E-BCF', async (t) => {
  await t.open('Duplex');
  const sel = await t.pick({ prefer: 'wall' });
  if (!sel) { t.assert('select a wall', false, 'no pick'); return; }
  const expected = await t.pg.evaluate((fid) => ({
    guidByFid: window.__arcGuidByFid ? (window.__arcGuidByFid[fid] || null) : null,   // the bridge is fid→guid
    cam: { pos: [window.A.camera.position.x, window.A.camera.position.y, window.A.camera.position.z],
      tgt: [window.A.controls.target.x, window.A.controls.target.y, window.A.controls.target.z],
      fov: window.A.camera.fov }
  }), sel.fid);

  // export through the SAME function the button calls (download suppressed), bytes back as base64 chunks
  const r = await t.pg.evaluate(() => {
    const res = window.Bonsai.bcf.exportBcf({ download: false, title: 'W-E2E-BCF <check> & "escape"' });
    let b64 = ''; const u8 = res.bytes, CH = 32766;   // divisible by 3 — chunked btoa concat stays a valid base64 stream
    for (let i = 0; i < u8.length; i += CH) b64 += btoa(String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length))));
    return { b64: b64, topic: res.topicGuid, comps: res.components, cam: res.camera, n: u8.length };
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbcf-'));
  const zipPath = path.join(dir, 'issue.bcfzip');
  fs.writeFileSync(zipPath, Buffer.from(r.b64, 'base64'));
  console.log('  §BCF bytes=' + r.n + ' topic=' + r.topic + ' comps=' + JSON.stringify(r.comps));

  // B1 — independent container validation
  let zipOk = false, zipOut = '';
  try { zipOut = execSync('unzip -t ' + JSON.stringify(zipPath) + ' 2>&1').toString(); zipOk = true; }
  catch (e) { zipOut = String(e.stdout || e); }
  t.assert('B1 ZIP-VALID (Info-ZIP unzip -t exits 0)', zipOk, zipOut.trim().split('\n').pop());

  // B2 — structure
  execSync('cd ' + JSON.stringify(dir) + ' && unzip -o -q issue.bcfzip');
  const names = execSync('cd ' + JSON.stringify(dir) + " && unzip -Z1 issue.bcfzip").toString().trim().split('\n').sort();
  const want = ['bcf.version', r.topic + '/markup.bcf', r.topic + '/snapshot.png', r.topic + '/viewpoint.bcfv'].sort();
  t.assert('B2 STRUCTURE (the 4 canonical BCF entries)', JSON.stringify(names) === JSON.stringify(want), JSON.stringify(names));

  // B3 — component guid + markup refs, read back from the artifact
  const markup = fs.readFileSync(path.join(dir, r.topic, 'markup.bcf'), 'utf8');
  const vp = fs.readFileSync(path.join(dir, r.topic, 'viewpoint.bcfv'), 'utf8');
  const version = fs.readFileSync(path.join(dir, 'bcf.version'), 'utf8');
  const selGuid = expected.guidByFid;
  const b3 = !!selGuid && vp.includes('<Selection>') && vp.includes('IfcGuid="' + selGuid + '"') &&
    markup.includes('Guid="' + r.topic + '"') && markup.includes('<Viewpoint>viewpoint.bcfv</Viewpoint>') &&
    markup.includes('W-E2E-BCF &lt;check&gt; &amp; &quot;escape&quot;') && /VersionId="2.1"/.test(version);
  t.assert('B3 COMPONENT (real IfcGuid in <Selection>, topic + escaped title in markup, version 2.1)', b3,
    'selGuid=' + selGuid + ' inVp=' + (selGuid ? vp.includes('IfcGuid="' + selGuid + '"') : '?'));

  // B4 — camera values in the artifact == live app state
  const num = (xml, tag1, tag2) => { const m = new RegExp('<' + tag1 + '>[\\s\\S]*?<' + tag2 + '>(-?[\\d.]+)</' + tag2 + '>').exec(xml); return m ? +m[1] : NaN; };
  const cvp = ['X', 'Y', 'Z'].map(a => num(vp, 'CameraViewPoint', a));
  const cdir = ['X', 'Y', 'Z'].map(a => num(vp, 'CameraDirection', a));
  const fov = +(/<FieldOfView>(-?[\d.]+)<\/FieldOfView>/.exec(vp) || [])[1];
  const dPos = Math.hypot(cvp[0] - expected.cam.pos[0], cvp[1] - expected.cam.pos[1], cvp[2] - expected.cam.pos[2]);
  const tv = [expected.cam.tgt[0] - expected.cam.pos[0], expected.cam.tgt[1] - expected.cam.pos[1], expected.cam.tgt[2] - expected.cam.pos[2]];
  const tl = Math.hypot(tv[0], tv[1], tv[2]) || 1;
  const dDir = Math.hypot(cdir[0] - tv[0] / tl, cdir[1] - tv[1] / tl, cdir[2] - tv[2] / tl);
  const uLen = Math.abs(Math.hypot(cdir[0], cdir[1], cdir[2]) - 1);
  t.assert('B4 CAMERA (viewpoint == live camera ≤1e-5, unit direction at target, fov exact)',
    dPos < 1e-5 && dDir < 1e-5 && uLen < 1e-5 && Math.abs(fov - expected.cam.fov) < 1e-5,
    'dPos=' + dPos.toExponential(1) + ' dDir=' + dDir.toExponential(1) + ' |dir|-1=' + uLen.toExponential(1) + ' fov=' + fov);

  // B5 — real PNG snapshot
  const png = fs.readFileSync(path.join(dir, r.topic, 'snapshot.png'));
  const magic = png.length > 8 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4E && png[3] === 0x47;
  t.assert('B5 SNAPSHOT (PNG magic, >1KB rendered frame)', magic && png.length > 1024, 'bytes=' + png.length);

  // B6 — the real toolbar button drives the same path
  await t.clickSel('#b-bcf'); await t.sleep(600);
  const stat = await t.pg.evaluate(() => document.getElementById('stat').textContent);
  t.assert('B6 BUTTON (#b-bcf → "BCF exported" in #stat)', /BCF exported/.test(stat), 'stat="' + stat.slice(0, 70) + '"');
}, { width: 1200, height: 850, dpr: 1 });
