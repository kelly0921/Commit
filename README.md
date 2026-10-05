# Commit

Commit helps a group turn individual needs into a shared purchase. The consumer PWA combines private needs, deterministic best-value recommendations, exact-term commitments, Activity and optional notifications. Merchant Studio uses AG Studio to analyze anonymous group demand and prepare bounded offers.

The current consumer and merchant design, solver, agent authority and payment implementation are frozen. PayPal uses Sandbox only. This is fictional inventory and staging/demo identity, not a production booking service.

## Run locally

Use Node.js 24 (the Render configuration pins 24.17.0).

~~~sh
npm ci
~~~

Copy .env.example to an ignored local .env if it does not already exist. Configure the Sandbox app credentials, OpenAI key and existing AG Studio license privately. Set PRODUCT_DATABASE_PATH to a new local database; never import historical payment databases. Optional Web Push requires a matched staging VAPID pair and a mailto contact.

Build a clean source checkout:

~~~sh
node deploy/render/build.mjs
npm run start:product
~~~

Consumer: http://127.0.0.1:3002/group

Start the separate merchant process in another terminal:

~~~sh
npm run start:merchant
~~~

Merchant: http://127.0.0.1:3005/merchant/group-demand

For source development, use npm run dev:product and npm run dev:merchant. Browser installation is optional. The consumer opens at /group and uses the persistent Group, Plan, Activity and You app navigation. Consumer and merchant APIs remain separate.

## Commercial and payment authority

Hard buyer and merchant boundaries override optimization. Deterministic rules rank feasible alternatives as Best Value, Lowest Cost and Best Experience; the LLM cannot calculate or override scores. Commitments bind exact proposal/envelope terms. Material changes require fresh consent.

After explicit buyer approval, Commit may idempotently complete the exact pre-approved PayPal authorization and independently verify provider state. It cannot create buyer consent, change approved terms or amounts, substitute envelopes, or authorize an unapproved order. Capture remains a separately confirmed organizer action through the existing durable saga. Automatic approval completion does not capture funds.

## Verification

~~~sh
npm run typecheck
node deploy/render/build.mjs
npm test
~~~

The automated suite uses fake provider gateways and isolated local fixtures; it does not replace live Sandbox evidence. Existing live payment revalidation is PASS WITH LIMITATIONS. Historical receipts and databases remain local and are excluded from this source snapshot. No live payment operations are required to build or run the automated suite.

The deployment wrapper leaves frozen build scripts intact. When the legacy copy step expects an absent local replay receipt, the wrapper supplies a temporary unavailable marker and removes it and the compiled replay before release. It never publishes historical payment replay data.

## Render staging

[render.yaml](render.yaml) prepares one paid Node web service, one persistent disk and a gateway supervising the consumer and merchant processes. Render supplies TLS. The existing durable coordinator continues independently of open browser tabs. Fresh staging data initializes on the persistent disk; no historical acceptance ledger is imported.

Follow [Render deployment](docs/render-deployment.md) for the one-host hackathon setup. The Render-provided HTTPS hostname serves consumer routes and /merchant; only the four existing app credentials/license are required. Web Push and Basic Auth default off. The guide covers optional VAPID/access setup, health, protected reset and rollback. Automatic deployment is disabled. Repository publication does not create a Render service or deploy the app.

Actual external PWA installation, OS push and physical Android/iOS verification remain outstanding. Cold testing has not begun.

## Product specifications

- [Product requirements](docs/PRD.md)
- [Architecture and deterministic solver](docs/ARCHITECTURE.md)
- [Agentic authority model](docs/AGENTIC_MODEL.md)
- [PWA behavior](docs/PWA.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [GitHub publication scope](docs/github-publication.md)

Detailed historical reports, screenshots and raw acceptance receipts are retained in the original local workspace. Some specification links point to that local evidence archive and are unavailable in this clean deployment repository. Credentials, tokens, local databases and generated bundles are never committed.
