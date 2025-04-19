#!/bin/bash
# prepare environment variables from config/env/.env
set -a
source config/env/.env
set +a

# check if AWS Function is already deployed
aws lambda get-function --function-name $AWS_LAMBDA_FUNCTION_NAME > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "Updating AWS Lambda Function"
    aws lambda update-function-code \
        --function-name $AWS_LAMBDA_FUNCTION_NAME \
        --zip-file fileb://function.zip > /dev/null 2>&1
else
    echo "Creating AWS Lambda Function"
    aws lambda create-function \
        --function-name $AWS_LAMBDA_FUNCTION_NAME \
        --runtime nodejs20.x \
        --role $AWS_LAMBDA_FUNCTION_ROLE \
        --handler $AWS_LAMBDA_FUNCTION_HANDLER \
        --zip-file fileb://function.zip > /dev/null 2>&1
fi

# print the result
if [ $? -eq 0 ]; then
    echo "AWS Lambda Function Deployed Successfully"
else
    echo "Failed to Deploy AWS Lambda Function"
fi

# Remove the function.zip file
rm function.zip