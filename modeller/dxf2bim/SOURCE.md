# dxf2bim/ — verbatim copies of the BIMCompiler DXF2BIM reader modules

Copied, never forked (prompts/DXF2BIM_MODELLER_LANE.md §L3, §L3.3). Do not edit here: change BIMCompiler, then run `modeller/dxf2bim/sync.sh <BIMCompiler> <commit>`.

Commit: `bf9401061` — DXF2BIM §14: full library export (index + shards) for the OCI-hosted Modeller (#195)

| file | BIMCompiler source | sha256 |
|---|---|---|
| dxf2bim/dxf2bim.js | deploy/dev/dxf2bim.js | 815fb190044ba1ba949a2fbf21d6b546db1e3130d1512109085e83d7ea96dfa5 |
| dxf2bim/dxf2elev.js | deploy/dev/dxf2elev.js | 93b7d5080af88d93c9698d02356a06cf5a61cb4e94dcce2a784587f6ccdeaf9d |
| dxf2bim/dxf2marks.js | deploy/dev/dxf2marks.js | 70f8bfbeb712e04ef35998f053123ee803a91d0c4b757fdb401e5a9732978709 |
| dxf2bim/dxf2mesh.js | deploy/dev/dxf2mesh.js | 67157a627b4408230948e62b93810f0be91e362d9f8458deedc98813d3a17fc2 |
| dxf2bim/dxf2types.js | deploy/dev/dxf2types.js | aa0364a564356a9d6ddcebd71b237b5cb36b5368e00cf9ebbea181b0d1df0b1c |
| dxf2bim/dxf2shell.js | deploy/dev/dxf2shell.js | 1edc8535d79abcc98688538f68fef97aaa3d3967602e747a3809a1354d00ff67 |
| dxf2bim/dxf2shell_config.js | deploy/dev/dxf2shell_config.js | 8b7f75eef018994cad43ca8bfc9a5cd816ba6f01cfbb95efb6cc0c6ef8ea5d40 |
| dxf2bim/dxf2qualify.js | deploy/dev/dxf2qualify.js | 4d6b010af89b3b2fe113ca904105c61230fa6afd65dc1adf0379caf9a484468e |
| lib/dxf-parser.js | deploy/dev/dxf-parser.js (gdsestimating/dxf-parser, MIT, minified) | 8c4c9fa93250356e14dde6f156891d62a257cd759611072995b89ce3aa9c9ab8 |

Check: `git -C <BIMCompiler> show bf9401061:deploy/dev/<file> | sha256sum` equals the column above.
