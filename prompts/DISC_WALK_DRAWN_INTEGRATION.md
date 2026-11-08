# ⚠ DO NOT REMOVE
SCOPE: drawn services enter the walk. ACMV runs and terminals come from the drawn-route record where sheets are held; run height follows §7.1 of `prompts/DISC_WALK_DRAWN_MAINS.md`. Read the log after every run; exit code is not evidence. Public repo: no client or project names, and no coordinates or sheet numbers from a private file.
Design: the design lane, 2026-11-08. Owner rulings are quoted. Build: the Modeller lane.

## §1 Data flow. OWNER: *"Tool now, UI later"*
- `modeller/tools/mains_to_db.js <building.db> <sheet.dxf>... [--sheet-meta=json]` runs the shipped `DrawnMains.read` on the named DXFs, against the DB's OWN `ifc_grid_axis`, and writes through `DrawnMains.write`.
- One writer: the later Modeller button will call the same read + write.
- Logs `§MAINS-READ` per sheet, plus a summary `§MAINS-TO-DB sheets= pieces= length= refused=`.
- The film does NOT show or narrate a "load sheets" button. It says the sheets were read by the reader. (§7 Q2, the UI, stays open.)
- **Federated building for heights** (§4): the building DB is made by the existing node extractor with both files, `modeller/tools/extract_ifc2db.js <ARC.ifc> --also <STR.ifc>` (one federation pin, ONE FRAME). It is then opened in the Modeller as a local `.db`. The Modeller's own IFC open is one file at a time, and that is not changed here.

## §2 Walker, ACMV runs
- When `drawn_route` rows exist, the ACMV walk commits each drawn piece as an op IN PLACE of band ducts (band duct pieces are already not placed, §9.2: the drawn piece IS the run).
- **Strength is per attribute, not one flag:**
  - position = `drawn`;
  - width = `drawn` when the reader found it, else none;
  - height = `provisional` (§7.1 void middle) or absent.
- Do NOT set the §11 `Provisional=TRUE` flag on drawn pieces: drawn length is real data and counts in totals. Record the height strength in its own property: `BIMOOTB_Walk` `HeightBasis` = `void-middle` | `none`.
- §9.1's "no sheet held" must not fire for ACMV once `drawn_route` exists.
- Log: `§WALK-MAINS disc=ACMV drawn=<m> pieces=<n> heightKnown=<n> planOnly=<n>`.
- A placed total, where the walker reports one, counts drawn pieces.

## §3 Look
- A line at height. Where the film needs it visible, a screen-space-width line, which still implies no depth.
- The drawn width is a property and a label, never a ribbon or solid.
- Plan-only pieces (no z) are not drawn in 3D; they are listed and counted.

## §4 Height (§7.1 inputs)
- **Ceiling** = the existing host search: `modeller/disc_walker.js` `hostBind` (~L1370) with `_AREA_HOST`'s IfcCovering rule (~L1307), "the ceiling whose real outline holds the point" (#2681). Reuse it at each piece's midpoint; do not write a second ceiling query.
- **Structure above** = IfcSlab / IfcBeam / IfcRoof of the STRUCTURE discipline only: the lowest one's LOWER face above the ceiling at that point.
- Never take an ARC finish slab as structure: finish layers are not enclosures. With no STR, rule §7.1.3 applies: plan only, counted.
- Height = the middle of that void, labelled `provisional`, naming which ceiling and which structure.
- Sloped or deep coverings are logged (§7.1.5). On the private ARC: 32 IfcCovering, some sloped, avg bbox_z 0.51 m.
- Heights sit in the federation's ONE FRAME.

## §5 Terminals. OWNER: *"Drawn replace borrowed"*
- On a storey a held sheet covers, place the DRAWN terminals. The reader counts them; kind comes from name words.
  - position = drawn;
  - height = the ceiling whose real outline holds them, via the host search, labelled.
- Drop the borrowed band terminals on that storey. Elsewhere, borrowed ones stay provisional.
- Log: `§WALK-TERMINALS storey=<s> drawn=<n> borrowedDropped=<n>`.
- Terminals of no kind are placed and counted, but never give a system.

## §6 Witness W-DRAWN-WALK (`modeller/tests/witness_drawn_walk.js`)
- **D1** tool → DB → open → Walk: the ACMV runs equal the drawn_route pieces (count, length); no band duct pieces. RED: no drawn_route gives the §9 behaviour.
- **D2** height: a piece under a covering with STR structure above gets the void middle, labelled. RED: with no STR, planOnly counts it and it gets no z.
- **D3** an ARC finish slab above is never taken as structure.
- **D4** drawn pieces carry no Provisional=TRUE, HeightBasis is set, and Viewer totals count them (ProvTotals).
- **D5** terminals: on a covered storey, drawn placed and band dropped, both counted. On an uncovered storey, band stays provisional.
- **D6** §9.1 "no sheet held" does not fire when drawn_route exists.
- **D7** the look: committed runs are line ops, with no solid or ribbon mesh.
- Public fixtures only; the design lane runs the private set.
