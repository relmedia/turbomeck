#!/usr/bin/env bash
# Run from anywhere: bash deploy/debug-products.sh
# Resolves repo root from this file's location, then runs the product pipeline debug script.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/scripts/debug/product-pipeline.mjs"
