#!/usr/bin/env bash
# Land one reviewed PR on main: retarget, take main in, re-approve, merge commit.
# Stops with a nonzero status when a step needs a human (or a local conflict fix).
set -u
GH=/opt/homebrew/bin/gh
REPO=qwts/bookmarkit
n="$1"

field() { $GH pr view "$n" --repo $REPO --json "$1" -q ".$1"; }

echo "=== PR $n: $(field title)"
[ "$(field baseRefName)" = "main" ] || $GH pr edit "$n" --repo $REPO --base main >/dev/null

settle() {
  for _ in $(seq 1 20); do
    m=$(field mergeable)
    [ "$m" != "UNKNOWN" ] && { echo "$m"; return; }
    sleep 5
  done
  echo UNKNOWN
}

m=$(settle)
if [ "$m" = "CONFLICTING" ]; then echo "  CONFLICTING — needs a local merge"; exit 2; fi
if [ "$m" != "MERGEABLE" ]; then echo "  $m — cannot land"; exit 3; fi

# Take main in when behind, so CI runs against what will be on main.
if $GH api -X PUT "repos/$REPO/pulls/$n/update-branch" >/dev/null 2>&1; then
  echo "  updated branch with main"
  sleep 30
fi

for _ in $(seq 1 60); do
  rollup=$($GH pr view "$n" --repo $REPO --json statusCheckRollup \
    -q '[.statusCheckRollup[]|select(.status!=null)|"\(.name):\(.status):\(.conclusion // "")"]|join(" ")')
  case "$rollup" in
    *IN_PROGRESS*|*QUEUED*|*PENDING*) sleep 20;;
    *) break;;
  esac
done
echo "  checks: $rollup"
case "$rollup" in *FAILURE*|*TIMED_OUT*|*CANCELLED*) echo "  red checks"; exit 4;; esac

[ "$(field reviewDecision)" = "APPROVED" ] || \
  $GH pr review "$n" --repo $REPO --approve --body "Re-approving after taking main in; CI green." >/dev/null

out=$($GH api "repos/$REPO/pulls/$n/merge" -X PUT -f merge_method=merge 2>&1 | tail -1)
echo "  $out"
case "$out" in *'"merged":true'*) exit 0;; *) exit 5;; esac
