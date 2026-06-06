# KANBAN_MARVEL_SPEC — dictionary-driven "Odoo-marvel" cards (model-agnostic optics)

The Kanban board already folds ANY doc table's REAL records into wfmc-state columns and commits a
signed `SET_STATUS` on a legal drag (`kanban_lens.js` + `kanban_host.js`, witnessed by
`poc_idmp_kanban.js`). What it lacked was the *optics* — a flat `Table #id` chip. This spec adds the
"marvel" card chrome WITHOUT authoring anything per-model: every visual is **derived from the
Application Dictionary's own naming conventions**, so when iDempiere absorbs another system's model
(Odoo, SAP, …) the richer card renders with **zero new code**. That IS the thesis — frictionless,
model-agnostic absorption — made visible.

## Doctrine
- **NON-INVENT.** Every glyph/label on a card traces to a REAL column value of that record. Absent
  column ⇒ the line is omitted, never faked. No `Date.now`/`Math.random` in the render path (colours
  are deterministic hashes; monograms are slices of real identifiers).
- **Zero per-model authoring.** Field roles are detected by AD convention, not a per-table switch:
  - **title**  = first present of `DocumentNo` · `Name` · `Value` · `DocumentNo`-like · the key column.
  - **amount** = first present of `GrandTotal` · a numeric column matching `/Amt$|Amount$|Total$/i`.
  - **date**   = first present column matching `/^Date|Date$/` (e.g. `DateOrdered`, `DateInvoiced`).
  - **avatar** = a 2-char monogram from the doc TABLE (e.g. `C_Order`→`OR`, `C_Invoice`→`IN`),
    filled with a colour deterministically hashed from the table name (each absorbed model gets its
    own stable brand chip). FK "person" columns are ids, not names → not faked into initials.
- **Colour scheme = lifecycle status (deterministic palette).** The card's left rail + a status chip
  are coloured by `doc_status` so the board reads at a glance and a legal drag RE-COLOURS the card to
  the destination state (live feedback). Palette (status→hex), unknown→neutral:
  `DR #f5a623 · IP/IN #4a90e2 · CO #27c08a · CL #8a94a6 · VO #aab2bd · RE #e5604d · ?? #6c7a89`.
- **Engine untouched.** This is pure presentation in `mount()`; the drag→`resolveDrag`→`dispatch`
  write path, legality, signing and persistence are unchanged.

## Mechanism (generic, one place)
- `kanban_lens.js mount(opts)` accepts an OPTIONAL `opts.meta` map: `{ "Table#id": {title, amount,
  date} }`. When a card has meta it renders the marvel layout (avatar + title + meta line + status
  rail/chip); when absent it falls back to the current `Table #id` text. The lens stays generic — the
  HOST supplies the real values.
- `idempiere.html openKanbanFor()` builds `meta` from the OPEN window's `_records` (full rows, keyed
  by columnName) using the convention detectors above, computed ONCE per board, and passes it to
  `mount`. The 4 doc tables in `KDOC_TABLES` (and any future absorbed doc table) flow through the same
  detectors — no table-specific branch.

## Group-by (honest scope)
This board's columns ARE its group-by: the wfmc lifecycle state, because the columns double as the
legal drop-targets that drive `SET_STATUS`. Re-grouping the columns by another field would break the
drag→transition semantics, so a free "group-by any field" toggle belongs to a SEPARATE read-only
view, not this write-board. Deferred deliberately, not faked — see RESUME.

## Witness contract (`tests/poc_kanban_marvel.js`, whitebox §-log first)
```
§KANBAN-MARVEL table=C_Order cards=N enriched=N titleCol=DocumentNo amountCol=GrandTotal \
              dateCol=DateOrdered avatars=N statusColors=N handAuthored=0
§KANBAN-CARD key=C_Order#<id> avatar=OR title='<real DocumentNo>' amount='<real GrandTotal>' \
            date='<real DateOrdered>' color=<status-hex>        (one sampled real card)
§KANBAN-MARVEL-RESULT PASS
```
- PASS = every card enriched from real columns (enriched==cards), `titleCol/amountCol/dateCol` are
  REAL column names of the table (detected, not hardcoded), avatars rendered for all cards, status
  colours applied, `handAuthored=0`, sampled card's title/amount/date equal the record's real values,
  and 0 pageerrors. The existing `poc_idmp_kanban.js` (drag→signed write) must still PASS (the write
  path is untouched).
