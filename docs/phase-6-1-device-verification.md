# Phase 6.1 — hosted PWA and real-device verification

October 5, 2026. Hosted/device verdict remains **EXTERNAL_PWA_NOT_READY**.

Phase 6.1B2 hackathon configuration is prepared: one paid Render web service, one instance, one 1 GB persistent disk, one launcher, two loopback runtimes and one Render-provided public HTTPS hostname. The current Blueprint asks for four existing application values only. This update does not deploy, publish offers, run live PayPal operations or begin cold testing.

## Selected hosting architecture

| Item | Current configuration/result |
| --- | --- |
| Consumer URL | https://<RENDER_EXTERNAL_HOSTNAME>/ and consumer routes; actual deployed URL not available |
| Merchant URL | Same origin, /merchant; no second hostname or DNS required |
| Source repository | Private kelly0921/Commit, main; current configuration is published after verification |
| Render infrastructure | One paid 1c-2g Node 24 service, one instance, one disk |
| Runtime | Public gateway on Render PORT, consumer loopback 3010, merchant loopback 3011 |
| Persistence | /var/data/commit/staging.sqlite; fresh baseline on first boot, existing groups preserved on restart |
| Coordinator | Existing durable consumer coordinator runs independently of browser tabs |
| Access | Direct public judging/demo URL by default; optional Basic gate disabled |
| Push | WEB_PUSH_ENABLED false by default; no VAPID/contact required, Activity remains authoritative |
| Required app values | PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, OPENAI_API_KEY, AG_STUDIO_LICENSE_KEY |
| Optional expected payee | PAYPAL_MERCHANT_ID remains supported if supplied; not a required prompt |
| Public origin | Derived only from Render's actual onrender.com hostname, reused as both internal browser origins |
| Deployment performed here | None; no Render account/API credential locally |

[Current Render operator guide](render-deployment.md) covers path routing, cookie/CSRF isolation, four-value setup, optional push/gate, health, persistent reset and rollback. The gateway filters cookies by the selected fixed path surface; application sessions, independent CSRF tokens and permission checks authorize operations. Same-origin browser privileges are shared, so this is logical synthetic-demo separation, not production tenant authentication.

## History and accepted payment evidence

The earlier VM/Caddy packet and old two-host Render production-style topology remain archived. Their former requirements for two custom hosts, DNS, mandatory gate credentials and mandatory VAPID/contact are superseded for this hackathon deployment. The old reports are not retroactive evidence of hosting. Byte-preserved preceding reports/configurations live under docs/assets/phase-6-1b2-render/previous-*; original Phase 6.1B, shutdown-correction and GitHub publication receipts remain unchanged.

Phase 6.1A remains **PAYMENT_REVALIDATION_PASS_WITH_LIMITATIONS**. Explicit buyer approval, idempotent exact-order authorization completion, independent provider verification, amount/merchant/envelope binding, stale-envelope rejection and the existing capture/recovery saga remain frozen. No financial semantics changed and no new live PayPal transaction was run. A deterministic fake-gateway test verifies callbacks at the derived consumer /commit/return and /commit/cancel paths. Normal consumers still need no manual provider-status action.

## Verification status

| Required check | Evidence/status |
| --- | --- |
| Consumer/merchant HTTPS loading | Local one-origin HTTP gateway/browser PASS; actual Render TLS/origin NOT VERIFIED |
| Manifest/service worker | Current paths/assets and offline-safe rules PASS in tests; local browser reports offline protection ready; actual hosted HTTPS pending |
| External Chrome/Edge installability | NOT VERIFIED on the new host |
| Actual PWA installation | NOT PERFORMED |
| Android | NOT physically tested |
| iOS/iPadOS | NOT physically tested |
| Real Web Push | Intentionally disabled for first deployment; no delivery claim |
| Notification deep link | Existing safe consumer-route tests PASS; actual OS click NOT VERIFIED |
| Activity if push fails/is off | PASS; persisted Activity is retained, disabled delivery attempts no push and effective enabled state is false |
| Background coordination | Existing durable coordinator composition retained; worker/reopen tests PASS; hosted closed-UI operation pending |
| Fresh invite/join | Existing independent-session regressions PASS; hosted independent browsers pending |
| Optional installation | Existing browser/manifest behavior preserved; participation remains available without install |
| Automatic provider completion | Accepted Phase 6.1A live evidence reused; no live provider rerun; hosted callback verification pending |
| Offline financial/commercial safety | Existing worker/UI regressions PASS; no API/dynamic/payment return cache, no POST replay or offline financial success |
| Notification privacy | Existing payload/recipient-scope tests PASS; actual OS lock screen NOT VERIFIED |
| Protected reset/restart | Local persistent restart, fixed-path reset/refusal and child shutdown tests PASS; actual Linux disk/socket/Render lifecycle pending |
| Same-origin isolation | PASS: independent cookie/session names, only selected cookie forwarded, cross-surface cookies/CSRF blocked, exact Origin/Host checks, projections retained |
| Native AG Studio | PASS local real browser: dashboard, three charts, grid, native AI Assistant panel and read-only 8% simulation; live LLM turn not rerun |
| Regression | 306/306 tests PASS, zero skips/failures; typecheck and audited build PASS |
| Blueprint | Official retained JSON Schema and disk-specific rule PASS; exactly four sync:false prompts; account-side Render validation pending |
| Secrets/history | Final preservation and scan receipts are retained under the Phase 6.1B2 evidence directory; no secrets, historical database or acceptance ledger deployed |

## Local browser evidence

The browser smoke used a fresh isolated staging fixture, HTTP loopback origin, offline AI, existing real AG Studio license and no PayPal credentials. Viewport was 1280×720. It does not represent Render TLS, standalone installation, real push or physical device verification.

Native Studio opened from /merchant; the unchanged asset links and API namespace loaded normally. The 8%/4+ full-cohort simulation returned 15 newly feasible groups, $20,884 incremental GMV/revenue and $1,816 discount cost. The AI Assistant composer was visible; no live OpenAI turn was submitted. No draft/publication or provider-backed commitment was created.

The consumer's existing Start a Group flow created one disposable synthetic group on the same origin. Group, Plan, Activity and You navigation remained present. Notifications & install reported server Web Push pending, Enable updates was disabled, and offline protection was ready. No payment button was invoked.

Local screenshots: merchant-simulation.jpg, merchant-analyst.jpg, consumer-group.jpg, consumer-push-disabled.jpg and consumer-activity.jpg in docs/assets/phase-6-1b2-render/. Exact browser/test/Blueprint results are saved beside them. These local screenshots and receipts are excluded from source publication.

## Remaining work

The next operator step is Render → New Blueprint → connect main → supply the four app values → deliberately deploy → wait for health → open the generated URL and /merchant. No custom DNS is needed. Existing Blueprint environment variables may persist after removal from YAML; old origin values are ignored and push/gate values have no effect while their flags are false.

Account-side Blueprint acceptance, actual Linux mount/private socket/shutdown/reset, public HTTPS callbacks, external installability, physical installation and device checks remain unverified. Optional Web Push can be enabled later with a matched VAPID pair/contact and WEB_PUSH_ENABLED true. Existing demo sessions remain synthetic; merchant sessions remain in memory across requests and are recreated after process restart. Disk redeploys have downtime and this architecture has no HA.

No hosted staging URL is invented. No deploy or cold testing is initiated here. Configuration readiness is **HACKATHON_RENDER_READY** when the recorded local checks/preservation pass; it does not change the overall hosted/device verdict until the external verification is completed.
