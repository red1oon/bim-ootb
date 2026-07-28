#!/usr/bin/env bash
# ifc_preflight_stats.sh — fast, non-invasive size/element/discipline probe for a raw .ifc file,
# meant to run BEFORE attempting to open a large IFC in the Modeller/Viewer (see
# prompts/IFC_LARGE_PRIVATE_STRESS_TEST.md, bim-compiler repo). One grep pass + one awk pass over
# the STEP text — no wasm parse, no browser, works at multi-GB scale in seconds.
#
# The product-type → discipline table below is a MANUAL MIRROR of viewer/import_worker.js's
# PRODUCT_TYPES + DISC_MAP (that's the browser's real classifier — this script never invents its
# own taxonomy). If those change, update the split() lists below to match.
#
# Known parity gaps vs the real in-browser parse (both make this an UPPER-BOUND/estimate, not the
# exact number the app would report):
#   - IfcFlowTerminal here always counts as MEP (DISC_MAP default). The app further disambiguates
#     it by element Name (sprinkler/light/diffuser/sanitary → FP/ELEC/ACMV/PLB, §FLOWTERM-REFINE)
#     which needs the wasm parser's attribute resolution, not a raw grep.
#   - discFromFilename() filename-suffix override (e.g. "_HEAT.ifc" forces HEAT) is not replicated
#     — none of the KUL files match that pattern, so it's a no-op for this set, but a future file
#     named that way would get a different discipline in the real app than this script reports.
#   - Counts every top-level STEP instance line; does not resolve IFCMAPPEDITEM-referenced repeats
#     the way the app's geometry dedup (FNV-1a) does, so raw entity counts can overstate rendered
#     geometry — see the GEOM_* lines, which are raw entity counts, not deduped mesh counts.
#
# Usage: ./ifc_preflight_stats.sh path/to/file.ifc

set -euo pipefail

f="${1:?usage: ifc_preflight_stats.sh <file.ifc>}"
[ -f "$f" ] || { echo "not found: $f" >&2; exit 1; }

size_bytes=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f")
size_mb=$(awk -v b="$size_bytes" 'BEGIN{printf "%.1f", b/1048576}')
echo "FILE=$f"
echo "SIZE_MB=$size_mb"

