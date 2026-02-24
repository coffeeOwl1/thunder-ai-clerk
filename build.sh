#!/usr/bin/env bash
set -euo pipefail

ENV="${1:-prod}"

case "$ENV" in
  dev)
    CONFIG="config.dev.js"
    if [[ ! -f "$CONFIG" ]]; then
      echo "Error: $CONFIG not found. Copy config.dev.js.example to config.dev.js and edit it." >&2
      exit 1
    fi
    ;;
  prod)
    CONFIG="config.prod.js"
    ;;
  *)
    echo "Usage: $0 [dev|prod]" >&2
    echo "  dev   — build with config.dev.js (gitignored, personal settings)" >&2
    echo "  prod  — build with config.prod.js (default)" >&2
    exit 1
    ;;
esac

# Run unit tests before building — fail fast on broken code
echo "Running unit tests..."
npm test || { echo "Unit tests failed — aborting build." >&2; exit 1; }

cp "$CONFIG" config.js

rm -f thunderclerk-ai.xpi
zip -r thunderclerk-ai.xpi . \
  -x "*.git*" "node_modules/*" "tests/*" "*.md" "package*.json" \
     ".claude/*" "LICENSE" "config.dev.js" "config.dev.js.example" \
     "config.prod.js" "build.sh"

echo "Built thunderclerk-ai.xpi (env: $ENV, config: $CONFIG)"
