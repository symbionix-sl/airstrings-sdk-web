#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# Seeds the demo project with strings and publishes bundles.
# Idempotent — safe to run repeatedly.
#
# Expects: server on localhost:8080, Postgres on localhost:5432
# ──────────────────────────────────────────────────────────
set -euo pipefail

BASE="http://localhost:8080"
DB_URL="${DATABASE_URL:-postgres://airstrings:airstrings@localhost:5432/airstrings?sslmode=disable}"

PROJECT_ID="proj_demo00000001"
RAW_KEY="aabb00112233445566778899aabbccddeeff00112233445566778899aabb0011"
KEY_HASH=$(echo -n "$RAW_KEY" | openssl dgst -sha256 -binary | xxd -p -c 64)
KEY_PREFIX="${RAW_KEY:0:8}"

echo "══════════════════════════════════════"
echo "AirStrings Demo — Seed Data"
echo "══════════════════════════════════════"
echo ""

# ── 1. Check server health ────────────────────────────────
echo "==> Checking server health..."
if ! curl -sf "$BASE/healthz" > /dev/null 2>&1; then
  echo "ERROR: Server not running at $BASE"
  echo "Start it with: cd backend && bash scripts/smoke-run.sh"
  exit 1
fi
echo "  Server healthy."
echo ""

# ── 2. Bootstrap project via DB ───────────────────────────
echo "==> Bootstrapping demo project..."
psql "$DB_URL" -q -c "
  INSERT INTO projects (id, name, description, default_locale)
  VALUES ('$PROJECT_ID', 'Demo App', 'AirStrings Web SDK demo project', 'en')
  ON CONFLICT (id) DO UPDATE SET name = 'Demo App';
" 2>/dev/null

echo "  Project: $PROJECT_ID"

# ── 3. Bootstrap write API key ────────────────────────────
echo "==> Bootstrapping API key..."
psql "$DB_URL" -q -c "
  INSERT INTO api_keys (id, project_id, name, key_hash, prefix, permission)
  VALUES (
    'ak_demo0000000a',
    '$PROJECT_ID',
    'demo-write-key',
    decode('$KEY_HASH', 'hex'),
    '$KEY_PREFIX',
    'write'
  )
  ON CONFLICT (id) DO NOTHING;
" 2>/dev/null

APIKEY="$RAW_KEY"
echo "  API key ready."
echo ""

# ── Helper to create or update a string ───────────────────
create_string() {
  local key="$1"
  local values="$2"

  # Try create first (201), fall back to upsert (200) if exists
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/projects/$PROJECT_ID/strings/" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $APIKEY" \
    -d "{\"key\":\"$key\",\"values\":$values}")

  if [ "$STATUS" -eq 201 ]; then
    echo "  Created: $key"
  elif [ "$STATUS" -eq 409 ]; then
    # Already exists — upsert
    curl -s -o /dev/null -X PUT "$BASE/v1/projects/$PROJECT_ID/strings/$key/" \
      -H "Content-Type: application/json" \
      -H "X-API-Key: $APIKEY" \
      -d "{\"values\":$values}"
    echo "  Updated: $key"
  else
    echo "  WARN: $key returned HTTP $STATUS"
  fi
}

# ── 4. Create strings ────────────────────────────────────
echo "==> Creating strings..."

create_string "greeting" '{"en":"Hello!","fr":"Bonjour !","es":"Hola!"}'
create_string "farewell" '{"en":"Goodbye!","fr":"Au revoir !","es":"Adios!"}'
create_string "app.title" '{"en":"AirStrings Demo","fr":"Démo AirStrings","es":"Demo AirStrings"}'
create_string "settings.theme" '{"en":"Theme"}'
create_string "settings.language" '{"en":"Language","fr":"Langue","es":"Idioma"}'
create_string "onboarding.welcome" '{"en":"Welcome to AirStrings","fr":"Bienvenue sur AirStrings","es":"Bienvenido a AirStrings"}'
create_string "items.count" '{"en":"{count, plural, one {# item} other {# items}}","fr":"{count, plural, one {# article} other {# articles}}","es":"{count, plural, one {# elemento} other {# elementos}}"}'

echo ""

# ── 5. Publish bundles ───────────────────────────────────
echo "==> Publishing bundles for en, fr, es..."

RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/projects/$PROJECT_ID/bundles/publish" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $APIKEY" \
  -d '{"locales":["en","fr","es"]}')
BODY=$(echo "$RESP" | sed '$d')
STATUS=$(echo "$RESP" | tail -1)

if [ "$STATUS" -eq 200 ]; then
  BUNDLE_COUNT=$(echo "$BODY" | jq '.bundles | length')
  echo "  Published $BUNDLE_COUNT bundles."
  echo "$BODY" | jq -r '.bundles[] | "    \(.locale): rev \(.revision) → \(.cdn_url)"'
else
  echo "  ERROR: Publish returned HTTP $STATUS"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  exit 1
fi

echo ""
echo "══════════════════════════════════════"
echo "  SEED COMPLETE"
echo "══════════════════════════════════════"
echo ""
echo "  Project:  $PROJECT_ID"
echo "  Locales:  en, fr, es"
echo "  Strings:  greeting, farewell, app.title, settings.theme, settings.language, onboarding.welcome, items.count (ICU)"
echo ""
echo "  MinIO bundles:"
echo "    http://localhost:9000/airstrings-bundles/bundles/v1/$PROJECT_ID/en/bundle.json"
echo "    http://localhost:9000/airstrings-bundles/bundles/v1/$PROJECT_ID/fr/bundle.json"
echo "    http://localhost:9000/airstrings-bundles/bundles/v1/$PROJECT_ID/es/bundle.json"
echo ""
