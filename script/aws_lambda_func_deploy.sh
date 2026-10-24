#!/bin/bash
# prepare environment variables from config/env/.env
set -e

cleanup() {
    rm -f function.zip || true
}
trap cleanup EXIT

set -a
source config/env/.env
set +a

# Only create a function when AWS confirms that it does not exist. Other lookup
# failures (for example, missing permissions or network errors) must be surfaced.
if lookup_error="$(aws lambda get-function --function-name "$AWS_LAMBDA_FUNCTION_NAME" 2>&1 >/dev/null)"; then
    echo "Updating AWS Lambda Function"
    script/aws_lambda_func_update.sh "$AWS_LAMBDA_FUNCTION_NAME"
else
    lookup_status=$?
    if [[ "$lookup_error" == *ResourceNotFoundException* ]]; then
        echo "Creating AWS Lambda Function"
        aws lambda create-function \
            --function-name "$AWS_LAMBDA_FUNCTION_NAME" \
            --runtime nodejs22.x \
            --role "$AWS_LAMBDA_FUNCTION_ROLE" \
            --handler "$AWS_LAMBDA_FUNCTION_HANDLER" \
            --zip-file fileb://function.zip > /dev/null
        aws lambda wait function-active \
            --function-name "$AWS_LAMBDA_FUNCTION_NAME"
    else
        printf '%s\n' "$lookup_error" >&2
        exit "$lookup_status"
    fi
fi

echo "AWS Lambda Function Deployed Successfully"
