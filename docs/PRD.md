# Commit — canonical product requirements

## Current product update — Phase 6: delegated bounded agency

Commit now coordinates on the server within immutable human grants. The final Common Yes visual system remains the baseline. [Agentic model](AGENTIC_MODEL.md), [PWA behavior](PWA.md) and [Phase 6 verification](phase-6-agentic-pwa-report.md) define the current implementation; older phase plans below describe their historical scope. Submission preparation and external cold testing remain stopped.

- Assist: AI interprets, explains, compares, simulates and drafts. It cannot change commercial authority.
- Delegate: each participant explicitly grants automatic replanning/better offers against confirmed hard boundaries; all current grants must permit a group action. Merchant policies explicitly permit publication within immutable dates/packages/discount/margin/size/threshold/cap. Policy publication is the bounded exception to per-offer confirmation; AI itself receives no publishing or policy-writing tool.
- Financial: every buyer still approves their exact current PayPal authorization. Organizer auto-finalize is OFF by default, separately confirmed, and invokes the existing saga only after four current approvals and preflight. Changed envelopes require fresh approval.
- Durable Activity precedes optional Web Push. A person can close the browser and return to scoped updates, current needs and agent reasons. Server supervision is required.
- Consumer PWA: original icons/manifest, contextual install/updates, safe worker, offline warning, blocked mutations and no offline payment/authority replay. Merchant Studio stays desktop-first.
- Use Commit creates an independent demo identity and explicit fictional February stays; secure expiring invites join separate sessions. The payment demo requires four people. Seeded exploration and the verified historical replay remain available.
- Merchant demand includes 50 clearly labeled fixture cohorts plus anonymous aggregate projections from fresh groups. No budgets, identities, private requirements or consumer financial records enter merchant simulations.
- Native installation, real push and real Android/iOS behavior require additional device/staging verification. Demo identity is not production authentication.


**Phase 5 update — October 3, 2026: COMPLETE — PASS WITH LIMITATIONS.** 198/198 tests, typecheck/build and the live merchant-to-consumer Sandbox loop pass. Human publication and organizer acceptance created offer-bound proposal v2; four fresh authorizations and captures independently confirm $1,393.80, saving $121.20. Original fixtures and payment evidence remain intact. See [Phase 5 report](phase-5-report.md). Stop before submission work.

Published offers have immutable versions and merchant/date/package/group-size/validity/redemption conditions. AI may create a server-validated unpublished draft; it cannot publish, mutate consumer proposals or execute payments. A separate merchant review with an unchecked exact-terms confirmation and single-use server authorization publishes. Eligible groups see solver-computed before/after totals and allocations. Organizer acceptance reserves the offer and creates a new proposal, making earlier commitments stale even on decreases. Verified cleanup of old active holds is required before fresh approvals. Four fresh approvals use the existing capture saga. Accepted exact offer terms survive later expiry/revocation; new acceptances are blocked. The explicit February demo preserves the original verified December fixture and never falsifies hard feasibility.

Consumer UX/design pass **COMPLETE — PASS** (October 3, 2026): original Commit identity, social group hub, bounded-AI review, price/quality comparison and human payment/recovery states. **152/152 tests, typecheck, build and live AI regression pass.** Verified Phase 3 financial behavior and historical evidence are preserved. See [design system](DESIGN_SYSTEM.md) and [design report](design-pass-report.md). Consumer demo is ready to freeze with the existing Sandbox/identity/fulfillment limitations. Phase 4 merchant Studio is complete; the consumer surface remains frozen.

Status: Phases 1/1.1, 2/2.1 and **Phase 3 are COMPLETE — PASS WITH LIMITATIONS**. Historical authorization/staleness/void evidence is preserved. Separate fresh Phase 3 fixtures verified four full captures totaling $1,515/$0 refunded and controlled capture-3 rejection with $785 fully refunded/two holds voided. Current version 4 is CONFIRMED; the compensated version 3 history remains intact. All 141 tests, typecheck and build pass. Phase 4 is complete with a separate read-only merchant console. Updated October 3, 2026 (local time). See [Phase 1 verification](phase-1-report.md), [historical Phase 2](phase-2-report.md), [Phase 2.1](phase-2-1-report.md) and [Phase 3](phase-3-report.md).

