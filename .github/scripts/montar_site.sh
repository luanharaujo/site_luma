#!/usr/bin/env bash
# Assemble the published site: cover from this repo + each part (treinos, adm)
# from a versioned release "parte-<name>-<sha7>" (asset <name>.tar.gz) built by
# the part's own repo. The parts no longer live in this repo.
#
# Which version of each part goes live (first that applies):
#   1. VERSAO_<PARTE>: tag typed in a manual run of the workflow (workflow_dispatch)
#   2. PIN_<PARTE>: repo variable that pins the part (rollback that sticks). While
#      it is set, dispatches from either part keep this version live.
#   3. DISPATCH_PARTE/DISPATCH_TAG: the release that triggered this run
#   4. the most recently published release of that part that is not a draft and
#      has its asset uploaded (rules in versoes.jq)
# Rollback:  gh variable set PIN_ADM --body parte-adm-1a2b3c4 && gh workflow run site
# Unpin:     gh variable delete PIN_ADM && gh workflow run site
set -euo pipefail
out="${1:-_site}"
repo="${GITHUB_REPOSITORY:?}"
rm -rf "$out"; mkdir -p "$out"
rsync -a --exclude '.git' --exclude '.github' --exclude "/$out" \
  --exclude 'treinos/' --exclude 'adm/' ./ "$out/"
tmp="$(mktemp -d)"
resumo="${GITHUB_STEP_SUMMARY:-/dev/null}"
echo "| parte | versão publicada | origem |" >> "$resumo"
echo "|---|---|---|" >> "$resumo"
for parte in treinos adm; do
  PARTE="$(echo "$parte" | tr a-z A-Z)"
  var="VERSAO_$PARTE"; pin="PIN_$PARTE"
  tag="${!var:-}"; origem="manual"
  if [ -z "$tag" ] && [ -n "${!pin:-}" ]; then
    tag="${!pin}"; origem="pino"
    echo "::warning::$parte pinned at $tag (repo variable $pin); new releases of $parte stay off the site until it is removed"
  fi
  if [ -z "$tag" ] && [ "${DISPATCH_PARTE:-}" = "$parte" ] && [ -n "${DISPATCH_TAG:-}" ]; then
    tag="$DISPATCH_TAG"; origem="dispatch"
  fi
  if [ -z "$tag" ]; then
    origem="mais nova"
    # Fail loudly if the API call fails (an empty list is fine, an error is not).
    lista="$(gh api --paginate "repos/$repo/releases?per_page=100" --jq '.[]')" \
      || { echo "::error::$parte: could not list releases"; exit 1; }
    tag="$(jq -s -r --arg parte "$parte" -f "$(dirname "$0")/versoes.jq" <<<"$lista" | tail -n 1)"
  fi
  case "$tag" in ""|parte-"$parte"-*) ;; *) echo "::error::$parte: bad version '$tag'"; exit 1;; esac
  if [ -n "$tag" ] && gh release download "$tag" --repo "$repo" \
       --pattern "$parte.tar.gz" --dir "$tmp/$parte" --clobber; then
    mkdir -p "$out/$parte"
    if tar -tzf "$tmp/$parte/$parte.tar.gz" | grep -qE '(^/|(^|/)\.\.(/|$))'; then
      echo "::error::$parte: unsafe paths in tarball"; exit 1
    fi
    tar -xzf "$tmp/$parte/$parte.tar.gz" -C "$out/$parte" --no-same-owner --exclude="._*" --exclude=".DS_Store"
    find "$out/$parte" \( -name "._*" -o -name ".DS_Store" \) -delete  # macOS AppleDouble junk
    echo "$parte: $tag ($origem)"; echo "| $parte | $tag | $origem |" >> "$resumo"
    publicadas="${publicadas:-} $tag"
  else
    echo "::error::$parte: no release found (got '$tag')"; exit 1
  fi
done
echo "publicadas=${publicadas:-}" >> "${GITHUB_OUTPUT:-/dev/null}"
if find "$out" -type l | grep -q .; then echo "::error::symlinks in site"; exit 1; fi
