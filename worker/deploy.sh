#!/bin/bash
set -e

ACCOUNT_ID="0eea1400b40de45cde5de42a11d1d553"
CF_EMAIL="Drew.mattie@gmail.com"
CF_KEY="a06db050a42ef1031fe3d3f1afd21711a282b"

echo "=== Pipeline Score API Deploy ==="
cd "$(dirname "$0")"

# Step 1: Create D1 database (idempotent)
echo "Creating D1 database..."
DB_RESPONSE=$(curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/d1/database" \
  -H "X-Auth-Email: $CF_EMAIL" \
  -H "X-Auth-Key: $CF_KEY" \
  -H "Content-Type: application/json" \
  --data '{"name":"pipelinescore-db"}')

DB_ID=$(echo $DB_RESPONSE | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('uuid',''))" 2>/dev/null)

# If already exists, fetch the ID
if [ -z "$DB_ID" ]; then
  echo "Database may already exist, fetching ID..."
  LIST_RESPONSE=$(curl -s -X GET \
    "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/d1/database" \
    -H "X-Auth-Email: $CF_EMAIL" \
    -H "X-Auth-Key: $CF_KEY")
  DB_ID=$(echo $LIST_RESPONSE | python3 -c "import sys,json; dbs=json.load(sys.stdin).get('result',[]); print(next((d['uuid'] for d in dbs if d['name']=='pipelinescore-db'),''))" 2>/dev/null)
fi

echo "D1 Database ID: $DB_ID"

# Step 2: Update wrangler.toml with real DB ID
sed -i.bak "s/database_id = \"PLACEHOLDER\"/database_id = \"$DB_ID\"/" wrangler.toml
rm -f wrangler.toml.bak

# Step 3: Run schema migrations
echo "Running schema migrations..."
CLOUDFLARE_EMAIL="$CF_EMAIL" CLOUDFLARE_API_KEY="$CF_KEY" \
  npx wrangler@latest d1 execute pipelinescore-db --file=schema.sql --remote

# Step 4: Deploy Worker
echo "Deploying Worker..."
CLOUDFLARE_EMAIL="$CF_EMAIL" CLOUDFLARE_API_KEY="$CF_KEY" \
  npx wrangler@latest deploy

echo ""
echo "=== Deploy Complete ==="
echo "API live at: https://pipelinescore-api.[your-subdomain].workers.dev"
echo "Test: curl https://pipelinescore-api.[subdomain].workers.dev/api/stats"