**Turn social intent into commerce.** Commit helps a group agree on what to buy before anybody pays. Participants privately describe their limits, AI interprets them, application code finds a feasible merchant package, and each person eventually authorizes only their own share. The organizer never holds pooled money.

## Scope and source of truth

This document is the canonical product specification. [Architecture](ARCHITECTURE.md) defines implementation decisions; [build plan](BUILD_PLAN.md) tracks delivery. [PayPal feasibility](paypal-feasibility-report.md) is authoritative for verified payments. Phase 0 passed with limitations: separate AUTHORIZE/VOID and AUTHORIZE/CAPTURE work; atomic multi-order capture is unavailable; account partial capture and Venmo remain unverified.

Chronology: original Phase 2 reached four-person live Sandbox readiness and verified void cleanup **before Phase 1.1**. Phase 1.1 subsequently strengthened selection and commitment semantics through deterministic best value, quality/commercial hard gates, exact envelopes and material-change staleness. Original payment evidence proves the earlier implementation, so Phase 2.1 must independently revalidate the current implementation before Phase 3 is eligible.

Phase 2.1 authorizes fresh Sandbox approvals, API verification, a realistic demo material change, fresh approval/readiness and verified void cleanup. The deterministic solver establishes current terms; old prices/allocations are not assumed authoritative. No capture, refund, capture saga, production identity/onboarding, AG Studio or discount publication is in scope. Preserve all historical evidence and stop after the revalidation report.

## Demo and user problem

One fictional merchant, **Summit Weekend**, sells ski-weekend packages. The seeded group plans **Vermont Ski Weekend** with Kelly, Lawrence, Sarah, and Alex. Verbal interest, unequal budgets, private needs, changing plans, and someone fronting the cost are the problem. This is an original consumer product inspired by a possible future Venmo Groups extension, not an existing Venmo integration.

| Participant | Private hard ceiling | Private preference/need |
|---|---:|---|
| Kelly | $450 | Prefer $400; rentals required |
| Lawrence | $400 | Owns equipment; no rentals required |
| Sarah | $500 | Own bed required |
| Alex | $350 | Can drive |

These are synthetic demo records. At least four packages must represent real tradeoffs: cheap but unsuitable sleeping arrangements, balanced lodge, expensive slopeside stay, parking/distance tradeoff, unavailable inventory, and insufficient capacity. The illustrative $429/$361/$478/$342 allocations in the concept are not fixed output; actual allocations follow seeded package prices and deterministic rules.

## Phase 1 journeys

1. Landing: understand the concept, choose Try Demo without signing up, or create a plan with a name and natural-language goal. The four fictional participants are seeded automatically.
2. Group room: see participants, which constraints are confirmed, public requirements, selected proposal, assigned shares, and $0 captured. Seeded financial commitment statuses are NOT_STARTED; do not imply real commitments.
3. My constraints: enter natural language; interpret into a strict schema; privately review and edit the extracted budget and supported requirements; explicitly confirm. Ambiguous or unsupported needs require clarification instead of silently disappearing.
4. Solve: all four members need confirmed hard ceilings. Evaluate every package; persist either a feasible proposal with exact allocations or a failed evaluation with no purchasable proposal. Display alternative package outcomes without exposing private rejection reasons.
5. Proposal: show selected package, each share, public facts, alternatives, and a concise explanation grounded in solver facts. Only the current participant can see their own price components, ceiling, and preferences.
6. Persona switching: Kelly/Lawrence/Sarah/Alex and a Summit Weekend preview. Changing persona must replace private client state and server identity; switching is deliberately permitted in the local synthetic demo. Merchant preview has only public catalog information and an explicit future-console placeholder, not group/private demand data.

## Interpretation and confirmation

