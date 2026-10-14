# ⚠ DO NOT REMOVE — Milestone 6: W-MFG-POST — ⛔ BLOCKED (no oracle to extract from). Read this before touching it.

Parent row: "Issue, receipt and activity collectors post to resolved WIP and variance accounts with debits equal to credits. Break: unbalance one variance line."

## Why it is blocked (measured 2026-10-14)
- Reference iDempiere Postgres (GardenWorld): PP_Cost_Collector = 0 rows, PP_Cost_CollectorMA = 0, PP_Order_Cost = 0, Fact_Acct rows for AD_Table 53035 (PP_Cost_Collector) = 0.
  (The seed's 64 PP_Order_Cost rows belong to the BIM-generated orders MO-99xxxxx, not to a legacy posting.)
- Doc_CostCollector (Libero, the code that decides which account is debited/credited for an issue, receipt, activity, variance) is NOT in the local tree: core Doc.java only lists it in a comment (line 93, "330 - DocType fixed");
  no org.eevolution Java, no Libero jar, no running legacy server (ports 8080/8443 closed) to create a collector and read the resulting Fact_Acct.
- Therefore the DR/CR pairing per collector type has NO extractable source. Writing it from general cost-accounting knowledge would be invention (PRIME RULE) and a possible twin divergence (CARDINAL RULE).

## What IS extractable and already measured
- Account ROLES exist physically: m_product_acct and c_acctschema_default both carry p_wip_acct, p_methodchangevariance_acct, p_usagevariance_acct, p_ratevariance_acct, p_mixvariance_acct, p_floorstock_acct,
  p_costofproduction_acct, p_labor_acct, p_burden_acct, p_outsideprocessing_acct, p_overhead_acct, p_scrap_acct (+ p_asset_acct, p_cogs_acct...). m_product_acct: 110 rows, 53 with p_wip_acct set.
  (AD_Column carries only 13 of these P_* columns for M_Product_Acct; the Libero ones are physical-only in the seed.)
- The balance invariant and the write path exist: kernel POST verb (erp_kernel.js:148) refuses an unbalanced batch (SUM DR == SUM CR to the cent) before any write.
- The wip_token plugin (plugins/wip_token.mjs) resolves {Production.WIP} from the seed (rule 7 precedent).

## THE ONE QUESTION
Where may the Doc_CostCollector posting rules be extracted from: (a) the Libero source / jar, or a running legacy iDempiere with the Libero plugin where one collector of each type can be created and posted so Fact_Acct is the oracle;
or (b) do you want a rules table written from standard-cost-accounting knowledge, shipped explicitly marked UNVERIFIED (witness prints INCONCLUSIVE-vs-legacy, not PASS)?
Until answered, M6 and the milestone that depends on collectors (M9 W-MFG-TRACE) are not started. M7, M8, M10 do not depend on it.
