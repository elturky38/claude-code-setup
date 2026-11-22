#!/usr/bin/env bash
# Usage: vault_search.sh "<keywords>" [vault_path]
# Searches note titles and content for keywords, case-insensitive.
# Falls back to grep if ripgrep isn't available.
set -euo pipefail

QUERY="${1:?Usage: vault_search.sh \"<keywords>\" [vault_path]}"
VAULT="${2:-$(cat "$(dirname "$0")/../references/vault_path.txt" 2>/dev/null || echo .)}"

if command -v rg >/dev/null 2>&1; then
  rg -il --glob '*.md' "$QUERY" "$VAULT" || true
else
  grep -ril --include='*.md' "$QUERY" "$VAULT" || true
fi