`ConstraintInterpreter` accepts at most 2,000 characters and returns validated hardMax/preferredMax in USD, typed requirements/preferences, confidence, and clarification notes. Normalize amounts to integer cents; reject negative, nonfinite, fractional-cent, or excessive money. preferredMax cannot exceed hardMax. Confidence does not replace participant review. Unknown keys, wrong types, extra properties, conflicting/unsupported hard requirements, and refused/incomplete model outputs cannot become confirmed constraints.

Supported hard requirements: rentalsRequired, ownBed, parkingIncluded, maxDistanceMinutes, minRating, minReviewCount, minAccommodationQuality, flexibleCancellationRequired, minRefundPercent, wifiRequired and breakfastRequired. Refund requirements refer to cancellation by the package's displayed deadline; unsupported dates or unconditional refund guarantees require clarification. Supported preferences: distanceMinutes, parkingIncluded, canDrive, plus preferredMax. Visibility is PRIVATE by default. Only explicit user selection can publish a requirement/preference. Budget ceilings and the original statement always remain private. A confirmed hard ceiling is required for feasibility.

The real AI provider uses structured outputs and independent application validation. If no key is available, an explicitly labeled offline demo mode may exercise a limited local interpreter and deterministic explanation; it must never be described as live AI. Provider errors never silently change modes. Live AI verification is a separate acceptance gate until credentials are available.

## Bounded Agency

AI may interpret, recommend, optimize, explain, and simulate. AI must not silently redefine the commercial boundaries established by users or merchants. **Hard boundaries always override optimization.** The AI may never lower a boundary merely to make a transaction possible. Interpretation produces a draft; only explicit participant confirmation can replace confirmed buyer terms. Merchant terms and scoring policy are outside the model's write capabilities.

Buyer-side hard boundaries may include:

- Hard maximum spend.
- Must-have requirements.
- Minimum quality standards.
- Required cancellation/refund properties.
- Exact merchant/package terms once a commitment exists.

Merchant-side hard boundaries may include:

- Minimum acceptable price.
- Minimum margin.
- Maximum discount.
- Eligible inventory/dates.
- Redemption limits.

An infeasible transaction stays infeasible. The product may explain the unmet boundaries and invite an explicit human revision; it cannot relax them automatically.

## Money and value optimization

Money uses integer USD cents. Split shared lodging and any shared parking fee equally, distributing remainder cents by stable participant ID. Each participant pays their own lift ticket, rentals only when requested, and own-bed supplement only when requested. Sum of allocations must equal the merchant total exactly. No cross-subsidy based on private budget, no invented driver credit, and no LLM arithmetic.

Selection is hierarchical:

1. Reject options violating any confirmed participant hard constraint, including individual spend ceilings and must-haves. Merchant price, margin, discount, inventory/date and redemption boundaries also gate feasibility.
2. Reject options below product quality floors or a participant's stronger quality/cancellation/refund requirements.
3. Evaluate only feasible options for price efficiency, quality, preference fit and fairness across participants.
4. Rank feasible alternatives with the published deterministic policy.
5. Explain why the recommendation was selected using only solver facts.

The current versioned policy, `bounded-value-v1`, scores each dimension on 0–1000 and weights price efficiency 25%, quality 35%, preference fit 25% and fairness 15%. Higher value wins; ties use higher quality, then lower total, then stable package ID. Quality floors are rating at least 4/5, at least 25 reviews and accommodation quality at least 3/5. Buyer requirements can strengthen those floors. These are explicit demo product rules, not independent certification. [Architecture](ARCHITECTURE.md) publishes every formula and normalization. No LLM calculates, supplies or overrides scores, weights, floors, allocation amounts or ranking.

All six fictional merchant packages carry structured rating, review count, cancellation flexibility, distance, accommodation quality and included amenities, plus exact stay dates and cancellation/refund terms. Missing or malformed commercial evidence fails closed. Quality is evaluated from these declared fields with transparent rules; no opaque model quality judgment is used.

**No plan may be labeled feasible if any hard participant constraint is violated.** All groups use the same published allocation/scoring policy. Unsupported needs must be resolved before confirmation.

## Proposal comparison

