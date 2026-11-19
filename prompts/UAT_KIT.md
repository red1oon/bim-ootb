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

## 3 DECISIONS
- **2026-11-20, Detail 1 APPROVED (owner: *"Yes"*)**: the checker reads its stages from the pack's `manifest.json` (`uat-pack/2`). For the tester nothing changes: the Shed pack shows the same five boxes. Another project's pack lists its own. Next: build it as §2 says (back-compatible with `capex-uat-pack/1`; the three-case witness).
- **Raised the same day, waiting for the owner, Detail 2 (the mischief the checker remedies):** a UAT signed off on ticks that nobody can check. The checker cannot yet tell the tester's own files from the answer key's. A tester (or a script, like the dry run's declared B5 bypass) can hand back the reference's own database and get PASS. Proposed: a database byte-identical to the reference reads **NOT YOURS**, not PASS. An honest export always differs (it carries its own `import_date`; measured 2026-11-19: same 513 rows, different SHA-256). The result file also records the SHA-256 of what was given.
- **2026-11-20, Detail 2 APPROVED, lenient (owner, verbatim):** *"Yes to your question if it works that way better but not overtink or overkill that a small human quirk showstop the whole UAT."* So a file byte-identical to the answer key reads **NOT YOURS**. It counts like NOT GIVEN (the run reads PARTIAL PASS, with a remark naming the box), never FAIL, so it never stops the UAT. The result file records each given file's SHA-256.
- **2026-11-20, RULE: schedule values are never fingerprinted (owner, verbatim):** *"if 4D schedule correction will affect our UAT? If so, can not fingerprint the schedule values. Qualitiative proof is enough."*
  - Measured the same day: the answer key's database holds NO schedule data (`schedules`, `tasks`, `task_sequences`, `task_elements` all 0 rows; the 4D schedule is computed live in the Viewer). So 4D corrections do not touch the checker today.
  - The guide's 4D steps are already qualitative: B3.1 *note* the finish date (no value is checked); B3.5 *"the finish date moved by the days you added"*.
  - **Watch:** if the 4D work ever writes schedule rows into the Shed's export, the checker must leave the schedule tables out of the B2.8 count. A checker stage on a 4D value may only judge direction or order, never an exact date or duration.
- **The owner's summary of the checker (2026-11-20):** *"In essence it is like a hash control to avoid cheating in the UAT or deviation from expected results thus proving if the software really works."*
