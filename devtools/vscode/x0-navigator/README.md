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

## Install (two commands, works offline, no npm)

From the bim-ootb folder:

```sh
node devtools/vscode/pack.js                                             # writes devtools/vscode/dist/x0-navigator-0.1.0.vsix
code --install-extension devtools/vscode/dist/x0-navigator-0.1.0.vsix   # VS Code's own installer
```

Then reload VS Code (*Developer: Reload Window*). No `code` command on your PATH? Use the Extensions view ▸ `…` ▸ *Install
from VSIX…* and pick that file. `node devtools/vscode/pack.js --install` does both steps.

**Check it worked:** open any `viewer/*.js`, hover a field such as `APP.db`: the hover starts with `written at`.
**After you pull changes to the add-on:** run the two commands again (the installed copy is a copy).
**Remove it:** `code --uninstall-extension bim-devtools.x0-navigator`.

Setting `bimDevtools.compilerRoot` points at the bim-compiler checkout; left empty it is the sibling folder `../bim-compiler`.

*Why not a symlink into `~/.vscode/extensions/`:* VS Code ignores a folder its `extensions.json` does not list (measured,
VS Code 1.146.0; `tests/realvsc/install.js` keeps that as its red control). An earlier version of this file said to symlink.

## Witnesses (node only)

```sh
node devtools/vscode/x0-navigator/tests/witness_x0_appdef.js     # §X0_APPDEF
node devtools/vscode/x0-navigator/tests/witness_x0_taghover.js   # §DEVTK_SPEC  [--compiler-root <dir>]
node devtools/vscode/x0-navigator/tests/witness_x0_activate.js   # §X0_ACTIVATE
node devtools/vscode/x0-navigator/tests/witness_x0_fresh.js      # §X0_FRESH
node devtools/vscode/x0-navigator/tests/witness_x0_isolation.js  # §X0_ISOLATION
```

One more runs the **real VS Code** (its extension-test mode, a temp profile, a virtual display, no GPU), so it is
local only and starts nothing without `--go`. It needs VS Code and `xvfb-run`:

```sh
node devtools/vscode/x0-navigator/tests/realvsc/run.js --go      # §X0_REALVSC  [--compiler-root <dir>]
node devtools/vscode/x0-navigator/tests/realvsc/install.js --go  # §X0_INSTALL  (packs, installs into a temp folder, checks)
```

Spec: bim-compiler `prompts/CODE_ARCHITECTURE_DESIGN.md` §F.4, §F.5.
