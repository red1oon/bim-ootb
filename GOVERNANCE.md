# Governance

The project's quality objectives, generated from the latest test run: [erp/team_objectives.html](erp/team_objectives.html). How to check them yourself: `docs/TermsHowToVerify.md` in the bim-compiler repository.


## Licence
The code is MIT licensed. The licence text is the only legal text, and it gives no warranty.

## Project quality objectives
The project states **quality objectives**, not guarantees. Each objective is a property with a test that must fail when the property is broken
(`node scripts/witness_terms.js`). An objective holds for builds from the author's repository at a commit whose run of those tests passes.

## Copies
Anyone may copy, change and redistribute the code under MIT. A copy keeps the quality objectives only while its own run of the same tests still
passes, with no test or check removed or weakened. A build that changed a property without its check is outside the objectives, whoever made
it. The exported run record (runner version, commit, record hash) is how anyone tells which case they hold.

## Contributions
This project is open source and author-decided. The author decides what enters the canonical line. A change is considered only if the tests
still pass and no test or check is removed or loosened. A change that breaks a principle (local first with a minimal relay, the twin of legacy
iDempiere including what the user sees, one generic dictionary engine, a test before a claim) is declined, whoever asks.

The precedent is SQLite, which is "open-source … but not open-contribution" (sqlite.org/copyright.html). SQLite's reason is legal (keeping
the code public domain). This project's reason is keeping the objectives true, under MIT.
