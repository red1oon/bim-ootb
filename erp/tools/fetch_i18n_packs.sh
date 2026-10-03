#!/bin/bash
# ⚠ DO NOT REMOVE — Scope: fetch the published iDempiere / ADempiere language packs that tools/build_i18n.py extracts
#   erp/i18n/<lang>.json from (bim-compiler prompts/ERP_UI_LOCALES.md §L2). Every source is pinned (commit or dated
#   release file). Output goes to $ERP_TRL_CACHE (default ~/.cache/erp_trl) — never into the repo. Read the
#   §I18N-FETCH lines after a run; a missing source is a FAIL line, not a silent skip.
# Also exports ad_message_base.csv (AD_Message ID → Value/MsgText) from the local iDempiere 12 Postgres (docker
#   container `postgres`), because the packs key AD_Message rows by ID while the page looks messages up by Value.
# RAR (the 2008 Arabic pack) is unpacked with node-unrar-js (npm, pure JS) — no system unrar needed.
set -uo pipefail
TOOLS="$(cd "$(dirname "$0")" && pwd)"
C="${ERP_TRL_CACHE:-$HOME/.cache/erp_trl}"; mkdir -p "$C"; cd "$C" || exit 1
SF=https://downloads.sourceforge.net/project/adempiere/Language%20Packs
ok() { echo "§I18N-FETCH ok $*"; }; bad() { echo "§I18N-FETCH FAIL $*"; }
gh_pin() {   # dir repo commit [sparse-path]
  local d=$1 r=$2 c=$3 sp=${4:-}
  if [ ! -d "$d/.git" ]; then
    if [ -n "$sp" ]; then git clone -q --filter=blob:none --sparse "https://github.com/$r" "$d" && git -C "$d" sparse-checkout set "$sp"
    else git clone -q "https://github.com/$r" "$d"; fi
  fi
  git -C "$d" fetch -q origin "$c" 2>/dev/null; git -C "$d" checkout -q "$c" 2>/dev/null
  [ "$(git -C "$d" rev-parse HEAD)" = "$c" ] && ok "$r@$c" || bad "$r want $c have $(git -C "$d" rev-parse HEAD 2>/dev/null)"
}
gh_pin nmicoud_fr_FR nmicoud/fr_FR 17bbc28b0f9a1a73fdb575e44ff58d148e359984
gh_pin gq globalqss/globalqss-idempiere-lco 31b1442b7656db8b011a5b713524452425255af2 es_CO
gh_pin bxservice_tbayen.translations bxservice/tbayen.translations c88fe31960b8dc6b527d7a64d74ac052a3f4e848
gh_pin djoudi_ar_DZ djoudi/ar_DZ d1c2c3dcb5f9551d2dac9bbc58eeae374c35a348
gh_pin JPiere_japanese-translation JPiere/japanese-translation b5547855eebd5bcf96562bbc14f414790038c1ff
sf() {   # file url dir unpack
  local f=$1 u=$2 d=$3
  [ -s "$f" ] || curl -sfL -o "$f" "$u" || { bad "$u"; return; }
  mkdir -p "$d"
  case "$f" in
    *.zip) unzip -qo "$f" -d "$d" ;;
    *.tgz) tar -xzf "$f" -C "$d" ;;
    *.rar) if [ "$(find "$d" -name "*.xml" | wc -l)" = 0 ]; then node "$TOOLS/unrar.mjs" "$f" "$d" >/dev/null 2>&1 || { bad "unrar $f (npm i node-unrar-js@2 where node resolves it)"; return; }; fi ;;
  esac
  ok "$f $(sha256sum "$f" | cut -c1-16) → $d ($(find "$d" -name '*.xml' | wc -l) xml)"
}
sf ms_MY.zip "$SF/Bahasa%20Malaysia/First%20Bahasa%20Release%20-%20Beta/ms_MY.zip" x_ms_MY
sf th_TH.350.zip "$SF/Thailand/ADempiere%20Thai%20Language/th_TH.350.zip" x_th_TH.350
sf zh_CN.zip "$SF/Chinese/Release%20352%20Packages/zh_CN.zip" x_zh_CN
sf fr352.tgz "$SF/Francais/Latest%20Stable%20and%20Alpha/adempiere_fr_FR_352.tgz" x_fr352
sf ar_najeh.rar "$SF/Arabic/Beta%20Release%20by%20Najeh/arabic_language_By_Najeh.rar" x_ar
if docker exec postgres true 2>/dev/null; then
  docker exec postgres psql -U adempiere -d idempiere -At -c "copy (select ad_message_id, value, msgtext, msgtype from adempiere.ad_message where isactive='Y' order by 1) to stdout with csv header" > ad_message_base.csv \
    && ok "ad_message_base.csv $(($(wc -l < ad_message_base.csv)-1)) rows (iDempiere $(docker exec postgres psql -U adempiere -d idempiere -At -c 'select version from adempiere.ad_system'))"
else
  [ -s ad_message_base.csv ] && ok "ad_message_base.csv (cached; postgres container not running)" || bad "ad_message_base.csv — start the iDempiere postgres container"
fi
