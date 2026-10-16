# dxf2bim/ — verbatim copies of the BIMCompiler DXF2BIM reader modules

Copied, never forked (prompts/DXF2BIM_MODELLER_LANE.md §L3). Do not edit here: change BIMCompiler, then re-copy and update this file.

| file | BIMCompiler source | commit | sha256 |
|---|---|---|---|
| dxf2bim/dxf2bim.js | deploy/dev/dxf2bim.js | 4bb4bf3c0 (master, PR #182) | 6ae03baa48bba6170a3a4e8fbd928a694afaf19e645a747f3ccbc55d034c5b4b |
| dxf2bim/dxf2elev.js | deploy/dev/dxf2elev.js | 4bb4bf3c0 (master, PR #182) | 7fa2292393dea3e1b00441008d9b732a8387a3acfe6180b90a1aa23ec28ce5d2 |
| dxf2bim/dxf2marks.js | deploy/dev/dxf2marks.js | 4bb4bf3c0 (master, PR #182) | 09894806489e3afce7e1e9a24331c4ef449b4eadcb9ccac3501911f171e3f878 |
| dxf2bim/dxf2mesh.js | deploy/dev/dxf2mesh.js | 4bb4bf3c0 (master, PR #182) | 67157a627b4408230948e62b93810f0be91e362d9f8458deedc98813d3a17fc2 |
| dxf2bim/dxf2types.js | deploy/dev/dxf2types.js | 4bb4bf3c0 (master, PR #182) | 0df204a2f63819e036765977af2d93bbdd0d601e3cfc1b8982955349b6332944 |
| dxf2bim/dxf2shell.js | deploy/dev/dxf2shell.js | 4bb4bf3c0 (master, PR #182) | 274088a8a38796e98368206cde2cf0e4fb3a4332130e12f2f6be99911895575a |
| dxf2bim/dxf2shell_config.js | deploy/dev/dxf2shell_config.js | 4bb4bf3c0 (master, PR #182) | 377dc2acea6483b1c4a2558007761fc540cb57ccece681e919484c8521a19459 |
| lib/dxf-parser.js | deploy/dev/dxf-parser.js (gdsestimating/dxf-parser, MIT, minified) | 4bb4bf3c0 | 8c4c9fa93250356e14dde6f156891d62a257cd759611072995b89ce3aa9c9ab8 |

All rows re-verified against master 4bb4bf3c0 (2026-10-16): only dxf2marks.js changed (#182: `@VIEW=ROOF`, `@WALLTOP`). `dxf2qualify.js` (L2) is not used by the import and is not copied.

Check: `git -C <BIMCompiler> show <commit>:deploy/dev/<file> | sha256sum` equals the column above.
