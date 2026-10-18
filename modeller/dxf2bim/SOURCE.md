# dxf2bim/ — verbatim copies of the BIMCompiler DXF2BIM reader modules

Copied, never forked (prompts/DXF2BIM_MODELLER_LANE.md §L3, §L3.3). Do not edit here: change BIMCompiler, then run `modeller/dxf2bim/sync.sh <BIMCompiler> <commit>`.

Commit: `ffb478578` — extractor: per-mesh DXF2BIM metadata (material_name, element_dxf2bim) — stacked on #220 

| file | BIMCompiler source | sha256 |
|---|---|---|
| dxf2bim/dxf2bim.js | deploy/dev/dxf2bim.js | 815fb190044ba1ba949a2fbf21d6b546db1e3130d1512109085e83d7ea96dfa5 |
| dxf2bim/dxf2elev.js | deploy/dev/dxf2elev.js | 26672c28ce495c90a3465ef516f7f6f10711776a09c835093491fafe1d8b2d0b |
| dxf2bim/dxf2marks.js | deploy/dev/dxf2marks.js | 7c031a48f3022b5911ded5183eb5df317d8ef7933ed2c39d1e8cea14dfb7f187 |
| dxf2bim/dxf2mesh.js | deploy/dev/dxf2mesh.js | 67157a627b4408230948e62b93810f0be91e362d9f8458deedc98813d3a17fc2 |
| dxf2bim/dxf2types.js | deploy/dev/dxf2types.js | aa0364a564356a9d6ddcebd71b237b5cb36b5368e00cf9ebbea181b0d1df0b1c |
| dxf2bim/dxf2shell.js | deploy/dev/dxf2shell.js | 1edc8535d79abcc98688538f68fef97aaa3d3967602e747a3809a1354d00ff67 |
| dxf2bim/dxf2shell_config.js | deploy/dev/dxf2shell_config.js | 56f464ad4feca88ad30073bcc492c949a9bdf4dc1950f73c574f1ff09194a181 |
| dxf2bim/dxf2qualify.js | deploy/dev/dxf2qualify.js | 118589837c66cb6352fa7effbb4e5ca7e2a959c339a535179c4bcb0d239254c2 |
| dxf2bim/std2d.js | deploy/dev/std2d.js | 4913fc465eb09adddbc2730888f5f92ea7e8d8c32a36145915d90fa16ebbc216 |
| dxf2bim/std2d_geom.js | deploy/dev/std2d_geom.js | 46903de12432a6dec1a470c12fcbb89a78717b292874a486ad325a81527148a6 |
| dxf2bim/std2d_dxf.js | deploy/dev/std2d_dxf.js | 4cfd7a941e5f224f3b5643c07d742ea48e51a5f44add7d2d19af8bd5741e915d |
| dxf2bim/std2d_marks.js | deploy/dev/std2d_marks.js | dfe0cc0bf5e8ae811ef3729e60bac11b893662beff87bca0cc56906ccac511f4 |
| dxf2bim/std2d_scopes.js | deploy/dev/std2d_scopes.js | f9fcada1ad0f7bf2276d2cf5f8818748ef41ebe2af7ba4b857c3390a5edf5420 |
| dxf2bim/polygon-clipping.js | deploy/dev/polygon-clipping.js | de2bdc061b61d537f7d12f6519f46e35113f0f246b6a06293a08b615454946cf |
| dxf2bim/ifc_extract_core.js | scripts/ifc_extract_core.js (the Node extractor body; one extractor, two hosts) | a6983807130c9898b7809430e397221383018ad84924db4e27eaabf240ba55ce |
| lib/dxf-parser.js | deploy/dev/dxf-parser.js (gdsestimating/dxf-parser, MIT, minified) | 8c4c9fa93250356e14dde6f156891d62a257cd759611072995b89ce3aa9c9ab8 |

Check: `git -C <BIMCompiler> show ffb478578:deploy/dev/<file> | sha256sum` equals the column above.
