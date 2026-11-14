# X0 Navigator

A dev-side VS Code extension for this repo. Plain JavaScript, only the `vscode` API, no dependencies, no build
step. It never calls a model or the network, and nothing in `devtools/` is loaded by any page.

| Feature | Question it answers | Reads |
|---|---|---|
| F12 and hover on `APP.x` (also `A.x` / `app.x` in a file that binds them) | Where is this field set? | `internal/APP_SURFACE.md` (generated) |
| Find All References (Shift+F12) on such a field | Where is this field written and read, under any spelling? | every site the repo's generator recorded, kept beside X0's own fresh index |
| Hover on a `§TAG` | Which rule is this tag, and which code prints it? | `prompts/*.md`, `docs/**/*.md` of bim-ootb and bim-compiler, plus the `.js` source |

| *Run & Ship* list in the Explorer side bar (also as commands) | Does it run, is it safe to ship, is it live? | the repo's own scripts, git, and (Fetch back only) the live site |
| Status bar note + command *Cost if deployed* | What does this file, or my change, add to what every user downloads? | `sw.js` cache lists and the pages' script tags |
| A grey line above code that prints a `§TAG` | What did this line last print? | `logs/*.log` that start with a `§LOG_STAMP` |
| A warning on line 1 of an edited file the offline cache serves, with a quick fix (the light bulb, Ctrl+.) | Did I forget the cache bump? Do it for me, when I say so | the *Check* step's own bump rule for this one file; the fix runs the repo's `scripts/bump.js` (dry run, or `--write` on your click) |
| Command *Context for this file* | What do the indexes say about this file, as one block I can paste to an assistant? | all of the above, for the open file (X0 itself calls no model) |

**First versions (2026-11-13), and what each does not do yet:**

- **Run & Ship** has four steps. *Run local* starts the task *Serve repo* and lists each app's local URL and cache version on disk.
  *Check* runs `node --check` on the JS files that differ from `origin/main`, the repo's precache audit, and the bump rule (a
  precached file changed but that app's `CACHE_VERSION` did not). *Cost if deployed* is below. *Fetch back* reads the live site and
  compares each app's cache version, and the deploy's commit stamp, with `origin/main`; no stamp on the live site → INCONCLUSIVE.
  It stops at the first failure. **Not yet:** issue, commit, PR, merge or deploy; any browser step. Fetch back is the only step that
  uses the network, and only when you press it.
- **Cost if deployed** counts raw bytes: *start-up* = the scripts the app's pages load, *offline cache* = the files its service
  worker stores, for your working tree against `origin/main`. **Not yet:** minified sizes, budgets, memory estimates, browser timings.
- **Values beside the code** shows a logged value only when it can be proven current: the log names its commit, and the file that
  prints the tag is unchanged since. Otherwise it shows nothing. It reads the checkout's `logs/` and the folders in the setting
  `bimDevtools.extraLogDirs` (default `~/.cache/bim4d`, where bake logs are kept; read-only, sub-folders included). A log counts
  only if a `§LOG_STAMP` line is among its first 20 lines; `cli_silent_bake.js` writes one since 2026-11-14. **Not yet:** other log folders, history. Expect few at first: only
  logs saved since 2026-11-13 carry the stamp.

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
node devtools/vscode/x0-navigator/tests/witness_x0_deploy_cost.js # §PERF_IMPACT
node devtools/vscode/x0-navigator/tests/witness_x0_lens.js       # §LENS
node devtools/vscode/x0-navigator/tests/witness_x0_ship.js       # §SHIP_PANEL  [--live reads the public site once]
node devtools/vscode/x0-navigator/tests/witness_x0_context.js    # §X0_CONTEXT
node devtools/vscode/x0-navigator/tests/witness_x0_refs.js       # §X0_REFS
node devtools/vscode/x0-navigator/tests/witness_x0_isolation.js  # §X0_ISOLATION
```

One more runs the **real VS Code** (its extension-test mode, a temp profile, a virtual display, no GPU), so it is
local only and starts nothing without `--go`. It needs VS Code and `xvfb-run`:

```sh
node devtools/vscode/x0-navigator/tests/realvsc/run.js --go      # §X0_REALVSC  [--compiler-root <dir>]
node devtools/vscode/x0-navigator/tests/realvsc/install.js --go  # §X0_INSTALL  (packs, installs into a temp folder, checks)
```

Spec: bim-compiler `prompts/CODE_ARCHITECTURE_DESIGN.md` §F.4, §F.5.
