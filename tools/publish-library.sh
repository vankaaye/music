#!/usr/bin/env bash
# Publish a music folder so the Music app can stream it on every device
# (and hand off to AirPlay).
#
#   ./publish-library.sh check   https://host/path/            # test a host first
#   ./publish-library.sh publish ~/Music r2:music https://host/path/
#
# "check" tells you whether a host will work BEFORE you upload anything.
# "publish" builds library.json, uploads the folder with rclone, verifies the
# result, and prints the link to paste into the app.

set -euo pipefail

APP_ORIGIN="${APP_ORIGIN:-https://vankaaye.github.io}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

c_ok()   { printf '\033[32m  ok  \033[0m %s\n' "$1"; }
c_bad()  { printf '\033[31m fail \033[0m %s\n' "$1"; }
c_warn() { printf '\033[33m warn \033[0m %s\n' "$1"; }
c_head() { printf '\n\033[1m%s\033[0m\n' "$1"; }

usage() {
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 1
}

# --- check: will this host actually work? -----------------------------------
do_check() {
  local url="$1"
  [ -n "$url" ] || usage
  local fail=0

  c_head "Checking $url"

  case "$url" in
    https://*) c_ok "uses HTTPS" ;;
    http://*)  c_bad "must be HTTPS — a page served over HTTPS cannot read http://"; fail=1 ;;
    *)         c_bad "not a URL"; exit 1 ;;
  esac

  local hdr
  if ! hdr="$(curl -sS -m 25 -I -H "Origin: $APP_ORIGIN" "$url" 2>&1)"; then
    c_bad "could not reach it: $hdr"
    exit 1
  fi

  local code acao ar
  code="$(printf '%s' "$hdr" | grep -oE '^HTTP/[0-9.]+ [0-9]+' | tail -1 | grep -oE '[0-9]+$' || true)"
  acao="$(printf '%s' "$hdr" | grep -i '^access-control-allow-origin:' | head -1 | cut -d: -f2- | tr -d ' \r' || true)"
  ar="$(printf '%s'  "$hdr" | grep -i '^accept-ranges:' | head -1 | cut -d: -f2- | tr -d ' \r' || true)"

  case "$code" in
    200|206) c_ok "reachable (HTTP $code)" ;;
    401|403) c_bad "not public (HTTP $code) — the app sends no password in Link mode"; fail=1 ;;
    404)     c_warn "HTTP 404 — fine if this exact file isn't uploaded yet" ;;
    *)       c_bad "HTTP ${code:-no response}"; fail=1 ;;
  esac

  if [ -n "$acao" ]; then
    if [ "$acao" = "*" ] || [ "$acao" = "$APP_ORIGIN" ]; then
      c_ok "CORS allows this app (Access-Control-Allow-Origin: $acao)"
    else
      c_bad "CORS allows '$acao', not $APP_ORIGIN"; fail=1
    fi
  else
    c_bad "no Access-Control-Allow-Origin header — the browser will block reads"; fail=1
  fi

  if [ "$ar" = "bytes" ]; then
    c_ok "supports Range requests (seeking and download progress work)"
  else
    c_warn "no Accept-Ranges — seeking within a track may not work"
  fi

  if [ "$fail" -eq 0 ]; then
    c_head "This host will work."
  else
    c_head "This host will NOT work as-is — fix the failures above."
    exit 1
  fi
}

# --- publish: build, upload, verify -----------------------------------------
do_publish() {
  local folder="${1:-}" remote="${2:-}" baseurl="${3:-}"
  [ -n "$folder" ] && [ -n "$remote" ] && [ -n "$baseurl" ] || usage
  [ -d "$folder" ] || { c_bad "no such folder: $folder"; exit 1; }
  command -v rclone >/dev/null || {
    c_bad "rclone is not installed — see https://rclone.org/install/"; exit 1; }
  case "$baseurl" in */) ;; *) baseurl="$baseurl/";; esac

  c_head "1. Building library.json"
  python3 "$HERE/make-library.py" "$folder"

  c_head "2. Uploading to $remote"
  rclone copy "$folder" "$remote" --progress \
    --include '*.mp3' --include '*.m4a' --include '*.aac' --include '*.flac' \
    --include '*.wav' --include '*.ogg' --include '*.oga' --include '*.opus' \
    --include '*.wma' --include 'library.json'

  c_head "3. Verifying what you just uploaded"
  do_check "${baseurl}library.json"

  c_head "Done — paste this into the app under + → Connect Library → Link"
  printf '\n    %slibrary.json\n\n' "$baseurl"
}

case "${1:-}" in
  check)   shift; do_check "${1:-}" ;;
  publish) shift; do_publish "${1:-}" "${2:-}" "${3:-}" ;;
  *)       usage ;;
esac
