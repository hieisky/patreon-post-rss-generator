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

wait_for_revision() {
    local function_name="$1"
    local expected_revision="$2"
    local attempt state returned_revision update_status reason_code runtime aws_status

    if is_missing_value "$expected_revision"; then
        echo "Lambda function '$function_name' returned a missing expected revision ID." >&2
        return 1
    fi

    # A stale successful revision must not satisfy this update; fast updates may
    # complete before polling begins, so observing InProgress is not required.
    for ((attempt = 1; attempt <= 60; attempt++)); do
        if state="$(aws lambda get-function-configuration \
            --function-name "$function_name" \
            --query '[RevisionId,LastUpdateStatus,LastUpdateStatusReasonCode,Runtime]' \
            --output text)"; then
            :
        else
            aws_status=$?
            echo "Failed to get Lambda function '$function_name' configuration while waiting for revision '$expected_revision'." >&2
            return "$aws_status"
        fi

        IFS=$'\t' read -r returned_revision update_status reason_code runtime <<< "$state"

        if is_missing_value "$returned_revision"; then
            echo "Lambda function '$function_name' returned a missing revision while waiting for revision '$expected_revision'." >&2
            return 1
        fi

        case "$update_status" in
            Failed)
                echo "Lambda function '$function_name' update for revision '$expected_revision' failed (observed revision '$returned_revision', reason '$reason_code')." >&2
                return 1
                ;;
            InProgress)
                ;;
            Successful)
                if [[ "$returned_revision" == "$expected_revision" ]]; then
                    if is_missing_value "$runtime"; then
                        echo "Lambda function '$function_name' returned a missing runtime for successful revision '$expected_revision'." >&2
                        return 1
                    fi
                    printf '%s\n' "$runtime"
                    return 0
                fi
                ;;
            *)
                echo "Lambda function '$function_name' returned invalid update status '$update_status' while waiting for revision '$expected_revision' (observed revision '$returned_revision')." >&2
                return 1
                ;;
        esac

        if (( attempt < 60 )); then
            sleep 5 || return $?
        fi
    done

    echo "Timed out waiting for Lambda function '$function_name' revision '$expected_revision' to become successful after 60 attempts." >&2
    return 1
}

if code_revision="$(aws lambda update-function-code \
    --function-name "$function_name" \
    --zip-file fileb://function.zip \
    --query RevisionId \
    --output text)"; then
    :
else
    aws_status=$?
    echo "Failed to update code for Lambda function '$function_name'." >&2
    exit "$aws_status"
fi

if is_missing_value "$code_revision"; then
    echo "Lambda function '$function_name' returned a missing revision ID after updating code." >&2
    exit 1
fi

runtime="$(wait_for_revision "$function_name" "$code_revision")"

if [[ "$runtime" == "nodejs22.x" ]]; then
    exit 0
fi

if configuration_revision="$(aws lambda update-function-configuration \
    --function-name "$function_name" \
    --revision-id "$code_revision" \
    --runtime nodejs22.x \
    --query RevisionId \
    --output text)"; then
    :
else
    aws_status=$?
    echo "Failed to update runtime for Lambda function '$function_name' using revision '$code_revision'." >&2
    exit "$aws_status"
fi

if is_missing_value "$configuration_revision"; then
    echo "Lambda function '$function_name' returned a missing revision ID after updating runtime from revision '$code_revision'." >&2
    exit 1
fi

final_runtime="$(wait_for_revision "$function_name" "$configuration_revision")"

if [[ "$final_runtime" != "nodejs22.x" ]]; then
    echo "Lambda function '$function_name' revision '$configuration_revision' completed with runtime '$final_runtime', expected 'nodejs22.x'." >&2
    exit 1
fi
