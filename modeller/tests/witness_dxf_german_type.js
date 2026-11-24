// ⚠ DO NOT REMOVE — W-DE-TYPE (BIMCompiler prompts/PDF2BIM_VECTOR_PROBE.md §59.4). Read the log after every run; exit code is not evidence.
// THE ISSUE THIS PROVES OR DISPROVES: owner 2026-11-25: "go with convention so raster need not do such fuss; in our Modeller we have defaults to adjust". A German house's eave overhang is not stated by a
// plan / catalogue page (72 Hartl Haus pages: form + pitch printed, overhang not) and the raster cannot read the section's printed number: it must come from a CITED convention in the building-type registry,
// be switched on by @DEFAULT=building.type, lose to a value the drawing set states, and never change a key the type does not override.
const D = require('../dxf2defaults.js'), ref = require('../element_defaults.json');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const T = 'German Einfamilienhaus', BT = ref.building_types[T];
const st = (list) => [{ desc: { defaults: list.map(([key, value]) => ({ key, value, by: 'user' })) } }];
ok('G1 the type exists in the registry with cited sources (label, url, confidence) and every override names a registry key with a basis', !!BT && BT.sources.length >= 1 && BT.sources.every(s => s.label && s.url && s.confidence) && Object.keys(BT.overrides).every(k => ref.defaults[k] && BT.overrides[k].basis), Object.keys(BT.overrides).join(','));
ok('G2 the editor offers it: building.type options list the type', ref.defaults['building.type'].options.indexOf(T) >= 0);
let dt = D.create(null, [], {});
ok('G3 General (nothing stated): the overhang is the base 0 m, source default', dt.num('synth.roof.overhang') === 0 && dt.source('synth.roof.overhang') === 'default');
dt = D.create(null, st([['building.type', T]]), {});
ok('G4 @DEFAULT=building.type,' + T + ': synth.roof.overhang = 0.5 m, source "type"', dt.type() === T && dt.num('synth.roof.overhang') === 0.5 && dt.source('synth.roof.overhang') === 'type', 'value=' + dt.num('synth.roof.overhang'));
dt = D.create(null, st([['building.type', T], ['synth.roof.overhang', '1.0']]), {});
ok('G5 a value the drawing set states beats the type: @DEFAULT=synth.roof.overhang,1.0 (the DE-1 section A-A measures ~1.0 m) -> 1.0 m, source stated', dt.num('synth.roof.overhang') === 1 && dt.source('synth.roof.overhang') === 'stated');
dt = D.create(null, st([['building.type', T]]), {});
ok('G6 CONTROL the type changes ONLY what it overrides (roof.slope_deg, synth.roof.overhang): door.height, wall.height, window.sill stay the base values', ['door.height', 'wall.height', 'window.sill'].every(k => dt.num(k) === ref.defaults[k].value));
ok('G9 roof.slope_deg under the type = 22 deg (the mode of the 63 pitches the Hartl Haus pages print), source "type"; General stays 15', dt.num('roof.slope_deg') === 22 && dt.source('roof.slope_deg') === 'type' && D.create(null, [], {}).num('roof.slope_deg') === 15);
dt = D.create(null, st([['building.type', T], ['roof.slope_deg', '30']]), {});
ok('G10 a pitch the drawing set states beats the type: @DEFAULT=roof.slope_deg,30 -> 30, source stated', dt.num('roof.slope_deg') === 30 && dt.source('roof.slope_deg') === 'stated');
dt = D.create(null, st([['building.type', T]]), {});
ok('G11 the pitch override cites its evidence: the basis names the catalogue and the 63-of-72 count, and a catalogue source with its confidence is listed', /63 of 72/.test(BT.overrides['roof.slope_deg'].basis) && BT.sources.some(s => /Hartl Haus/.test(s.label) && /one maker/.test(s.confidence)));
dt = D.create(null, st([['building.type', 'Skyscraper']]), {});
ok('G7 FALSIFIER an unknown type falls back to General: overhang 0 (no invented type values)', dt.type() === 'General' && dt.num('synth.roof.overhang') === 0);
const mod = JSON.parse(JSON.stringify(ref)); mod.building_types[T].overrides['synth.roof.overhang'].value = 0.4;
dt = D.create(mod, st([['building.type', T]]), {});
ok('G8 FALSIFIER editing the registry changes the result (0.5 -> 0.4): the reference holds the value, not the code', dt.num('synth.roof.overhang') === 0.4);
console.log(fail ? 'W-DE-TYPE: FAIL ' + fail : 'W-DE-TYPE: PASS'); process.exit(fail ? 1 : 0);
