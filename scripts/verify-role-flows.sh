#!/usr/bin/env zsh

set -euo pipefail

BASE_URL="${ROUTE_VERIFY_BASE_URL:-http://127.0.0.1:3000}"
BODY_FILE="${TMPDIR:-/tmp}/sync-role-verify-body"
NODE_BIN="${NODE_BIN:-}"
SITE_COOKIE_HEADER="${SITE_COOKIE_HEADER:-}"

if [[ -z "${NODE_BIN}" ]]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  elif [[ -x "/usr/local/bin/node" ]]; then
    NODE_BIN="/usr/local/bin/node"
  elif [[ -x "/opt/homebrew/bin/node" ]]; then
    NODE_BIN="/opt/homebrew/bin/node"
  else
    echo "FAIL verifier setup: node was not found. Set NODE_BIN to a Node.js executable." >&2
    exit 1
  fi
fi

request_status() {
  local url="$1"
  local cookie_header="${2:-}"

  "${NODE_BIN}" -e '
const fs = require("node:fs");
const [url, cookieHeader, bodyFile] = process.argv.slice(1);
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15000);
const headers = cookieHeader ? { cookie: cookieHeader } : {};

fetch(url, {
  headers,
  redirect: "manual",
  signal: controller.signal
})
  .then(async (response) => {
    clearTimeout(timeout);
    fs.writeFileSync(bodyFile, await response.text());
    process.stdout.write(String(response.status));
  })
  .catch((error) => {
    clearTimeout(timeout);
    fs.writeFileSync(bodyFile, error?.stack || String(error));
    process.exit(2);
  });
' "${url}" "${cookie_header}" "${BODY_FILE}"
}

build_cookie_header() {
  local role_cookie_header="${1:-}"

  if [[ -z "${SITE_COOKIE_HEADER}" ]]; then
    print -r -- "${role_cookie_header}"
    return 0
  fi

  if [[ -z "${role_cookie_header}" ]]; then
    print -r -- "${SITE_COOKIE_HEADER}"
    return 0
  fi

  if [[ "${role_cookie_header}" == *"${SITE_COOKIE_HEADER}"* ]]; then
    print -r -- "${role_cookie_header}"
    return 0
  fi

  print -r -- "${SITE_COOKIE_HEADER}; ${role_cookie_header}"
}

print_body_file() {
  if [[ ! -f "${BODY_FILE}" ]]; then
    return 0
  fi

  local body_line
  while IFS= read -r body_line; do
    print -r -- "${body_line}" >&2
  done < "${BODY_FILE}"
}

require_cookie_header() {
  local label="$1"
  local cookie_header="$2"

  if [[ -z "${cookie_header}" ]]; then
    echo "FAIL ${label}: cookie header is required for authenticated role verification" >&2
    return 1
  fi
}

check_status() {
  local label="$1"
  local expected_csv="$2"
  local path="$3"
  local cookie_header="${4:-}"
  local request_cookie_header
  request_cookie_header="$(build_cookie_header "${cookie_header}")"

  local http_code
  if ! http_code="$(request_status "${BASE_URL}${path}" "${request_cookie_header}")"; then
    echo "FAIL ${label}: request failed for ${BASE_URL}${path}" >&2
    print_body_file
    return 1
  fi

  local expected
  local matched="0"
  for expected in ${(s:,:)expected_csv}; do
    if [[ "${http_code}" == "${expected}" ]]; then
      matched="1"
      break
    fi
  done

  if [[ "${matched}" != "1" ]]; then
    echo "FAIL ${label}: expected ${expected_csv}, got ${http_code}" >&2
    print_body_file
    return 1
  fi

  echo "PASS ${label}: ${http_code}"
}

check_authenticated_route() {
  local label="$1"
  local cookie_header="$2"
  local path="$3"
  local expected="${4:-200}"

  require_cookie_header "${label}" "${cookie_header}"
  check_status "${label}" "${expected}" "${path}" "${cookie_header}"
}

check_agreement_access() {
  local label="$1"
  local cookie_header="$2"
  local expected_csv="$3"
  local order_id="$4"

  require_cookie_header "${label}" "${cookie_header}"
  check_status "${label}" "${expected_csv}" "/api/orders/${order_id}/agreement" "${cookie_header}"
}

check_status "public login route" "200" "/login"
check_status "public signup route" "200" "/signup"
check_status "unauthenticated agreement route" "401" "/api/orders/test-order/agreement"
check_status "unauthenticated artist dashboard" "302,307" "/artist/dashboard"
check_status "unauthenticated buyer orders" "302,307" "/buyer/orders"
check_status "unauthenticated admin orders" "302,307" "/admin/orders"

check_authenticated_route "artist dashboard" "${ARTIST_COOKIE_HEADER:-}" "/artist/dashboard"
check_authenticated_route "artist submit" "${ARTIST_COOKIE_HEADER:-}" "/artist/submit"
check_authenticated_route "artist denied buyer orders" "${ARTIST_COOKIE_HEADER:-}" "/buyer/orders" "302,307,403"
check_authenticated_route "artist denied admin orders" "${ARTIST_COOKIE_HEADER:-}" "/admin/orders" "302,307,403"

check_authenticated_route "buyer catalog" "${BUYER_COOKIE_HEADER:-}" "/buyer/catalog"
check_authenticated_route "buyer orders" "${BUYER_COOKIE_HEADER:-}" "/buyer/orders"
check_authenticated_route "buyer denied artist submit" "${BUYER_COOKIE_HEADER:-}" "/artist/submit" "302,307,403"
check_authenticated_route "buyer denied admin orders" "${BUYER_COOKIE_HEADER:-}" "/admin/orders" "302,307,403"

check_authenticated_route "admin dashboard" "${ADMIN_COOKIE_HEADER:-}" "/admin/dashboard"
check_authenticated_route "admin review queue" "${ADMIN_COOKIE_HEADER:-}" "/admin/review-queue"
check_authenticated_route "admin orders" "${ADMIN_COOKIE_HEADER:-}" "/admin/orders"
check_authenticated_route "admin denied artist submit" "${ADMIN_COOKIE_HEADER:-}" "/artist/submit" "302,307,403"
check_authenticated_route "admin denied buyer orders" "${ADMIN_COOKIE_HEADER:-}" "/buyer/orders" "302,307,403"

if [[ -n "${ORDER_ID:-}" ]]; then
  check_agreement_access "wrong buyer agreement authorization" "${WRONG_BUYER_COOKIE_HEADER:-}" "403" "${ORDER_ID}"
  check_agreement_access "correct buyer agreement authorization" "${BUYER_COOKIE_HEADER:-}" "200,307" "${ORDER_ID}"
  check_agreement_access "admin agreement authorization" "${ADMIN_COOKIE_HEADER:-}" "200,307" "${ORDER_ID}"
else
  echo "INFO agreement authorization matrix: ORDER_ID not provided"
fi

echo "Role flow verification scaffold complete against ${BASE_URL}"
