# Patreon RSS Generator

A Cloudflare Worker that generates RSS feeds for Patreon campaigns, allowing you to follow creators' posts using any RSS reader.

Also, you can deploy this worker to AWS Lambda.

## Features

- Converts Patreon campaign posts into RSS format
- Github Action to Cloudflare worker
- Deploy to AWS Lambda

## Usage

Access the RSS feed by making a GET request to your worker's URL with a campaign ID:

```
https://[your-worker-domain]/?campaign_id=[patreon-campaign-id]
Or
https://[your-aws-lambda-api-gateway-domain]/?campaign_id=[patreon-campaign-id]
```

### Query Parameters

- `campaign_id` (required): The Patreon campaign ID you want to generate an RSS feed for

## Limitations

- Cloudflare worker has a 10ms CPU time limit, so the worker may not be able to fetch and parse large posts in a single request. In such cases, the worker will return a partial feed with a link to the full post.
- The worker does not support authenticated Patreon feeds (e.g., posts that require a Patreon login to view).
- Referred to [CF-CF-Connecting-IP in Worker subrequests](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip-in-worker-subrequests), if your RSS reader service's IP determines as a bot, and `fetch` will forward the `cf-connecting-ip` header to Patreon endpoint and may cause 403 Forbidden. (e.g. BazQux Reader)

## Development

### Prerequisites

- Node.js (latest LTS version)
- Cloudflare Workers account / AWS account
- Wrangler CLI 
- AWS Account and AWS Role that able to create and run Lambda functions

### Configuration

1. Run `yarn install` or `npm install` to install dependencies.

2. Set up the following secrets in your GitHub repository:
   - If you are using Cloudflare Workers:
     - `CLOUDFLARE_API_TOKEN`
     - `CLOUDFLARE_ACCOUNT_ID`
   - If you are using AWS Lambda:
     - `AWS_PROFILE`
     - `AWS_REGION`
     - `AWS_LAMBDA_FUNCTION_NAME`
     - `AWS_LAMBDA_ROLE_ARN`

## Local Run

To run the project locally: `yarn run worker-dev` or `npm run worker-dev`

## Deployment

### Cloudflare Workers

The project uses GitHub Actions for automated deployments. To deploy:

1. Create a new tag following semantic versioning:
    ```bash
    git tag v1.0.0
    git push origin v1.0.0
    ```

2. The GitHub Action will automatically deploy to Cloudflare Workers when a new tag is pushed.

### AWS Lambda

The project uses deployment scription to deploy to AWS Lambda. To deploy:

1. Setup AWS CLI with your AWS account (please refer `.env.sample`).

2. Run the following command to deploy to AWS Lambda:
    ```bash
    yarn run deploy-lambda
    ```
3. For the API Gateway, follow the detailed guide by Amirhossein Soltani ([published Feb 18, 2023](https://medium.com/@amirhosseinsoltani7/connect-cloudflare-to-aws-api-gateway-c64f0713b5e9)). Note: You may need to adjust some steps based on current AWS Console interface.

## License

MIT License