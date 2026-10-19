# standards/ — jurisdiction packs (foundation lane F4, prompts/DXF2BIM_FOUNDATION_LANE.md §4)
One JSON file per document, one row per clause: locator, **verbatim quote**, `quote_tokens` (every number the row states must appear in the quote: W-PACK checks it mechanically), the machine `check`, `status`, `review`.
- `verified_text` = the value is in a retrieved verbatim quote of the cited clause; confidence says what the text was (a reproduction, not the gazette); `review: pending owner / professional` until a person compares it with the gazette. Only these rows may carry a `check`.
- `pointer` = the clause delegates to a schedule that was not retrieved; `unverified` = no source read yet. Neither may produce a finding.
- **Advisory only: never a legal determination.** A finding names the clause, the threshold, the measured value, the element ids and the evidence tier (drawn / derived / assumed) of the geometry it rests on.
- The UBBL is a model by-law adopted per state: name the state and version in any finding. Bangladesh (BNBC 2020) is a skeleton until the code text is obtained.
- The library's own code tables (`component_library.db`) are NOT copied here: their audit against the primary text is kept private (SYSNOVA/DXF2BIM/standards_audit/).
