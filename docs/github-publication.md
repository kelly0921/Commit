# GitHub source publication

Target: private repository `kelly0921/Commit`, initial `main` branch. The remote was empty and the signed-in account had push access when publication preparation began on October 5, 2026.

This is a clean source snapshot of the frozen current consumer/merchant application, tests, deterministic solver, payment implementation and Render deployment configuration. The original local branch, working tree, historical reports and receipts remain intact. The original local Git history contains earlier evidence and is not imported into this empty deployment repository.

Included: application source, current UI assets, automated tests, reproducible build/operator scripts, package lock, environment template, deployment configuration and current canonical product/architecture/authority/PWA/design documentation.

Excluded: actual environment values, credentials, tokens, databases, local staging fixtures, generated bundles, historical replay data, screenshots, raw acceptance ledgers and historical verification reports. No invented payment receipt replaces excluded evidence. Existing specification links to historical reports refer to the retained local archive.

The Render build entrypoint now supports a clean checkout without a historical replay file. It runs the frozen product build, removes the compiled replay, performs the existing release audit, and removes only its own temporary unavailable marker. Existing local historical replay bytes remain unchanged. This packaging correction changes no product UI, provider operation, commitment envelope, saga, solver or authority behavior.

Publication does not deploy Render, publish a merchant offer, perform a live PayPal transaction or begin device/cold testing. Render automatic deployment remains disabled. Hosted readiness has not been established.

Local acceptance: **297/297 tests pass**, including three new packaging preservation/cleanup tests; typecheck and the audited release build pass. The updated Blueprint passes the retained official Render JSON Schema. All 507 protected pre-existing files and eight historical databases remain unchanged. The source scan found no configured-secret values or private-key/token patterns. Detailed publication receipts remain local under `docs/assets/github-publication/`.
