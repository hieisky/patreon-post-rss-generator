#!/bin/bash

set -e

function_name="${1:-}"

if [[ -z "$function_name" ]]; then
    echo "Usage: $0 FUNCTION_NAME" >&2
    exit 2
fi

is_missing_value() {
    [[ -z "$1" || "$1" == "None" || "$1" == "null" ]]
}

wait_for_update() {
    local function_name="$1"
    local previous_revision="$2"
    local expected_hash="$3"
    local expected_runtime="${4:-}"
    local attempt state returned_revision update_status reason_code runtime code_hash aws_status

    # Lambda can create multiple revisions during one update. Reject the old
    # snapshot, but verify the uploaded code and desired runtime rather than
    # requiring the mutation response's temporary RevisionId to survive.
    for ((attempt = 1; attempt <= 60; attempt++)); do
        if state="$(aws lambda get-function-configuration \
            --function-name "$function_name" \
            --query '[RevisionId,LastUpdateStatus,LastUpdateStatusReasonCode,Runtime,CodeSha256]' \
            --output text)"; then
            :
        else
            aws_status=$?
            echo "Failed to get Lambda function '$function_name' configuration while waiting for its update." >&2
            return "$aws_status"
        fi

        IFS=$'\t' read -r returned_revision update_status reason_code runtime code_hash <<< "$state"

        printf 'Lambda %s: poll %s/60, status=%s, revision=%s, runtime=%s\n' \
            "$function_name" "$attempt" "$update_status" "$returned_revision" "$runtime" >&2

        if is_missing_value "$returned_revision"; then
            echo "Lambda function '$function_name' returned a missing revision while waiting for its update." >&2
            return 1
        fi

        case "$update_status" in
            Failed)
                echo "Lambda function '$function_name' update failed (observed revision '$returned_revision', reason '$reason_code')." >&2
                return 1
                ;;
            InProgress)
                ;;
            Successful)
                if is_missing_value "$runtime" || is_missing_value "$code_hash"; then
                    echo "Lambda function '$function_name' returned a missing runtime or code hash for successful revision '$returned_revision'." >&2
                    return 1
                fi
                if [[ "$returned_revision" != "$previous_revision" && "$code_hash" == "$expected_hash" &&
                    ( -z "$expected_runtime" || "$runtime" == "$expected_runtime" ) ]]; then
                    printf '%s\t%s\n' "$returned_revision" "$runtime"
                    return 0
                fi
                ;;
            *)
                echo "Lambda function '$function_name' returned invalid update status '$update_status' (observed revision '$returned_revision')." >&2
                return 1
                ;;
        esac

        if (( attempt < 60 )); then
            sleep 5 || return $?
        fi
    done

    echo "Timed out waiting for Lambda function '$function_name' to complete the requested update after 60 attempts (status '$update_status', revision '$returned_revision', runtime '$runtime', code hash '$code_hash', expected hash '$expected_hash', expected runtime '${expected_runtime:-any}')." >&2
    return 1
}

if previous_revision="$(aws lambda get-function-configuration \
    --function-name "$function_name" \
    --query RevisionId \
    --output text)"; then
    :
else
    aws_status=$?
    echo "Failed to read Lambda function '$function_name' before updating code." >&2
    exit "$aws_status"
fi

if is_missing_value "$previous_revision"; then
    echo "Lambda function '$function_name' returned a missing revision ID before updating code." >&2
    exit 1
fi

echo "Uploading code for Lambda function '$function_name'." >&2
if code_hash="$(aws lambda update-function-code \
    --function-name "$function_name" \
    --revision-id "$previous_revision" \
    --zip-file fileb://function.zip \
    --query CodeSha256 \
    --output text)"; then
    :
else
    aws_status=$?
    echo "Failed to update code for Lambda function '$function_name'." >&2
    exit "$aws_status"
fi

if is_missing_value "$code_hash"; then
    echo "Lambda function '$function_name' returned a missing code hash after updating code." >&2
    exit 1
fi

completed_update="$(wait_for_update "$function_name" "$previous_revision" "$code_hash")"
IFS=$'\t' read -r code_revision runtime <<< "$completed_update"

if [[ "$runtime" == "nodejs22.x" ]]; then
    echo "Lambda code update completed; runtime is already nodejs22.x." >&2
    exit 0
fi

echo "Updating Lambda function '$function_name' runtime to nodejs22.x." >&2
if aws lambda update-function-configuration \
    --function-name "$function_name" \
    --revision-id "$code_revision" \
    --runtime nodejs22.x \
    --query RevisionId \
    --output text > /dev/null; then
    :
else
    aws_status=$?
    echo "Failed to update runtime for Lambda function '$function_name' using revision '$code_revision'." >&2
    exit "$aws_status"
fi

wait_for_update "$function_name" "$code_revision" "$code_hash" nodejs22.x > /dev/null
echo "Lambda code and runtime updates completed successfully." >&2
