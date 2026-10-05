# Render startup diagnostic patch

October 5, 2026. The operator reports that the first hosted build/audit/upload succeeded, but runtime startup exited with only `{"event":"render_start_failed"}`. The operator confirmed all four required application secrets and the configured 1 GB disk at /var/data/commit. These observations do not identify the failing check. No root cause or successful hosted startup is claimed yet.

This patch changes only deployment failure diagnostics and their tests. Existing validation predicates remain enforced. Consumer/merchant UI, routing, PayPal semantics, solver, authority, AG Studio, SQLite schema/storage architecture, disk and plan remain unchanged. No environment value, secret prefix, credential, raw provider response, cookie, session ID, database row or exception message/stack/cause is printed.

## Safe log contract

A failed launcher now emits exactly three fields, all from a fixed allowlist:

```json
{"event":"render_start_failed","stage":"config","reason":"missing_required_env"}
```

The example is illustrative; it does not assert that a secret is missing on the deployed service. Success/ready/stopped events remain unchanged. No environment dump or raw child stdout/stderr is enabled.

| Stage | What failed |
| --- | --- |
| config | Existing deployment environment validation |
| storage | Existing disk/path/mount checks or private directory preparation |
| control | Existing private reset socket and metadata setup |
| database | Compiled/native dependency loading, SQLite opening, migrations or initialization checks |
| gateway | Gateway construction or binding the public Render port |
| consumer / merchant | Child spawning, premature exit or startup timeout |
| consumer_dependencies / merchant_dependencies | Loading the same frozen compiled runtime dependencies |
| consumer_database / merchant_database | Opening the existing shared staging SQLite database |
| consumer_services / merchant_services | Constructing the existing runtime services |
| consumer_listen / merchant_listen | Binding the existing loopback listener |
| launcher | An unclassified wrapper failure; no raw exception is exposed |

Configuration reasons distinguish invalid Render/Node/staging settings, non-Sandbox payment mode, AI mode, fixed database path, platform hostname, port, missing required application values and invalid optional capability configuration. They never include the rejected value. The validated environment/secret requirements are unchanged.

Filesystem/network reasons map only recognized error codes: permission_denied, resource_missing, disk_full, read_only_filesystem, address_in_use, address_unavailable and file_limit_reached. Dependency reasons include module_missing and native_module_load_failed. SQLite reasons map recognized numeric base/extended error codes; they never inspect the exception text or database contents. Unknown errors receive a fixed stage-specific fallback.

The fixed disk guard can report disk_mount_not_detected if its existing exact mount check fails; permission_denied reports an OS access failure. Neither is evidence that the operator failed to configure a disk. This patch does not relax checks or guess a platform workaround.

Child errors are sent as only type/stage/reason. The launcher independently validates the child's stage against its runtime and checks both labels against its allowlist. The IPC send completes before the child exits, so the useful reason is not lost behind a generic child-exit event. Raw child output stays suppressed. Dependency loading is caught inside the same safe boundary. Shutdown received during that loading prevents subsequent runtime/database creation.

## Operator next step

Manually deploy the diagnostic commit, retaining the current service secrets, disk and Blueprint. Share only the new render_start_failed JSON line. That line will identify the failing stage/reason for a narrow follow-up. Do not paste environment values, private service screenshots, database contents or provider payloads. No deploy or live PayPal operation is performed by this task.

## Verification

The added tests exercise the real launcher CLI, configuration rejection, filesystem and SQLite failures, gateway/consumer/merchant listener collisions, cross-runtime/malicious IPC labels and startup shutdown. Sentinel secret, cookie, provider and private-path text must never appear in the safe record. Fixtures use fresh disposable local databases and offline AI, without PayPal credentials. Existing full deployment/application regressions, typecheck and audited build are run before publication.

Final verification: **317/317 tests PASS**, zero failures/skips, including all 306 preceding regressions plus 11 diagnostic checks. Typecheck and the audited clean build PASS; the build has 79 files, zero historical ledgers and zero configured-secret leaks. **505 protected files and eight historical databases (235 table snapshots) remain unchanged**. The plan, disk, Blueprint, routing gateway and frozen application source are unchanged. No live PayPal operations or Render deployment were performed.

Exact test, source/history preservation and secret-scan results are stored locally under docs/assets/render-startup-diagnostic/. Previous wrapper/configuration/operator-guide bytes are archived there. Earlier Phase 6.1A, Phase 6.1B/B2 and payment receipts remain untouched. Actual hosted root cause and recovery remain pending the next manual deployment's safe log.
