import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

function configuration(revision, options = {}) {
    return [
        revision,
        options.status ?? 'Successful',
        options.reason ?? 'None',
        options.runtime ?? 'nodejs22.x',
        options.hash ?? 'uploaded-code'
    ].join('\t');
}

function deploy(configurations, options = {}) {
    // An inherited descriptor retains mock responses across command substitutions.
    // PATH excludes the real AWS CLI; no AWS account or environment file is used.
    const responses = [...configurations, ...Array(60).fill(configurations.at(-1))];
    const mock = `
aws() {
    local operation="$2" arguments="$*" query=""
    local revision status reason runtime hash
    printf 'AWS:%s\\n' "$arguments" >&2
    shift 2
    while (( $# )); do
        if [[ "$1" == --query ]]; then query="$2"; shift 2; else shift; fi
    done
    if [[ "$operation" == "$MOCK_FAIL_ACTION" &&
        ( -z "$MOCK_FAIL_QUERY" || "$query" == "$MOCK_FAIL_QUERY" ) ]]; then
        echo 'AWS mock diagnostic' >&2
        return 42
    fi
    case "$operation" in
        get-function-configuration)
            IFS=$'\\t' read -r revision status reason runtime hash <&3 || return 87
            case "$query" in
                RevisionId) printf '%s\\n' "$revision" ;;
                '[RevisionId,LastUpdateStatus,LastUpdateStatusReasonCode,Runtime]')
                    printf '%s\\t%s\\t%s\\t%s\\n' "$revision" "$status" "$reason" "$runtime" ;;
                '[RevisionId,LastUpdateStatus,LastUpdateStatusReasonCode,Runtime,CodeSha256]')
                    printf '%s\\t%s\\t%s\\t%s\\t%s\\n' "$revision" "$status" "$reason" "$runtime" "$hash" ;;
                *) echo "Unexpected query: $query" >&2; return 86 ;;
            esac ;;
        update-function-code)
            case "$query" in
                RevisionId) echo 'code-pending' ;;
                CodeSha256) printf '%s\\n' "$MOCK_UPLOAD_HASH" ;;
                *) return 85 ;;
            esac ;;
        update-function-configuration)
            echo 'configuration-pending' ;;
        *) echo "Unexpected AWS operation: $operation" >&2; return 84 ;;
    esac
}
sleep() {
    printf 'SLEEP:%s\\n' "$1" >&2
    return "$MOCK_SLEEP_EXIT"
}
export -f aws sleep
exec 3<<'MOCK_RESPONSES'
${responses.join('\n')}
MOCK_RESPONSES
script/aws_lambda_func_update.sh test-function
`;
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-c', mock], {
        cwd: root,
        encoding: 'utf8',
        timeout: 5000,
        env: {
            PATH: '/nonexistent',
            HOME: '/nonexistent',
            BASH_ENV: '/dev/null',
            MOCK_UPLOAD_HASH: options.uploadHash ?? 'uploaded-code',
            MOCK_FAIL_ACTION: options.failAction ?? '',
            MOCK_FAIL_QUERY: options.failQuery ?? '',
            MOCK_SLEEP_EXIT: String(options.sleepExit ?? 0)
        }
    });
    assert.ifError(result.error);
    return result;
}

function calls(result, operation) {
    return result.stderr.split('\n').filter(line => line.startsWith(`AWS:lambda ${operation} `));
}

