#!/usr/bin/env bash
# Securely saves the Cloudflare API token to .cf-token
# Token is read silently and never echoed to the terminal.
set -e
cd "$(dirname "$0")"
read -rs -p "Cloudflare API token: " CFTOK
echo ""
echo -n "$CFTOK" > .cf-token
chmod 600 .cf-token
unset CFTOK
echo "saved"
