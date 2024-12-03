#!/bin/bash
# prepare environment variables from config/env/.env
set -a
source config/env/.env
set +a

npx wrangler deploy \
    --config config/cloudflare/wrangler.toml 
