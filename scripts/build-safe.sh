#!/usr/bin/env bash

set -euo pipefail

if lsof -iTCP:3000 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "Stop the local dev server before running 'npm run build'." >&2
  echo "Running build and dev together against the same .next directory makes route behavior flaky in this repo." >&2
  exit 1
fi

exec npx next build
