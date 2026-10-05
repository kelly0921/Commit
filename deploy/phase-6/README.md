# Commit HTTPS staging operations

Prepared October 4, 2026. Not deployed or tested on a Linux host yet. Phase 6.1A payment revalidation is complete with PASS WITH LIMITATIONS under the corrected exact buyer-approved authorization invariant. Payment implementation, automatic approval completion, commitment envelopes, capture/reconciliation, solver, agentic authority and final consumer/merchant UI are frozen. Hosting must use those unchanged files and preserve historical evidence.

## Fixed topology

Consumer public HTTPS hostname → Caddy → loopback `3010` → consumer Node 24 and always-on durable coordinator. Merchant hostname → Caddy → loopback `3011` → isolated Merchant Studio Node 24. Both use **only** `/var/lib/commit-staging/staging.sqlite`, with WAL/SHM in the same persistent directory. One consumer worker; systemd restarts it after failure. Do not replicate SQLite onto ephemeral instances or share it over a network filesystem.

Release code: `/opt/commit-staging/app`. Runtime secrets: `/etc/commit-staging/runtime.env` (root-owned `0600`, never committed). Caddy access configuration: `/etc/commit-staging/caddy.env` (root-owned `0600`). DB directory: owned by dedicated `commit-staging` account, `0700`. Backups: `/var/backups/commit-staging`, root-owned `0700`.

## Deployment steps once host/DNS access exists

1. Use an existing dedicated Linux staging VM with Node **24** at `/usr/bin/node`, Caddy, systemd, public DNS for both hosts, HTTPS ports 80/443, and SSH access. This packet does not provision a billed VM or change DNS.
2. Locally run `npm run build`, then `node deploy/phase-6/stage-release.mjs`. Transfer **only** that generated ignored `.staging/release-*` directory. The allowlist excludes `.env`, `data`, reports/evidence, Git, and the historical replay payload. Never copy the workspace or an existing SQLite file to staging.
3. Put that release at `/opt/commit-staging/app`; use `npm ci --omit=dev` there. The build is already present. Create the dedicated `commit-staging` system account and its persistent DB directory. Ensure code/dependencies are readable by that account and code is not writable by it. Node version must be 24-compatible before services start.
4. Install `runtime.env.example` at the protected runtime path. Fill real exact HTTPS origins, existing **Sandbox** app credentials, OpenAI key/model, optional browser license, and operational `mailto:` contact through a protected local/SSH editor. Keep secret values out of commands, logs, screenshots and chat. Do not use a historical DB path.
5. Generate keys directly into protected config:

   ```sh
   cd /opt/commit-staging/app
   sudo /usr/bin/node --env-file=/etc/commit-staging/runtime.env deploy/phase-6/configure-staging.mjs
   ```

   This validates Sandbox/config permissions/origins, refuses existing key rotation, writes atomically and emits no key values. Permission errors leave a safe failure. Do not run it until the contact and origins are real.
6. Install both `.service` files in `/etc/systemd/system/`. Install `caddy-staging.conf` under `/etc/systemd/system/caddy.service.d/commit-staging.conf`. Fill `caddy.env` with the two DNS hosts and demo access username/password **hash** generated interactively using `caddy hash-password`. Import this packet's Caddyfile from the VM's Caddy configuration; preserve unrelated existing host configuration. Validate Caddy before reloading. No Host rewriting, path rewriting, commercial request retries, local TLS bypass or security exception is needed. [Caddy passes the incoming Host to HTTP upstreams](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy); [automatic HTTPS requires working public DNS/network access](https://caddyserver.com/docs/automatic-https).
7. `systemctl daemon-reload`, enable/start the two Commit services, then reload Caddy. First consumer boot creates a **fresh** fictional catalog/persona baseline. No historical group, mandate, policy, activity, subscription, authorization or capture is imported. Merchant sessions are in memory and reestablish after restart; durable commercial data stays in SQLite.
8. Run `smoke-https.mjs` with the real origins and optional `COMMIT_SMOKE_USER`/`COMMIT_SMOKE_PASSWORD` loaded from protected configuration. It checks HTTPS routes, manifest/worker scope and Secure host-only cookies, creates only empty browser sessions, and emits no cookies or credentials. It performs **zero commercial POSTs**. It is not proof of installation/push/devices.

The access gate must remain intact. Verify PWA installation, standalone relaunch and authenticated worker retrieval with that gate on actual browsers; do not remove it to force installability. Demo identity/tenancy and short-lived sessions are not production authentication.

## Protected reset

Host-only command, no browser/API endpoint:

```sh
cd /opt/commit-staging/app
sudo /usr/bin/node deploy/phase-6/reset-staging.mjs --reset-staging
```

Requires Linux root and the service account. Refuses any alternate/traversed/symlinked staging directory or DB/sidecar, stops both exact services, confirms them inactive, backs up the stopped DB and sidecars in a private timestamped directory, rechecks paths, unlinks only the three named staging files, creates the fictional seed with zero commitments/subscriptions, assigns private ownership and restarts. It does not delete backup directories or access local historical files. Errors retain the backup and report failure; inspect the service status before continuing. No reset was executed in this workspace or on a host.

Reset clears invites/sessions/mandates/policies/activity/subscriptions and invalidates old deep links. **Reset does not void/refund provider resources.** Use it for disposable nonfinancial staging data only; first resolve and verify any staging Sandbox payment resources through the existing operator workflow. Never erase a financial ledger to simulate recovery. There is no automatic post-reset live financial revalidation.

## Acceptance handoff

Record actual browser version/OS, physical platform, standalone screenshots, real notification text/click destination and installation outcome. Use independent organizer/invitee sessions. With both UIs closed, use a controlled nonfinancial demand event and already explicitly approved mandates/policy, confirm durable event/offer/proposal/Activity/outbox before reopening, then inspect actual push. Never use browser timers or a service worker for commercial logic. Denial, expiry, offline/reopen, obsolete links and all service restarts need external evidence.

Use the completed [Phase 6.1A payment evidence](../../docs/phase-6-1a-payment-revalidation.md) for payment acceptance. Do not rerun live PayPal captures for deployment testing or rewrite the verified payment flow. Investigate only if deployment reveals an actual integration defect. Packaging, hosted smoke and reset perform no real PayPal operation. Historical replay stays local/read-only; staging returns `REPLAY_LOCAL_ONLY` at the replay API rather than hosting the historical receipt. No historical payment database or acceptance ledger belongs in the release.
