#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — scope: prompts/BUILDINGSMART_IFC_SCHEMA_CLASSIFICATION.md §P1. One-time (regenerate
# -on-demand) dump of the REAL buildingSMART IFC EXPRESS schema entity hierarchy, walked via
# `ifcopenshell`'s compiled schema (verified byte-identical to a direct grep of buildingSMART's own
# published .exp files for the 4 §GROUND TRUTH classes — see the spec's §THE WEBFETCH LESSON: this
# script uses the compiled library directly, never an AI summary of a fetched page).
#
# Emits viewer/rates/ifc_schema_hierarchy.json: {"ClassName": ["ImmediateParent", ..., "IfcRoot"], ...}
# for every real IFC entity, consumed by matchRule()'s NEW tier-2 schema-ancestor fallback in
# viewer/schedule_author.js + viewer/time_machine.js (×2) — walk a class's real ancestor chain until
# one IS explicitly classified in SEQUENCE_RULES, instead of silently defaulting.
#
# §OPEN QUESTION resolved (schema version): do NOT assume IFC4-only. Checked this project's own
# extraction pipeline (~/bim-compiler/DAGCompiler/python/extractIFCtoDB.py) — it opens whatever
# schema the source .ifc file declares (`ifcopenshell.open(ifc_path)` then reads `.schema` back,
# no version gating) and split_ifc_by_discipline.py's `_detect_schema()` reads FILE_SCHEMA from the
# header with an IFC2X3 default — both are schema-agnostic by design, not IFC4-locked. Direct grep
# of this worktree's own real fixtures confirms BOTH versions are genuinely in use, not hypothetical:
#   IFC/SampleHouse_ARC.ifc            FILE_SCHEMA(('IFC4'))
#   IFC/Duplex_ARC.ifc                 FILE_SCHEMA(('IFC2X3'))
#   tests/fixtures/Vogel_Gesamt_upgraded.ifc  FILE_SCHEMA(('IFC2X3'))
# extractIFCtoDB.py also carries an explicit "IFC4X3 Infrastructure disciplines" class→discipline
# map (line ~375: IfcRoad/IfcRailway/IfcBridge/... — GIS/ROAD/RAIL/BRIDGE/TUNNEL/MARINE/INFRA), i.e.
# the pipeline is already written expecting IFC4X3 infra classes to show up, even with no IFC4X3
# fixture in this worktree today. So this dump covers all three: IFC2X3, IFC4, IFC4X3_ADD2 (the
# same ADD2/TC1 flavor the spec's own §GROUND TRUTH source URL uses for IFC4).
#
# §MERGE STRATEGY (extracted DBs do not retain which schema version sourced them — elements_meta has
# no schema/version column, confirmed by reading its CREATE TABLE — so the runtime lookup cannot pick
# a per-element schema; a single flat class->chain map is required). For each entity name, priority
# IFC4 > IFC2X3 > IFC4X3_ADD2 (IFC4 is buildingSMART's flagship/most complete of the three, and is
# the version this project's own §GROUND TRUTH table was verified against). A class absent from IFC4
# falls through to whichever of IFC2X3/IFC4X3 declares it. Real, measured divergence: of the 539
# entity names common to IFC2X3+IFC4, 94 have a different ancestor chain between the two versions (14
# of those are IfcProduct-subtype "physical" classes — e.g. IfcBuildingStorey/IfcSite/IfcSpace gain an
# intermediate IfcSpatialElement in IFC4, IfcReinforcingBar's IfcBuildingElementComponent parent was
# renamed IfcElementComponent in IFC4) — every one of these is EITHER an added intermediate node OR a
# rename, never a change to whether the chain eventually reaches a classified ancestor or IfcRoot, so
# the IFC4-priority merge cannot turn a resolvable classification into an unresolvable one. 114 classes
# exist ONLY in IFC2X3 (pre-IFC4 deprecated types), 116 ONLY in IFC4X3 (infra) — both sets need their
# own source version's chain since IFC4 has no entry for them at all. This is a real, checked schema
# fact (see the counts logged below), not a guess.
#
# Usage:
#   python3 tools/dump_ifc_schema_hierarchy.py
#   python3 tools/dump_ifc_schema_hierarchy.py -o /tmp/custom_out.json
"""Walk every ENTITY in IFC2X3 + IFC4 + IFC4X3_ADD2 and emit a merged class -> ancestor-chain JSON."""

import argparse
import json
import os
import sys

SCHEMA_VERSIONS = ['IFC4', 'IFC2X3', 'IFC4X3_ADD2']  # merge priority order, first wins on conflict

