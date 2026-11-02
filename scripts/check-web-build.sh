#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
rm -rf .build-check
pnpm exec tsc -p tsconfig.build.json --outDir .build-check

stale=0
for built in .build-check/*.js; do
  name="$(basename "$built")"
  if ! diff -q "$built" "web/$name" >/dev/null 2>&1; then
    echo "stale or missing: web/$name" >&2
    stale=1
  fi
done
rm -rf .build-check

if [ "$stale" -ne 0 ]; then
  echo "web/*.js is out of date, run: pnpm build" >&2
  exit 1
fi
