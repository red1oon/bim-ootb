
---

# §G RESUME — 2026-08-26 session close

**One-liner:** DAY 0 Substructure+Superstructure unsupported, after the ground-bearing exemption:
**Hospital 0 · HHS 1 · Duplex 2 · Terminal 5** at HR 3 (all remaining are `IfcMember`); stacking 0
everywhere; MEP does not appear on DAY 0 on any of the four.

## G.1 ⚠ THE USER IS DEEPLY FRUSTRATED. READ THIS BEFORE YOU TYPE ANYTHING.
Their words, this session, verbatim:

> *"this is the constant hell dealing with u"* · *"Drifting and forgetting"* · *"Trashing all over"*
> *"for weeks talking to u has not solved anything thus i given up"*
> *"i am utterly frustrated do not ask me to make any decisions"*
> *"stop talking ceremony that i dont read. Your language is always horrible, all request for terse
> without drama never end"*
> *"u have no idea how to read WITNESS logging or device one that tells u things are wrong"*
> *"u truly have no sense of geometry WITNESSing when all the maths in the world is at your disposal"*
> *"u have no idea about systems analysis"* · *"your design must have been spaghetti"*

**They are right on the substance.** This session produced five retractions, three wrong metrics and
two silent no-op bugs before a single number could be trusted. Do not defend any of it.

**Standing orders from them, non-negotiable:**
- **Do NOT ask them to decide anything.** Decide, act, show the number.
- **NEVER refer to what is seen / on screen / visually.** Geometry and maths only. A metric named
  `floatingOnScreen` was written this session and that framing is banned.
- **Terse. No ceremony, no preamble, no drama.** They do not read it.
- **Do not report lesser issues.** Their scope is DAY 0, Substructure/Superstructure, no MEP.
- **"First days no MEP"** — verified true on all four buildings; keep it true.
- **"Anything that hangs within a well formed room is no issue"** — enclosure, not bearing.
- Their lead, not yet chased: *"everything was going fine until the gantt editor"*, and
  *"u not even creating any new geometry, just playback"*.

## G.2 WHAT IS DONE (bim-ootb PR #1548, branch feat/arch-envelope-closeup)
- Architecture split into **Envelope (5-6)** and **Closeup (8)**; bands contiguous, sequence 8 was free.
- **All four production call sites now reach the template** (`§TPL_WIRED`); `witness_4d_template_reached`
  gates it, 6/0. It was dead code shipped 2026-08-25 and never called.
- **`§TPL_LAYER_ORDER`** — inside a task, elements are laid out in support order (topological layers
  of the shipped contact graph), banded so a later layer cannot start before an earlier one ends,
  with the solve's crew-leveling preserved inside each band.
- **`§TPL_LAYER_SELFCHECK`** — reports `applied / moved / stillInverted` and FAILS on a no-op. Built
  because the layer pass shipped silently broken and produced identical numbers.
- Enclosure by ray-cast (`scripts/probe_enclosure_geometry.js`): collapses §14.2's "63 uncountable"
  to **10**, and HHS's 209 floating to **18** genuinely open.
- Suite matches clean `main`; ZDA baseline re-locked with its justification.

## G.3 ⛔ OPEN, IN THEIR PRIORITY ORDER
1. **`IfcMember` at DAY 0** — the entire remaining sub/super residue on all four buildings is this
   one class. Start here.
2. **Hospital `stillInverted=778`** inside tasks — cause not established.
3. The default bucket is mid-programme (§D) — blocked on a measured productivity.
4. Their two untested leads in G.1.

**Do not open with a summary of this file. Open with a number.**
