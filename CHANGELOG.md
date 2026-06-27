# Changelog

All notable, user-facing changes are batched here by [release-please](https://github.com/googleapis/release-please)
from our conventional-commit prefixes (`feat` → minor, `fix`/`docs` → patch, `feat!`/`BREAKING CHANGE` → major).
The per-deploy build id (`erp/sw.js` `CACHE_VERSION` = `vNNN`) is separate — a cache-bust id, not a release.

## [1.2.0](https://github.com/red1oon/bim-ootb/compare/v1.1.0...v1.2.0) (2026-06-27)


### ✨ Features

* **modeller-ux:** ⇄ adjacency lens — render abuts cross-edges on the backbone (W-UX-6) ([#547](https://github.com/red1oon/bim-ootb/issues/547)) ([351ac22](https://github.com/red1oon/bim-ootb/commit/351ac229c1dd625c366a36a942021e0579985ed9))
* **modeller-ux:** full SDG cross-edges JS-derived → multi-edge adjacency lens (W-UX-6 Phase 2) ([#548](https://github.com/red1oon/bim-ootb/issues/548)) ([76837d4](https://github.com/red1oon/bim-ootb/commit/76837d433a9fcbd0ac954a75fa36dde60d4d0392))
* **modeller:** all residents real rooms/storeys + cross-edges (recovers [#542](https://github.com/red1oon/bim-ootb/issues/542) orphan + adds SampleCastle) ([#543](https://github.com/red1oon/bim-ootb/issues/543)) ([1e8658b](https://github.com/red1oon/bim-ootb/commit/1e8658b6bee6bdbe3d4993f5732d4abb09b7bee0))
* **modeller:** BOM Tree editor in the Outliner — Open any extracted.db, signed re-parent ([#530](https://github.com/red1oon/bim-ootb/issues/530)) ([0bf40aa](https://github.com/red1oon/bim-ootb/commit/0bf40aa3fb80808c1f1ac1dce8a96b6b0620b914))
* **modeller:** bom-graph tab under DISC/ARC — ARC drops as a containment tree (sw v734) ([#539](https://github.com/red1oon/bim-ootb/issues/539)) ([81ebd6b](https://github.com/red1oon/bim-ootb/commit/81ebd6b6b9a751c4a5375a7fbe1d3cfb1014af89))
* **modeller:** calibrated-confidence highlight in the STR Walker Outliner (?strwalk) ([#533](https://github.com/red1oon/bim-ootb/issues/533)) ([d76e9f3](https://github.com/red1oon/bim-ootb/commit/d76e9f37c677939e98f66d4b868602ce3bf72d09))
* **modeller:** disc-walk from Terminal-mined rules wired to the Outliner (Phase 6) ([#549](https://github.com/red1oon/bim-ootb/issues/549)) ([a786659](https://github.com/red1oon/bim-ootb/commit/a786659d43dcd936318052b9e78be34fdc8613cf))
* **modeller:** guided Open — 4 permanent residents fetched from cloud + cached local (sw v731) ([#536](https://github.com/red1oon/bim-ootb/issues/536)) ([fb99891](https://github.com/red1oon/bim-ootb/commit/fb99891913d2ce6db9ca4f812e7ae7fce4237682))
* **modeller:** live-port ARC-only STR walker auto-pick to bim-ootb (sw v730) ([#534](https://github.com/red1oon/bim-ootb/issues/534)) ([29d1419](https://github.com/red1oon/bim-ootb/commit/29d141982947fbae82d26dc05cf74a84fd9be575))
* **modeller:** per-building editable instance — mo_&lt;key&gt; op-log fork, reference stays pristine (sw v732) ([#537](https://github.com/red1oon/bim-ootb/issues/537)) ([57b0e83](https://github.com/red1oon/bim-ootb/commit/57b0e8345a9f41f8e4ed5eadf89679e2e44d3e4e))
* **modeller:** replay an instance's STR edits on reopen — prior edits re-appear (sw v733) ([#538](https://github.com/red1oon/bim-ootb/issues/538)) ([fa46dc0](https://github.com/red1oon/bim-ootb/commit/fa46dc09692ee90d5440de9b40c4618e195f96e2))
* **modeller:** residents fetch from isolated GH playground — zero OCI + Terminal via LFS ([#542](https://github.com/red1oon/bim-ootb/issues/542)) ([a6dba4f](https://github.com/red1oon/bim-ootb/commit/a6dba4febc672ac614c955b14fe56c4818443b2a))
* **modeller:** STR Walker live wiring (?strwalk) + fix [#530](https://github.com/red1oon/bim-ootb/issues/530) qs TDZ that broke the modeller ([#531](https://github.com/red1oon/bim-ootb/issues/531)) ([41b385b](https://github.com/red1oon/bim-ootb/commit/41b385befa0491a55a86cb349182b786a6d011a8))


### 📝 Documentation

* **readme:** ADempiere origin + Alpha badge + feature refresh ([#545](https://github.com/red1oon/bim-ootb/issues/545)) ([0606a7e](https://github.com/red1oon/bim-ootb/commit/0606a7e859d2bc4e20c225f915df86d7382a1bd9))
* **readme:** update roadmap 2D→3D grid, add contributor section, extend who paragraph ([#544](https://github.com/red1oon/bim-ootb/issues/544)) ([8864397](https://github.com/red1oon/bim-ootb/commit/8864397491e9a36551db125094b6b7f763f3c778))
* **readme:** warm up tone — collaborative spirit, learning joy, BIM-ERP ambition ([#535](https://github.com/red1oon/bim-ootb/issues/535)) ([fdff53b](https://github.com/red1oon/bim-ootb/commit/fdff53bcfd810498e433e221cd2089f4fa4e278a))

## [1.1.0](https://github.com/red1oon/bim-ootb/compare/v1.0.0...v1.1.0) (2026-06-25)


### ✨ Features

* **release:** batched semantic-version releases via release-please; decouple build id from release (sw v754) ([#525](https://github.com/red1oon/bim-ootb/issues/525)) ([406c946](https://github.com/red1oon/bim-ootb/commit/406c94601e2a204e02f0a1a2a7499578c7ccbd6e))

## 1.0.0 (2026-06-25)

Baseline release — the iDempiere-faithful serverless browser ERP + BIM viewer as shipped to date:
folding kernel, signed op-log, spatial BIM→ERP (Find → Project Order), 4D/5D authoring + Schedule Editor,
What-if, foreign-schedule import (Primavera P6 / MS Project), and the System Monitor with paradigm vitals.
Subsequent entries are cut automatically from merged PRs.
