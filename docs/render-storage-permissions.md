# Render storage permission follow-up

October 5, 2026. The operator deployed diagnostic commit b2431d5ddb8def0a15510b75c9ab108377970b30. The Node 24.17.0 build and 79-file audit passed. Runtime repeatedly reported:

```json
{"event":"render_start_failed","stage":"storage","reason":"permission_denied"}
```

Configuration validation completed, including required application-value presence. Storage preparation failed before SQLite initialization, listeners or provider services. The old safe log combines EACCES and EPERM and does not identify the exact failing syscall. The report does not claim to know the deployed disk's owner or permission bits.

## Confirmed wrapper defect and narrow correction

The wrapper unconditionally called chmod on the mount root. Write access and permission to change a directory's mode are separate authorities: POSIX can reject chmod when the effective user is not the owner, even if the directory is writable. This valid managed-storage scenario was incorrectly rejected by the wrapper. [POSIX ownership/permission rule](https://pubs.opengroup.org/onlinepubs/009696699/functions/fchmod.html).

The correction preserves a foreign-owned mount root's owner/mode and explicitly verifies read/write/search access. When the application owns the root, 0700 hardening remains mandatory. All existing application-owned runtime/tmp/backups directories remain 0700, non-symlinked, canonically resolved and owned by the service account. Foreign-owned application directories are refused. SQLite/database sidecar 0600 handling, launcher umask 0077 and private operator socket/metadata checks remain unchanged. Permission errors on application-owned resources are not swallowed.

The fixed /var/data/commit mount, exact /proc mount check, staging.sqlite path, one 1 GB disk, paid plan, startup migration/reopen behavior and reset safeguards are unchanged. No chown, elevated shell operation, broad permission grant, alternate database directory or schema migration is introduced. Render persists files beneath the configured mount path. [Render persistent disks](https://render.com/docs/disks).

This fixes a demonstrable wrapper assumption. The original deployed failing syscall remains unconfirmed; hosted recovery requires another manual deployment's result.

## More precise safe labels

The failure record still has only event/stage/reason, with no exception text, paths, owner IDs, environment values, cookies, provider responses or database contents.

| Storage stage | Operation |
| --- | --- |
| storage_disk_guard | Existing canonical path/type and database-file guards |
| storage_mount_probe | Existing Linux mount metadata read and exact-mount check |
| storage_root_permissions | Root ownership check and hardening when app-owned |
| storage_access | Required read/write/search access to the mount root |
| storage_runtime_directory | Private runtime-directory creation, path/owner checks and 0700 enforcement |
| storage_tmp_directory | Same checks for private temporary files |
| storage_backups_directory | Same checks for private stopped backups |

The reason still maps only allowlisted system codes or fixed validation labels. If a different storage operation is failing on Render, its next record identifies that operation without exposing private details. Missing/unwritable storage, incorrect mounts, symlinks and unsafe application-directory ownership remain fatal.

## Verification and limits

Seven added deterministic filesystem/ownership cases cover a writable foreign-owned root, an owned root, refused mount access, refused owned-root/private-directory chmod, foreign-owned private directories and alternate/symlink paths. Fixtures use disposable local directories and simulated ownership/permission metadata; they do not establish physical Render filesystem ownership. The preceding startup diagnostic test is updated only to expect its newly precise storage stage.

The full regression suite, typecheck, audited clean build, source secret scan and protected source/history checks run before publication. Existing product/UI, routing, solver, PayPal, commitment/capture, AG Studio and agent authority are frozen. No live provider operation, disk reset, Render deployment or cold testing is performed by this patch. Original diagnostic/B2/payment evidence and the operator's safe failure observation are preserved under local evidence archives.

Final local result: **324/324 tests PASS**, zero failures/skips; typecheck and the audited 80-file clean build PASS. All **505 protected files and eight historical databases (235 table snapshots) remain unchanged**. Source/runtime and staged-source scans report zero configured-secret leaks. Real Render filesystem ownership and hosted recovery remain unverified until the operator redeploys.

Manually deploy the follow-up commit in the same service, retaining its disk and environment. Confirm ready/Live, or share only the next render_start_failed JSON line. Do not change secrets, filesystem permissions or database state to work around the failure.