t0=$(date +%s.%N)
grep -oE '=IFC[A-Z0-9]+\(' "$f" | tr -d '=(' | awk '
  BEGIN {
    # ARC
    n=split("IFCWALL IFCWALLSTANDARDCASE IFCSLAB IFCDOOR IFCWINDOW IFCROOF IFCSTAIR IFCSTAIRFLIGHT " \
      "IFCRAILING IFCCOVERING IFCCURTAINWALL IFCPLATE IFCFURNISHINGELEMENT IFCBUILDINGELEMENTPROXY " \
      "IFCSPACE IFCFURNITURE IFCSYSTEMFURNITUREELEMENT IFCBUILDINGELEMENTPART IFCRAMP IFCRAMPFLIGHT " \
      "IFCTRANSPORTELEMENT IFCCONTROLLER IFCGEOGRAPHICELEMENT", a); for (i=1;i<=n;i++) disc[a[i]]="ARC";
    # STR
    n=split("IFCBEAM IFCCOLUMN IFCFOOTING IFCPILE IFCMEMBER IFCREINFORCINGBAR IFCREINFORCINGMESH " \
      "IFCTENDON IFCTENDONANCHOR", a); for (i=1;i<=n;i++) disc[a[i]]="STR";
    # ELEC
    n=split("IFCCABLESEGMENT IFCCABLECARRIERSEGMENT IFCCABLECARRIERFITTING IFCELECTRICAPPLIANCE " \
      "IFCLIGHTFIXTURE IFCOUTLET IFCJUNCTIONBOX IFCSWITCHINGDEVICE IFCELECTRICDISTRIBUTIONBOARD", a);
      for (i=1;i<=n;i++) disc[a[i]]="ELEC";
    # PLB
    n=split("IFCPIPESEGMENT IFCPIPEFITTING IFCSANITARYTERMINAL IFCVALVE IFCWASTETERMINAL " \
      "IFCSTACKTERMINAL", a); for (i=1;i<=n;i++) disc[a[i]]="PLB";
    # ACMV
    n=split("IFCDUCTSEGMENT IFCDUCTFITTING IFCAIRTERMINAL IFCAIRTERMINALBOX IFCUNITARYEQUIPMENT " \
      "IFCCOIL IFCFAN IFCCOMPRESSOR IFCCHILLER", a); for (i=1;i<=n;i++) disc[a[i]]="ACMV";
    # FP
    n=split("IFCFIRESUPPRESSIONTERMINAL IFCALARM", a); for (i=1;i<=n;i++) disc[a[i]]="FP";
    # MEP (generic)
    n=split("IFCFLOWSEGMENT IFCFLOWTERMINAL IFCFLOWFITTING IFCFLOWCONTROLLER IFCFLOWMOVINGDEVICE " \
      "IFCFLOWSTORAGEDEVICE IFCFLOWTREATMENTDEVICE IFCENERGYCONVERSIONDEVICE IFCDISTRIBUTIONELEMENT " \
      "IFCDISTRIBUTIONFLOWELEMENT IFCDISTRIBUTIONCONTROLELEMENT", a); for (i=1;i<=n;i++) disc[a[i]]="MEP";
  }
  {
    total++; typeCount[$0]++;
    if ($0 in disc) { elementCount++; discCount[disc[$0]]++ } else { otherCount++ }
  }
  END {
    print "TOTAL_STEP_ENTITIES=" total;
    print "ELEMENT_COUNT=" elementCount+0 "   # instances of PRODUCT_TYPES (import_worker.js parity)";
    printf "DISC_BREAKDOWN=";
    order="ARC STR ELEC PLB ACMV FP MEP"; ndisc=split(order, do_, " ");
    out="";
    for (i=1;i<=ndisc;i++) { d=do_[i]; if (discCount[d]+0 > 0) out=out d "=" discCount[d]+0 " "; }
    print out;
    print "GEOM_IFCPOLYLOOP=" typeCount["IFCPOLYLOOP"]+0;
    print "GEOM_IFCFACE=" typeCount["IFCFACE"]+0;
    print "GEOM_IFCCARTESIANPOINT=" typeCount["IFCCARTESIANPOINT"]+0;
    print "GEOM_IFCFACETEDBREP=" typeCount["IFCFACETEDBREP"]+0;
    # Instancing: IFCREPRESENTATIONMAP defines a shape ONCE; IFCMAPPEDITEM is a placed instance of
    # it (like a block insert). UNIQUE_SHAPE_DEFS is the real "how many distinct meshes" number —
    # ELEMENT_COUNT (placed elements) can be far higher than this when a catalog part repeats.
    # NOT every element goes through a mapped item — IFCEXTRUDEDAREASOLID direct/parametric solids
    # (walls, slabs, straight runs) are unique per placement and never show up in this reuse count.
    umap = typeCount["IFCREPRESENTATIONMAP"]+0; mitem = typeCount["IFCMAPPEDITEM"]+0;
    print "UNIQUE_SHAPE_DEFS(IFCREPRESENTATIONMAP)=" umap;
    print "INSTANCED_PLACEMENTS(IFCMAPPEDITEM)=" mitem;
    if (umap > 0) printf "AVG_REUSE_PER_SHAPE=%.1f\n", mitem/umap;
    print "DIRECT_PARAMETRIC_SOLIDS(IFCEXTRUDEDAREASOLID, not instanced)=" typeCount["IFCEXTRUDEDAREASOLID"]+0;
    print "OTHER_NON_PRODUCT_ENTITIES=" otherCount+0;
    print "DISTINCT_TYPES=" length(typeCount);
  }
'
t1=$(date +%s.%N)
awk -v t0="$t0" -v t1="$t1" 'BEGIN{printf "SCAN_SECONDS=%.1f\n", t1-t0}'