Proposal cards distinguish **Best Value / Recommended**, **Lowest Cost** and **Best Experience** among feasible alternatives. Labels may coincide when one package wins multiple categories. Best Experience means the highest deterministic quality score; it is not a claim that an AI independently assessed the merchant. Cards show group total, the current participant's share, declared quality, amenities, distance, dates and refund deadline so the price/quality tradeoff is visible. Feasible alternatives have a rank; a hard-constraint or quality-floor failure is labeled **Unavailable**, receives no score/rank or recommendation badge, and cannot become the proposed purchase. Public reasons remain privacy-safe; owners can inspect their own failed checks. Private preference/fairness/value scores stay internal.

## Commitment envelope

A commitment binds to the exact commercial terms shown for approval: immutable proposal ID/version, merchant ID, package ID, participant amount ceiling and currency, material package attributes, stay dates, cancellation deadline/refund percentage, confirmed buyer hard conditions and the value-policy version. The persisted envelope also fingerprints merchant boundaries without exposing private costs or margins to buyers.

If a material term changes outside the approved envelope, mark the commitment **STALE**, preserve its provider resource IDs for reconciliation/void, and require a fresh proposal and buyer approval. This includes price decreases as well as increases, merchant/package substitutions, quality/amenity changes and dates/refund changes. Never silently reuse an authorization for materially different terms. Preparing a NOT_STARTED envelope grants no financial approval. Legacy proposals and active approvals lacking the new envelope become stale on migration; terminal void/capture/refund history is preserved.

## Merchant agent safety

Merchant agent capability boundaries (Phase 4 implements simulation only):

- `simulateGroupOffer()` may be called by AI and is read-only; it cannot change catalog, commitments, inventory or offers.
- `draftGroupOffer()` may create an unpublished proposal within merchant boundaries.
- Publishing requires explicit merchant confirmation in the UI of the exact draft/version and terms, followed by server-side boundary validation and audit.

AI must not autonomously accept a buyer offer, publish a discount, or violate merchant price/margin floors. No publishing or offer-acceptance tool is exposed to AI. Phase 4 implements read-only Studio analysis and simulation. Drafting, publication and offer acceptance remain deferred to Phase 5.

## Privacy and changes

Server session identity determines access; client-supplied participant IDs are not authorization. Organizer privileges do not grant private-constraint access. Public group/proposal APIs never return statements, hardMax/preferredMax, private preferences, or private component breakdowns. AI explanation receives only privacy-safe deterministic facts; it cannot publish a private budget through prose. No private statements in logs/audits. Audit actor, entity, revision, operation, and timestamp.

Editing any confirmed constraint invalidates the current proposal and its commitments. An AI response or solve based on an obsolete revision cannot overwrite a newer one. Commitments link to immutable proposal allocations and approved ceilings. Increased and decreased shares require a new version and payer approval in Phase 2; stale authorizations remain available for explicit verified void. Automatic stale void is deferred. Lower capture remains gated on merchant-specific partial-capture verification.

Demo persona switching is not production authentication. Local binding and synthetic data are required until real identity and access control are added. Each browser demo session has an isolated group; seeded private data is intentionally visible only after the judge explicitly switches into that persona.

## Later states and phases

Plan states: DRAFT, COLLECTING_CONSTRAINTS, SOLVING, PROPOSED, AWAITING_COMMITMENTS, READY_TO_CAPTURE, CAPTURING, CONFIRMED, PROPOSAL_STALE, REPLAN_REQUIRED, CAPTURE_FAILED, COMPENSATING, FAILED. Phase 1 uses DRAFT/COLLECTING_CONSTRAINTS/PROPOSED/PROPOSAL_STALE/REPLAN_REQUIRED; SOLVING is the current action, not a permanently stuck state.

Commitment states: NOT_STARTED, ORDER_CREATED, PAYER_APPROVED, AUTHORIZED, CAPTURED, VOIDED, REFUNDED, FAILED, STALE. Phase 2 executes all except CAPTURED/REFUNDED, which remain future-compatible enum values. NEEDS_VERIFICATION is a derived shared label for an authorization whose verified eligibility is no longer fresh or valid.

