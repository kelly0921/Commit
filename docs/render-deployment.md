# Phase 6.1B2 — hackathon Render deployment

The current deployment uses **one paid Render web service, one instance, one persistent disk and one Render-provided HTTPS hostname**. Consumer Commit opens at /; Merchant Studio opens at /merchant. No custom domain, DNS, Cloudflare or second hostname is required. Configuration preparation does not deploy the service or establish external PWA/device readiness.

The accepted Phase 6.1A payment verdict remains **PAYMENT_REVALIDATION_PASS_WITH_LIMITATIONS**. Product/UI, solver, financial semantics, exact commitment envelopes, capture saga, offers, AG Studio and agent authority remain frozen. Only deployment wrappers, configuration, tests and documentation change.

## Public routing

~~~mermaid
flowchart TD
  URL[One Render HTTPS hostname] --> TLS[Render managed TLS]
  TLS --> Gateway[Node gateway on 0.0.0.0:$PORT]
  Gateway -->|Consumer pages, assets and APIs| Consumer[Consumer on loopback 3010]
  Gateway -->|Merchant pages, assets and API namespace| Merchant[Merchant on loopback 3011]
  Consumer --> Coordinator[Existing durable coordinator]
  Consumer --> DB[Persistent staging.sqlite]
  Merchant --> DB
  Coordinator --> DB
  Disk[/var/data/commit persistent disk] --- DB
~~~

