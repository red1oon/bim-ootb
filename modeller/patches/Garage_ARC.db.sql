-- ════════════════════════════════════════════════════════
-- ROOM004: carry spatial_structure into Garage_ARC.db (bim-ootb modeller/)
--
-- Root cause: finalize_all_8.js (6068fab) silently shipped Garage_ARC.db with NO spatial_structure
-- table -- its fresh source (an ephemeral /tmp _all.db merge, never preserved) lacked it. Real
-- ROOM_INJECTION_HYBRID.md Task 2/5/6 room data for this building only exists today on the
-- unmerged bim-ootb branch fable/modeller-lod400-livewire (@790b069) -- this script ports it to
-- any local main checkout without needing a binary DB push (LFS-blocked until 2026-08-01).
--
-- Source: fable/modeller-lod400-livewire modeller/Garage_ARC.db, spatial_structure table, 6 rows
-- Apply:  sqlite3 modeller/Garage_ARC.db < prompts/Modeller/DISC_Walker/embed8_scripts/ROOM004_Garage_spatial_structure_carry.sql
-- Verify: sqlite3 modeller/Garage_ARC.db "SELECT COUNT(*) FROM spatial_structure"  -- expect 6
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS spatial_structure (guid TEXT, type TEXT, name TEXT, parent_guid TEXT,
                     object_type TEXT, predefined_type TEXT, center_x REAL, center_y REAL, center_z REAL,
                     size_x REAL, size_y REAL, size_z REAL); 

DELETE FROM spatial_structure;

INSERT INTO spatial_structure VALUES('STC_Exist_Garage_-_Ground_Level','IfcBuildingStorey','Exist Garage - Ground Level',NULL,'COMPILED',NULL,NULL,NULL,172.640160278776903,NULL,NULL,NULL);
INSERT INTO spatial_structure VALUES('RM_Exist_Garage_-_Ground_Level_1','IfcSpace','≈ Exist Garage - Ground Level R1','STC_Exist_Garage_-_Ground_Level','COMPILED','INTERNAL',192.318292145439272,113.196082230170759,172.640160278776903,16.0,9.60000000000000852,13.5146878624663635);
INSERT INTO spatial_structure VALUES('RM_Exist_Garage_-_Ground_Level_2','IfcSpace','≈ Exist Garage - Ground Level R2','STC_Exist_Garage_-_Ground_Level','COMPILED','INTERNAL',193.718292145439249,104.796082230170767,172.640160278776903,11.5999999999999943,3.59999999999999431,13.5146878624663635);
INSERT INTO spatial_structure VALUES('RM_Exist_Garage_-_Ground_Level_3','IfcSpace','≈ Exist Garage - Ground Level R3','STC_Exist_Garage_-_Ground_Level','COMPILED','INTERNAL',197.818292145439272,134.196082230170759,172.640160278776903,5.79999999999998294,0.799999999999982946,13.5146878624663635);
INSERT INTO spatial_structure VALUES('RM_Exist_Garage_-_Ground_Level_4','IfcSpace','≈ Exist Garage - Ground Level R4','STC_Exist_Garage_-_Ground_Level','COMPILED','INTERNAL',199.218292145439278,171.196082230170759,172.640160278776903,5.80000000000001136,2.0,13.5146878624663635);
INSERT INTO spatial_structure VALUES('RM_Exist_Garage_-_Ground_Level_5','IfcSpace','≈ Exist Garage - Ground Level R5','STC_Exist_Garage_-_Ground_Level','COMPILED','INTERNAL',200.318292145439272,155.596082230170765,172.640160278776903,0.799999999999982946,6.80000000000001136,13.5146878624663635);