test('completes when AWS changes the revision while finalizing the code update', () => {
    const result = deploy([
        configuration('before', { hash: 'old-code' }),
        configuration('code-pending', { status: 'InProgress' }),
        configuration('code-finished')
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls(result, 'get-function-configuration').length, 3);
    assert.equal(calls(result, 'update-function-configuration').length, 0);
});

test('uses the completed code revision for the runtime precondition and tolerates another revision change', () => {
    const result = deploy([
        configuration('before', { hash: 'old-code', runtime: 'nodejs20.x' }),
        configuration('code-finished', { runtime: 'nodejs20.x' }),
        configuration('code-finished', { runtime: 'nodejs20.x' }),
        configuration('configuration-pending', { status: 'InProgress' }),
        configuration('configuration-finished')
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(calls(result, 'update-function-code')[0], /--revision-id before(?: |$)/);
    assert.match(calls(result, 'update-function-configuration')[0], /--revision-id code-finished(?: |$)/);
    assert.equal(calls(result, 'get-function-configuration').length, 5);
});

test('rejects stale success even when the same ZIP was already deployed', () => {
    const result = deploy([
        configuration('before'),
        configuration('before'),
        configuration('code-finished')
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls(result, 'get-function-configuration').length, 3);
    assert.equal(result.stderr.match(/SLEEP:5/g)?.length, 1);
});

test('accepts immediate completion without requiring an InProgress observation', () => {
    const result = deploy([configuration('before'), configuration('code-finished')]);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /SLEEP:/);
});

test('does not accept a changed revision containing a different deployment package', () => {
    const result = deploy([
        configuration('before', { hash: 'old-code' }),
        configuration('other-deployment', { hash: 'different-code' })
    ]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Timed out/);
    assert.equal(calls(result, 'get-function-configuration').length, 61);
    assert.equal(calls(result, 'update-function-configuration').length, 0);
});

test('does not accept a completed runtime change that replaced the uploaded code', () => {
    const result = deploy([
        configuration('before'),
        configuration('code-finished', { runtime: 'nodejs20.x' }),
        configuration('other-deployment', { hash: 'different-code' })
    ]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Timed out/);
    assert.equal(calls(result, 'update-function-configuration').length, 1);
});

test('does not report success while the completed configuration has the wrong runtime', () => {
    const result = deploy([
        configuration('before'),
        configuration('code-finished', { runtime: 'nodejs20.x' }),
        configuration('configuration-finished', { runtime: 'nodejs20.x' })
    ]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /expected runtime 'nodejs22.x'/);
});

for (const status of ['InProgress', 'Successful']) {
    test(`bounds polling when the old revision remains ${status}`, () => {
        const result = deploy([configuration('before'), configuration('before', { status })]);
        assert.equal(result.status, 1, result.stderr);
        assert.equal(calls(result, 'get-function-configuration').length, 61);
        assert.equal(result.stderr.match(/SLEEP:5/g)?.length, 59);
        assert.match(result.stderr, /Timed out/);
    });
}

test('surfaces failed updates and AWS reason codes immediately', () => {
    const result = deploy([
        configuration('before'),
        configuration('code-finished', { status: 'Failed', reason: 'InvalidRuntime' })
    ]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /InvalidRuntime/);
    assert.equal(calls(result, 'update-function-configuration').length, 0);
});

for (const failAction of ['get-function-configuration', 'update-function-code', 'update-function-configuration']) {
    test(`preserves errors from ${failAction}`, () => {
        const result = deploy([
            configuration('before'),
            configuration('code-finished', { runtime: 'nodejs20.x' })
        ], { failAction });
        assert.equal(result.status, 42, result.stderr);
        assert.match(result.stderr, /AWS mock diagnostic/);
    });
}

test('preserves a polling API error after the upload was accepted', () => {
    const result = deploy([configuration('before')], {
        failAction: 'get-function-configuration',
        failQuery: '[RevisionId,LastUpdateStatus,LastUpdateStatusReasonCode,Runtime,CodeSha256]'
    });
    assert.equal(result.status, 42, result.stderr);
    assert.match(result.stderr, /AWS mock diagnostic/);
    assert.equal(calls(result, 'update-function-code').length, 1);
    assert.equal(calls(result, 'update-function-configuration').length, 0);
});

test('rejects a missing initial revision before sending an update', () => {
    const result = deploy([configuration('None')]);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(calls(result, 'update-function-code').length, 0);
});

test('rejects an invalid update status', () => {
    const result = deploy([configuration('before'), configuration('code-finished', { status: 'Unknown' })]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /invalid update status/);
});

test('rejects an upload response without a code hash', () => {
    const result = deploy([configuration('before')], { uploadHash: 'None' });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(calls(result, 'get-function-configuration').length, 1);
});

test('preserves failures of the polling delay', () => {
    const result = deploy([configuration('before'), configuration('before')], { sleepExit: 43 });
    assert.equal(result.status, 43, result.stderr);
    assert.equal(calls(result, 'get-function-configuration').length, 2);
});

test('logs poll progress so a pending update is visible in Actions', () => {
    const result = deploy([configuration('before'), configuration('code-finished')]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /poll 1\/60/);
    assert.match(result.stderr, /Successful/);
});
