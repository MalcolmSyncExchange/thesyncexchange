#!/usr/bin/env bash

set -euo pipefail

open -na "Google Chrome" --args \
  --user-data-dir=/tmp/sync-exchange-localhost-chrome \
  --host-resolver-rules="MAP localhost 127.0.0.1" \
  http://localhost:3000
