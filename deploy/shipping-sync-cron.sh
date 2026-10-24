#!/bin/sh
#
# Backstop for the shipping sweeps.
#
# apps/admin/instrumentation.ts schedules the same work with node-cron inside
# the Next.js process. That timer dies on every pm2 restart and every redeploy,
# and nothing outside the process notices — so a deploy during a busy afternoon
# could silently stop all shipping email until someone restarted admin again.
# This gives the schedule an owner that survives that.
#
# Running alongside the in-process timer is safe by construction, not by luck:
# each sweep takes a Postgres advisory lock, and every customer email is
# claimed through the order_emails unique index before it is sent. A duplicate
# run is a no-op, not a duplicate mail.
#
# Install (as the user that owns the checkout):
#   chmod +x deploy/shipping-sync-cron.sh
#   crontab -e
#   */30 * * * * /home/ariel/apps/turbomeck/deploy/shipping-sync-cron.sh
#
# The secret is read from apps/admin/.env at call time rather than being copied
# into the crontab, so it exists in exactly one place (mode 600) and rotating it
# needs no crontab edit.

set -eu

REPO="${REPO:-/home/ariel/apps/turbomeck}"
PORT="${ADMIN_PORT:-3001}"
LOG_DIR="${LOG_DIR:-/home/ariel/logs}"
LOG="$LOG_DIR/shipping-cron.log"
# Generous: a sweep of 200 parcels makes 200 PostNord calls at concurrency 4.
TIMEOUT="${TIMEOUT:-300}"

mkdir -p "$LOG_DIR"

stamp() { date -Is; }

SECRET=$(grep '^CRON_SECRET=' "$REPO/apps/admin/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r\n' || true)
if [ -z "$SECRET" ]; then
  echo "$(stamp) ERROR no CRON_SECRET in $REPO/apps/admin/.env" >> "$LOG"
  exit 1
fi

# -f so an HTTP error becomes a non-zero exit instead of a logged error body.
if RESPONSE=$(curl -fsS -m "$TIMEOUT" \
      -H "Authorization: Bearer $SECRET" \
      "http://localhost:$PORT/api/cron/sync-shipping-status" 2>&1); then
  echo "$(stamp) $RESPONSE" >> "$LOG"
else
  echo "$(stamp) REQUEST FAILED: $RESPONSE" >> "$LOG"
fi

# Keep the log bounded without needing a logrotate rule for it.
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 5000 ]; then
  tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
