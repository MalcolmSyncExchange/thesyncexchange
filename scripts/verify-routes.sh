#!/usr/bin/env zsh

set -euo pipefail

ROOT_DIR="$(cd "${0:A:h}/.." && pwd)"
cd "${ROOT_DIR}"

DEFAULT_EXISTING_URL="${ROUTE_VERIFY_EXISTING_URL:-http://127.0.0.1:3000}"
REQUIRE_EXISTING_SERVER="${ROUTE_VERIFY_REQUIRE_EXISTING:-0}"
PORT="${ROUTE_VERIFY_PORT:-3000}"
HOST="${ROUTE_VERIFY_HOST:-127.0.0.1}"
BASE_URL="${ROUTE_VERIFY_BASE_URL:-http://${HOST}:${PORT}}"
ATTEMPTS="${ROUTE_VERIFY_ATTEMPTS:-30}"
DELAY_SECONDS="${ROUTE_VERIFY_DELAY_SECONDS:-1}"
SERVER_LOG="$(mktemp -t sync-exchange-route-verify)"
BODY_FILE="$(mktemp -t sync-exchange-route-body)"
HEADER_FILE="$(mktemp -t sync-exchange-route-headers)"

SERVER_PID=""
USE_EXISTING_SERVER=0

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${BODY_FILE}" "${HEADER_FILE}"
}

trap cleanup EXIT

start_server() {
  PORT="${PORT}" npm run dev -- --hostname "${HOST}" --port "${PORT}" >"${SERVER_LOG}" 2>&1 &

  SERVER_PID="$!"
}

maybe_use_existing_server() {
  if curl -sS --max-time 8 -o /dev/null "${DEFAULT_EXISTING_URL}/"; then
    BASE_URL="${DEFAULT_EXISTING_URL}"
    USE_EXISTING_SERVER=1
    return 0
  fi

  return 1
}

wait_for_server() {
  local attempt=1

  while (( attempt <= ATTEMPTS )); do
    if curl -sS --max-time 12 -o /dev/null "${BASE_URL}/"; then
      return 0
    fi

    sleep "${DELAY_SECONDS}"
    (( attempt += 1 ))
  done

  echo "Dev server did not become ready at ${BASE_URL}" >&2
  echo "--- dev server log ---" >&2
  cat "${SERVER_LOG}" >&2
  return 1
}

request_route() {
  local path="$1"
  curl -sS --max-time 12 -D "${HEADER_FILE}" -o "${BODY_FILE}" "${BASE_URL}${path}"
}

status_code() {
  awk 'toupper($1) ~ /^HTTP/ { code=$2 } END { print code }' "${HEADER_FILE}"
}

location_header() {
  awk 'BEGIN { IGNORECASE=1 } /^location:/ { sub(/\r$/, "", $0); print substr($0, 11) }' "${HEADER_FILE}"
}

assert_contains() {
  local needle="$1"
  local file="$2"

  if ! grep -Fq "${needle}" "${file}"; then
    return 1
  fi
}

verify_page() {
  local path="$1"
  local expected_status="$2"
  shift 2
  local tokens=("$@")

  request_route "${path}"

  local actual_status
  actual_status="$(status_code)"

  if [[ "${actual_status}" != "${expected_status}" ]]; then
    echo "FAIL ${path} -> expected ${expected_status}, got ${actual_status}" >&2
    echo "--- response headers ---" >&2
    cat "${HEADER_FILE}" >&2
    echo "--- response body ---" >&2
    cat "${BODY_FILE}" >&2
    return 1
  fi

  local token
  for token in "${tokens[@]}"; do
    if ! assert_contains "${token}" "${BODY_FILE}"; then
      echo "FAIL ${path} -> missing body token: ${token}" >&2
      echo "--- response body ---" >&2
      cat "${BODY_FILE}" >&2
      return 1
    fi
  done

  echo "PASS ${path} -> ${actual_status}"
}

