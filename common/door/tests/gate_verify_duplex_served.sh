#!/usr/bin/env bash
# Verify step for oci_patch_gate.js: run the object witnesses on the UNPATCHED served Duplex (each witness applies the patch itself,
# through the Viewer's own loader), proving the bytes are the served object by content-md5. $GATE_DB is the gate's pre-patched copy,
# on which the Viewer witness's no-patch falsifier cannot hold.
set -euo pipefail
U=https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/buildings/Duplex_extracted.db
EXPECT='sHANmqrU2zgwa11XfgP44A=='          # the served object's content-md5 recorded by the gate's §GATE_SERVED_DB
D=$(mktemp -d); curl -s -o "$D/raw" "$U"
GOT=$(openssl md5 -binary "$D/raw" | base64)
[ "$GOT" = "$EXPECT" ] || { echo "§VERIFY_RAW md5 mismatch got=$GOT expect=$EXPECT"; exit 1; }
if [ "$(head -c2 "$D/raw" | xxd -p)" = "1f8b" ]; then gunzip -c "$D/raw" > "$D/served.db"; else cp "$D/raw" "$D/served.db"; fi
echo "§VERIFY_RAW served bytes md5=$GOT (= gate's served_db) elements=$(sqlite3 -readonly "$D/served.db" 'select count(*) from elements_meta') dictionary_tables=$(sqlite3 -readonly "$D/served.db" "select count(*) from sqlite_master where name='ad_table'")"
FIXTURE_DB="$D/served.db" node common/door/tests/witness_object_rung1.js
FIXTURE_DB="$D/served.db" node common/door/tests/witness_object_count.js
FIXTURE_DB="$D/served.db" node common/door/tests/witness_object_viewer.js
