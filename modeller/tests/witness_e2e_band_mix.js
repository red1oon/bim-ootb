#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-BAND-MIX: the page end of bim-compiler prompts/MODELLER_MASTER.md §BAND-MIX. Read the log after every run.
 * ISSUE IT PROVES OR DISPROVES: the node witness (witness_band_mix.js) sees the allocation, not the page's LOD400 gate. A mix device is kept by the page only if its mesh
 * resolves (opened building, then the rules DB, then the rules' source building). The first build passed in node and placed NOTHING in the page: every mix mesh was
 * "hash unresolved", and then the 1.9 MB rules patch itself failed in the browser's sql.js. CLAIM: a real Open + walk of SampleCastle holds the ELEC and PLB mix
 * devices, every one provisional, every one with a real mesh (§DW-PRIM-LOD lod400), none refused. INCONCLUSIVE, never PASS, when the walk allocates nothing.
 * Usage: node modeller/tests/witness_e2e_band_mix.js   (software GL, headless)
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-BAND-MIX', async (t) => {
  await t.open('SampleCastle');
  for (const disc of ['ELEC', 'PLB']) { const n0 = t.slog.length;
    await t.pg.evaluate((d) => { window.__dwLastDoneDisc = null; window.discWalk(d, { building: 'SampleCastle' }); }, disc);
    await t.pg.waitForFunction(d => window.__dwLastDoneDisc === d, { timeout: 900000, polling: 500 }, disc).catch(() => {}); await t.sleep(800);
    const lines = t.slog.slice(n0), alloc = lines.filter(l => /§BAND-MIX /.test(l)).reduce((a, l) => a + Number((/ placed=(\d+) /.exec(l) || [])[1] || 0), 0);
    const refuse = lines.filter(l => /§DW-LOD400-REFUSE disc=/.test(l))[0] || null, walk = lines.filter(l => /§DISC-WALK /.test(l)).pop() || '', lod = lines.filter(l => new RegExp('§DW-PRIM-LOD disc=' + disc + ' ').test(l)).pop() || '';
    const r = await t.pg.evaluate(d => { const w = (window.__dwWalks || {})[d] || []; return { n: w.length, mix: w.filter(p => p.bandMix).length, prov: w.filter(p => p.provisional).length, noHash: w.filter(p => !p.geometry_hash).length, noSource: w.filter(p => p.bandMix && (!p.meshFrom || !p.mix)).length }; }, disc);
    console.log('§W-E2E-BAND-MIX ' + disc + ' allocated=' + alloc + ' held=' + JSON.stringify(r) + ' | ' + walk.slice(0, 120) + ' | ' + lod.slice(0, 70) + ' | refuse=' + (refuse ? refuse.slice(0, 140) : 'none'));
    if (!alloc) { console.log('§W-E2E-BAND-MIX ' + disc + ' INCONCLUSIVE the walk allocated no mix device: nothing judged'); t.assert(disc + ' allocation happened', false, 'allocated=0'); continue; }
    t.assert(disc + ' every allocated mix device is held by the page, provisional, with a real mesh and its source named', r.mix === alloc && r.prov >= r.mix && r.noHash === 0 && r.noSource === 0 && !refuse && new RegExp('lod400=' + r.n + ' ').test(lod) && / placed=0 /.test(walk), 'allocated=' + alloc + ' held=' + r.mix + ' lod400 line: ' + lod.slice(18, 60)); }
});