verify_redirect() {
  local path="$1"
  local expected_status="$2"
  local expected_location="$3"

  request_route "${path}"

  local actual_status
  actual_status="$(status_code)"
  local actual_location
  actual_location="$(location_header)"

  if [[ "${actual_status}" != "${expected_status}" ]]; then
    echo "FAIL ${path} -> expected ${expected_status}, got ${actual_status}" >&2
    echo "--- response headers ---" >&2
    cat "${HEADER_FILE}" >&2
    return 1
  fi

  if [[ "${actual_location}" != *"${expected_location}"* ]]; then
    echo "FAIL ${path} -> expected redirect containing ${expected_location}, got ${actual_location:-<none>}" >&2
    echo "--- response headers ---" >&2
    cat "${HEADER_FILE}" >&2
    return 1
  fi

  echo "PASS ${path} -> ${actual_status} (${actual_location})"
}

verify_post_json() {
  local path="$1"
  local expected_status="$2"
  local expected_token="$3"

  curl -sS --max-time 20 -X POST -D "${HEADER_FILE}" -o "${BODY_FILE}" "${BASE_URL}${path}"

  local actual_status
  actual_status="$(status_code)"

  if [[ "${actual_status}" != "${expected_status}" ]]; then
    echo "FAIL POST ${path} -> expected ${expected_status}, got ${actual_status}" >&2
    echo "--- response headers ---" >&2
    cat "${HEADER_FILE}" >&2
    echo "--- response body ---" >&2
    cat "${BODY_FILE}" >&2
    return 1
  fi

  if ! assert_contains "${expected_token}" "${BODY_FILE}"; then
    echo "FAIL POST ${path} -> missing body token: ${expected_token}" >&2
    echo "--- response body ---" >&2
    cat "${BODY_FILE}" >&2
    return 1
  fi

  echo "PASS POST ${path} -> ${actual_status}"
}

verify_readiness() {
  request_route "/api/health/readiness"

  local actual_status
  actual_status="$(status_code)"

  if [[ "${actual_status}" != "200" && "${actual_status}" != "503" ]]; then
    echo "FAIL /api/health/readiness -> expected 200 or 503, got ${actual_status}" >&2
    echo "--- response headers ---" >&2
    cat "${HEADER_FILE}" >&2
    echo "--- response body ---" >&2
    cat "${BODY_FILE}" >&2
    return 1
  fi

  for token in "\"status\"" "\"capabilities\"" "\"blockedFeatures\"" "\"degradedFeatures\""; do
    if ! assert_contains "${token}" "${BODY_FILE}"; then
      echo "FAIL /api/health/readiness -> missing body token: ${token}" >&2
      echo "--- response body ---" >&2
      cat "${BODY_FILE}" >&2
      return 1
    fi
  done

  echo "PASS /api/health/readiness -> ${actual_status}"
}

if ! maybe_use_existing_server; then
  if [[ "${REQUIRE_EXISTING_SERVER}" == "1" ]]; then
    echo "No dev server responded at ${DEFAULT_EXISTING_URL}. Start the app first with 'npm run dev' and rerun this script." >&2
    exit 1
  fi

  start_server
  wait_for_server
fi

verify_page "/" 200 "Music licensing built for speed, trust, and clean execution." "Get Started"
verify_page "/login" 200 "Welcome back" "Log in"
verify_page "/signup" 200 "Create your Sync Exchange account" "Get started"
verify_page "/signup/artist" 200 "Create your artist account" "Sign up as an artist"
verify_page "/signup/buyer" 200 "Create your buyer account" "Sign up as a buyer"
verify_page "/test-checkout" 200 "Stripe test checkout" "Buy License (\$25)"
verify_page "/success" 200 "Payment successful"
verify_redirect "/onboarding" 307 "/login?redirectTo=%2Fonboarding"
verify_redirect "/onboarding/artist" 307 "/login?redirectTo=%2Fonboarding%2Fartist"
verify_redirect "/buyer/catalog" 307 "/login?redirectTo=%2Fbuyer%2Fcatalog"
verify_page "/api/health/config" 200 "\"missingCore\"" "\"missingOperational\""
verify_readiness
verify_post_json "/api/create-checkout-session" 200 "\"url\":\"https://checkout.stripe.com"
verify_page "/api/orders/test-order/agreement" 401 "\"error\":\"Unauthorized.\""

if (( USE_EXISTING_SERVER == 1 )); then
  echo "Verified route and checkout smoke checks against existing dev server at ${BASE_URL}"
else
  echo "Verified route and checkout smoke checks against isolated dev server at ${BASE_URL}"
fi
