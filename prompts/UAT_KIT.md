# ⚠ DO NOT REMOVE
SCOPE: the UAT KIT, a permanent feature of every implementation project (owner, 2026-11-20). One reusable kit, with per-project data, so any project (ours or another implementer's) ships a UAT that a tester can do by hand and then mark themselves, online, against a reference pack. The first instance is the CAPEX UAT (`prompts/CAPEX_DASHBOARD.md` §5.86–§5.90; guide BIMCompiler `docs/CapexUATGuide.md`). **Spec before code; one detail at a time with the owner. Read the log of every witness run (`§UATCHECK`, `§UATCK_*`); an exit code is not evidence.**

## 0 OWNER'S DIRECTIVES (verbatim, 2026-11-20)
- *"I am also surprised there is a nice HTML to fill in and paste the answer online as part of the UAT test which makes this a very portable UAT for others reuse. Do make UAT a permanent feature for implementation projects."*
- *"Indeed we want this UAT to be completely human"* · *"And eventual UAT report 100% done. But this report if no material changes, remains the same, as it be signed off as it is. Even if there is material changes, it be an appendix later."*
- *"Yes spec it first."*

**What follows from them:**
- (a) Every guide step is done AS A PERSON. The kit's goal is 0 "Programmatically" rows. A step that only a script can do is a kit defect to fix, not a row to declare.
- (b) A signed UAT report is never re-issued. A material change after sign-off goes into a dated APPENDIX.
- (c) The checker page is the portable heart of the kit.

## 1 THE KIT (what each project gets)
| part | today (CAPEX) | per-project data | shared code |
|---|---|---|---|
| Guide | `docs/CapexUATGuide.md`: do / confirm / tick, sign-off per chapter | the steps, pictures, expected text | the page layout, Print / Save-as-PDF, the checklist sheet (§5.88) |
| Reference pack | `Shed_UAT_pack_20261115.zip` on OCI, built by `capex/tools/uat_pack.js` from a passing W-UAT-CHAIN run | the files, expected values, tolerances | the zip + `manifest.json` + sha256 format, the builder that refuses a non-passing run |
| Checker page | `capex/uat/check.html` + `uat_compare.js` | which stages, what to give, how to compare | the page, pack integrity, PASS / FAIL / NOT GIVEN / PARTIAL PASS / INCONCLUSIVE, `uat_result.json` |
| Dry run | `UATDryRun.js` + rules R1–R8 (private, per client) | the guide's steps ↔ instruments | the judge, the report from `raw.log` only, verify, the acceptance block |
| Hands-on film | BIMCompiler `scripts/film_uat_howto/` (`prompts/FILM_UAT_GUIDE.md` §5) | the scenes | the private desktop, real pointer and keys, compose, gates |

## 2 DETAIL 1 (proposed, waits for the owner): the checker reads its stages from the pack, not from code
**Measured 2026-11-20** (read of origin/main, every claim with file:line):
- The page judges exactly four stages, B0.9, B2.8, B2.9 and B3.1. Their ids, labels, order and comparison are hard-coded in `uat_compare.js` `judge` (:78–88).
- The page's five inputs are fixed (`#pack #marked #db #vline #cline`, `check.html` :31–35), and so are their labels: "nine marked sheets", `SHED_extracted.db`, "DONE — SHED …".
- The reference database's path is fixed (`reference/SHED_extracted.db`, check.html :70).
- The comparison patterns are fixed: `ELEMENTS=/SHED \d+ elements/`, and `COST` assumes a "USD n (RM n)" shape (uat_compare.js :76).
- The pack builder fixes 9 + 9 sheets, the exclude tolerance and the zip name (`uat_pack.js` :13, :23–31).
- Already generic: pack integrity by sha256 (check.html :58–77); the verdict rules, where NOT GIVEN is never PASS and none given = INCONCLUSIVE (uat_compare.js :86–87); the result file `uat_result.json`.

**Proposal:** the pack's `manifest.json` carries a `stages` list, and the page builds one input box per stage from it. Each stage states:
- `id` (the guide step) and `label` (the guide's words);
- `give`, one of `files` (accept pattern), `file` (accept pattern) or `line` (typed or pasted);
- `compare`, one of a SHARED set of rules (below), with its options;
- `reference`, a pack path, or `expected`, a value.

The page then has no project words in it.

**The comparison rules are a fixed shared set, never project code:**
- `marks`: today's mark-for-mark DXF rule, with its tolerance as an option.
- `db`: element rows and table counts. The row query and the keys to leave out become options; today's are the default.
- `line`: today's `compareLine`. The pattern to compare becomes an option.
- `file-sha`: the given file must equal the reference byte for byte.

A project that needs a new rule adds it to the shared set, with a witness, for every project.

**Back-compatible:** a `capex-uat-pack/1` manifest has no `stages`. The page then uses today's four stages as the built-in default list, so the live Shed pack and its signed report keep working unchanged. The new format is `uat-pack/2`.

**Witness (named issue):** *"the checker judges a project differently from what its pack says"*. W-UAT-CHECK runs on (1) the Shed pack, unchanged, where A, B, C and K2 must give the same verdicts as today; (2) the same pack rewritten as `uat-pack/2` with `stages`, which must give identical rows and verdicts; (3) a second, tiny made-up pack with different stages (a `line` and a `file-sha`), where PASS, FAIL and NOT GIVEN must each be produced.

**Open questions for the owner, one at a time:** first, is the stage list in the manifest the right place, or would you rather keep a per-project page? The details after that (pack naming per project, where packs live, the guide template) wait for this answer.
