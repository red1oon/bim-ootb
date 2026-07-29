-- SampleCastle rel_fills_host — the authored host<->opening<->filling chain (§PATHB).
-- Self-heal patch, §LODHELL-FIX-3 (prompts/RESUME_MODELLER_LOD400_REAL_GEOMETRY.md §LODHELL-FIX).
--
-- WHY: SampleCastle_ARC.db predates extractIFCtoDB.py's extract_rel_fills_host() (:757), so it
-- shipped with no rel_fills_host table at all. That is the ONLY reason sdg_cascade.js
-- stretchRide() silently no-ops on this resident — not a missing relation in the source IFC.
-- Ifc2x3_SampleCastle.ifc carries 79 IfcRelVoidsElement / 74 IfcRelFillsElement; all 79 edges are
-- RECOVERED VERBATIM below (provenance 'ifc:recovered'), nothing derived, nothing proximity-guessed.
--
-- Generated 2026-07-27 from a clean re-extraction of internal/sources/Ifc2x3_SampleCastle.ifc
-- (witness W-LODHELL-CLASSIFY, 5 PASS). Idempotent: CREATE IF NOT EXISTS + INSERT OR IGNORE on the
-- opening_guid PRIMARY KEY, so re-applying on every open is a no-op. Schema matches the compiler's
-- own DDL (extractIFCtoDB.py :198).
--
-- MEASURED LIMIT, read before expecting a visible change: 65 of the 71 hosts are `kozijn` window-
-- frame walls whose body is 100% removed by their own opening (§VOID-CONSUMED) — they are correctly
-- absent from the scene, so fidByGuid[host_guid] is null and stretchRide skips them. Only 9 of the
-- 74 fills have BOTH ends present as scene features today. The table is the substrate; making a
-- void-consumed host participate as a non-rendered logical anchor is a separate design call.
CREATE TABLE IF NOT EXISTS rel_fills_host (
    opening_guid TEXT PRIMARY KEY,
    host_guid TEXT,
    filling_guid TEXT,
    host_class TEXT,
    filling_class TEXT,
    provenance TEXT DEFAULT 'ifc:recovered'
);
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('01l44l2PPl8f9P1d5P9HO9','1xkmYzLHD1VPKdNI8y8Me1','2boqH8yCb7me06TlnJm870','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('02KjFhRcI7CVZwDi31Zx0O','3V$ApEXsL4kuuKln_RMzx7','3RaVPvaOf64eZBU6WKpwMU','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('04QTF4MUScLSzbMHxktTdB','09Jnrvfpz0LhOau2puveUM','3UPz4qnhz6dR_hTWbylJYM','IfcBuildingElementProxy','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('06pCH1SYZ4TC9sXztIUIP6','0IIlOCBsj3HgQHK5iljQCT','1KInL01tD6DQPBVoxre2dQ','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('06zXvol68ifaSN6A2MPov0','1E7L0rbcP3b9T_kO_wpzXM','0MO3NBPw1FofnfwKUa2odt','IfcBuildingElementProxy','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0Dyqt$xH7lsEsHVNLZyqpz','27SAqTJ4n1cfkb4yN$O3Ny','2$G2$L_ZfD2xyYJh6wxmZd','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0E6im$l57EqHL09ReZxPHt','1X9_auq7fAKPab7CpdR8v7','3Y6cgtY0rEBQUJPUx_aPRF','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0GqtzXOkvIqfkJk8AbAagN','2X9Gop0bn3_x38P_1PGdAJ','2qY72vI$D0SenCZx1z6HDK','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0IEPamUddvmzAprJOQn4F0','06vshORsrEVvjbvNCwwl$2','1dnueTAkL0h8RlVLQtwd3w','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0SlGRK9ZOVUK9BtaMmgD2V','07o2mHpkH4_PxUBc290w3Z','2RXwC8nPLBKOSiamyBX0qt','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0UMmGnV463MLm2FMLl$rLX','32cOaJbaP9VOemKr9dYXtJ','1FtRH1k0bE4fyu_U9mJBmf','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0_CqIoZjW2apc6nSTYv2Dx','0LxscyRCL35PTDOLAAjfSI','1zWpVk7Az3eeFDJEw36Ky9','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0bF$T5u17dBe6R6oW2DaAi','0uG931DjD31hhRwgBkGmit','3vBRjYZSX1a8J6d0CTn4Yh','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0fsr4AdIiOgBwzfZa28r_o','0VctgvK$r7cwrBnu9fG$cA','38X2u$b_51PQbXrbF3UXq0','IfcBuildingElementProxy','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0jApD$0AtFJCJgOxoJd_ou','1hsZ5cIZbElRpA938d3ffl','0EWFPIrsv7_9lhqHOpPwsU','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0mwYDZf_8Aq2dXR0_oDKUO','0bPEvM_fn8SPrU2SioL4bx','3qYGwE1BDBbP2FWtfJUDNa','IfcBuildingElementProxy','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0u433U_mtqmy447tYAv_dE','2jJ$Htazn4wuzmZrbCCkR9',NULL,'IfcCovering',NULL,'ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0yeHirqI6mcF2qTQZ26WcN','2jJ$Htazn4wuzmZrbCCkR9',NULL,'IfcCovering',NULL,'ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('0zkPGJjLkL9gWCbwVvNqqA','3fvHYcQET4afRMl3etTK4F','26iMI7lnj4Rukyjg89OAF3','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('10_3QclYzmHVaIndGIkCXa','3u3z2zFojEchllTko9vkJ5','2EqkVNVRnBUvQjRlN4tm$r','IfcBuildingElementProxy','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('13Vvkc_yyjKxPao2AYC3C4','1WCZr3c7r05hqSejiWoWO4','1k3S_FTjr5YgVNsOxgXfqg','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1ClSPLKbrtgzKnGghFJfRG','0$YDCcbYPB0wRxDYucu1$k','0FcHfq3eXDUvB1x$PxjHW5','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1E_dUDvmJWCU7qbEHGNUFL','2SOFxehfn3JPJ42eH$gc$u','1jm08JDI1AxPr7MMlr69d8','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1Gu952rAxgbDp5TElOy2HF','0yZXVK6wf1RuZHbCnDbIWu','266hPy3$L5vfMXcAOOFF6p','IfcBuildingElementProxy','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1Gxll6B1U7YgSc0Q2yq5zA','1HTzx6dK99rxYirl5arG$b','27bh8yZhL8hPRD0H6aMxEY','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1HMu6$4nLPMJmbympAKWlh','1j6lJOCJrBfhwVjXcDrBMU','012S6Z0qLCRuoYXSZ2tygw','IfcBuildingElementProxy','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1LBU1tL8d9DEA9BhZ9gsuc','2iybqz3VH31hQztnwzJ_m7','0eASoFkCvD_OTC_ct3cBps','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1OVySEmHFHdipc8tHw$JoP','0Nj60ieO55uBt_I0iEvvde','1ktZHnXqP81AONft3VUKlo','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1TbD1hYlkRvhSw29VgOblT','1ZbRQwjUz9DQ98KhTax8G9','0xrZguOJ55xx5lucOklTa9','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1TuvwTbwpgOgwOQKGHCz13','0uG931DjD31hhRwgBkGmit','3kTNDXm3L6jgBFZ2taLcKJ','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1Waj0870YwDfcS4RQijrMr','1qSuEDSd1E8ftzFK1HXdBc','13lQ7MfpP9YQNh0Z31qoMP','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1WyXfW4Hqoowfe6PwyMRfW','0uG931DjD31hhRwgBkGmit','0xmEoRha9E$xhaP7dhI3oe','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1mgaTBo5Ej3i1I52D7Kd99','3C2fvEKUr00BlwuG1or05l',NULL,'IfcSlab',NULL,'ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1og9YKWY_EFKLC9YltQRUm','36fadt$IzDJQp5auYj8rIY','2aVhmg2N92hhv4rjQpPXmo','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1pxF$WIrY17zECdxnWQm2P','2qmQa8nAP39u6po5334l9v','0Nx0E1OHf1DuxTjjuUm2Ac','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1qrRkv3zXyuAMHWKz0fGJj','3XhijCDWT4ERsmhSDcEHtI','1dvN3gzSD4L9Bv2$zoJRLk','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1sNgiC090UdtFQO5npPFM2','0zCNq_mof6gPonl4mLYuLv','1WI7CxHKj8vQB6ZX1aG6wQ','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1sQQnxp4yO4HQpeAeQHvRT','1J9G$AMj5D8ePpFewsM_ee','2mNENoxwD4MQMQY_gKi$v7','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1slHY8IMUglWsYTrH3MaIp','01hUAhn2r989LDYSpRx4VK','2KQzcnl4P108p1xYLp2BcG','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1tknVQg$jcQGLlmYxhrZlq','2r4e5jHWfDKhLK$Is1u15D','3G$_TtmoH0i97AYiv2eBBu','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1tsM6iVjMm95VTODAaeqlL','0SzdhD7kXE$9LKStg07UwP','2KiBBLKs133RJOEnn$kg25','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1yiR6eAmST0jHLMQDwQyya','1qHBiNfAHCHhBLrRv9Uyf5','3upcShrCbFfh0jm4mYUUdu','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('1zo9HLxE57v4DmFM1Z7srY','0uG931DjD31hhRwgBkGmit','30Awpp2EX78eiSUY7FvQt3','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2$I6iiQ9n8n4TOgqMzA0SJ','0ZN2GJozT4VxCVh_WHtQyq','3lVtU7tjD3YOCLUfqajZ2A','IfcBuildingElementProxy','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('264dm_Wg0ghNBAsQyrjaUO','0uG931DjD31hhRwgBkGmit','3ZKKU$3lPCq8PEyTGjaGdU','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2FXfLj7BbJzgyZ2gjiLgfP','13hN5zL1L2fftXqB_Ac_WZ','2hVrKM8Vv2Xxs7m9ITda8L','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2GK2888FNUDebw1bXUxS3V','0GioG4iQzA1OyX4F47kc4a','1DmcUaFzzFFhg92TJQnxyJ','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2H8TFkE8qW1axTjo9SRRzr','3CRwhrtRn1UvX9iQV_OTuz','2GoKiXXxrC7g4IPoyQPZ2t','IfcBuildingElementProxy','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2Kc0O_KBDC0CH2mBZ6ePqI','3JaHyppKTBGBnjCpoJt74v','3WXd7RsH9CT9CRRwuhBxrU','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2YTu3steXE$WMJAsJFbg27','356ZU40Tn3tvjGsP5aWnKD','03lGFt1VjBDe6syvgmNFAy','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2ZPLYMlv$R69hry2mM7R2B','1J9G$AMj5D8ePpFewsM_ee','2wNrfbWo5F3AXCQjcATu9n','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2_5jthHi8DiV82sEu6QUir','1a3Bw$Plv1NBGNlNfFUZO_','0yGGfH85nFPvINarcAfBNX','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2jT_OTjZM5odqgM7jd8Qq2','0P9P2MTnDFWgpzAECWRMfc','0pZslPSAb8jBEsesxVZzu0','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2k0WVKunoAv_AIv2NCiO8z','03x61TFn1FxQHXFUNuParm','3vqhA9V$zD8Ri_tijsQ9Uy','IfcBuildingElementProxy','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2k7SwcvISjmPRfe9AnwmeV','23NrJ1a$r1DOY9eePDI0DJ','2$5nWI0fL8zwtrwndfa9MN','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2l7rgQIFSfxzKkno1Hi5D1','1i4_mvNgv86Pj97Vy1f2eY','2ri5H4RCf2ZuCMpo1Ccl52','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2qR9Q2qf_i3yhWEtsdkt4l','3TK6FSuO9AVg4wHo$O3IN3','140c7DVn1Fdgh5_iO2DSKg','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2sE8Ha8jZAEIetaRIzSZEf','3xum028un7c91eysAw7ToR','3topRXa9T1svryvk0HDA1V','IfcBuildingElementProxy','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2xicW6eU04O2vo5611eb6m','2_xwfAnHjEGheqbGUc$BD5','2Qc0XfkND1d86$Q97dSDkt','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('2yG6PjMsJCSw$wWoUwaY4R','3kQNZLqVfDcRRvBkM1IMS9',NULL,'IfcSlab',NULL,'ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('37zRds4ANdcvJxswLMHEbg','0vTAFL4d1DwxQSNiJxvejT','2YXmX7u6r4yOOh$kIa$Gd6','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3Don1s7QEHh1a2pb7mpkxv','3lUaefqT14jRJXPO$2osRB','178Zovd$P9MeTHI2jV$s2n','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3FJMSSB3ATVembQhvKe9QY','2jJ$Htazn4wuzmZrbCCkR9',NULL,'IfcCovering',NULL,'ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3GP9QYrbayq33qri5qyt2$','0I$ApwjMb2WhHUnG9PohvA','3LppQIb2j30xblkm5GtTTV','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3Ip6HsMyI1NcWFsDorI_mc','0FdLbmS_r6Ch8VPitxry03','0HKXdsxQDBXehvvnIH9Bj2','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3Loz87W2QU8ZXxJvmvicsl','2Hagr_o5nCPha8GzqG_2Pz','2tncJiXU52xOIwnI4dHkq$','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3M0D3egUMBYtAWLjf7ifyp','1tkaVzyOLEHRrk3ZXytZyO','0rEPlH2fP8YQ_q3GiazsFo','IfcBuildingElementProxy','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3OdfN$Ive1S0F$$8adHAnR','1ZbRQwjUz9DQ98KhTax8G9','3nUiG96vjAwPUR6jFmv$ZI','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3P4AXXdMqDfySyU5JAVKQq','1oHEx35PDDzQFKEx3RZUI5','2xD3QGjx90oAGyybkEra8b','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3QHlZ2Unwl2_E63a5CXgc4','0d193_IC94VBo0OC8YxmOX','39e5HG9Mz5bhpeErZLhRP4','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3V60v400XEBSLdGt9x8vAo','1A9aTEU4z9SwaqEUwI8Lx4','2vImyoNwX9iBXoTp4G3gAg','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3WMY5krdz54lIOHbK6cg3o','0A$dxBFCfD698O7H1hW$fd','2DaLEnOpD71xPKiE7SoDTP','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3aaZ34vTqUdH_lsBbTmw$t','1AtB01imf94g7vyKEx$EUO','0rOlpuy6fEpfuuqvscj$PW','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3ccxvIHVc_Chr3XroWbB9b','32BRu80e95IgL7sHEAaW4K','26_$0XSjr4qx6Hsbp36s4D','IfcWallStandardCase','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3ib8v8dl32P5kzhn6tXbk3','148inggZz0fAp_L7YGDBl6','0WtDl5Fx1CGO$F0RJCi8b$','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3qtaRtgoOJ4eB7z7birJTK','1V2qCAZ9rAp8VsEGyWln2v','1vWdN2kyHCyOFb8jrE1QwS','IfcBuildingElementProxy','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3tMTKSP5YJ505cjzpGpCoP','09R3x3btbEC9NWKCsQ9Ndr','1ZFLyNI$fDRgE2KgYahsry','IfcBuildingElementProxy','IfcDoor','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3wQwZtXMIt8MY6jmRmfYts','2T7$dTI398mR34m8VeIw4m','1PAxaJRu13gfudq_tpVBm7','IfcWallStandardCase','IfcWindow','ifc:recovered');
INSERT OR IGNORE INTO rel_fills_host (opening_guid,host_guid,filling_guid,host_class,filling_class,provenance) VALUES ('3zAMENWkMpWjVZBUxGGlNb','3bi7XzqxrAgvdZxFnRwTdg','1xjGgwmzP23uthLfXurB67','IfcWallStandardCase','IfcDoor','ifc:recovered');
