#!/usr/bin/env zsh

set -euo pipefail

BASE_URL="${ROUTE_VERIFY_BASE_URL:-http://127.0.0.1:3000}"

check_status() {
  local label="$1"
  local expected="$2"
  local path="$3"
  shift 3

  local status
  status="$(curl -sS --max-time 15 -o /tmp/sync-role-verify-body -w '%{http_code}' "$@" "${BASE_URL}${path}")"

  if [[ "${status}" != "${expected}" ]]; then
    echo "FAIL ${label}: expected ${expected}, got ${status}" >&2
    cat /tmp/sync-role-verify-body >&2
    return 1
  fi

  echo "PASS ${label}: ${status}"
}

check_authenticated_route() {
  local label="$1"
  local cookie_header="$2"
  local path="$3"

  if [[ -z "${cookie_header}" ]]; then
    echo "SKIP ${label}: cookie header not provided"
    return 0
  fi

  check_status "${label}" "200" "${path}" -H "Cookie: ${cookie_header}"
}

check_agreement_access() {
  local label="$1"
  local cookie_header="$2"
  local expected_one="$3"
  local expected_two="$4"
  local order_id="$5"

  if [[ -z "${cookie_header}" ]]; then
    echo "SKIP ${label}: cookie header not provided"
    return 0
  fi

  local status
  status="$(curl -sS --max-time 15 -o /tmp/sync-role-verify-body -w '%{http_code}' -H "Cookie: ${cookie_header}" "${BASE_URL}/api/orders/${order_id}/agreement")"

  if [[ "${status}" != "${expected_one}" && "${status}" != "${expected_two}" ]]; then
    echo "FAIL ${label}: expected ${expected_one} or ${expected_two}, got ${status}" >&2
    cat /tmp/sync-role-verify-body >&2
    return 1
  fi

  echo "PASS ${label}: ${status}"
}

check_status "public login route" "200" "/login"
check_status "public signup route" "200" "/signup"
check_status "unauthenticated agreement route" "401" "/api/orders/test-order/agreement"

check_authenticated_route "artist dashboard" "${ARTIST_COOKIE_HEADER:-}" "/artist/dashboard"
check_authenticated_route "artist submit" "${ARTIST_COOKIE_HEADER:-}" "/artist/submit"
check_authenticated_route "buyer catalog" "${BUYER_COOKIE_HEADER:-}" "/buyer/catalog"
check_authenticated_route "buyer orders" "${BUYER_COOKIE_HEADER:-}" "/buyer/orders"
check_authenticated_route "admin orders" "${ADMIN_COOKIE_HEADER:-}" "/admin/orders"

if [[ -n "${ORDER_ID:-}" ]]; then
  check_agreement_access "wrong buyer agreement authorization" "${WRONG_BUYER_COOKIE_HEADER:-}" "403" "403" "${ORDER_ID}"
  check_agreement_access "correct buyer agreement authorization" "${BUYER_COOKIE_HEADER:-}" "200" "307" "${ORDER_ID}"
  check_agreement_access "admin agreement authorization" "${ADMIN_COOKIE_HEADER:-}" "200" "307" "${ORDER_ID}"
else
  echo "SKIP agreement authorization matrix: ORDER_ID not provided"
fi

echo "Role flow verification scaffold complete against ${BASE_URL}"
