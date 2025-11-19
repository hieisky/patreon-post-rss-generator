# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A dual-deployment service that generates RSS feeds from Patreon campaign posts. Supports both Cloudflare Workers and AWS Lambda deployments with a shared core service architecture.

**Key characteristic**: The project uses ES modules (`"type": "module"` in package.json) with `.js` extensions, so all imports must include the `.js` extension.

## Architecture

The codebase uses a **handler-service pattern** with deployment-specific adapters:

```
src/
├── handlers/          # Deployment platform adapters
│   ├── worker.js      # Cloudflare Workers adapter (exports default fetch handler)
│   └── lambda.js      # AWS Lambda adapter (exports handler function)
└── services/          # Shared business logic
    ├── patreon.js     # Patreon API interaction (fetchPatreonData, prepareUrl)
    └── rss.js         # RSS generation (generateRSS, escapeXml)
```

**Handler responsibilities**: Parse platform-specific request formats, extract query parameters, call services, format platform-specific responses.

**Service responsibilities**: Pure functions that handle Patreon API communication and RSS XML generation. Platform-agnostic.

### Query Parameters

Both handlers support:
- `campaign_id` (required): Patreon campaign identifier
- `user_defined_tags` (optional): Comma-separated tag filter
- `media_type` (optional): Filter by media type

### Patreon API Integration

The service uses the public Patreon API endpoint `/api/posts` with JSON:API format. Key fields requested:
- Post: content, teaser_text, content_teaser_text, published_at, title, url, image, thumbnail
- User: full_name, url
- Campaign info included via `include=campaign` parameter

**Important**: The service does not support authenticated Patreon feeds (patron-only posts).

## Development Commands

### Local Development

```bash
# Start local Cloudflare Workers development server
yarn run worker-dev
# or
npm run worker-dev
```

This uses `wrangler dev` with the config at [config/cloudflare/wrangler-dev.toml](config/cloudflare/wrangler-dev.toml).

### Deployment

**Cloudflare Workers** (via GitHub Actions):
```bash
# Create and push a semantic version tag
git tag v1.0.0
git push origin v1.0.0
```
The GitHub Action at [.github/workflows/cloudflare_worker.yaml](.github/workflows/cloudflare_worker.yaml) automatically deploys on tag push.

**Manual Cloudflare deployment**:
```bash
yarn run worker-publish
```

**AWS Lambda**:
```bash
# First, configure config/env/.env with AWS credentials
# Then deploy
yarn run deploy-lambda
# or
npm run deploy-lambda
```

This runs the [script/aws_lambda_func_deploy.sh](script/aws_lambda_func_deploy.sh) script which:
1. Creates function.zip (via `npm run zip`)
2. Creates or updates Lambda function using AWS CLI
3. Cleans up the zip file

## Configuration

### Environment Variables

Copy [config/env/.env.sample](config/env/.env.sample) to `config/env/.env` and configure:

**For Cloudflare Workers**:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

**For AWS Lambda**:
- `AWS_PROFILE`
- `AWS_REGION`
- `AWS_LAMBDA_FUNCTION_ROLE`
- `AWS_LAMBDA_FUNCTION_NAME`

### Wrangler Configuration

- [config/cloudflare/wrangler-dev.toml](config/cloudflare/wrangler-dev.toml): Local development
- `config/cloudflare/wrangler.toml`: Production deployment

## Known Limitations

1. **Cloudflare CPU limit**: 10ms CPU time limit may prevent fetching/parsing large posts, resulting in partial feeds
2. **Bot detection**: Cloudflare forwards `cf-connecting-ip` header in subrequests, which may cause 403 errors if the RSS reader's IP is flagged as a bot by Patreon (e.g., BazQux Reader)
3. **Authentication**: Does not support patron-only content requiring login

## Testing

The [http/](http/) directory contains HTTP request files for manual API testing:
- `patreon_post.http`: Test RSS feed generation
- `patreon_search.http`: Test Patreon API searches

Use these with an HTTP client (like REST Client for VS Code or IntelliJ HTTP Client).

## Code Style Notes

- ES modules with explicit `.js` extensions in all imports
- Platform adapters handle request/response formatting
- Services are pure functions with no platform dependencies
- XML escaping via `escapeXml()` for text nodes, CDATA for rich content
- Error responses include detailed logging with timestamp, user agent, and request details
