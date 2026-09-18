#!/bin/sh
set -e

SECRET_FILE="/app/data/.session_secret"

if [ -z "$SESSION_SECRET" ]; then
  mkdir -p /app/data
  if [ ! -f "$SECRET_FILE" ]; then
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
  fi
  export SESSION_SECRET="$(cat "$SECRET_FILE")"
fi

exec node server.js