# §GROUND TRUTH — the spec's own verified table (BUILDINGSMART_IFC_SCHEMA_CLASSIFICATION.md
# §GROUND TRUTH), re-asserted here as a hard regression check on this script's own output before it
# is trusted. If any of these fail, the dump is wrong — stop, do not write the JSON.
GROUND_TRUTH = {
    'IfcSwitchingDevice': 'IfcFlowController',
    'IfcSensorType': 'IfcDistributionControlElementType',
    'IfcFlowInstrumentType': 'IfcDistributionControlElementType',
    'IfcSpace': 'IfcSpatialStructureElement',
}
# IfcSpace must NOT pass through IfcElement (the physical/spatial distinction the spec calls out).
GROUND_TRUTH_EXCLUDES = {
    'IfcSpace': 'IfcElement',
}


def _entity_declarations(schema):
    """All real ENTITY declarations in a schema (excludes enum/type/select declarations)."""
    return [d for d in schema.declarations() if type(d).__name__ == 'entity']


def _ancestor_chain(decl):
    """Immediate parent first, IfcRoot (or whatever the chain terminates at) last."""
    chain = []
    sup = decl.supertype()
    while sup:
        chain.append(sup.name())
        sup = sup.supertype()
    return chain


def dump_schema_hierarchy():
    import ifcopenshell.ifcopenshell_wrapper as W

    per_version = {}
    counts = {}
    for version in SCHEMA_VERSIONS:
        schema = W.schema_by_name(version)
        ents = _entity_declarations(schema)
        chains = {}
        for d in ents:
            chains[d.name()] = _ancestor_chain(d)
        per_version[version] = chains
        counts[version] = len(chains)
        print(f"  §SCHEMA_WALK version={version} entities={len(chains)}")

    # Merge: IFC4 first (priority order), fill in any class missing from earlier versions.
    merged = {}
    source_of = {}
    for version in SCHEMA_VERSIONS:
        for cls, chain in per_version[version].items():
            if cls not in merged:
                merged[cls] = chain
                source_of[cls] = version

    only_in = {v: 0 for v in SCHEMA_VERSIONS}
    for cls, v in source_of.items():
        only_in[v] += 1
    print(f"  §SCHEMA_MERGE total_classes={len(merged)} "
          + ' '.join(f'{v}_contributed={only_in[v]}' for v in SCHEMA_VERSIONS))

    return merged


def verify_ground_truth(merged):
    """Regression check against the spec's own §GROUND TRUTH table — abort on any failure."""
    ok = True
    for cls, expected_parent in GROUND_TRUTH.items():
        chain = merged.get(cls)
        if chain is None:
            print(f"  §GROUND_TRUTH_FAIL cls={cls} not found in merged hierarchy at all")
            ok = False
            continue
        if not chain or chain[0] != expected_parent:
            print(f"  §GROUND_TRUTH_FAIL cls={cls} immediate_parent={chain[0] if chain else None} "
                  f"expected={expected_parent} full_chain={chain}")
            ok = False
        else:
            print(f"  §GROUND_TRUTH_OK cls={cls} -> {chain[0]} ... {chain[-1]} (len={len(chain)})")
    for cls, excluded in GROUND_TRUTH_EXCLUDES.items():
        chain = merged.get(cls, [])
        if excluded in chain:
            print(f"  §GROUND_TRUTH_FAIL cls={cls} chain WRONGLY passes through {excluded}: {chain}")
            ok = False
        else:
            print(f"  §GROUND_TRUTH_OK cls={cls} correctly does NOT pass through {excluded}")
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    default_out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                'viewer', 'rates', 'ifc_schema_hierarchy.json')
    ap.add_argument('-o', '--out', default=default_out,
                     help='Output JSON path (default: viewer/rates/ifc_schema_hierarchy.json)')
    args = ap.parse_args()

    print("§SCHEMA_DUMP_START versions=" + ','.join(SCHEMA_VERSIONS))
    merged = dump_schema_hierarchy()

    if not verify_ground_truth(merged):
        print("§SCHEMA_DUMP_ABORT ground-truth regression check FAILED — not writing output")
        return 1

    out_obj = {
        '_meta': {
            'generated_by': 'tools/dump_ifc_schema_hierarchy.py',
            'schema_versions': SCHEMA_VERSIONS,
            'merge_priority': SCHEMA_VERSIONS,
            'total_classes': len(merged),
            'note': ('class -> [ImmediateParent, ..., IfcRoot]. Merged across IFC2X3+IFC4+IFC4X3_ADD2 '
                     '(IFC4-priority; a class absent from IFC4 uses IFC2X3 then IFC4X3_ADD2). '
                     'Regenerate via: python3 tools/dump_ifc_schema_hierarchy.py'),
        },
    }
    out_obj.update(merged)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w') as f:
        json.dump(out_obj, f, indent=1, sort_keys=True)

    print(f"§SCHEMA_DUMP_DONE out={args.out} classes={len(merged)} "
          f"bytes={os.path.getsize(args.out)}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
