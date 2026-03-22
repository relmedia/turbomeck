#!/usr/bin/env bash
# Check PostgreSQL port, DATABASE_URL from project .env (password hidden), and connectivity.
#
# Usage on VPS (from repo root):
#   chmod +x deploy/check-database.sh
#   ./deploy/check-database.sh
#   ./deploy/check-database.sh /path/to/.env

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$REPO_ROOT/.env}"

echo "=== Listening ports (PostgreSQL) ==="
ss -tlnp 2>/dev/null | grep -E ':543[0-9]+\s' || true

echo ""
echo "=== postgresql service ==="
systemctl is-active postgresql 2>/dev/null || true
systemctl status postgresql --no-pager -l 2>/dev/null | head -n 6 || true

echo ""
if [[ ! -f "$ENV_FILE" ]]; then
  echo "=== No .env at: $ENV_FILE ==="
  echo "Pass a path: $0 /home/ariel/apps/turbomeck/.env"
  exit 1
fi

echo "=== DATABASE_URL from: $ENV_FILE (password not shown) ==="
LINE="$(grep -E '^[[:space:]]*DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 || true)"
VAL="${LINE#*=}"
VAL="${VAL#\"}"
VAL="${VAL%\"}"
VAL="${VAL#\'}"
VAL="${VAL%\'}"

if [[ -z "$VAL" ]]; then
  echo "  (no DATABASE_URL line)"
else
  # Hide password: postgresql://user:SECRET@host:port/db
  SAFE="$(echo "$VAL" | sed -E 's|(postgresql://[^:]+:)[^@]+(@)|\1****\2|')"
  echo "  $SAFE"
  # Parse pieces (best effort)
  if [[ "$VAL" =~ postgresql://([^:]+):[^@]+@([^:/]+)(:([0-9]+))?/([^?]+) ]]; then
    echo ""
    echo "  Parsed:"
    echo "    user:     ${BASH_REMATCH[1]}"
    echo "    host:     ${BASH_REMATCH[2]}"
    echo "    port:     ${BASH_REMATCH[4]:-5432}"
    echo "    database: ${BASH_REMATCH[5]}"
  fi
fi

echo ""
echo "=== Connection test ==="
export DATABASE_URL="$VAL"

if command -v pg_isready &>/dev/null; then
  if [[ "$VAL" =~ @([^:/]+)(:([0-9]+))?/ ]]; then
    H="${BASH_REMATCH[1]}"
    P="${BASH_REMATCH[3]:-5432}"
    if pg_isready -h "$H" -p "$P" 2>/dev/null; then
      echo "pg_isready: OK (host=$H port=$P)"
    else
      echo "pg_isready: FAILED"
    fi
  fi
else
  echo "(install: sudo apt install postgresql-client — for pg_isready/psql)"
fi

if command -v psql &>/dev/null && [[ -n "$VAL" ]]; then
  if psql "$VAL" -c "SELECT current_database() AS db, current_user AS role;" 2>/dev/null; then
    echo "psql: OK — password and user are correct for this URL."
  else
    echo "psql: FAILED — check user, password, database name, and that Postgres allows this connection."
  fi
fi

echo ""
echo "=== Roles (optional, local socket) ==="
sudo -u postgres psql -tAc "SELECT rolname FROM pg_roles WHERE rolcanlogin ORDER BY 1;" 2>/dev/null || echo "(run manually: sudo -u postgres psql -c \"\\du\")"
