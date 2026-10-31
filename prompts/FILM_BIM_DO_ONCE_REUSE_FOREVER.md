# ⚠ DO NOT REMOVE
SCOPE: the film "BIM — The Untold Story of Do Once, Reuse Forever" (a new topic category; owner 2026-11-01). Storyline, recorder spec, takes, assembly, witness of the output.
**Read the log after every run; exit code is not evidence.** Every spoken or captioned number is a `§FILM_FACT` of the take. Never print the shed's private title-block text (client, site).
Honour this block until the film is published.

## ▶ RESUME HERE (written 2026-11-01, session 16)
Storyline below is APPROVED (owner: "Yes, make it the storyline. 'BIM - The Untold Story of Do Once, Reuse Forever'"). **Blocked on §D105** (bim-ootb lane
`prompts/DXF2BIM_ARCHITECT_REVIEW.md`: the analytical builder reads ONLY the IFC; parity shed-via-IFC = direct; other IFCs measured) — chapters 5-6 claim exactly that, so no take
before §D105 is merged and witnessed. Then: recorder spec → recorder (reuse `prompts/film_dxf2bim_submission_rec.js` harness + the spotlight helper on branch `film/whatsnew`, pushed,
stopped WIP) → CPU dry run → GPU take (ask the other sessions to hold browser runs) → fill → cards (BIMCompiler `prompts/film_title_cards.py`, new FILM_SET; the whatsnew cards PR #285
is superseded) → assemble (`prompts/film_dxf2bim_why_assemble.sh`) → back card (`prompts/film_back_card.py`) → witness of the output.

## STORYLINE (approved 2026-11-01)
**Owner's frame:** "I wana revolve around the underlying foundation of BIM itself. The sole purpose of going digital is for its reusability and info building."
**Spine:** ONE piece of information, entered once by a drafter, followed through every reuse — and every step ADDS information, none is lost, nothing is retyped. Then widen: every part,
any BIM model. Long film (no length cap; owner: "This can be a long movie"). Every new thing is shown live, then **blown up** (a real screenshot of that element, ≈2x, dark backdrop,
one-line caption, 4-6 s; `§FILM_SPOT`).
| # | chapter | on screen | the information, reused / added (facts from the take) |
|---|---|---|---|
| 0 | THE PROMISE | title card; one line: "Going digital has one purpose: enter information once, reuse it forever." | — |
| 1 | WRITTEN ONCE | the DETAILS sheet in the Sheet view (dimensions drawn, Ø); blow up the note "Footing, Column, Grade Beam Casting Ratio = 1:1.5:3" and "f'c = 24 MPa"; NOTES chip | the note, its sheet + handle |
| 2 | READ, NOT RETYPED | convert; a footing selected; the properties carried (Note_CastingRatio, NoteSource sheet#handle, Sched_Footing_T) — via the model's own export if the Modeller still has no properties panel (state it) | footings + columns carrying the ratio; the schedule's 12" = drawn 0.3048 m |
| 3 | REUSED FOR COST | Measure impact (which defaults matter) → the bill row priced at PWD SoR 07.3.1 / page | the price row chosen BY the note; bill total |
| 4 | REUSED FOR CHECKS | the type marks checked across the set (GB-1 tagged + detailed, not modelled); the checks with their codes; the Load Summary (own weight, a ballpark pending the engineer) | marks, advisories, own weight (§D104-corrected) |
| 5 | CARRIED IN THE IFC | export the IFC; open it as ANY BIM model would be opened; blow up the pset carrying the casting ratio / f'c | the open handover: what the IFC carries |
| 6 | REUSED FOR STRUCTURE | from that IFC: the analytical model (STAAD) — joints, members, supports; the f'c note became the concrete's stiffness; **the proof: via the IFC = the direct route, byte for byte** | §D105 parity line; joints / members / supports |
| 7 | ANY MODEL, NOT JUST THIS ONE | another IFC (Duplex / Hospital, as §D105 measured): the same chain, and what that model states vs lacks (listed, never guessed) | per-model stated / missing |
| 8 | WHAT IT DOES NOT DO | the engineer's analysis and design, live / wind / seismic, bars from the details — stated plainly | — |
| 9 | INFORMATION THAT GROWS | recap: one note → property → price → check → IFC → stiffness; "Entered once. Reused at every step. Never retyped." | — |
| — | end card + back card (prior art: what we learned from others, what this adds; contact red1org@gmail.com) | | |
**Subtitles to draw from (each must stay true):** "Entered once. Reused at every step. Never retyped." · "Every step adds information, and none is lost." · "A drawing note that ends up pricing
the concrete and stiffening the frame." · "Not 3D for its own sake: information that travels."
**Not claimed:** a structural design; "first" / "novel" (prior-art search limited); that the details' bars are used.
