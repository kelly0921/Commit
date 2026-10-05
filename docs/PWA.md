# Commit consumer PWA

October 5, 2026. Accepted `consumer-app-final` layouts, Common Yes mark, `#0A4978` blue, typography, consumer shell and merchant UI remain frozen. Phase 6.1A payment revalidation is complete with PASS WITH LIMITATIONS. Payment implementation, automatic approval completion, envelopes, capture/reconciliation, solver and agentic authority are frozen. This hosted resumption changes documentation and adds verification evidence only.

## IMPLEMENTED

**App shell:** returning root/installed launch opens Group. Consumer navigation is Group, Plan, Activity, You, with persistent mobile bottom navigation and desktop rail. Settings are **You → App → Notifications & install**. Invite/browser participation needs no installation. Merchant Studio is a separate desktop origin.

**Manifest/install plumbing:** `/commit-app` ID, `/group` start, `/` scope, standalone display, accepted theme/background and 192/512/maskable icons. Installation is user-triggered; browser menu guidance covers unsupported install events. Manifest and viewport checks are not native-install proof. [Browser installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) require actual platform validation.

**Worker/offline:** root worker caches only offline document/styles/icons, never APIs/private needs/current financial pages/PayPal returns. Offline navigation and loaded pages warn financial status may have changed. PayPal/commercial actions disable; the client blocks POST before fetching. No commercial operation queues/replays on reconnect. Worker handles shell/notification/click/badge presentation only.

**Push/Activity:** contextual Enable updates respects denial. Activity works without permission and survives push failure. Recipient/group-scoped subscriptions validate known HTTPS push services, encryption keys, ownership and expiry. Unsubscribe removes delivery/subscription. Expired/404/410 endpoints clean up; transient delivery retries at most five times. Encrypted VAPID payload uses conservative `Commit update` / `Open Commit to review the latest update.` with safe deep link, Activity ID and informational badge, excluding budgets/raw needs/provider IDs. [Web Push encryption/authentication](https://web.dev/articles/push-notifications-web-push-protocol) is distinct from actual OS delivery.

**Deep links:** recipient-scoped Activity/read state persists. Safe destinations load authoritative current state; wrong-group links cannot change identity, obsolete proposal links require current/fresh-consent review. Actual installed notification clicks remain pending.

**Server coordination:** Node owns durable SQLite events/leases/dedupe, demand watcher, explicitly confirmed bounded merchant policies and participant mandates. Browser timers/service workers do no business orchestration. Delegated publication/finalization retains existing authority/preflight rules; buyer approvals stay explicit.

**Automatic provider completion:** current existing Sandbox checkouts reconcile through durable events and authoritative order/authorization checks, exact envelopes and original idempotency keys. After provider-confirmed explicit buyer approval, the server may idempotently complete the exact approved authorization and independently verify its state. Pending says `Checking your approval…`; intervention produces private Activity. Normal users need no manual provider-status action. Active holds refresh while valid; stale/void/saga-owned work cannot be reused. The accepted [Phase 6.1A live evidence](phase-6-1a-payment-revalidation.md) verifies authorization/void, authorization/test capture, restart and idempotency under the corrected invariant. No payment implementation changes or new live financial operations occur in this hosted task.

**Staging packet:** [deployment commands](../../deploy/phase-6/README.md) provide Node 24/systemd services behind protected Caddy, two exact HTTPS origins, one fresh persistent `/var/lib/commit-staging/staging.sqlite`, protected VAPID generation, allowlisted release and root-only backup/reset. Historical databases/reports/replay stay local. Deployment, key generation and host reset have not run.

Fresh local evidence: **281/281** tests, zero failures or skips; typecheck/build pass on Node v24.17.0; eight existing databases and 468 protected files unchanged; configured-value scan zero leaks including the audited 89-file release. The release excludes historical databases, acceptance ledgers and environment files and has not been uploaded. [Current verification report and receipts](phase-6-1-device-verification.md).

## EXTERNALLY VERIFIED

**None for resumed hosted acceptance.** No HTTPS staging, external Chrome/Edge installation/standalone launch, native permission/OS push, physical Android/iOS session or external independent invite/join is verified.

Earlier local in-app-browser worker/manifest/layout observations and final screenshot bundles remain unchanged. They are local browser/layout evidence. Unit/injected-transport/HTTPS-shaped loopback tests are implementation evidence. Neither establishes external PWA/device success.

## NOT VERIFIED / PRODUCTION PREREQUISITE

Blocking inputs: actual SSH target/user, two public HTTPS origins and operational `WEB_PUSH_CONTACT`. The supplied deployment fields remain literal `<...>` placeholders. Local public-origin/contact settings are absent; host-side staging VAPID generation has not run. Available computer surfaces expose only In-app Browser/MCP Apps, with no external Chrome/Edge or native device automation. Actual installation and physical-device evidence remain required. Private credentials must not be supplied in chat.

Pending acceptance: TLS/proxy/access gate and worker retrieval, hosted smoke, one completed native install with actual browser/version/OS, Group returning restore, real push/click/badge/lock-screen privacy, closed-UI hosted event, independent join/needs/privacy, denial/subscription expiry/offline/obsolete links, worker/both service restarts, reset execution. Android/iOS can only pass after physical testing. No chrome removal/device proof is fabricated.

Financial checkpoint: the current automatic completion path has passed Phase 6.1A live revalidation with its documented limitations. Reuse that unchanged evidence for deployment; do not rerun captures simply to test hosting. Only an actual deployed integration defect would justify further investigation. There is no pending payment-code rewrite or GET-only reconciliation requirement.

Production prerequisites outside staging: production authentication/tenancy/account recovery, operational ownership/monitoring/protected consistent backups, provider retry-limit and subscription/key-rotation review, real merchant inventory/terms and production payment arrangements. Demo identities and fictional Sandbox inventory are not production commerce readiness.

Current verdict: **EXTERNAL_PWA_NOT_READY**. Do not begin cold testing or submission work.
