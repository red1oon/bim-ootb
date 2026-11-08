#!/usr/bin/env bash
# build_odoo_agent_zip.sh — (re)build the self-sufficient odoo_agent.zip download bundle.
# Vendored deps (erp_kernel.js, odoo_adapter.js) come from the engine-lane source:
#   ../../../bim-compiler/scripts/{erp_kernel,odoo_adapter}.js  (source of truth)
# Run from anywhere; writes bim-ootb/erp/odoo_agent.zip. Deterministic (-X strips extra metadata).
set -euo pipefail

ERP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # …/bim-ootb/erp
SRC="$ERP_DIR/odoo_agent"
SCRIPTS="$ERP_DIR/../../bim-compiler/scripts"

# Re-vendor the engine-lane deps so the bundle never drifts from source.
if [ -d "$SCRIPTS" ]; then
  cp "$SCRIPTS/erp_kernel.js"   "$SRC/erp_kernel.js"
  cp "$SCRIPTS/odoo_adapter.js" "$SRC/odoo_adapter.js"
  echo "re-vendored erp_kernel.js + odoo_adapter.js from $SCRIPTS"
fi

cd "$ERP_DIR"
rm -f odoo_agent.zip
# Zip the folder (so it unzips to ./odoo_agent/). -X = no extra attrs for reproducibility.
zip -rX odoo_agent.zip odoo_agent \
  -x 'odoo_agent/node_modules/*' 'odoo_agent/odoo_chain.json'
# export.js writes the workbook with SheetJS: add the twin's own vendored copy (erp/xlsx.mini.min.js) into the bundle
#   under odoo_agent/ without keeping a second copy in the repo.
STAGE="$(mktemp -d)"; mkdir -p "$STAGE/odoo_agent"; cp "$ERP_DIR/xlsx.mini.min.js" "$STAGE/odoo_agent/"
(cd "$STAGE" && TZ=UTC touch -d '2022-01-01 00:00:00' odoo_agent/xlsx.mini.min.js && zip -X "$ERP_DIR/odoo_agent.zip" odoo_agent/xlsx.mini.min.js)
rm -rf "$STAGE"
echo "wrote $ERP_DIR/odoo_agent.zip ($(stat -c%s odoo_agent.zip) bytes)"
unzip -l odoo_agent.zip
