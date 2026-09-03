#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
printf 'SIPIC-RP disponível em http://127.0.0.1:8080\n'
exec node server.mjs