Phases 2–3 implement participant authorizations/progress and durable capture/recovery. Phase 4 adds privacy-safe AG Studio demand and read-only simulation. Later phases cover explicitly approved offer publication and replanning, demo polish and submission. READY_TO_CAPTURE requires valid authorizations for every required participant on the same current proposal and no staleness; it is not atomic settlement or a capture guarantee.

## Acceptance

Use the Phase 1 and Phase 2 checklists in BUILD_PLAN.md. Preserve allocation conservation, privacy, immutable revisions, payment/race/recovery coverage and existing PayPal tests. The bounded-agency gate additionally requires cheaper below-quality-floor rejection, higher-value selection over a cheaper feasible alternative, hard limits winning over preference/price, rejected AI boundary/score overrides, deterministic-only explanation facts, material-envelope staleness and safe legacy migration. Run the full suite, typecheck and build; verify desktop/mobile comparisons and record results in the Phase 1 report before further phase work.

## Original Phase 2 scope and current revalidation gate

Each participant authorizes only their exact saved share toward the current immutable proposal through a separate PayPal Sandbox order. The verified Summit Lodge fixture is Kelly $390, Lawrence $335, Sarah $395, Alex $335, total $1,455. Commit pages explain authorization, zero capture, the specific package/version and next group step. Shared rooms show names, shares and commitment progress; private budgets, statements and preferences remain owner-only.

The group reaches READY_TO_CAPTURE only after every required authorization is verified, exact, current, fresh and unexpired. This is an informational milestone with no capture action in Phase 2. Revisions invalidate old commitments, including lower prices until account-specific partial capture is verified. Duplicate clicks/reloads cannot create additional orders. The original Phase 2 minimum gate was two real approvals with four preferred, and four passed. **Phase 2.1 now requires all four under current envelopes, live material-change staleness and fresh all-four approval/readiness.** Preserve Phase 1/1.1 behavior and the spike. Production authentication, capture/refunds, merchant intelligence/offers and submission remain outside this phase.

## Phase 3 — finalization and recovery (complete)

When all four current commitments are freshly verified, Kelly as organizer may review a confirmation showing Summit Lodge, proposal version, four exact approved shares and $1,515 total, then Cancel or Finalize. A delayed Finalize click refreshes PayPal status before enforcing the same freshness, amount, envelope and expiry checks; users do not need new buyer approval merely because a status check became old. Changed commercial terms or invalid resources still block capture. AI cannot initiate capture. The approved commercial envelope is frozen during execution. Captures happen sequentially; progress and gross captured/refunded totals are truthful. All four verified captures yield a clearly labeled demo booking confirmation, with no external reservation claim.

A capture rejection stops the sequence. Completed shares receive full refunds; every remaining active hold is voided. Pending/failed/unknown compensation remains visible with organizer reconciliation/resume and manual-review status. Only verified complete compensation returns the plan to replanning. Duplicate finalization resumes the same durable saga and uses the same request IDs. Separate fresh Sandbox success and capture-3 negative-test fixtures passed, as recorded in the Phase 3 report. The separate Phase 4 instruction added read-only merchant intelligence; financial behavior remains frozen.

## Consumer UX/design pass — complete

Original Commit identity uses warm paper, deep teal, social avatars, exact monetary hierarchy and restrained motion. Group room is the hub with a conditional **Your next step**; navigation follows **Group room / Our plan / My needs**. Persona switching is clearly **Demo as**, and the existing merchant view stays a public catalog preview.

Natural-language interpretation remains an unconfirmed private draft. **Here’s what I understood** distinguishes **Must have** from **Nice to have**, shows editable absolute/preferred budgets, and offers **Edit my words / Looks right**. Sharing remains explicitly opt-in; clarification blocks confirmation. The prominent privacy message describes visibility accurately.

Proposal emphasizes the deterministic best-value recommendation, declared rating/reviews/accommodation, distance, amenities, dates and refund deadline, exact total and participant shares. Only the current owner sees private checks/components. Plain-language deterministic solver facts replace formula/weight displays. Recommended, Lowest Cost and Best Experience can coincide; infeasible alternatives remain unavailable with privacy-safe reasons and no purchase action. Catalog prices, scoring and boundaries are unchanged.

