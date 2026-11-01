#!/bin/bash
# Measure one candidate suite at one commit (bench/PROTOCOL.md §3.2): cold caches, setup with network,
# then the test command timed without network; if that fails it is rerun with network to tell red from networked.
# The offline run uses a nested user namespace so tests run as the calling user, not as root (root passes
# permission tests that must fail and breaks ssh config lookups).
# Usage: bench/corpus/measure-suite.sh <work-dir outside this checkout> <repo id from suites.json> <commit>
# Prints one JSON line: {"repo","commit","offlineExit","onlineExit","seconds","recipe","host"}; recipe = sha256 of setup+test. Needs git, jq, unshare, and the
# stack's tools on PATH (go, uv, npm).
set -u
[ $# -eq 3 ] || { echo "usage: $0 <work-dir> <repo> <commit>" >&2; exit 2; }
WORK=$1 REPO=$2 COMMIT=$3
HERE=$(cd "$(dirname "$0")" && pwd)
URL=$(jq -r --arg r "$REPO" '.[$r].url // empty' "$HERE/suites.json"); [ -n "$URL" ] || { echo "unknown repo $REPO" >&2; exit 2; }
SETUP=$(jq -r --arg r "$REPO" '.[$r].setup' "$HERE/suites.json")
TEST=$(jq -r --arg r "$REPO" '.[$r].test' "$HERE/suites.json")
DIR=$WORK/$REPO-${COMMIT:0:12}
{ [ -d "$DIR" ] && chmod -R u+w "$DIR"; rm -rf "$DIR"; } && mkdir -p "$WORK"
git clone -q "$URL" "$DIR/src" && git -C "$DIR/src" checkout -q "$COMMIT" || exit 1
export HOME=$DIR/home GOPATH=$DIR/gopath GOCACHE=$DIR/gocache GOMODCACHE=$DIR/gopath/mod GOTOOLCHAIN=local \
  npm_config_cache=$DIR/npm UV_CACHE_DIR=$DIR/uv CI=1
mkdir -p "$HOME"
cd "$DIR/src"
timeout 900 bash -c "$SETUP" > "$DIR/setup.log" 2>&1 || { echo "setup failed or timed out (15 min), see $DIR/setup.log" >&2; exit 1; }
T0=$(date +%s)
RECIPE=$(printf '%s\n%s' "$SETUP" "$TEST" | sha256sum | cut -c1-12)
export BENCH_TEST=$TEST
timeout 600 unshare -rn bash -c "ip link set lo up; exec unshare --user --map-user=$(id -u) --map-group=$(id -g) bash -c \"\$BENCH_TEST\"" \
  > "$DIR/offline.log" 2>&1; OFF=$?
SECS=$(( $(date +%s) - T0 ))
ON=null
[ $OFF -eq 0 ] || { timeout 600 bash -c "$TEST" > "$DIR/online.log" 2>&1; ON=$?; }
printf '{"repo":"%s","commit":"%s","offlineExit":%s,"onlineExit":%s,"seconds":%s,"recipe":"%s","host":"%s"}\n' \
  "$REPO" "$COMMIT" "$OFF" "$ON" "$SECS" "$RECIPE" "$(uname -sr) $(nproc)cpu"
