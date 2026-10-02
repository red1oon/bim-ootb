#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — verifier for oci_patch_gate.js --verify (prompts/FIND_ASK_ANSWERS.md §K.1).
# ISSUE IT PROVES OR DISPROVES: the cost patch could drop, alter or duplicate rows on the way from the
# live _extracted.db into the served _meta.db. PASS iff the patched meta DB's qto_cache equals the
# source's qto_cache row for row (and therefore in count and in every cost sum), AND re-applying the
# patch a second time changes nothing (no duplication).
# Usage: verify_qto_patch.py --gate-db <patched meta.db> (--src <extracted.db> | --src-url <live url>) --patch <patch.sql>
import argparse, gzip, shutil, sqlite3, subprocess, sys, tempfile

def rows(db):
    con = sqlite3.connect(db)
    cols = [r[1] for r in con.execute('PRAGMA table_info(qto_cache)')]
    return cols, sorted(con.execute('SELECT ' + ','.join(cols) + ' FROM qto_cache').fetchall(), key=repr)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--gate-db', required=True); ap.add_argument('--src'); ap.add_argument('--src-url'); ap.add_argument('--patch', required=True)
    a = ap.parse_args()
    if a.src_url:   # fetch the SOURCE itself from the bucket (served gzip-encoded; curl --compressed decodes)
        a.src = tempfile.mktemp(suffix='.db')
        subprocess.run(['curl', '-s', '--compressed', '-o', a.src, a.src_url], check=True)
        print('§QTO_VERIFY source fetched ' + a.src_url)
    sc, sr = rows(a.src)
    gc, gr = rows(a.gate_db)
    ok1 = sc == gc and sr == gr
    print('§QTO_VERIFY rows src=%d patched=%d colsMatch=%s rowsEqual=%s' % (len(sr), len(gr), sc == gc, sr == gr))
    tmp = tempfile.mktemp(suffix='.db'); shutil.copy(a.gate_db, tmp)
    con = sqlite3.connect(tmp); con.executescript(open(a.patch).read()); con.commit(); con.close()
    _, tr = rows(tmp)
    ok2 = tr == gr
    print('§QTO_VERIFY reapply rows=%d unchanged=%s' % (len(tr), ok2))
    con = sqlite3.connect(a.gate_db)
    s = con.execute('SELECT ROUND(SUM(material_cost)), ROUND(SUM(labour_cost)), ROUND(SUM(equipment_cost)) FROM qto_cache').fetchone()
    print('§QTO_VERIFY sums material=%s labour=%s equipment=%s' % s)
    print('§QTO_VERIFY ' + ('PASS' if ok1 and ok2 and sr else 'FAIL'))
    sys.exit(0 if ok1 and ok2 and sr else 1)

if __name__ == '__main__':
    main()