| Public request | Internal destination |
| --- | --- |
| /, /group, /proposal, /activity, /you, /commit, /waiting, /start, /join, /replay, /demo and other existing consumer routes | Consumer, original path |
| /commit/return and /commit/cancel | Consumer, original path |
| Consumer assets, manifest, service worker and /api/* outside the merchant namespace | Consumer, original path |
| /merchant and /merchant/ | Merchant /merchant/group-demand |
| /merchant/group-demand and other /merchant/* | Merchant, original path; unknown routes retain 404 |
| /merchant.js and /merchant.css | Merchant, original path |
| /api/merchant and /api/merchant/* | Merchant, original path; frozen merchant authorization still applies |
| /health | Gateway plus both child/SQLite probes; public, no provider calls |

The actual route tables were inspected. Merchant APIs already use /api/merchant/*, and their two root asset names do not collide with consumer assets. No new merchant-api namespace, HTML rewrite or merchant business-logic change is needed. The compiled real AG Studio module and original HTML/CSS are served unchanged. Consumer /merchant was a legacy preview route; this deployment deliberately routes that public entry to actual Merchant Studio.

Only fixed pathname boundaries select a runtime. Query parameters, caller-supplied ports and forwarded headers cannot select another upstream. Ambiguous dot traversal, encoded path separators, backslashes and invalid request targets are rejected. The proxy preserves HTTP method, body, Origin, CSRF and response security headers and performs no retries.

## Canonical origin

Render provides RENDER_EXTERNAL_HOSTNAME for its public web service. Under strict Render staging configuration, the wrapper validates that exact onrender.com hostname and derives its HTTPS origin. Both internal PUBLIC_CONSUMER_ORIGIN and PUBLIC_MERCHANT_ORIGIN receive that same origin, with no path component. Incoming Host must match it exactly; arbitrary hosts remain rejected. Business routes now work on the actual Render hostname, including /merchant. [Render default environment variables](https://render.com/docs/environment-variables).

Operators do not supply either PUBLIC origin. Obsolete manually configured origin values are ignored by this adapter; the Render-supplied hostname is authoritative. Existing configured Sandbox PAYPAL_MERCHANT_ID remains honored if supplied, but it is an additional expected-payee check and is not required by the validated integration.

The frozen commitment service constructs return/cancel URLs at https://<render-host>/commit/return and /commit/cancel. These never move beneath /merchant. Push/Activity deep links remain relative, validated consumer paths on the same browser origin. Deterministic tests inspect exact generated URLs using a fake gateway; no live PayPal operations are needed.

## Same-origin isolation

Path separation routes requests; application sessions authorize them. Consumer uses commit_demo_phase6 and merchant uses commit_merchant_phase6. Both remain HttpOnly, Secure on the derived HTTPS origin, SameSite=Strict and host-only. The gateway forwards only the selected surface's exact cookie name and rejects duplicate selected cookies. Consumer cookies never authenticate merchant operations, and merchant cookies never authenticate participant APIs.

Opening merchant HTML does not convert a consumer session or grant a merchant session. Merchant Studio's existing explicit bootstrap API creates an independent synthetic merchant session. Merchant operations still require that session and its own CSRF token; mutation Origin must equal the canonical HTTPS origin. A consumer CSRF token is invalid for merchant operations even though browser origins now match. Participant ownership/privacy checks, anonymous merchant projections, exact-term confirmation and financial authority checks remain in the frozen runtimes.

This is a **public synthetic judging demo**, not production merchant authentication. Anyone may deliberately enter the merchant demo and obtain its independent demo session. Same-origin scripts share browser-origin privileges; cookie/path filtering establishes logical separation, not a security boundary against arbitrary compromised same-origin JavaScript. Existing CSP and server capability checks remain. No real buyers, production merchant identities or Live PayPal are represented.

## Blueprint and four required values

[render.yaml](../render.yaml) pins Node 24.17.0, paid 1c-2g compute, one instance, one 1 GB disk, public /health and autoDeployTrigger off. No maxShutdownDelaySeconds field is present: Render rejected that override with a disk. The launcher's actual configuration now uses 25 seconds, below the documented default 30 seconds; the earlier config override that retained 45 seconds is also corrected. [Render shutdown behavior](https://render.com/docs/deploys#graceful-shutdown).

Build: npm ci --include=dev && node deploy/render/build.mjs

Start: node deploy/render/launcher.mjs

On initial Blueprint creation, the only sync:false prompts are:

1. PAYPAL_CLIENT_ID — existing Sandbox app client ID.
2. PAYPAL_CLIENT_SECRET — existing Sandbox app secret.
3. OPENAI_API_KEY — existing application key.
4. AG_STUDIO_LICENSE_KEY — existing application license.

All values go directly into Render's private environment settings. Never paste them into chat, logs or reports. Render prompts for sync:false values during initial Blueprint creation, not later updates; maintain existing values directly in protected settings. [Render secret-value prompts](https://render.com/docs/blueprint-spec#prompting-for-secret-values).

Infrastructure defaults in the Blueprint are NODE_ENV production, COMMIT_STAGING true, DATABASE_PATH /var/data/commit/staging.sqlite, AI_MODE openai, the current OpenAI model, PAYPAL_ENVIRONMENT sandbox, disabled negative testing, STAGING_ACCESS_ENABLED false and WEB_PUSH_ENABLED false. Render supplies PORT, RENDER and RENDER_EXTERNAL_HOSTNAME. The adapter fails startup for missing app secrets, invalid platform hostname, Live PayPal, alternate database paths or invalid flags.

## Optional access gate

The public judging deployment has no mandatory Basic Auth. No username/password is needed to boot. Application-level cookie, CSRF, ownership and commercial/financial permissions still apply.

For a deliberately restricted operator environment, set STAGING_ACCESS_ENABLED true and provide STAGING_ACCESS_USERNAME plus a STAGING_ACCESS_PASSWORD of at least 20 characters. The optional gateway gate then protects business routes; health remains public and safe. The flag defaults false. This is optional infrastructure, not a replacement for application authorization.

## Optional push and intact PWA

WEB_PUSH_ENABLED false starts without VAPID/contact values. Push configuration is not forwarded to the consumer and no sender is constructed. Delivery performs no push request. Activity remains the persistent authoritative channel. A deployment capability adapter reports pushConfigured false, publicKey null and effective pushEnabled false, even if a database retains an older enabled preference. The frozen UI therefore displays server push pending and disables Enable updates; it cannot falsely report push active. Saved consent, subscriptions and pending delivery records remain intact rather than being silently rewritten.

To enable later, supply a matched WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY pair and WEB_PUSH_CONTACT mailto address, then set WEB_PUSH_ENABLED true and restart. Enabled startup requires all three values and validates the pair. The existing sender/delivery/subscription implementation is retained. Existing pending notifications can resume under saved opt-in preferences after enabling.

One-time key generation on the trusted local machine remains:

~~~sh
node deploy/render/generate-vapid.mjs .staging/render-vapid.env
~~~

The helper writes a new ignored private file without printing keys or overwriting an existing pair. Transfer values privately into Render settings. Do not rotate keys on routine redeploys. Protect Windows directory ACLs as well as Linux file permissions.

Manifest, icons, service worker, install flow and offline shell are unchanged and served at their current consumer paths. The start URL remains /group, display standalone and scope /. Installation remains optional. The worker caches only offline/static presentation assets; it does not cache APIs, dynamic pages, payment returns or POSTs and does not queue mutations. On this shared origin a merchant navigation may also receive the same generic offline safety page; no merchant/private data is cached. Real HTTPS installability and OS delivery still require hosted/device verification.

## Persistent runtime and health

One launcher supervises the gateway, consumer and merchant. Children listen only on loopback. The existing coordinator runs inside consumer independently of open browser tabs. If a child exits, the launcher shuts down the whole service so Render can restart it. Signals stop new work, drain accepted requests/worker work, close SQLite/IPC and apply a bounded shutdown deadline. Durable operation keys/leases remain for the existing recovery path if forced termination is necessary.

The production disk must be mounted exactly at /var/data/commit. Shared staging SQLite is /var/data/commit/staging.sqlite; control/tmp/backups stay beneath the disk. First boot migrates a fresh database and seeds fictional catalog/personas, without payment history, groups or acceptance ledgers. Later boot reopens it, migrates idempotently and preserves groups. No fallback to local historical data is allowed. Build has no database initialization or disk dependency. Its audit removes compiled replay and excludes databases, ledgers and configured secrets. Existing historical source replay is never overwritten or imported.

GET /health checks the gateway, both connected/listening runtimes and SQLite schema via IPC. It returns only status, never secrets or financial data, and calls no PayPal/OpenAI/AG service. Unknown Host still fails. Persistent disk deployment has downtime and supports one instance, with no high availability. [Render disk limitations](https://render.com/docs/disks#disk-limitations).

## Protected reset and rollback

The existing protected reset is unchanged. From the running Render service's own shell/account:

~~~sh
node deploy/render/reset-staging.mjs --reset-disposable-staging
~~~

It uses a private same-account Unix socket, fixed disk, quiesced runtimes and a private stopped backup. It refuses provider IDs, attempted/ambiguous payments, provider events, capture sagas and financial steps. There is no public HTTP reset, arbitrary path or automatic PayPal cleanup. Only disposable nonfinancial state can be reset. A refusal keeps the ledger and restores both runtimes.

Code rollback does not roll back persistent database state. Keep a consistent private stopped-database backup and the accepted code revision. Never import local historical payment databases or erase current ledgers to resolve uncertain provider state. The platform Linux mount, socket ownership, TLS and actual stop/reset/rollback behavior must still be verified on Render.

## Operator flow

1. Render → New Blueprint → connect kelly0921/Commit on main.
2. Review one paid 1c-2g service, one instance and the 1 GB disk; keep automatic deployment off.
3. Provide only the four essential app values above.
4. Deploy Blueprint deliberately and wait for health.
5. Open the generated https://<render-host>/ URL for Consumer Commit.
6. Open https://<render-host>/merchant for real Merchant Studio.
7. Verify public routing, persistence, privacy and existing automatic provider-completion integration before device/cold testing. Reuse accepted Phase 6.1A evidence; no new live capture is required merely for deployment.

No domain/DNS task is required. No deployment is triggered by this adaptation; commits use Render's skip-deployment marker.

## Startup failure diagnostics

If startup fails, the launcher emits render_start_failed with fixed stage/reason labels. Raw exception text, environment values and child output remain suppressed. The [diagnostic patch guide](render-startup-diagnostic.md) explains the labels and the narrow manual retry procedure. The first operator-reported Render startup failure has not yet been diagnosed; this logging patch makes its next failure actionable without changing application behavior or weakening deployment validation.

## Verification report and limits

Local verification covers the complete regression suite, typecheck/build, official Blueprint schema plus the known disk restriction, strict derived origin, public path smoke, consumer/merchant routes and assets, same-origin cookie/CSRF/Origin isolation, anonymous merchant projection, read-only simulator, PWA assets/offline rules, disabled push/Activity, exact fake-gateway callback URLs, restart persistence, child failure/shutdown and protected reset/refusal. Browser evidence must be distinguished from physical hosted/device evidence.

| Requested report item | Phase 6.1B2 result |
| --- | --- |
| 1. Public routing | One derived onrender.com origin; consumer at /, real Merchant Studio at /merchant; existing /api/merchant/* and asset names preserved |
| 2. Same-origin isolation | PASS: exact Host/Origin, separate HttpOnly/Secure cookies, per-surface cookie filtering, separate CSRF/session capabilities, privacy projections; public synthetic roles remain demo identity |
| 3. Blueprint | One 1c-2g Node 24 service/instance, one 1 GB disk, /health, auto deploy off; known disk-incompatible shutdown field omitted |
| 4. Operator values | Exactly PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, OPENAI_API_KEY, AG_STUDIO_LICENSE_KEY |
| 5. Push | Default off, no VAPID/contact startup dependency; Activity persists and effective UI push-enabled state is false |
| 6. PayPal URLs | Exact derived-origin consumer /commit/return and /commit/cancel PASS with fake gateway; accepted live Phase 6.1A evidence reused |
| 7. Merchant/AG | Real local browser PASS: native charts, grid, AI Assistant composer and 8%/4+ analysis; 15 new feasible groups, $20,884 incremental GMV, $1,816 cost; no live LLM turn or publication |
| 8. Regression | **306/306 PASS**, zero skips/failures; typecheck/build and Blueprint schema/disk checks PASS |
| 9. Preservation | **505 protected files and eight historical databases unchanged**; 224 source/runtime files scanned, zero configured-secret leaks; zero live PayPal operations |
| 10. Limits | Account-side Blueprint validation/deployment, Render Linux lifecycle/TLS, actual PWA installation, real push and physical devices remain unverified; no cold testing |
| 11. Verdict | **HACKATHON_RENDER_READY** — configuration/local acceptance only |

Real browser evidence was captured at 1280×720 on an isolated HTTP loopback origin, with offline AI, the existing AG Studio license and no PayPal credentials. The native consumer wizard created only one disposable synthetic group. Notifications & install showed server push pending, disabled Enable updates and offline protection ready. No consumer or merchant UI source was modified.

Local browser screenshots, excluded from source publication:

![Real AG Studio 8% read-only simulation](assets/phase-6-1b2-render/merchant-simulation.jpg)

![Consumer push-off capability reporting](assets/phase-6-1b2-render/consumer-push-disabled.jpg)

The old two-host deployment, its gate/push requirements, the initial rejected shutdown override and prior reports/receipts are preserved under local evidence archives. Earlier VM/Caddy configuration remains historical preparation. Current publication has no secret values, historical databases or receipts. Detailed Phase 6.1B2 results are in docs/assets/phase-6-1b2-render/ and the current [Phase 6.1 report](phase-6-1-device-verification.md).

No Render API account credential is available here, so account-side Blueprint acceptance and real hosted verification remain operator work. No actual public service URL is invented. Physical installation, Android/iOS, real push, lock-screen privacy and cold testing remain unverified. No live PayPal operation is performed. Configuration readiness is distinct from EXTERNAL_PWA_READY_FOR_COLD_TESTING.

## Hackathon infrastructure story

Commit runs as one durable Render service. Consumer Commit and Merchant Studio share a secure hosted runtime while remaining logically isolated. Render keeps the coordination agent and persistent group state alive after the browser closes; PayPal remains the authoritative payment provider.

This describes the intended architecture; actual Render hosting is not claimed until deployed. No Render Workflows are used.
