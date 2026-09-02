#!/usr/bin/env node
// W-BOMTREE-OUTLINER — pure-logic proof of the BOM Tree ⇄ Outliner integration:
// Open extracted.db → seedFromElements → treeNodes (deep render) → foldReparents (signed reparent fold). Headless.
'use strict';
const cp = require('child_process'), fs = require('fs'), path = require('path');
const V = path.join(__dirname, '..', 'viewer');
const O = require(path.join(V, 'bom_tree_outliner.js'));
const DB = process.argv[2] || '/home/red1/bim-compiler/deploy/dev/buildings/SampleHouse_extracted.db';
let pass = 0, fail = 0; const ok = (c, m) => { (c ? pass++ : fail++); console.log(`  ${c ? '✓' : '✗ FAIL'} ${m}`); };
function load(db) { const r = JSON.parse(cp.execFileSync('sqlite3', ['-json', db, "SELECT guid, ifc_class cls, storey, discipline disc FROM elements_meta"], { encoding: 'utf8', maxBuffer: 1 << 28 }) || '[]'); return r.map(x => ({ guid: x.guid, cls: x.cls, storey: x.storey, disc: x.disc })); }
function leaves(ns) { let o = []; (ns || []).forEach(n => { if (n.kind === 'element') o.push(n.id); if (n.children) o = o.concat(leaves(n.children)); }); return o; }
(function () {
  console.log('═══ W-BOMTREE-OUTLINER — Open extracted.db → seed → render → signed reparent (pure logic) ═══');
  const els = load(DB); console.log(`  ${path.basename(DB)} elements=${els.length}`);
  const seed = O.seedFromElements(els, 'SampleHouse');
  const nodes = O.treeNodes(seed);
  ok(nodes.length === 1, `one root (building) [${nodes.length}]`);
  const lv = leaves(nodes);
  ok(lv.length === els.length, `every element rendered as a leaf [${lv.length}/${els.length}]`);
  ok(nodes[0].children.length > 0 && nodes[0].children[0].kind === 'group', `deep nested groups under the building root`);
  const e0 = lv[0];
  const t0 = O.foldReparents(seed, []); const p0 = t0.nodes[e0].parent;
  const otherClass = Object.keys(t0.nodes).find(k => t0.nodes[k].kind === 'class' && k !== p0);
  const folded = O.foldReparents(seed, [{ childId: e0, toParent: otherClass }]);
  ok(folded.nodes[e0].parent === otherClass, `reparent fold: element moved to new parent`);
  ok(folded.nodes[e0].prov === 'user-authored', `reparent: provenance flips derived-seed → user-authored`);
  ok(leaves(O.treeNodes(folded)).length === els.length, `reparent: still lossless (every element present) [${leaves(O.treeNodes(folded)).length}]`);
  ok(JSON.stringify(O.treeNodes(seed)) === JSON.stringify(O.treeNodes(seed)), `treeNodes deterministic`);
  const src = fs.readFileSync(path.join(V, 'bom_tree_outliner.js'), 'utf8');
  const hits = (src.match(/['"`]Ifc[A-Z][A-Za-z]+['"`]/g) || []);
  ok(hits.length === 0, `integration grep-clean of IFC class names [${hits.length}]`);
  console.log(`\n═══ W-BOMTREE-OUTLINER: ${pass}/${pass + fail} ${fail ? '✗ RED' : '🟢 GREEN'} ═══`);
  process.exit(fail ? 1 : 0);
})();
