#!/usr/bin/env bash
# Assemble the published site: cover from this repo + each part (treinos, adm)
# from a versioned release "parte-<name>-<sha7>" (asset <name>.tar.gz) built by
# the part's own repo.
#
# Which version of each part goes live:
#   1. VERSAO_<PARTE> env (workflow_dispatch input or dispatch payload), e.g. parte-adm-1a2b3c4
#   2. otherwise the newest release whose tag starts with "parte-<name>-"
#   3. until step (c): the folder committed in this repo
# Rollback = run the workflow with the previous version, or delete the bad release.
set -euo pipefail
out="${1:-_site}"
repo="${GITHUB_REPOSITORY:?}"
rm -rf "$out"; mkdir -p "$out"
rsync -a --exclude '.git' --exclude '.github' --exclude "$out" \
  --exclude 'treinos/' --exclude 'adm/' ./ "$out/"
tmp="$(mktemp -d)"
resumo="${GITHUB_STEP_SUMMARY:-/dev/null}"
echo "| parte | versão publicada |" >> "$resumo"
echo "|---|---|" >> "$resumo"
for parte in treinos adm; do
  var="VERSAO_$(echo "$parte" | tr a-z A-Z)"
  tag="${!var:-}"
  if [ -z "$tag" ]; then
    tag="$(gh release list --repo "$repo" --limit 100 --json tagName,createdAt \
      -q "[.[] | select(.tagName | startswith(\"parte-$parte-\"))] | sort_by(.createdAt) | last | .tagName // empty")"
  fi
  case "$tag" in ""|parte-"$parte"-*) ;; *) echo "::error::$parte: bad version '$tag'"; exit 1;; esac
  if [ -n "$tag" ] && gh release download "$tag" --repo "$repo" \
       --pattern "$parte.tar.gz" --dir "$tmp/$parte" --clobber; then
    mkdir -p "$out/$parte"
    if tar -tzf "$tmp/$parte/$parte.tar.gz" | grep -qE '(^/|(^|/)\.\.(/|$))'; then
      echo "::error::$parte: unsafe paths in tarball"; exit 1
    fi
    tar -xzf "$tmp/$parte/$parte.tar.gz" -C "$out/$parte" --no-same-owner
    echo "$parte: $tag"; echo "| $parte | $tag |" >> "$resumo"
  elif [ -z "$tag" ] && [ -d "$parte" ]; then
    rsync -a "$parte/" "$out/$parte/"
    echo "$parte: folder in repo"; echo "| $parte | pasta do repositório |" >> "$resumo"
  else
    echo "::error::$parte: could not get '$tag' and no fallback"; exit 1
  fi
done
if find "$out" -type l | grep -q .; then echo "::error::symlinks in site"; exit 1; fi
