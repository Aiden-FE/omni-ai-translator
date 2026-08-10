#!/usr/bin/env bash

set -u

store="${1:-}"

case "$store" in
  chrome)
    store_name="Chrome Web Store"
    credential_names=(
      CHROME_CLIENT_ID
      CHROME_CLIENT_SECRET
      CHROME_REFRESH_TOKEN
      CHROME_ITEM_ID
      CHROME_PUBLISHER_ID
    )
    ;;
  firefox)
    store_name="Firefox Add-ons"
    credential_names=(AMO_API_KEY AMO_API_SECRET)
    ;;
  edge)
    store_name="Edge Add-ons"
    credential_names=(
      EDGE_PRODUCT_ID
      EDGE_CLIENT_ID
      EDGE_CLIENT_SECRET
      EDGE_TENANT_ID
    )
    ;;
  *)
    echo "Unsupported store: $store" >&2
    exit 2
    ;;
esac

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"

configured_count=0
missing_names=()

for credential_name in "${credential_names[@]}"; do
  if [ -n "${!credential_name:-}" ]; then
    configured_count=$((configured_count + 1))
  else
    missing_names+=("$credential_name")
  fi
done

if [ "$configured_count" -eq 0 ]; then
  echo "configured=false" >> "$GITHUB_OUTPUT"
  echo "::warning::$store_name credentials are not configured; skipping $store_name publish"
  exit 0
fi

if [ "${#missing_names[@]}" -gt 0 ]; then
  echo "configured=false" >> "$GITHUB_OUTPUT"
  echo "::error::$store_name credentials are partially configured; missing:${missing_names[*]}"
  exit 1
fi

echo "configured=true" >> "$GITHUB_OUTPUT"
echo "All required $store_name credentials are present"
