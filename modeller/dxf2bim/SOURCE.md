# dxf2bim/ — verbatim copies of the BIMCompiler DXF2BIM reader modules

Copied, never forked (prompts/DXF2BIM_MODELLER_LANE.md §L3, §L3.3). Do not edit here: change BIMCompiler, then run `modeller/dxf2bim/sync.sh <BIMCompiler> <commit>`.

Commit: `b44f0ccc6` — std2d §L1.8 S1: an orthogonal wall's sliver contour (mean width < 1 mm) becomes its bound

| file | BIMCompiler source | sha256 |
|---|---|---|
| dxf2bim/dxf2bim.js | deploy/dev/dxf2bim.js | 815fb190044ba1ba949a2fbf21d6b546db1e3130d1512109085e83d7ea96dfa5 |
| dxf2bim/dxf2elev.js | deploy/dev/dxf2elev.js | 93b7d5080af88d93c9698d02356a06cf5a61cb4e94dcce2a784587f6ccdeaf9d |
| dxf2bim/dxf2marks.js | deploy/dev/dxf2marks.js | 70f8bfbeb712e04ef35998f053123ee803a91d0c4b757fdb401e5a9732978709 |
| dxf2bim/dxf2mesh.js | deploy/dev/dxf2mesh.js | 67157a627b4408230948e62b93810f0be91e362d9f8458deedc98813d3a17fc2 |
| dxf2bim/dxf2types.js | deploy/dev/dxf2types.js | aa0364a564356a9d6ddcebd71b237b5cb36b5368e00cf9ebbea181b0d1df0b1c |
| dxf2bim/dxf2shell.js | deploy/dev/dxf2shell.js | 1edc8535d79abcc98688538f68fef97aaa3d3967602e747a3809a1354d00ff67 |
| dxf2bim/dxf2shell_config.js | deploy/dev/dxf2shell_config.js | e682bc8dc1e2aacf1c258bdc20419506acbd9e5bceec215bc93db3762587eca5 |
| dxf2bim/dxf2qualify.js | deploy/dev/dxf2qualify.js | 4d6b010af89b3b2fe113ca904105c61230fa6afd65dc1adf0379caf9a484468e |
| dxf2bim/std2d.js | deploy/dev/std2d.js | 1d19b33512ba6ca814e10af6810e6d4d56d7d7f9a44ab49fc9eefb16a0e7db89 |
| dxf2bim/std2d_geom.js | deploy/dev/std2d_geom.js | 46903de12432a6dec1a470c12fcbb89a78717b292874a486ad325a81527148a6 |
| dxf2bim/std2d_dxf.js | deploy/dev/std2d_dxf.js | b048dbd18853177e3235d460200fa86e4c81a6b815a943e94d744b00e47f5f6d |
| dxf2bim/std2d_marks.js | deploy/dev/std2d_marks.js | 67704c069ce55d6a7053c22d3fc5a56c74e507e16d90661d7b357d13c01ba551 |
| dxf2bim/polygon-clipping.js | deploy/dev/polygon-clipping.js | de2bdc061b61d537f7d12f6519f46e35113f0f246b6a06293a08b615454946cf |
| dxf2bim/ifc_extract_core.js | scripts/ifc_extract_core.js (the Node extractor body; one extractor, two hosts) | 16accb7e37683247535e9b3a776e15aec5ab27c63dc58536ac2bc3d2e6c8a3d5 |
| lib/dxf-parser.js | deploy/dev/dxf-parser.js (gdsestimating/dxf-parser, MIT, minified) | 8c4c9fa93250356e14dde6f156891d62a257cd759611072995b89ce3aa9c9ab8 |

Check: `git -C <BIMCompiler> show b44f0ccc6:deploy/dev/<file> | sha256sum` equals the column above.
