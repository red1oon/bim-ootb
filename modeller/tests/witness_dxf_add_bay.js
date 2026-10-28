#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DXF-ADD-BAY (prompts/DXF2BIM_FOUNDATION_LANE.md §D89 / §D90). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: lengthening a repeating-bay shed by one bay — the most common change an architect makes to it — could not be done: the grid move left the roof
// behind and added no frame, and its cost was not computed. Driven as a person does it on the CLI-marked shed: state the building type in the editor (Element defaults ▸
// building.type ▸ Farming Shed ▸ Set), Convert, press "Add a bay" at the end.
//   B0 with the type stated, the panel offers "Add a bay" (the rule is the type row's edits.bay_repeat); with General it does not, and the action refuses with the reason
//   B1 the copies are exactly one typical bay + its frame line: +2 IfcBeam, +2 IfcWall, +12 IfcMember, +9 IfcPlate, +2 IfcColumn, +2 IfcFooting, nothing else (measured typical bay, §D89)
//   B2 every copy's box = its source's box + one pitch on the bay axis (1 mm)
//   B3 everything beyond the hinge moved one pitch; every full-length member / covering is one pitch longer (1 mm); the grid has one more line, labelled <hinge>A, at hinge + pitch
//   B4 the cost shown = an independent recompute here: Σ round(rate × qty) of the copies (ADDED) + Σ [round(rate × qty after) − round(rate × qty before)] of the stretched (CHANGED),
//      qty = the shipped 5D basis (M longest edge, M2 longest × second, M3 volume, else count), rate = the page's active pack (window.RATES)
//   B7 the Conformity Gate on the commit is clean: a copy inherits its source's relations (sdg_gate opts.copies); on the same boxes, without the rule the gate reports RED,
//      and with a wrong shift (no true counterpart) it reports RED again — the rule removes inherited contacts only
//   B3r the moves went through the spine's cascade: the shed's double door, hosted by its joined wall (§D88 B), rides it one pitch as hosted-by (2 fills edges, 2 riders)
//   B9 (§D89 step 4) a wall of the last typical bay moved 5 cm, then a second bay: every copy = its source's CURRENT box + one pitch (1 mm) — the edited wall's copy carries the edit
//      (main's bay copy cloned the insert row: the copy sat at the wall's pre-edit place)
//   B5 one Ctrl+Z restores every element and the grid; Ctrl+Y brings the bay back      B6 0 page errors
// Input: the 9 CLI-marked shed sheets (SHED_MARKED_DIR, default ~/Videos/dxf2bim_film_work/why/cli/marked). Missing input -> MISSING, exit 2.
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_add_bay.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), BigDecimal = require(path.join(ROOT, 'erp', 'bigdecimal.js'));
const MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms)), MM = 0.001;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
const WANT = { IfcBeam: 2, IfcWall: 2, IfcMember: 12, IfcPlate: 9, IfcColumn: 2, IfcFooting: 2 };
(async () => {
  const files = fs.existsSync(MARKED) ? fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)) : [];
  if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets (SHED_MARKED_DIR ' + MARKED + ', found ' + files.length + ')'); process.exit(2); }
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const open = async (type) => {
    const pg = await (await br.createBrowserContext()).newPage(); await pg.setViewport({ width: 1440, height: 810 });
    pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/^§DXF-BAY|^§GATE /.test(t)) console.log('  ' + t.slice(0, 300)); });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai', { timeout: 120000 });
    await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfMetaEditor && !window.DxfMetaEditor.state.busy', { timeout: 300000 }); await sleep(800);
    if (type) {   // the editor: Element defaults ▸ building.type ▸ <type> ▸ Set (real clicks; the section opens first)
      const how = await pg.evaluate(async t => { const sh = document.querySelector('#dm-panel [data-act="sec"][data-sec="edefaults"]'); if (!sh) return 'no Element defaults section';
        if (!window.DxfMetaEditor.state.sec.edefaults) { sh.click(); await new Promise(r => setTimeout(r, 400)); }
        const row = document.querySelector('#dm-panel [data-edef="building.type"]'); if (!row) return 'no building.type row'; const sel = row.querySelector('select'); if (!sel) return 'no select';
        sel.value = t; sel.dispatchEvent(new Event('change', { bubbles: true })); const set = row.querySelector('[data-act="edefset"]'); if (!set) return 'no Set button'; set.click(); return 'set'; }, type);
      console.log('§ADD-BAY type ' + type + ': ' + how); await sleep(1500);
      await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfMetaEditor && !window.DxfMetaEditor.state.busy', { timeout: 300000 }); await sleep(800);
    }
    await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok', { timeout: 300000 }).catch(() => {});
    if (!await pg.evaluate(() => !!(window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok))) return null;
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 300000 }); await sleep(2500);
    return pg;
  };
  const snap = pg => pg.evaluate(() => { const g = window.Bonsai.group(), G = window.Bonsai.grid, out = {};
    window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT').forEach(o => { const m = g.children.find(q => q.isMesh && q.userData && q.userData.featureId === o.id); if (!m) return;
      m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); out[o.id] = { c: o.parameters.ifc_class, b: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z], bay: o.parameters.bayCopy || null }; });
    return { els: out, xs: G.xs.slice(), xl: G.xlabels.slice(), ys: G.ys.slice() }; });
  try {
    // B0 the General shed: not offered, refused with the reason
    const pG = await open(null);
    if (!pG) { console.log('§W-DXF-ADD-BAY INCONCLUSIVE: the shed did not qualify'); process.exit(1); }
    const g0 = await pG.evaluate(async () => ({ row: !!document.getElementById('dxf-bay-row'), type: window.DxfImportUI.bayRule().type, r: await window.DxfImportUI.addBay('max') }));
    await pG.close();
    // the Farming Shed
    const pg = await open('Farming Shed');
    const offered = await pg.evaluate(() => ({ row: !!document.getElementById('dxf-bay-row'), type: window.DxfImportUI.bayRule().type, max: (document.getElementById('dxf-bay-max') || {}).textContent }));
    ok('B0 the type row decides: Farming Shed offers "Add a bay", General does not and refuses with the reason', offered.row && offered.type === 'Farming Shed' && !g0.row && g0.type === 'General' && g0.r && g0.r.ok === false && /declares no bay_repeat/.test(g0.r.why),
      'shed: type=' + offered.type + ' row=' + offered.row + ' button="' + offered.max + '" | general: type=' + g0.type + ' row=' + g0.row + ' refused="' + (g0.r && g0.r.why) + '"');
    if (!offered.row) throw new Error('not offered');
    const S0 = await snap(pg);
    // B0h the shed's double door opening is cut in the rendered wall (§D88 B): the joined wall's mesh carries vertices at both gap ends, up to the leaf head
    const H0 = await pg.evaluate(() => { const ops = window.Bonsai.oplog._geomOps(), cuts = ops.filter(o => o.op_type === 'GEOM_CUT' && /^door-gap:/.test(o.parameters.slide && o.parameters.slide.opening || ''));
      if (!cuts.length) return { cuts: 0 }; const host = cuts[0].parameters.parent, m = window.Bonsai.group().children.find(q => q.isMesh && q.userData && q.userData.featureId === host); if (!m) return { cuts: cuts.length, mesh: false };
      m.updateMatrixWorld(true); const a = m.geometry.attributes.position, e = m.matrixWorld.elements, xs = new Set(), zs = new Set();
      for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i), z = a.getZ(i); xs.add((e[0] * x + e[4] * y + e[8] * z + e[12]).toFixed(3)); zs.add((e[2] * x + e[6] * y + e[10] * z + e[14]).toFixed(3)); }
      const lo = Math.min(...cuts.map(c => Math.min(c.parameters.void.c1[0], c.parameters.void.c2[0]))), hi = Math.max(...cuts.map(c => Math.max(c.parameters.void.c1[0], c.parameters.void.c2[0]))), head = Math.max(...cuts.map(c => c.parameters.void.c2[2]));
      return { cuts: cuts.length, host, lo: lo.toFixed(3), hi: hi.toFixed(3), head: head.toFixed(3), hasLo: xs.has(lo.toFixed(3)), hasHi: xs.has(hi.toFixed(3)), hasHead: zs.has(head.toFixed(3)), verts: a.count }; });
    ok('B0h the double door\'s opening is cut in the rendered wall (vertices at both gap ends and at the leaf head)', H0.cuts === 2 && H0.hasLo && H0.hasHi && H0.hasHead, JSON.stringify(H0));
    const gboxes = 'window.__gbx = () => { const out = {}; window.Bonsai.group().children.forEach(m => { if (m.isMesh && m.userData && m.userData.featureId != null && !m.userData.anchor) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; out[m.userData.featureId] = [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]; } }); return out; }; window.__gb0 = window.__gbx(); 1';
    await pg.evaluate(gboxes);
    await pg.click('#dxf-bay-max'); await sleep(4000);
    const R = await pg.evaluate(() => { const L = window.DxfImportUI.state.lastBay; return L ? { cascadeFills: L.cascadeFills, riders: L.plan.riders, plan: { ok: L.plan.ok, why: L.plan.why, pitch: L.plan.pitch, axis: L.plan.axis, hinge: L.plan.hingeLabel, moved: L.plan.moved, stretched: L.plan.stretched, copied: L.plan.copied, tag: L.plan.tag }, cost: L.cost, verify: L.res && L.res.verify, gate: L.res && L.res.gate, stat: (document.getElementById('dxf-status') || {}).textContent, rates: window.RATES } : null; });
    if (!R || !R.plan.ok) { ok('B1 a bay was added', false, JSON.stringify(R && R.plan)); throw new Error('no bay'); }
    const S1 = await snap(pg), K = R.plan.axis === 'x' ? 0 : 1, P = R.plan.pitch;
    const added = Object.keys(S1.els).filter(id => !S0.els[id]).map(id => Object.assign({ id: +id }, S1.els[id]));
    const by = {}; added.forEach(a => { by[a.c] = (by[a.c] || 0) + 1; });
    ok('B1 the copies are one typical bay + its frame line, nothing else', JSON.stringify(Object.keys(by).sort().map(k => k + ':' + by[k])) === JSON.stringify(Object.keys(WANT).sort().map(k => k + ':' + WANT[k])),
      'added ' + added.length + ' ' + JSON.stringify(by) + ' (want ' + JSON.stringify(WANT) + ')');
    const sh = (b, d) => b.map((v, i) => (i % 3 === K ? v + d : v));
    const bad2 = added.filter(a => { const s = S0.els[a.bay && a.bay.src]; if (!s) return true; const w = sh(s.b, P * a.bay.dir); return a.b.some((v, i) => Math.abs(v - w[i]) > MM); });
    ok('B2 every copy = its source + one pitch', added.length > 0 && bad2.length === 0, 'pitch ' + P.toFixed(4) + ' m, copies ' + added.length + ', off ' + bad2.length + (bad2[0] ? ' e.g. #' + bad2[0].id + ' ' + bad2[0].c : ''));
    const mv = R.plan.moved.concat(R.riders || []).filter(id => { const a = S0.els[id], b = S1.els[id]; return !a || !b || b.b.some((v, i) => Math.abs(v - (i % 3 === K ? a.b[i] + P : a.b[i])) > MM); });
    const st = R.plan.stretched.filter(s => { const a = S0.els[s.id], b = S1.els[s.id]; return !a || !b || Math.abs((b.b[K + 3] - b.b[K]) - (a.b[K + 3] - a.b[K] + P)) > MM; });
    const still = Object.keys(S0.els).filter(id => R.plan.moved.indexOf(+id) < 0 && (R.riders || []).indexOf(+id) < 0 && !R.plan.stretched.some(s => s.id === +id)).filter(id => S0.els[id].b.some((v, i) => Math.abs(v - S1.els[id].b[i]) > MM));
    const hingeX = R.plan.tag.pos - P * R.plan.tag.dir, nl = S1.xs.length === S0.xs.length + 1 && Math.abs(S1.xs[R.plan.tag.index] - R.plan.tag.pos) <= 1e-6 && S1.xl[R.plan.tag.index] === R.plan.hinge + 'A';
    ok('B3 beyond the hinge moved one pitch, full-length members one pitch longer, nothing else changed, the grid gained the new line', mv.length === 0 && st.length === 0 && still.length === 0 && R.plan.moved.length > 0 && R.plan.stretched.length > 0 && nl,
      'moved ' + R.plan.moved.length + ' (off ' + mv.length + ') stretched ' + R.plan.stretched.length + ' (off ' + st.length + ') others changed ' + still.length + ' | grid ' + S0.xs.length + '->' + S1.xs.length + ' new ' + S1.xl[R.plan.tag.index] + '@' + (S1.xs[R.plan.tag.index] || 0).toFixed(3) + ' hinge ' + R.plan.hinge + '@' + hingeX.toFixed(3));
    const rid = await pg.evaluate(ids => { const ops = window.Bonsai.oplog._geomOps(); return ids.map(id => { const o = ops.find(q => q.id === id); return o ? o.parameters.ifc_class + ' ' + o.parameters.provenance.dxf_handle : '?'; }); }, R.riders || []);
    ok('B3r the moves went through the spine\'s cascade: the double door (§D88 B, hosted by its joined wall) rides that wall one pitch, as hosted-by', R.cascadeFills === 2 && (R.riders || []).length === 2 && rid.every(r => /^IfcDoor (33B|353)$/.test(r)),
      'cascade fills=' + R.cascadeFills + ' riders=' + JSON.stringify(rid) + ' (moved one pitch: checked in B3)');
    // B4 independent cost recompute (own BigDecimal, own quantity rule, the page's rates)
    const qty = (u, d) => { const s = d.slice().sort((a, b) => b - a); return u === 'M' ? s[0] : u === 'M2' ? s[0] * s[1] : u === 'M3' ? d[0] * d[1] * d[2] : 1; };
    const row = (cls, d) => { const r = R.rates[cls]; if (!r) return BigDecimal.of('0'); return BigDecimal.of(String(r.rate)).multiply(BigDecimal.of(qty(r.unit, d).toFixed(6))).setScale(0, BigDecimal.RoundingMode.HALF_UP); };
    const ops = await pg.evaluate(() => { const m = {}; window.Bonsai.oplog._geomOps().forEach(o => { if (o.op_type === 'GEOM_INSERT') m[o.id] = { c: o.parameters.ifc_class, bbox: o.parameters.bbox }; }); return m; });
    const dims = id => { const b = ops[id].bbox; return [b[1] - b[0], b[3] - b[2], b[5] - b[4]]; };
    let A = BigDecimal.of('0'), C = BigDecimal.of('0');
    R.plan.copied.forEach(c => { A = A.add(row(ops[c.from].c, dims(c.from))); });
    R.plan.stretched.forEach(s => { const d = dims(s.id), k = d.indexOf(Math.max.apply(null, d)), a = d.slice(); a[k] = d[k] * s.factor; C = C.add(row(ops[s.id].c, a).subtract(row(ops[s.id].c, d))); });
    const T = A.add(C).toString();
    ok('B4 the cost shown = an independent recompute (ADDED copies + CHANGED stretches)', R.cost && R.cost.added === A.toString() && R.cost.changed === C.toString() && R.cost.total === T && R.stat.indexOf('+' + T) >= 0,
      'shown added=' + (R.cost && R.cost.added) + ' changed=' + (R.cost && R.cost.changed) + ' total=' + (R.cost && R.cost.total) + ' | independent ' + A + ' / ' + C + ' / ' + T + ' | panel "' + String(R.stat).slice(0, 160) + '" gate=' + (R.gate || 'clean'));
    const G7 = await pg.evaluate(() => { const L = window.DxfImportUI.state.lastBay, ids = L.res.ids, after = window.__gbx(), cp = {}, bad = {};
      L.plan.ops.forEach((o, i) => { const bc = o.params.bayCopy; if (o.op_type === 'GEOM_INSERT' && bc) { const sh = [0, 0, 0]; sh[bc.axis === 'x' ? 0 : 1] = bc.dir * bc.pitch; cp[ids[i]] = { src: bc.src, shift: sh }; bad[ids[i]] = { src: bc.src, shift: sh.map(v => v * 2) }; } });
      const moved = L.plan.moved.concat(L.plan.stretched.map(s => s.id)).concat(ids), E = (o) => window.SdgGate.evaluate(window.__gb0, after, moved, {}, o);
      // the control: one copy put INTO an unrelated element (its box = that element's box) must be judged RED with the rule on
      const cid = Object.keys(cp)[0], far = Object.keys(after).find(f => !cp[f] && f !== String(cp[cid].src) && Math.abs(after[f][0] - after[cid][0]) > 6), after2 = Object.assign({}, after); after2[cid] = after[far].slice();
      const a = E({}), b = E({ copies: cp }), c = window.SdgGate.evaluate(window.__gb0, after2, moved, {}, { copies: cp });
      const ops = window.Bonsai.oplog._geomOps(), cls = f => { const o = ops.find(q => q.id === +f); return o && o.parameters ? o.parameters.ifc_class : '?'; }, isMoved = f => L.plan.moved.indexOf(+f) >= 0 ? 'moved' : (L.plan.stretched.some(x => x.id === +f) ? 'stretched' : (cp[f] ? 'copy' : 'static'));
      const desc = f => '#' + f + ' ' + cls(f) + ' ' + isMoved(f) + ' x[' + (window.__gb0[f] || after[f])[0].toFixed(3) + ',' + (window.__gb0[f] || after[f])[1].toFixed(3) + ']->[' + after[f][0].toFixed(3) + ',' + after[f][1].toFixed(3) + ']';
      return { commit: L.res.gate || '', without: [a.red.length, a.orange.length], rule: [b.red.length, b.orange.length], control: [c.red.length, c.red.some(r => String(r.a) === cid || String(r.b) === cid)], left: b.red.concat(b.orange).map(r => r.kind + ' ' + (r.gap != null ? 'gap ' + r.gap : 'depth ' + r.depth) + ': ' + desc(r.a) + ' | ' + desc(r.b)) }; });
    G7.left.forEach(l => console.log('§ADD-BAY gate-left ' + l));
    ok('B7 the gate on the commit is clean (a copy inherits its source\'s relations); without the rule the same boxes give RED, and a copy put into an unrelated element is RED with it', G7.commit === '' && G7.rule[0] === 0 && G7.rule[1] === 0 && G7.without[0] > 0 && G7.control[1] === true,
      'commit gate="' + G7.commit + '" | red/orange: without rule ' + G7.without.join('/') + ', with rule ' + G7.rule.join('/') + ' | control: ' + G7.control[0] + ' red, the displaced copy among them=' + G7.control[1]);
    // B5 one undo, one redo
    const same = (X, Y) => { const ka = Object.keys(X.els), kb = Object.keys(Y.els); if (ka.length !== kb.length) return 'count ' + ka.length + ' vs ' + kb.length; for (const id of ka) { const b = Y.els[id]; if (!b) return 'missing #' + id; if (X.els[id].b.some((v, i) => Math.abs(v - b.b[i]) > MM)) return 'moved #' + id; } return X.xs.length === Y.xs.length && X.xs.every((v, i) => Math.abs(v - Y.xs[i]) <= 1e-6) ? '' : 'grid ' + X.xs.length + ' vs ' + Y.xs.length; };
    await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(2500); const S2 = await snap(pg), u = same(S0, S2);
    await pg.keyboard.down('Control'); await pg.keyboard.press('y'); await pg.keyboard.up('Control'); await sleep(2500); const S3 = await snap(pg), y = same(S1, S3);
    ok('B5 one Ctrl+Z restores every element and the grid; Ctrl+Y brings the bay back', u === '' && y === '', 'undo: ' + (u || 'identical (' + Object.keys(S2.els).length + ' elements, ' + S2.xs.length + ' lines)') + ' | redo: ' + (y || 'identical (' + Object.keys(S3.els).length + ' elements)'));
    // B9 edit a wall of the bay the next add copies (the first bay's own copies are now the last typical bay), then add a second bay
    const wcopy = added.find(a1 => a1.c === 'IfcWall'), wfid = wcopy && wcopy.id;
    if (wfid == null) ok('B9 a second bay copies the edited wall at its edited place', false, 'the first bay added no wall');
    else {
      await pg.evaluate(async f => { window.Bonsai.selectMany([f]); await window.__commitMove(0, 0.05, 0); window.Bonsai.selectMany([]); }, wfid); await sleep(2500);
      const S4 = await snap(pg); await pg.click('#dxf-bay-max'); await sleep(4000);
      const R2 = await pg.evaluate(() => { const L = window.DxfImportUI.state.lastBay, ops = window.Bonsai.oplog._geomOps(), cls = f => { const o = ops.find(q => q.id === +f); return o && o.parameters ? o.parameters.ifc_class : '?'; };
        const role = f => L.plan.moved.indexOf(+f) >= 0 ? 'moved' : L.plan.stretched.some(x => x.id === +f) ? 'stretched' : (L.res.ids || []).indexOf(+f) >= 0 ? 'copy' : 'static';
        const g = window.__lastGateDetail || null;
        return { ok: L.plan.ok, why: L.plan.why, pitch: L.plan.pitch, copied: L.plan.copied, stretched: L.plan.stretched, gate: L.res && L.res.gate, roles: g ? g.red.concat(g.orange).map(r => r.kind + ' #' + r.a + ' ' + cls(r.a) + ' ' + role(r.a) + ' | #' + r.b + ' ' + cls(r.b) + ' ' + role(r.b) + ' ' + (r.depth != null ? 'depth ' + r.depth : 'gap ' + r.gap)) : ['(no gate detail hook)'] }; });
      R2.roles.forEach(l => console.log('§ADD-BAY B9 gate ' + l));
      const S5 = await snap(pg), add2 = Object.keys(S5.els).filter(id => !S4.els[id]).map(id => Object.assign({ id: +id }, S5.els[id]));
      const off9 = add2.filter(a2 => { const s0 = S4.els[a2.bay && a2.bay.src]; if (!s0) return true; const w = sh(s0.b, R2.pitch * a2.bay.dir); return a2.b.some((v, i) => Math.abs(v - w[i]) > MM); });
      const mine = add2.find(a2 => a2.bay && a2.bay.src === wfid), wb = S4.els[wfid];
      const st9 = (R2.stretched || []).filter(x => { const a4 = S4.els[x.id], a5 = S5.els[x.id]; return !a4 || !a5 || Math.abs((a5.b[K + 3] - a5.b[K]) - (a4.b[K + 3] - a4.b[K] + R2.pitch)) > MM; });
      ok('B9s the second bay stretches each full-length member by one pitch of its CURRENT length', R2.ok && (R2.stretched || []).length > 0 && st9.length === 0,
        'stretched ' + (R2.stretched || []).length + ' off ' + st9.length + (st9[0] ? ' e.g. #' + st9[0].id + ' ' + st9[0].cls + ' length ' + (S4.els[st9[0].id].b[K + 3] - S4.els[st9[0].id].b[K]).toFixed(4) + ' -> ' + (S5.els[st9[0].id].b[K + 3] - S5.els[st9[0].id].b[K]).toFixed(4) + ' (want +' + R2.pitch.toFixed(4) + ')' : ''));
      ok('B9 a second bay after editing a wall of the bay it copies: every copy = its source\'s current box + one pitch; the edited wall\'s copy carries the 5 cm', R2.ok && add2.length === added.length && off9.length === 0 && !!mine && Math.abs((mine.b[1] + mine.b[4]) / 2 - (wb.b[1] + wb.b[4]) / 2) < MM,
        'plan ok=' + R2.ok + (R2.why ? ' why=' + R2.why : '') + ' copies ' + add2.length + ' (first bay ' + added.length + ') off ' + off9.length + (off9[0] ? ' e.g. #' + off9[0].id + ' ' + off9[0].c : '') + ' | wall #' + wfid + ' y-centre ' + ((wb.b[1] + wb.b[4]) / 2).toFixed(4) + ' -> its copy ' + (mine ? ((mine.b[1] + mine.b[4]) / 2).toFixed(4) : 'none') + ' | gate=' + (R2.gate || 'clean'));
    }
    ok('B6 no page errors', errs.length === 0, 'errors=' + errs.length + (errs[0] ? ' ' + errs[0] : ''));
  } catch (e) { if (!/not offered|no bay/.test(String(e && e.message))) ok('B run', false, 'threw ' + String(e && e.stack || e).slice(0, 300)); }
  await br.close(); srv.close();
  console.log('§W-DXF-ADD-BAY ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
})();
