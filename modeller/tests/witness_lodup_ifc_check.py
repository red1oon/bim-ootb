#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — python half of W-LODUP-IFC (modeller/tests/witness_lodup_ifc.js). Read the log after every run; the exit code is not evidence.
# Spec: prompts/MODELLER_LOD_UPGRADE_PILL.md "P7 SPEC". Issue it proves or disproves: "the browser add-on IFC is not a valid IFC, or sits somewhere other than the proven Python add-on IFC".
# Usage: witness_lodup_ifc_check.py <mine.ifc> [<oracle.ifc>] [--tol-mm 1.0] [--ignore-pset Rule,...]   (--ignore-pset: Pset properties whose TEXT is a known, declared difference; they are counted and printed, never silent)
#   VALIDATE  ifcopenshell.validate on the browser file: 0 errors required.
#   SOLIDS    every written solid closed and consistently wound with a positive volume (read back from the file, as the oracle's own witness).
#   BBOX      (with an oracle file) every product, matched by GlobalId, its world bounding box within --tol-mm of the oracle's: the placement chain (site, building, storey, product) is applied on both.
#   ATTRS     (with an oracle file) per matched product: Name / Description / Tag equal; IfcReinforcingBar NominalDiameter / CrossSectionArea equal, BarLength within 0.01 mm, BarRole / PredefinedType equal;
#             the Pset BIMC_Upgrade properties equal (the rounded BarLength min / max within 0.1 mm).
# Exit 77 = ifcopenshell not installed (the node witness reports SKIP, never PASS). Reads both files read-only. Prints §LODUP_IFC_PY_* lines.
import sys, math, collections
try:
    import numpy as np
    import ifcopenshell, ifcopenshell.validate, ifcopenshell.util.placement as uplace
except Exception as e:
    print('§LODUP_IFC_PY SKIP ifcopenshell / numpy not importable: %s' % e); sys.exit(77)

args = [a for a in sys.argv[1:] if not a.startswith('--')]; tol = 1.0; ignore = set()
if '--tol-mm' in sys.argv: tol = float(sys.argv[sys.argv.index('--tol-mm') + 1]); args = [a for a in args if a != str(sys.argv[sys.argv.index('--tol-mm') + 1])]
if '--ignore-pset' in sys.argv: val = sys.argv[sys.argv.index('--ignore-pset') + 1]; ignore = set(val.split(',')); args = [a for a in args if a != val]
mine_p = args[0]; ora_p = args[1] if len(args) > 1 else None
bad_total = 0

def verdict(tag, ok, inconclusive=False):
    return 'INCONCLUSIVE' if inconclusive else ('PASS' if ok else 'FAIL')

f = ifcopenshell.open(mine_p)
log = ifcopenshell.validate.json_logger(); ifcopenshell.validate.validate(f, log)
v = verdict('VALIDATE', not log.statements)
print('§LODUP_IFC_PY_VALIDATE schema=%s roots=%d validate_errors=%d -> %s' % (f.schema, len(f.by_type('IfcRoot')), len(log.statements), v))
for s in log.statements[:5]: print('   §LODUP_IFC_PY_SCHEMA_ERROR', str(s)[:260])
if v == 'FAIL': bad_total += 1

def edges_ok(tris):
    E = collections.Counter(); vol = 0.0
    for P in tris:
        for k in range(3): E[(P[k], P[(k + 1) % 3])] += 1
        a, b, c = (np.array(x) for x in P); vol += a @ np.cross(b, c) / 6
    return all(E[(q, p)] == 1 for (p, q) in E) and all(x == 1 for x in E.values()), vol

bad = collections.Counter(); nsol = 0
if f.schema == 'IFC2X3':
    for b in f.by_type('IfcFacetedBrep'):
        nsol += 1; ok, vol = edges_ok([[tuple(p.Coordinates) for p in fc.Bounds[0].Bound.Polygon] for fc in b.Outer.CfsFaces])
        if not ok: bad['not closed or not consistently wound'] += 1
        elif vol <= 0: bad['inside out (volume <= 0)'] += 1
else:
    for fs in f.by_type('IfcTriangulatedFaceSet'):
        nsol += 1; pts = [tuple(p) for p in fs.Coordinates.CoordList]; ok, vol = edges_ok([[pts[i - 1] for i in t] for t in fs.CoordIndex])
        if not ok: bad['not closed or not consistently wound'] += 1
        elif vol <= 0: bad['inside out (volume <= 0)'] += 1
v = verdict('SOLIDS', not bad, not nsol)
print('§LODUP_IFC_PY_SOLIDS %s=%d invalid=%d %s -> %s' % ('breps' if f.schema == 'IFC2X3' else 'facesets', nsol, sum(bad.values()), dict(bad), v))
if v == 'FAIL': bad_total += 1

