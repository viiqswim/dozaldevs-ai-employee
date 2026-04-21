#!/usr/bin/env bash
# generate-jwt-keys.sh — Generate static JWT anon and service_role keys
#
# Usage:
#   bash scripts/generate-jwt-keys.sh [JWT_SECRET]
#
# If JWT_SECRET is not provided, uses the default dev secret.
# Output: ANON_KEY and SERVICE_ROLE_KEY environment variable assignments.
#
# Example:
#   bash scripts/generate-jwt-keys.sh "my-secret" >> docker/.env
#   # Or just print:
#   bash scripts/generate-jwt-keys.sh

set -euo pipefail

JWT_SECRET="${1:-${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}}"

if [ ${#JWT_SECRET} -lt 32 ]; then
  echo "ERROR: JWT_SECRET must be at least 32 characters long" >&2
  exit 1
fi

# Generate JWT using Node.js (available in the repo)
node -e "
const crypto = require('crypto');

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeJWT(payload, secret) {
  const header = base64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret)
    .update(header + '.' + body).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return header + '.' + body + '.' + sig;
}

const secret = process.argv[1];
const iat = Math.floor(Date.now() / 1000);
const exp = iat + (10 * 365 * 24 * 3600); // 10 years

const anonKey = makeJWT({role:'anon',iss:'supabase',iat,exp}, secret);
const serviceKey = makeJWT({role:'service_role',iss:'supabase',iat,exp}, secret);

console.log('ANON_KEY=' + anonKey);
console.log('SERVICE_ROLE_KEY=' + serviceKey);
" "$JWT_SECRET"
