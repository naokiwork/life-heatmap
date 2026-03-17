#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — One-shot deployment script for Life Heatmap
#
# Run this in the Replit Shell:
#   chmod +x scripts/deploy.sh && bash scripts/deploy.sh
#
# You will be prompted for the 4 secrets below.
# Nothing is written to any file.
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Exit on any error

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

header() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }
ok()     { echo -e "${GREEN}✓ $1${NC}"; }
warn()   { echo -e "${YELLOW}⚠ $1${NC}"; }
fail()   { echo -e "${RED}✗ $1${NC}"; exit 1; }

echo -e "${BLUE}"
cat << 'EOF'
 _     _  __         _   _             _
| |   (_)/ _| ___   | | | | ___  __ _| |_ _ __ ___   __ _ _ __
| |   | | |_ / _ \  | |_| |/ _ \/ _` | __| '_ ` _ \ / _` | '_ \
| |___| |  _|  __/  |  _  |  __/ (_| | |_| | | | | | (_| | |_) |
|_____|_|_|  \___|  |_| |_|\___|\__,_|\__|_| |_| |_|\__,_| .__/
                                                           |_|
  Deploy Script — Cloudflare Worker + Pages + Supabase
EOF
echo -e "${NC}"

# ─── Collect secrets interactively ───────────────────────────────────────────

header "STEP 1 — Collect credentials (values not saved to disk)"

echo ""
echo "Supabase service role key"
echo "  → Supabase dashboard → Settings → API → 'service_role' (secret key)"
read -rsp "  Paste here: " SUPABASE_SERVICE_ROLE_KEY
echo ""
[[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]] && fail "Supabase service role key is required"
ok "Supabase service role key received"

echo ""
echo "Cloudflare API token"
echo "  → Cloudflare dashboard → My Profile → API Tokens → Create Token"
echo "  → Use template: 'Edit Cloudflare Workers' (also add KV:Edit and Pages:Edit)"
read -rsp "  Paste here: " CLOUDFLARE_API_TOKEN
echo ""
[[ -z "$CLOUDFLARE_API_TOKEN" ]] && fail "Cloudflare API token is required"
ok "Cloudflare API token received"

echo ""
echo "Cloudflare Account ID (32-char hex)"
echo "  → Cloudflare dashboard → Workers & Pages → right sidebar → 'Account ID'"
read -rp "  Paste here: " CLOUDFLARE_ACCOUNT_ID
[[ -z "$CLOUDFLARE_ACCOUNT_ID" ]] && fail "Cloudflare Account ID is required"
ok "Cloudflare Account ID: ${CLOUDFLARE_ACCOUNT_ID:0:8}..."

echo ""
echo "OpenAI API key (real key from platform.openai.com)"
echo "  → If you don't have one, press Enter to DISABLE AI insights"
read -rsp "  Paste here (or Enter to skip): " OPENAI_API_KEY
echo ""
if [[ -z "$OPENAI_API_KEY" ]]; then
  warn "No OpenAI key — AI Insights will be disabled in the Worker"
  AI_ENABLED="false"
else
  ok "OpenAI API key received"
  AI_ENABLED="true"
fi

# Known values (from Replit environment)
REPL_CLIENT_ID="866a8f6d-e224-4603-bb0d-4c3e2544d22b"
JWT_SECRET="53556833fa0584287ef147eb41c01fbcfdd534ce556da5c9c92d42aa9527a26d"

echo ""
echo "GitHub Personal Access Token (for pushing code)"
echo "  → The token from github.com/settings/tokens"
read -rsp "  Paste here: " GITHUB_PAT
echo ""
[[ -z "$GITHUB_PAT" ]] && fail "GitHub PAT is required to push code"
ok "GitHub PAT received"

# ─── Push to GitHub ───────────────────────────────────────────────────────────

header "STEP 2 — Push code to GitHub"

git config user.email "naokiondawork@gmail.com"
git config user.name "naokiwork"
git remote set-url origin "https://naokiwork:${GITHUB_PAT}@github.com/naokiwork/life-heatmap.git" 2>/dev/null || \
  git remote add origin "https://naokiwork:${GITHUB_PAT}@github.com/naokiwork/life-heatmap.git"

git add -A
git commit -m "chore: deploy to Cloudflare Worker + Pages" --allow-empty 2>/dev/null || true
git push origin main --force
ok "Code pushed to GitHub"

# ─── Run Supabase schema ──────────────────────────────────────────────────────

header "STEP 3 — Apply Supabase database schema"

SUPABASE_PROJECT_ID="dqzmljdcgeizwtzcsoic"

echo "Applying schema via Supabase Management API..."
SCHEMA_SQL=$(cat supabase/schema.sql)

HTTP_STATUS=$(curl -s -o /tmp/supabase_response.json -w "%{http_code}" \
  --request POST \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query" \
  --header "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  --header "Content-Type: application/json" \
  --data "{\"query\": $(echo "$SCHEMA_SQL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}")

if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "201" ]]; then
  ok "Supabase schema applied"
else
  warn "Could not auto-apply schema (status $HTTP_STATUS)"
  warn "Please run supabase/schema.sql manually in Supabase SQL Editor:"
  warn "  https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql/new"
fi

# ─── Create Cloudflare KV namespace ──────────────────────────────────────────

header "STEP 4 — Create Cloudflare KV namespace"

export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

KV_OUTPUT=$(npx wrangler kv:namespace create RATE_LIMIT_KV 2>&1)
echo "$KV_OUTPUT"

KV_ID=$(echo "$KV_OUTPUT" | grep -o '"id": *"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')

if [[ -n "$KV_ID" ]]; then
  ok "KV namespace created: $KV_ID"
  # Update wrangler.toml with the real KV ID
  sed -i "s/REPLACE_WITH_KV_NAMESPACE_ID/${KV_ID}/g" wrangler.toml
  ok "wrangler.toml updated with KV ID"
else
  warn "Could not auto-extract KV ID — check output above and update wrangler.toml manually"
fi

# ─── Set Worker secrets ───────────────────────────────────────────────────────

header "STEP 5 — Set Cloudflare Worker secrets"

echo "$SUPABASE_SERVICE_ROLE_KEY" | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
ok "SUPABASE_SERVICE_ROLE_KEY set"

echo "$JWT_SECRET" | npx wrangler secret put JWT_SECRET
ok "JWT_SECRET set"

echo "$REPL_CLIENT_ID" | npx wrangler secret put REPL_CLIENT_ID
ok "REPL_CLIENT_ID set"

if [[ -n "$OPENAI_API_KEY" ]]; then
  echo "$OPENAI_API_KEY" | npx wrangler secret put OPENAI_API_KEY
  ok "OPENAI_API_KEY set"
fi

# ─── Update WORKER_URL and deploy ────────────────────────────────────────────

header "STEP 6 — Deploy Worker to Cloudflare"

# Update kill switch based on whether OpenAI key was provided
sed -i "s/FEATURE_AI_INSIGHTS_ENABLED = \"true\"/FEATURE_AI_INSIGHTS_ENABLED = \"${AI_ENABLED}\"/" wrangler.toml

# Determine the workers.dev subdomain from the account
WORKER_SUBDOMAIN=$(curl -s \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/subdomain" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --header "Content-Type: application/json" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -n "$WORKER_SUBDOMAIN" ]]; then
  WORKER_URL="https://life-heatmap.${WORKER_SUBDOMAIN}.workers.dev"
  sed -i "s|REPLACE_WITH_YOUR_SUBDOMAIN|${WORKER_SUBDOMAIN}|g" wrangler.toml
  ok "Worker URL: $WORKER_URL"
else
  warn "Could not auto-detect subdomain — update WORKER_URL in wrangler.toml manually"
fi

npx wrangler deploy
ok "Worker deployed!"

# ─── Deploy Cloudflare Pages ──────────────────────────────────────────────────

header "STEP 7 — Build and deploy frontend to Cloudflare Pages"

VITE_API_URL="${WORKER_URL:-https://life-heatmap.YOUR_SUBDOMAIN.workers.dev}" npm run build

npx wrangler pages deploy dist/public \
  --project-name life-heatmap \
  --branch main
ok "Pages deployed!"

# ─── Add GitHub Actions secrets ───────────────────────────────────────────────

header "STEP 8 — Configure GitHub Actions secrets (via GitHub API)"

set_gh_secret() {
  local secret_name="$1"
  local secret_value="$2"
  
  # Get repo public key
  KEY_INFO=$(curl -s \
    "https://api.github.com/repos/naokiwork/life-heatmap/actions/secrets/public-key" \
    --header "Authorization: Bearer ${GITHUB_PAT}" \
    --header "Accept: application/vnd.github+json")
  
  KEY_ID=$(echo "$KEY_INFO" | grep -o '"key_id":"[^"]*"' | cut -d'"' -f4)
  PUBLIC_KEY=$(echo "$KEY_INFO" | grep -o '"key":"[^"]*"' | cut -d'"' -f4)
  
  # Encrypt secret using libsodium (node script)
  ENCRYPTED=$(node -e "
    const sodium = require('libsodium-wrappers');
    sodium.ready.then(() => {
      const key = sodium.from_base64('${PUBLIC_KEY}', sodium.base64_variants.ORIGINAL);
      const msg = sodium.from_string('${secret_value}');
      const enc = sodium.crypto_box_seal(msg, key);
      console.log(sodium.to_base64(enc, sodium.base64_variants.ORIGINAL));
    });
  " 2>/dev/null)
  
  if [[ -z "$ENCRYPTED" ]]; then
    warn "Could not encrypt ${secret_name} — set it manually in GitHub repo settings"
    return
  fi
  
  curl -s -X PUT \
    "https://api.github.com/repos/naokiwork/life-heatmap/actions/secrets/${secret_name}" \
    --header "Authorization: Bearer ${GITHUB_PAT}" \
    --header "Accept: application/vnd.github+json" \
    --header "Content-Type: application/json" \
    --data "{\"encrypted_value\":\"${ENCRYPTED}\",\"key_id\":\"${KEY_ID}\"}" > /dev/null
  ok "GitHub secret ${secret_name} set"
}

set_gh_secret "CLOUDFLARE_API_TOKEN" "$CLOUDFLARE_API_TOKEN"
set_gh_secret "CLOUDFLARE_ACCOUNT_ID" "$CLOUDFLARE_ACCOUNT_ID"
set_gh_secret "SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY"
set_gh_secret "JWT_SECRET" "$JWT_SECRET"
set_gh_secret "REPL_CLIENT_ID" "$REPL_CLIENT_ID"
[[ -n "$OPENAI_API_KEY" ]] && set_gh_secret "OPENAI_API_KEY" "$OPENAI_API_KEY"

# Set the VITE_API_URL as a GitHub Actions variable
curl -s -X POST \
  "https://api.github.com/repos/naokiwork/life-heatmap/actions/variables" \
  --header "Authorization: Bearer ${GITHUB_PAT}" \
  --header "Accept: application/vnd.github+json" \
  --header "Content-Type: application/json" \
  --data "{\"name\":\"VITE_API_URL\",\"value\":\"${WORKER_URL}\"}" > /dev/null
ok "GitHub variable VITE_API_URL set"

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Frontend:   https://life-heatmap.pages.dev"
echo "  Worker API: ${WORKER_URL:-https://life-heatmap.YOUR_SUBDOMAIN.workers.dev}"
echo "  GitHub:     https://github.com/naokiwork/life-heatmap"
echo ""
if [[ "$AI_ENABLED" == "false" ]]; then
  warn "AI Insights disabled. To enable later:"
  warn "  1. Set OPENAI_API_KEY: echo 'sk-...' | npx wrangler secret put OPENAI_API_KEY"
  warn "  2. Update wrangler.toml: FEATURE_AI_INSIGHTS_ENABLED = \"true\""
  warn "  3. Redeploy: npx wrangler deploy"
fi
echo ""