def bbox(prod):
    if not prod.Representation: return None
    M = np.array(uplace.get_local_placement(prod.ObjectPlacement), float); pts = []
    for rep in prod.Representation.Representations:
        for it in rep.Items:
            if it.is_a('IfcFacetedBrep'):
                seen = {}
                for fc in it.Outer.CfsFaces:
                    for p in fc.Bounds[0].Bound.Polygon: seen[p.id()] = p.Coordinates
                pts.extend(seen.values())
            elif it.is_a('IfcTriangulatedFaceSet'): pts.extend(tuple(p) for p in it.Coordinates.CoordList)
    if not pts: return None
    P = np.array(pts, float); W = (np.c_[P, np.ones(len(P))] @ M.T)[:, :3]; return W.min(0), W.max(0)

if ora_p:
    g = ifcopenshell.open(ora_p); mine = {p.GlobalId: p for p in f.by_type('IfcProduct') if p.Representation}; ora = {p.GlobalId: p for p in g.by_type('IfcProduct') if p.Representation}
    only_m = sorted(set(mine) - set(ora)); only_o = sorted(set(ora) - set(mine)); worst = 0.0; over = 0; n = 0; nobb = 0
    for gid in sorted(set(mine) & set(ora)):
        a = bbox(mine[gid]); b = bbox(ora[gid])
        if a is None or b is None: nobb += 1; continue
        d = max(float(np.abs(a[0] - b[0]).max()), float(np.abs(a[1] - b[1]).max())) * 1000.0; n += 1; worst = max(worst, d); over += d > tol
    v = verdict('BBOX', not only_m and not only_o and not over and n > 0, n == 0)
    print('§LODUP_IFC_PY_BBOX products_mine=%d products_oracle=%d compared=%d only_in_mine=%d only_in_oracle=%d no_geometry=%d max_mm=%.4f over_tol=%d tol_mm=%g -> %s' % (len(mine), len(ora), n, len(only_m), len(only_o), nobb, worst, over, tol, v))
    if v == 'FAIL': bad_total += 1
    # attributes and the BIMC_Upgrade pset
    def pset(prod):
        for r in prod.IsDefinedBy:
            if r.is_a('IfcRelDefinesByProperties') and r.RelatingPropertyDefinition.Name == 'BIMC_Upgrade':
                return {p.Name: (p.NominalValue.wrappedValue if p.NominalValue is not None else None) for p in r.RelatingPropertyDefinition.HasProperties}
        return None
    diffs = []; nattr = 0; ignored = collections.Counter()
    for gid in sorted(set(mine) & set(ora)):
        a, b = mine[gid], ora[gid]; nattr += 1
        for k in ('Name', 'Description', 'Tag'):
            if getattr(a, k, None) != getattr(b, k, None): diffs.append((gid, k, getattr(a, k, None), getattr(b, k, None)))
        if a.is_a('IfcReinforcingBar'):
            for k, t in (('NominalDiameter', 1e-12), ('CrossSectionArea', 1e-12), ('BarLength', 1e-5)):
                x, y = getattr(a, k), getattr(b, k)
                if (x is None) != (y is None) or (x is not None and abs(x - y) > t): diffs.append((gid, k, x, y))
            for k in ('BarRole', 'PredefinedType', 'SteelGrade'):
                if hasattr(a, k) and getattr(a, k) != getattr(b, k): diffs.append((gid, k, getattr(a, k), getattr(b, k)))
        pa, pb = pset(a), pset(b)
        if pa is None or pb is None:
            if pa != pb: diffs.append((gid, 'BIMC_Upgrade present', pa is not None, pb is not None))
        else:
            for k in sorted(set(pa) | set(pb)):
                x, y = pa.get(k), pb.get(k)
                if k in ignore:
                    if x != y: ignored[k] += 1
                    continue
                if isinstance(x, float) and isinstance(y, float):
                    if abs(x - y) > (0.1 if k.startswith('BarLength') else 1e-9): diffs.append((gid, 'pset ' + k, x, y))
                elif x != y: diffs.append((gid, 'pset ' + k, x, y))
    v = verdict('ATTRS', not diffs, nattr == 0)
    print('§LODUP_IFC_PY_ATTRS products_compared=%d differences=%d declared_text_differences_ignored=%s -> %s' % (nattr, len(diffs), dict(ignored), v))
    for d in diffs[:6]: print('   §LODUP_IFC_PY_ATTR_DIFF', str(d)[:300])
    if v == 'FAIL': bad_total += 1
sys.exit(1 if bad_total else 0)
