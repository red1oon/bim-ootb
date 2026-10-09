# Witness log: white-box discipline for this POC

Rules (the owner's WITNESS logging discipline):
1. **Numbers decide.** A claim exists only as a command plus a number plus a threshold. No gate depends on someone looking at a picture. Things that need human judgement
   (Photoshop UI behaviour, brush feel) are listed as DEFERRED, never as blockers.
2. **Hypotheses are logged before they are tested and closed with the numbers** (`HYPOTHESES.md`). A refuted hypothesis stays in the file: that is what stops us running in circles.
3. **A threshold is only changed with a HYPOTHESES entry that cites the measurement justifying the change.** Never loosen a gate to get green.
4. **Every run is recorded.** `node witness_all.js` runs every suite and appends one line per suite to `ledger.jsonl` (time, commit, dirty flag, node version, suite,
   exit code, gate, failing checks with their numbers, sha256 of the full output) and keeps the full numeric output of the latest run in `latest/`.
5. **A green test must be able to fail.** Prefer negative controls (see `doc/run_doc.js`: ignoring an embedded profile must be detected).
6. Independent references only: float64 colour maths without an ICC engine, a separate parser (psd-tools), native LittleCMS via Pillow. A library checked against itself proves nothing.