Group/proposal actions first open the exact share/terms review. Only the explicit Commit action creates the checkout. The actual buyer approval uses official PayPal-hosted Sandbox checkout, with no imitation PayPal button. Each money moment distinguishes a hold from a charge, approved version/ceiling from changed terms, and a fresh status check from a new approval. Changed commitments show previous/new amounts and saved terms, explain that earlier approval will not be used, require fresh approval even for a decrease, and retain explicit old-hold management.

Waiting, all-four readiness, separate final review, per-person finalization, confirmed demo booking and compensation use human-readable outcomes. Provider uncertainty/pending refunds never count as completed. A confirmed booking is explicitly fictional with no reservation. Confirmed reversals do not promise instant bank/card settlement. All underlying financial services, solver/envelopes/idempotency and saga logic remain unchanged; only static asset serving was extended for a pure presentation module.

Fourteen isolated review views passed at 390px phone, 768px tablet and 1440px desktop, with no horizontal overflow or unlabeled controls. Keyboard focus, labels, text statuses, contrast and reduced-motion behavior are documented in the design report. No new payment execution or later-phase feature was part of this pass. Freeze the local consumer demo; a separately authorized merchant phase must preserve all bounded-agency and explicit-publication rules.


## Phase 4 — merchant intelligence (complete)

Summit Weekend now has a dedicated AG Studio 3.0.0 merchant workspace at `http://127.0.0.1:3005/merchant/group-demand`. It answers “What almost sold?” using 50 deterministic, anonymous synthetic group intents. It does not read live consumer tables. The frozen consumer merchant-preview placeholder remains unchanged; open the dedicated console directly.

The Studio dashboard contains four commercial KPIs, a cumulative commitment funnel, a primary-blocker chart, a potential-GMV-by-size chart, a full-width opportunity grid, and the custom Conversion Unlock Simulator. Native filters and cross-filters update the whole cohort view, including backend simulation scope. Warm Commit surfaces, teal charts, readable money, and an analytical layout extend the consumer design system. Tablet widgets stack; the narrow fallback contains a horizontally scrollable Studio workspace.

Active intents excludes purchased cohorts. Potential GMV sums original quotes for unresolved feasible cohorts or otherwise feasible price-blocked cohorts recoverable within the allowed 10% discount. Near conversion includes these recoverable price cohorts and feasible groups fully committed or one commitment away. Fully committed excludes purchased cohorts. The initial values are 46 active intents, $42,060 potential GMV, 22 near conversion and 3 fully committed. These are synthetic opportunities, not purchase forecasts or actual payment statuses.

Group Demand Analyst uses the real Studio Agent Framework to query the safe schema, filter the dashboard, and create/configure native visualizations. Its custom `simulate_group_offer` tool calls the server’s unchanged consumer solver against an isolated fictional catalog adaptation. Only deterministic code computes new feasibility, discounted incremental GMV, discount cost and modeled merchant revenue. The 0/3/5/8/10% curve honors a 10% maximum discount, 20% minimum margin, minimum price, eligible packages, dates, inventory and redemption rules. Quality, configuration, participation and buyer hard limits cannot be relaxed to make an offer work.

Participant identities, private budgets, raw needs/preferences, AI conversations and payment resources are absent from both the merchant API projection and Studio schema. The live three-prompt acceptance flow filters 14 February near-conversion cohorts, finds price as the largest blocker (9 groups), and simulates an 8% offer for 4+ people: 9 newly feasible groups, $12,530.40 incremental GMV/revenue and $1,089.60 discount cost. No offer or consumer/payment record changes.

Phase 4 passed the local demo gate with documented limitations: 173 tests, typecheck, build, live framework and browser verification. See [Phase 4 report](phase-4-ag-studio-report.md). The completed Phase 5 checkpoint above adds immutable unpublished drafts, explicit merchant UI confirmation before publication, and fresh participant approval for changed exact commitment terms.
