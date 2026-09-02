# ⚠ DO NOT REMOVE — Investigate + INSTALL real worktree enforcement (stop the shared-tree loop)
# A prior session CLAIMED it configured worktree enforcement in settings.json. A later session (2026-06-06)
# found NOTHING in any settings.json. Find the truth, then INSTALL the actual guardrail. Deliverable =
# a WORKING hook verified to fire — NOT another memory/CLAUDE.md note (that advisory loop is the bug).

## THE PROBLEM (why this keeps recurring)
Multiple Claude sessions/terminals share ONE working tree `/home/red1/bim-ootb`. They edit it directly,
it goes dirty + diverges from origin (observed: 9 ahead / 44 behind, ~5000-line reconcile), and the USER
has to stop everyone and coordinate a reset. Every session "solves" this by writing a memory/CLAUDE.md note
saying "use a worktree" — then the NEXT session edits the shared tree anyway and re-writes the same note.
**Memory + CLAUDE.md are advisory; the model reads them and still does the wrong thing. Only a harness-run
hook actually constrains behaviour.** The fix is mechanical, not documentary.

## WHAT THE 2026-06-06 SESSION ALREADY VERIFIED (don't redo blindly — extend it)
- `~/.claude/settings.json` → has only `env`, `statusLine`, `autoCompactEnabled`, etc. **NO `hooks` key.**
- `bim-ootb/.claude/settings.json` and `bim-ootb/.claude/settings.local.json` → **empty / absent.**
- `bim-compiler/.claude/settings.json` → **absent.**
- The only worktree machinery that EXISTS: the Agent tool's `isolation: "worktree"` (for SUBAGENTS only)
  and `EnterWorktree`/`ExitWorktree` tools — **neither forces a MAIN session into a worktree nor blocks
  edits to the shared tree.** So worktrees were always *available*, never *enforced*.

## ▶ STEP 1 — INVESTIGATE the claim (where did "it's done" come from?)
Resolve the discrepancy between "last session said it did" and "nothing is in JSON". Check ALL of:
- Every settings file: `~/.claude/settings.json`, `~/.claude/settings.local.json`, any `$CLAUDE_CONFIG_DIR`,
  managed/enterprise settings (`/etc/claude-code/`, `/Library/Application Support/ClaudeCode/` if present),
  project `bim-ootb/.claude/settings.json` + `.local.json`, `bim-compiler/.claude/*`.
- **Git history** of the settings files: `git -C ~/bim-ootb log -p -- .claude/settings*.json`; also any
  dotfiles repo. The claimed change may have been reverted, never committed, or written to the wrong path.
- **Memory files** `~/.claude/projects/-home-red1-bim-compiler/memory/*` — grep for "worktree", "hook",
  "settings.json", "enforce". Find the note that CLAIMED it; see if it described a hook or just the policy.
- Whether the prior claim actually referred to **Agent subagent worktree isolation** (real, but subagents
  only) and was mislabelled as session enforcement.
- Report the finding plainly: was it (a) never installed (advisory-only), (b) installed then reverted,
  (c) installed somewhere not loaded, or (d) misremembered. Cite what you found.

## ▶ STEP 2 — INSTALL the real guardrail (a hook, via the update-config skill)
Add a **PreToolUse hook** to the appropriate `settings.json` that DENIES file-mutating tools when the target
path is inside the shared canonical tree, and tells the session to use a worktree instead.
- Match tools: `Edit`, `Write`, `MultiEdit`, `NotebookEdit`.
- DENY when the resolved `file_path` is under `/home/red1/bim-ootb/` **EXCEPT** under a worktree
  (`/home/red1/bim-ootb/.git/...` n/a; real worktrees live at `/tmp/wt-*` or `/tmp/*-deploy`, which are
  OUTSIDE `~/bim-ootb`, so simply: deny writes whose absolute path starts with `/home/red1/bim-ootb/`).
- ALLOW everything else (Read, Bash/git, edits under `/tmp/wt-*`, edits in `bim-compiler`).
- Deny message (actionable): `"Shared tree is read-only. Work in a worktree: git -C ~/bim-ootb fetch origin
  && git worktree add /tmp/wt-<feature> -b feat/<feature> origin/main, edit there, PR to main."`
- Decide SCOPE and state why: project `bim-ootb/.claude/settings.json` (scopes to this repo, recommended)
  vs global `~/.claude/settings.json` (if sessions roam repos). Prefer project-scoped.
- Hook contract: a PreToolUse hook receives the tool input as JSON on stdin and returns a permission
  decision (deny + reason). Use the **update-config skill** — do NOT hand-guess the JSON shape; that skill
  owns hook syntax. (Optional add-on: a `SessionStart` hook that announces/auto-creates a fresh worktree.)

## ▶ STEP 3 — VERIFY it actually fires (this is the whole point)
- Attempt an `Edit`/`Write` to a file under `~/bim-ootb/` → MUST be blocked with the message. (Witness it.)
- Attempt the same edit inside `/tmp/wt-test` worktree → MUST be allowed.
- Confirm the normal flow still works: `git worktree add`, edits in the worktree, `gh pr create`, Read of
  shared-tree files, Bash git on the shared tree (reset/clean) are all UNAFFECTED.
- Confirm `~/bim-ootb` `git status` can no longer be dirtied by a session via Edit/Write.

## ▶ THE WORKFLOW THE HOOK ENFORCES (so sessions self-organise, user uncoordinated)
- One worktree per session off FRESH origin/main; never edit the shared tree.
- Land via PR + `gh pr merge --auto --squash`; only HOLD (don't merge) when a human deploy-go is required.
- Different files = no conflict; `viewer/sw.js` is the one magnet (take HIGHER CACHE_VERSION, keep BOTH
  precache lines — consider a git merge-driver to automate even that).
- The shared `~/bim-ootb` becomes a disposable read-only mirror: anyone can `git fetch && git reset --hard
  origin/main` it anytime because it holds nothing precious.

## ☠ DO / DON'T
- DO produce a verified, firing hook in settings.json. DON'T "fix" this by writing another memory or CLAUDE.md
  line — that is the exact loop this prompt exists to end.
- DON'T break the deploy-via-worktree→PR flow or the ability to Read/git the shared tree.
- Reference for context (already shipped, do not disturb): `prompts/SHARED_TREE_RECONCILE.md`,
  `prompts/HANDOFF_ghost_xray_rooms.md`, `prompts/HISTORY_SCRUB_FIX.md`.
