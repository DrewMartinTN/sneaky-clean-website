#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_FILE="$ROOT/.cf-token"

if [[ ! -s "$TOKEN_FILE" ]]; then
  printf 'Missing Cloudflare token file: %s\n' "$TOKEN_FILE" >&2
  exit 1
fi

cd "$ROOT"

read -r -p "Paste Mailgun API key: " MAILGUN_KEY
printf '\n'
read -r -p "Notification email: " ALERT_EMAIL

printf '\nPlease verify before uploading:\n'
printf 'Mailgun API key: %s\n' "$MAILGUN_KEY"
printf 'Notification email: %s\n\n' "$ALERT_EMAIL"
read -r -p "Upload these values to the live Worker? [y/N] " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  printf 'Canceled. Nothing was uploaded.\n'
  exit 0
fi

CF_TOKEN="$(tr -d '\n\r ' < "$TOKEN_FILE")"
printf '%s' "$MAILGUN_KEY" | CLOUDFLARE_API_TOKEN="$CF_TOKEN" npx wrangler secret put MAILGUN_API_KEY --config "$ROOT/wrangler.jsonc"
printf '%s' "$ALERT_EMAIL" | CLOUDFLARE_API_TOKEN="$CF_TOKEN" npx wrangler secret put POPUP_NOTIFICATION_EMAIL --config "$ROOT/wrangler.jsonc"

unset MAILGUN_KEY ALERT_EMAIL CF_TOKEN

printf '\nLive Worker secrets:\n'
CLOUDFLARE_API_TOKEN="$(tr -d '\n\r ' < "$TOKEN_FILE")" npx wrangler secret list --config "$ROOT/wrangler.jsonc"
