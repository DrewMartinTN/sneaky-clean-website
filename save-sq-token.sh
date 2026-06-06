#!/usr/bin/env bash
# Securely saves the Square access token to .sq-token
# Token is read silently and never echoed to the terminal.
set -e
cd "$(dirname "$0")"
read -rs -p "Square production access token: " SQTOK
echo ""
echo -n "$SQTOK" > .sq-token
chmod 600 .sq-token
unset SQTOK
echo "saved"
