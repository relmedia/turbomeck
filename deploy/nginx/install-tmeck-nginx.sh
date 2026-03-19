#!/usr/bin/env bash
# Usage on VPS:
#   sudo ./install-tmeck-nginx.sh
#
# Installs /etc/nginx/sites-available/nextjs.conf and enables it.

set -euo pipefail

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_SRC="${SCRIPT_DIR}/nextjs.conf"

if [[ ! -f "$SITE_SRC" ]]; then
  echo "Missing file: $SITE_SRC" >&2
  exit 1
fi

install -m 0644 "$SITE_SRC" /etc/nginx/sites-available/nextjs.conf
ln -sf /etc/nginx/sites-available/nextjs.conf /etc/nginx/sites-enabled/nextjs.conf

nginx -t
systemctl reload nginx

echo "OK: nextjs.conf enabled (turbomeck.cloud → :3000, admin → :3001)."
