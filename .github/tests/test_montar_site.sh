#!/usr/bin/env bash
# Reproduces the 18/11 race: adm 32f8661 published at 19:24:41, then a treinos
# dispatch at 19:25:41 ran with VERSAO_ADM empty and put adm 9d2d4fd back live,
# because every release had the same created_at (date of the tag's commit) and
# the "newest" was picked by created_at. Uses a fake `gh` and runs montar_site.sh.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
t="$(mktemp -d)"; trap 'rm -rf "$t"' EXIT
mkdir -p "$t/bin" "$t/repo"
# Releases of 18/11 in the order `gh release list` returned them, plus a newer draft and a newer release
# whose asset is still uploading: neither may be chosen.
cat > "$t/releases.json" <<'J'
[
 {"id":9,"tag_name":"parte-treinos-23ed160","draft":false,"created_at":"2026-11-18T19:09:51Z","published_at":"2026-11-18T19:25:38Z","assets":[{"name":"treinos.tar.gz","state":"uploaded"}]},
 {"id":10,"tag_name":"parte-adm-32f8661","draft":false,"created_at":"2026-11-18T19:09:51Z","published_at":"2026-11-18T19:24:41Z","assets":[{"name":"adm.tar.gz","state":"uploaded"}]},
 {"id":8,"tag_name":"parte-treinos-95e1ba9","draft":false,"created_at":"2026-11-18T19:09:51Z","published_at":"2026-11-18T19:12:56Z","assets":[{"name":"treinos.tar.gz","state":"uploaded"}]},
 {"id":7,"tag_name":"parte-adm-9d2d4fd","draft":false,"created_at":"2026-11-18T19:09:51Z","published_at":"2026-11-18T19:12:36Z","assets":[{"name":"adm.tar.gz","state":"uploaded"}]},
 {"id":5,"tag_name":"parte-adm-2e006a7","draft":false,"created_at":"2026-11-18T18:50:28Z","published_at":"2026-11-18T19:05:54Z","assets":[{"name":"adm.tar.gz","state":"uploaded"}]},
 {"id":11,"tag_name":"parte-adm-dddddd1","draft":true,"created_at":"2026-11-18T19:09:51Z","published_at":null,"assets":[{"name":"adm.tar.gz","state":"uploaded"}]},
 {"id":12,"tag_name":"parte-adm-eeeeee2","draft":false,"created_at":"2026-11-18T19:09:51Z","published_at":"2026-11-18T19:30:00Z","assets":[{"name":"adm.tar.gz","state":"starter"}]}
]
J
cat > "$t/bin/gh" <<'G'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  api) jq -c '.[]' "$FAKE_RELEASES" ;;
  release)  # release download <tag> --repo r --pattern <p>.tar.gz --dir <d> --clobber
    tag="$3"; while [ $# -gt 0 ]; do case "$1" in --pattern) p="$2";; --dir) d="$2";; esac; shift; done
    mkdir -p "$d" "$d/src"; printf '{"tag":"%s"}' "$tag" > "$d/src/versao.json"
    tar -czf "$d/$p" -C "$d/src" versao.json ;;
  *) echo "fake gh: unexpected $*" >&2; exit 2 ;;
esac
G
chmod +x "$t/bin/gh"
falhas=0
confere() { # <descrição> <arquivo> <tag esperada>
  got="$(jq -r .tag "$2")"
  if [ "$got" = "$3" ]; then echo "ok   $1: $got"; else echo "FAIL $1: got $got, want $3"; falhas=1; fi
}
cd "$t/repo"
export PATH="$t/bin:$PATH" FAKE_RELEASES="$t/releases.json" GITHUB_REPOSITORY=x/y
mkdir -p .github/scripts; cp "$raiz/.github/scripts/"{montar_site.sh,versoes.jq} .github/scripts/
echo capa > index.html
# The treinos dispatch: VERSAO_TREINOS set, VERSAO_ADM empty.
VERSAO_TREINOS=parte-treinos-23ed160 VERSAO_ADM= bash .github/scripts/montar_site.sh _site >/dev/null
confere "treinos dispatch keeps newest adm" _site/adm/versao.json parte-adm-32f8661
confere "treinos dispatch uses its own tag" _site/treinos/versao.json parte-treinos-23ed160
# A plain push: both empty.
VERSAO_TREINOS= VERSAO_ADM= bash .github/scripts/montar_site.sh _site >/dev/null
confere "push picks newest treinos" _site/treinos/versao.json parte-treinos-23ed160
confere "push picks newest adm" _site/adm/versao.json parte-adm-32f8661
# Prune order (oldest first): newest must be last.
ordem="$(jq -s -r --arg parte adm -f .github/scripts/versoes.jq <(jq -c '.[]' "$FAKE_RELEASES") | tr '\n' ' ')"
[ "$ordem" = "parte-adm-2e006a7 parte-adm-9d2d4fd parte-adm-32f8661 " ] \
  && echo "ok   order: $ordem" || { echo "FAIL order: $ordem"; falhas=1; }
# Sanity: the old filter (sort_by created_at, last) picks the stale adm here.
velho="$(jq -r '[.[] | select(.tag_name | startswith("parte-adm-")) | select(.draft|not) | select(.assets[0].state=="uploaded")] | sort_by(.created_at) | last | .tag_name' "$FAKE_RELEASES")"
[ "$velho" = parte-adm-9d2d4fd ] && echo "ok   old filter reproduces the bug: $velho" \
  || { echo "FAIL fixture no longer reproduces the bug ($velho)"; falhas=1; }
exit $falhas
