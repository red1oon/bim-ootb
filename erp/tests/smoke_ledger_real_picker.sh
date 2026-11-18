#!/bin/sh
# ⚠ DO NOT REMOVE — runs W-LEDGER-REAL (bim-compiler prompts/CLI_ERP_IVR.md §57) on a VIRTUAL display (Xvfb), never the owner's screen.
#   env -u DBUS_SESSION_BUS_ADDRESS keeps Chromium from sending its folder dialog to the owner's desktop portal; GTK_USE_PORTAL=0 makes it use its own GTK dialog on the virtual display.
#   xkeys.py refuses to type into any display but the virtual one (XKEYS_ALLOW). Read the §-log; the verdict line is §WITNESS_LEDGER_REAL.
cd "$(dirname "$0")/../.." || exit 2
exec env -u DBUS_SESSION_BUS_ADDRESS GTK_USE_PORTAL=0 xvfb-run -a -s "-screen 0 1280x900x24" sh -c 'XKEYS_ALLOW=$DISPLAY exec node erp/tests/witness_ledger_real.js'
