-- LTU_AHouse_meta.db patch. The §META_TRANSFORM_REPAIR block that used to open this file was withdrawn from production on 2026-08-27
-- (bim-compiler prompts/LTU_TERMINAL_CLINIC_RENDER_CORRUPTION.md: the bucket's copy of this patch was deleted, and the served pair was
-- re-imported 2026-08-29 with no elements_rtree, so that block made the WHOLE patch roll back on the served db — 4D_MODEL_INTEGRITY.md §Q.36.5).
-- It is removed here so the repo file is the file the bucket serves.
-- >>> BEGIN §IFC_STOREYS (tools/ifc_storeys_patch.py over the nine LTU_AHouse_*.ifc — regenerated block, do not hand-edit)
-- §IFC_STOREYS LTU_AHouse (2026-11-20, bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.36): the served DB kept the 38 IfcBuildingStorey rows without their
-- Elevation, so the scheduler had no declared floor ladder (§STOREY_DATUM mode=INFERRED) and ranked 18 storey names from nine files as 18 floors.
-- Every value is the file's own IfcBuildingStorey.Elevation x its IfcSIUnit prefix (MILLI). Idempotent (DELETE then INSERT). Witness: viewer/tests/witness_ifc_storeys.js.
CREATE TABLE IF NOT EXISTS storey_elevation (guid TEXT PRIMARY KEY, name TEXT, elevation_attr_m REAL, placement_z_m REAL);
DELETE FROM storey_elevation;
INSERT OR REPLACE INTO storey_elevation VALUES ('283h$UFSbCRQ_YecPi6c9x','Plan 1',2.7,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('22ywWYBIvEBejzhqMHcIKE','Plan 2',6.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('16QMKiUiT8juVcHVXXJJyO','Plan 3',9.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('0gH7g8U3z5g8xfJvSPBni7','Plan 4',12.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('3u1F9tzqfKGPmdleI68DDF','VÅNING 1',2.7,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('0QZ2nT0pt_GhHRPCDoudN$','VÅNING 2',6.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('0DDM9OSx57qAYSj0etQ5l3','VÅNING 3',9.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('3YIjd6NADFjuC8pZvds$9j','VÅNING 4',12.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('3vc3IvvDf5L9BeJSrdTD_M','TAKPLAN',15.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('0lH3QX7ZL04PrIH9kuIC7w','Plan 1',2.7,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('3W0U0$OJP7svcIi_WNSSVD','Plan 2',6.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('18$VYR6FLDVwIbtl3S$1QG','Plan 3',9.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('3TsIrlGIH9YgIagirgPDN6','Plan 4',12.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('2_gbY5Fxr7bxdxYI4APnST','Storey 1',2.7,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('2jFcDRNcr8suK_fPub973n','Storey 2',6.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('3zzqLnElzEN86hc0EMVt4c','Storey 3',9.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('0$1gnQTXHDkRH8fb_NXSpH','Plan 1',2.7,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('2CjrsWVJn6N8KnL0trl$KD','Plan 2',6.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('3VNjSC8evBLh3fK7XOekvC','Plan 3',9.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('2eikGomvH6weQiPpei6CLF','Plan 4',12.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('1Ks2kfClX4pvtcSFIZZqkO','Plan 1',2.7,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('2a9CRd7cL61AqQJ88TG8ry','Plan 2',6.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('1vk9II0dnEMR1cunpU5iY8','Plan 3',9.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('0EChi_vij2OAQF4FpA_Vff','Plan 4',12.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('0Whp6ssR9EUB1kh_fVIObT','Plan 1',2.7,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('1fCS0CVzrBrRN4Rd6LWunP','Plan 2',6.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('3AXoFu9p54sRdXXK1tjRpR','Plan 3',9.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('1Zqif0dkvFjhnheKsER1n7','Plan 4',12.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('26KgxLfQbAE91dFYrs7klg','Ref.',0.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('26KgxLfQbAE91dFYrs7TUh','VÅN 1',2.7,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('26KgxLfQbAE91dFYrs7TmR','VÅN 2',6.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('26KgxLfQbAE91dFYrs6Jvu','VÅN 3',9.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('26KgxLfQbAE91dFYrs6Jvf','VÅN 4',12.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('26KgxLfQbAE91dFYrs4Y80','VÅN 5',16.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('2YIjcNuaz5RAIaAFh6TiaZ','Plan 1',2.7,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('3ZzewyFMvF1uqebha9CI7m','Plan 2',6.0,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('3qeagLlTf1ePT97VQriyHR','Plan 3',9.3,NULL);
INSERT OR REPLACE INTO storey_elevation VALUES ('0u7LO27G92RxhTl497vv4J','Plan 4',12.3,NULL);
-- <<< END §IFC_STOREYS
