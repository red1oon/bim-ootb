# X0 Navigator

A dev-side VS Code extension for this repo. Plain JavaScript, only the `vscode` API, no dependencies, no build
step. It never calls a model or the network, and nothing in `devtools/` is loaded by any page.

| Feature | Question it answers | Reads |
|---|---|---|
| F12 and hover on `APP.x` (also `A.x` / `app.x` in a file that binds them) | Where is this field set? | `internal/APP_SURFACE.md` (generated) |
| Hover on a `§TAG` | Which rule is this tag, and which code prints it? | `prompts/*.md`, `docs/**/*.md` of bim-ootb and bim-compiler, plus the `.js` source |

It never guesses: a phantom field (read, never written) gets a hover and no jump, an unknown field gets nothing,
and a field whose line has moved gets `index stale` instead of a wrong jump.

**The APP index stays fresh by itself.** The committed `internal/APP_SURFACE.md` is only a snapshot (most merges
move its line numbers). X0 runs the repo's own `scripts/gen_app_surface.js` into VS Code's storage folder when it
starts, and again when a lookup misses after you saved a file (one run, about 4 s, in the background). It never
writes inside the repo. The command *X0 Navigator: Rebuild indexes* forces a run.

## Install (from the repo, works offline)

```sh
ln -s "$PWD/devtools/vscode/x0-navigator" ~/.vscode/extensions/bim-devtools.x0-navigator-0.1.0
```

Then reload VS Code. Setting `bimDevtools.compilerRoot` points at the bim-compiler checkout; left empty it is the
sibling folder `../bim-compiler`.

## Witnesses (node only)

```sh
node devtools/vscode/x0-navigator/tests/witness_x0_appdef.js     # §X0_APPDEF
node devtools/vscode/x0-navigator/tests/witness_x0_taghover.js   # §DEVTK_SPEC  [--compiler-root <dir>]
node devtools/vscode/x0-navigator/tests/witness_x0_activate.js   # §X0_ACTIVATE
node devtools/vscode/x0-navigator/tests/witness_x0_fresh.js      # §X0_FRESH
node devtools/vscode/x0-navigator/tests/witness_x0_isolation.js  # §X0_ISOLATION
```

Spec: bim-compiler `prompts/CODE_ARCHITECTURE_DESIGN.md` §F.4, §F.5.
