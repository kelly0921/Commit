# Phase 6.1B — Render deployment

Deployment configuration is prepared for review. No Render service, disk, domain or deployment has been created. No hosted/PWA/device verification, cold testing or live PayPal operation is performed in this phase. Phase 6.1A remains **PAYMENT_REVALIDATION_PASS_WITH_LIMITATIONS**; all product, payment, solver, agent authority, offer and AG Studio code remains frozen.

## Architecture

```mermaid
flowchart TD
  C[Consumer HTTPS hostname] --> TLS[Render managed TLS]
  M[Merchant HTTPS hostname] --> TLS
  TLS --> G[Node gateway on 0.0.0.0:$PORT]
  G -->|Exact consumer Host| Consumer[Consumer on 127.0.0.1:3010]
  G -->|Exact merchant Host| Merchant[Merchant on 127.0.0.1:3011]
  Consumer --> Agent[Existing durable coordinator]
  Consumer --> DB[Persistent staging.sqlite]
  Merchant --> DB
  Agent --> DB
  Disk[/var/data/commit persistent disk] --- DB
  Launcher[Node launcher] --> G
  Launcher --> Consumer
  Launcher --> Merchant
```

One paid Render web service, one instance and one 1 GB persistent disk keep both surfaces on the same SQLite file. There is no database migration to another platform, independent worker service, Render Workflow, Redis, Kubernetes, Compose or Caddy process. A disk belongs to one service instance and is unavailable during build, pre-deploy and one-off jobs; attaching it prevents horizontal scaling and zero-downtime deploys. [Render persistent disks](https://render.com/docs/disks).

## Blueprint and build

[render.yaml](../render.yaml) defines the Node native runtime, tested Node 24.17.0, paid `1c-2g` compute, one instance, disk mount, `/health` and manual deployments. It omits `maxShutdownDelaySeconds`: Render's backend rejects that override for a service with a disk, so platform defaults apply. No custom domains or live secret values are embedded. [Render Blueprint reference](https://render.com/docs/blueprint-spec), [Node version selection](https://render.com/docs/node-version).

Build: `npm ci --include=dev && node deploy/render/build.mjs`.

Start: `node deploy/render/launcher.mjs`.

Build has no database initialization and does not require the disk. The deployment-only wrapper runs the unchanged product build and audit. If a clean checkout has no local historical replay receipt, it temporarily provides an explicit unavailable marker solely for the legacy file-copy step, removes the compiled replay before release, and cleans up its own source marker. An existing local replay receipt is never overwritten or removed. The audit rejects database/payment-ledger payloads or configured secret values in `dist` and writes a checksum manifest. Frozen build scripts remain unchanged. The unchanged staging runtime disables historical replay through the existing `allowHistoricalReplay:false` option.

Use a private source repository that excludes `.env`, local `data/`, `.staging/` and acceptance ledgers. Do not upload the workspace as a zip or import local databases. The existing ignore rules cover those paths. Review the selected repository contents before connecting it to Render; Blueprint preparation does not publish Git changes or create a service. The earlier allowlisted Caddy release is preserved separately and is not this Render deployment.

## Gateway and public authority

Render terminates public HTTPS and forwards HTTP to the gateway on `0.0.0.0:$PORT`; the consumer and merchant listeners bind only `127.0.0.1`. [Render web-service port and TLS behavior](https://render.com/docs/web-services).

The gateway routes exclusively by one exact Host matching `PUBLIC_CONSUMER_ORIGIN` or `PUBLIC_MERCHANT_ORIGIN`. It rejects unknown hosts and absolute/protocol-relative targets, leaves URL paths and bodies intact, does not retry upstream requests, and preserves Origin, CSRF headers, response security headers and host-only cookies. A consumer Host cannot select a merchant upstream through a path or forged forwarded header.

Incoming `Forwarded` and `X-Forwarded-*` values never establish authority. They are discarded; upstream protocol/host headers are reconstructed from the exact configured HTTPS origin and already validated Host. The frozen servers use configured public origins for Secure cookies, Origin checks and provider return/cancel URLs; safe push deep links remain same-origin. No client proxy header can substitute another financial origin. Production startup requires Render's `RENDER=true`; this flag is a deployment check, not authentication or a substitute for Host validation.

The previous staging access gate is retained as gateway HTTP Basic protection with operator-supplied `STAGING_ACCESS_USERNAME` and `STAGING_ACCESS_PASSWORD`. Only sanitized operational events are logged; no request bodies, authentication headers, cookies, provider responses or secret values are logged by the wrapper. Child stdout/stderr is suppressed; child failures produce a generic structured event. This limits diagnostics deliberately without changing product behavior.

## Persistent disk and startup lifecycle

Only `/var/data/commit` is valid for production runtime state:

- `/var/data/commit/staging.sqlite`, with WAL/SHM beside it;
- `/var/data/commit/runtime/` for private launcher control and metadata;
- `/var/data/commit/backups/` for stopped-database reset backups;
- `/var/data/commit/tmp/` for runtime temporary files.

Other filesystem paths are ephemeral code/build artifacts. Production checks Linux mount metadata, the exact real disk path and absence of symlinked database resources; there is no fallback to local `data/`. Disk directories use 0700 and database/backup/control files use 0600. `DATABASE_PATH` is translated into the existing `PRODUCT_DATABASE_PATH` used by the frozen runtime; conflicting overrides are refused.

On first startup the launcher opens a new database with the existing `ProductDatabase`, applies schema migrations and seeds the fictional Summit Weekend merchant catalog and demo personas. No payment commitments, captures, mandates, policies, subscriptions or historical acceptance data are imported. The current UI creates groups through its existing flows. On later startups it reopens the same file and runs only existing migration/idempotent baseline initialization; it does not reset groups or overwrite their terms/state. Consumer starts before merchant, avoiding competing initial schema work.

## Supervision and shutdown

The launcher supervises the gateway and two Node children. The consumer runs the existing durable coordinator even when both UIs are closed. HTTP business logic and financial operations remain in the unchanged classes. Wrapper composition uses the same PayPal/AI/services and cookie names as the existing entrypoints.

Both children must report ready before business requests pass. Child startup has a 60-second bound. If either unexpectedly exits, the public gateway becomes unavailable, its sibling stops, and the launcher exits unsuccessfully so Render can restart the whole instance. It never intentionally serves half the application.

SIGTERM/SIGINT handlers are installed before asynchronous startup. Shutdown stops new gateway work, stops new coordinator ticks, closes child HTTP listeners, waits for accepted requests and the existing worker drain, then closes SQLite and IPC. The launcher allows 25 seconds before forced child termination, leaving headroom below Render's documented 30-second default. No custom platform delay is requested for this disk-backed service. Durable operation keys and event leases remain in SQLite if forced termination is necessary; the existing recovery path handles them after restart. The wrapper does not erase leases, invent completion or grant consent. [Render deploy/shutdown behavior](https://render.com/docs/deploys#graceful-shutdown).

## Environment variables

| Variable | Required value or operator action |
| --- | --- |
| `NODE_VERSION` | Blueprint: `24.17.0` |
| `NODE_ENV` | Blueprint: `production` |
| `DATABASE_PATH` | Blueprint: `/var/data/commit/staging.sqlite` |
| `COMMIT_STAGING` | Blueprint: `true` |
| `PAYPAL_ENVIRONMENT` | Blueprint: `sandbox`; live is rejected |
| `AI_MODE` | Blueprint: `openai` |
| `OPENAI_MODEL` | Blueprint: current default `gpt-5.6-terra`; retain the configured app model if already selected |
| `ENABLE_SANDBOX_SAGA_NEGATIVE_TEST` | Blueprint: `false` |
| `PUBLIC_CONSUMER_ORIGIN` | Operator: exact `https://<CONSUMER_HOST>` |
| `PUBLIC_MERCHANT_ORIGIN` | Operator: distinct exact `https://<MERCHANT_HOST>` |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Operator: current Sandbox app credentials |
| `PAYPAL_MERCHANT_ID` | Operator: retain the existing binding if configured; otherwise leave blank and retain the current provider verification behavior |
| `OPENAI_API_KEY` | Operator: current app key |
| `AG_STUDIO_LICENSE_KEY` | Operator: current configured AG Studio license; no integration change |
| `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` | Operator: matched new staging keypair |
| `WEB_PUSH_CONTACT` | Operator: operational `mailto:` address |
| `STAGING_ACCESS_USERNAME`, `STAGING_ACCESS_PASSWORD` | Operator: staging gate user and secret of at least 20 characters |
| `PORT`, `RENDER`, `RENDER_EXTERNAL_HOSTNAME` | Render-provided runtime values; do not substitute placeholders |

Operator values use `sync:false`; fill them in Render's protected environment settings. No secrets are present in the Blueprint, source, reports or logs. Do not set alternative DB paths, child bind addresses or live-payment flags. Deployment validation requires real origins, a matched VAPID pair, current AI/license configuration and the access gate before starting.

## One-time VAPID setup

On the trusted local machine, create the ignored `.staging` directory if needed, then run:

```sh
node deploy/render/generate-vapid.mjs .staging/render-vapid.env
```

The command writes a newly generated pair directly into a new private file, emits no key values and refuses overwrite. Copy each value directly from that private file into the corresponding Render environment variable. Set `WEB_PUSH_CONTACT` separately to the operational mailto address. Never paste keys into chat, reports, issue bodies or terminal command arguments. Linux file permissions are 0600; on Windows protect the ignored directory using the local account's ACLs. Once safely transferred, remove the local private file deliberately. Do not rotate staging keys on redeploy; existing subscriptions depend on them.

## Custom domains and first deployment

1. Review/connect the intended private source repository and import `render.yaml` in the Render account where credits were claimed. Confirm the paid plan, single instance, 1 GB disk, region and manual deployment setting before applying.
2. Select the real consumer and merchant hostnames. Add both to this same web service in Render's Custom Domains settings and configure the DNS records exactly as Render shows. Set both exact public origin variables. No domain is invented in this packet. [Render custom-domain setup](https://render.com/docs/custom-domains).
3. Fill protected environment settings, VAPID pair/contact and the staging access gate. Keep all credentials out of reports. `sync:false` values must be managed deliberately on existing services; review them in the Dashboard before deploying.
4. Start the operator-approved deployment. Initial health probes can use `RENDER_EXTERNAL_HOSTNAME`; that platform hostname serves only `/health` unless it is itself one of the explicitly configured app origins. Business requests on unconfigured hosts are rejected.
5. Verify the runtime disk, startup and health logs, both real TLS hosts, gateway gate and source isolation. Do not begin device verification or cold testing in this phase.

## Health

`GET /health` returns only `{"status":"ok"}` or `{"status":"unavailable"}` with no-store caching. It is available without the staging gate on either configured app Host and on Render's expected service hostname. All other unknown hosts are rejected, including at `/health`.

Each probe checks that both child processes are connected and listening, and uses IPC to query the existing schema in each child's SQLite connection. It creates no sessions and calls no PayPal, OpenAI or AG Studio service. Probes are deduplicated while in flight and time out after 1.5 seconds. A starting, resetting, stopping or failed runtime returns 503. [Render health Host/status behavior](https://render.com/docs/health-checks).

## Protected staging reset

From the shell/SSH session of the **existing running Render service**, run:

```sh
node deploy/render/reset-staging.mjs --reset-disposable-staging
```

Do not use a one-off job or ephemeral shell: those do not provide the active disk/runtime. This command accepts no arbitrary path and operates only on `/var/data/commit`. It connects to a same-account, mode-0600 Unix socket beneath that disk, requires explicit reset confirmation, and is never exposed through HTTP. The gateway blocks new business work while both children/coordinator stop and drain.

Reset refuses any provider-backed commitment, attempted or ambiguous payment operation, provider event, capture saga or financial step. It does not clear a financial ledger merely because a buyer says payment ended. There is no override and no automatic PayPal void/refund/cleanup. Resolve financial staging work through the existing verified operator path and preserve its ledger; use reset only for disposable nonfinancial data.

For permitted disposable state, it privately backs up the stopped database and any sidecars under the disk, rechecks exact non-symlinked paths, unlinks only the three named database files, recreates the fictional baseline and restarts both children. It invalidates old local sessions/invites/Activity/subscriptions. If reset is refused, the existing DB is retained and both children restart. If recreation/startup fails, keep the backup and investigate; do not claim success. No reset operation touches historical local evidence.

## Rollback

Keep the frozen code revision/build manifest and a private, consistent stopped-database backup before operational changes. Redeploy the previously accepted code using Render's rollback controls, then verify schema compatibility and health. Code rollback does not roll back persistent SQLite state. Never copy local historical payment databases into the disk, replace current ledgers with older ones while provider resources exist, or erase an authorization to simulate recovery. Any database restore requires the service stopped and a deliberate operator recovery decision using its own staging backup. Disk deploys have downtime; plan a short maintenance interval.

## Verification and known limits

Configuration acceptance: official Blueprint JSON Schema validation; full suite including new deployment tests; typecheck/build; frozen-file/database preservation; configured-secret scan; local fresh boot, exact Host routing, gate/Origin/CSRF/cookie isolation, safe health, restart persistence, child failure, graceful shutdown and nonfinancial reset/refusal.

Actual deployment remains an operator step: select repository/account/region/domains, fill secrets/contact, verify disk/TLS/health and preserve evidence. Render API/CLI account validation and deployment were not run because no account credential is available. Windows local fixtures use an isolated temporary staging directory and the launcher API; they do not establish the actual Linux disk mount, Unix-socket ownership enforcement or Render SIGTERM delivery. These require deployed operational verification. No hosted or PWA readiness is claimed.

Render's disk enforces a single instance and redeploy downtime; this architecture has no high availability. Existing merchant sessions remain in memory and are recreated after restart, while commercial state remains in SQLite. The short-lived demo identities and access gate remain staging mechanisms. Browser installation, OS push, Android/iOS, actual notification privacy, live domain/provider callback integration and cold testing are outside this phase. Reuse Phase 6.1A payment evidence; no live payment rerun is required simply for infrastructure testing.

## Sponsor usage statement

Render hosts Commit's durable application runtime, including the background coordination loop that continues after users close the PWA. A persistent staging datastore maintains group, commitment and Activity state, while PayPal remains the authoritative payment provider. The deployment keeps consumer and merchant experiences separated while allowing the shared group-commerce state machine to operate continuously.

This is the intended infrastructure story for a completed deployment. At this checkpoint the configuration is prepared, and Render hosting has not yet occurred. The project uses a Render web service and persistent disk; it does not claim Render Workflow usage or add sponsor-only product features.

## Acceptance receipts

October 5 follow-up: the initial published Blueprint passed the official JSON Schema but was rejected by Render's backend because `maxShutdownDelaySeconds` cannot be combined with a disk. The field has been removed and the deployment wrapper's deadline shortened from 45 to 25 seconds. A regression check forbids this disk-incompatible field, and a local shutdown test covers an unresponsive child. The original schema/test/publication receipts and prior configuration are preserved; schema validation alone does not establish backend acceptance. The user must retry the corrected Blueprint in Render to verify account-side acceptance. No deployment or live payment operation is initiated by this correction.

The table below records the original Phase 6.1B local acceptance; follow-up results are retained separately under `docs/assets/phase-6-1b-render-shutdown-fix/`.

Correction acceptance: **298/298 tests PASS**, typecheck/build PASS, official-schema and observed disk-rule checks PASS, and configured-secret scan PASS. All 506 protected files and eight historical databases remain unchanged. The commit changes only this deployment documentation, the Blueprint, the launcher's shutdown deadline and deployment tests. Account-side Blueprint acceptance and actual Render shutdown behavior still require hosted verification.

| Check | Final local result |
| --- | --- |
| Full suite | **294/294 PASS**, including 13 new Render tests; zero failures/skips |
| Typecheck / build | **PASS / PASS** |
| Blueprint validation | **PASS** against Render's official JSON Schema; one paid service, one instance, one disk |
| Build and runtime inventory | **PASS**; 89 audited files, no historical database/acceptance ledger/environment file or configured-secret value |
| Fresh boot / restart persistence | **PASS locally** with provider credentials omitted |
| Host, access gate, Origin, CSRF, cookies, health | **PASS locally** |
| Child failure / graceful stop | **PASS locally**; both runtimes close and database integrity passes |
| Nonfinancial reset / ambiguous financial reset | **PASS / correctly refused locally** |
| Preservation / secret scan | **PASS**; 491 pre-existing protected files and eight historical databases unchanged, zero configured-value leaks |
| Render deployment / hosted PWA / device verification | **NOT PERFORMED** |

See [latest full suite](assets/phase-6-1b-render/test-results-final.txt), [Blueprint validation](assets/phase-6-1b-render/blueprint-validation.json), [local verification](assets/phase-6-1b-render/local-verification.json), [release audit](assets/phase-6-1b-render/release-audit.json), [preservation/secret receipt](assets/phase-6-1b-render/isolation-after.json) and [Phase 6.1 report](phase-6-1-device-verification.md). The original hosting report is byte-preserved separately. The first targeted 20-second startup timeout and later passing results are retained; the final wrapper allows 60 seconds and passes the final full suite. No historical payment or test receipt is rewritten.

Final configuration verdict: **RENDER_DEPLOYMENT_READY**. Remaining operator steps are account/repository/region review, domain selection/DNS, protected environment/VAPID/contact setup, deployment and operational Linux/TLS/disk/reset checks. Hosted/PWA readiness remains **EXTERNAL_PWA_NOT_READY**. Stop before device verification and cold testing.
