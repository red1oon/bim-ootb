-- ════════════════════════════════════════════════════════
-- ROOM007: strip the non-habitable Roof space from Duplex_ARC.db (bim-ootb modeller/)
--
-- Root cause: main's Duplex_ARC.db spatial_structure (26 rows: 1 building + 4 storeys + 21 IfcSpace)
-- predates ROOM_INJECTION_HYBRID.md Task 5's habitability classifier (spaceHabitable()) -- it still
-- carries R301 "Roof" (object_type='Roof'), which the classifier correctly excludes (label:ROOF,
-- independent zband:8.91>6.67 geometry signal also fires). Confirmed by direct diff against
-- fable/modeller-lod400-livewire's already-filtered copy (@790b069): the ONLY difference is this
-- one row -- W-ROOM-HAB (5/5) already proved 20/20 remaining rooms habitable.
--
-- Apply:  sqlite3 modeller/Duplex_ARC.db < prompts/Modeller/DISC_Walker/embed8_scripts/ROOM007_Duplex_strip_roof.sql
-- Verify: sqlite3 modeller/Duplex_ARC.db "SELECT COUNT(*) FROM spatial_structure"  -- expect 25 (was 26)
--         sqlite3 modeller/Duplex_ARC.db "SELECT COUNT(*) FROM spatial_structure WHERE object_type='Roof'"  -- expect 0
-- ════════════════════════════════════════════════════════

DELETE FROM spatial_structure WHERE guid = '0pNy6pOyf7JPmXRLgxs3sW' AND object_type = 'Roof';
