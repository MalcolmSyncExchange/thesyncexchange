#!/usr/bin/env bash
set -euo pipefail
node scripts/build-guard.mjs
exec node node_modules/next/dist/bin/next build
