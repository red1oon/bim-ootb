# dxf2bim/ — verbatim copies of the BIMCompiler DXF2BIM reader modules

Copied, never forked (prompts/DXF2BIM_MODELLER_LANE.md §L3). Do not edit here: change BIMCompiler, then re-copy and update this file.

| file | BIMCompiler source | commit | sha256 |
|---|---|---|---|
| dxf2bim/dxf2bim.js | deploy/dev/dxf2bim.js | b4739b50a (master, PR #177) | 6ae03baa48bba6170a3a4e8fbd928a694afaf19e645a747f3ccbc55d034c5b4b |
| dxf2bim/dxf2elev.js | deploy/dev/dxf2elev.js | b4739b50a (master, PR #177) | 7fa2292393dea3e1b00441008d9b732a8387a3acfe6180b90a1aa23ec28ce5d2 |
| dxf2bim/dxf2marks.js | deploy/dev/dxf2marks.js | b4739b50a (master, PR #177) | bc3bbb4e07d3409885a12ddd82a0cacbef237137812c1fc853277b2b700b1b48 |
| dxf2bim/dxf2mesh.js | deploy/dev/dxf2mesh.js | b4739b50a (master, PR #177) | 67157a627b4408230948e62b93810f0be91e362d9f8458deedc98813d3a17fc2 |
| dxf2bim/dxf2types.js | deploy/dev/dxf2types.js | b4739b50a (master, PR #177) | 0df204a2f63819e036765977af2d93bbdd0d601e3cfc1b8982955349b6332944 |
| dxf2bim/dxf2shell.js | deploy/dev/dxf2shell.js | b4739b50a (master, PR #177) | 274088a8a38796e98368206cde2cf0e4fb3a4332130e12f2f6be99911895575a |
| dxf2bim/dxf2shell_config.js | deploy/dev/dxf2shell_config.js | a13b61707 (branch feat/dxf2bim-shell-config, PR #180; BASIC_SHAPES_SPEC §11) | 377dc2acea6483b1c4a2558007761fc540cb57ccece681e919484c8521a19459 |
| lib/dxf-parser.js | deploy/dev/dxf-parser.js (gdsestimating/dxf-parser, MIT, minified) | b4739b50a | 8c4c9fa93250356e14dde6f156891d62a257cd759611072995b89ce3aa9c9ab8 |

Check: `git -C <BIMCompiler> show <commit>:deploy/dev/<file> | sha256sum` equals the column above.
