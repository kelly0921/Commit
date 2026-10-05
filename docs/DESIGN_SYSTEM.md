# Commit design system

October 3, 2026 · final pre-testing redesign. This replaces the earlier teal/paper direction. The consumer and merchant products share an identity, not a shell. Historical design reports remain evidence of their original versions.

## Identity

Commit combines social coordination, precise personal money and merchant intelligence. Its identity is deep blue, cool white surfaces and dark neutral type. Coral is confined to social avatars and original illustrative details. The builder selected **Common Yes** from the first logo exploration: a substantial open C with angled terminals and a rising lower end, redrawn as a flat vector. It accompanies the existing typographic wordmark on both product surfaces. The canonical [app icon](../assets/brand/commit-common-yes.svg), [blue mark](../assets/brand/commit-common-yes-mark.svg) and [white mark](../assets/brand/commit-common-yes-white.svg) share the same geometry. Header marks are decorative inside named home links; matching SVG browser icons use the same artwork. The deeper blue reflects the builder's subsequent color preference; no bank/payment symbol is copied. The existing Inter/system sans stack requires no font download or new dependency. See the [logo implementation record](common-yes-logo-report.md).

## Tokens

| Role | Final value | Use |
| --- | --- | --- |
| Canvas | #F7F8FA | Cool consumer/merchant base |
| Surface | #FFFFFF | Major financial, recommendation and analytical surfaces |
| Secondary surface | #F0F2F7 | Quiet supporting information |
| Commit deep blue | #0A4978 | Logo, actions, navigation, analytical charts and focus |
| Hover | #073958 | Primary interaction feedback |
| Text | #10131A | Headings and exact money |
| Secondary text | #586174 | Body, metadata and supporting labels |
| Decorative border | #DCE0E8 | Surface divisions |
| Control border | #8792A5 | Inputs and outlined actions |
| Social accent | #FF6B63 | Restrained coral illustration/avatars, never essential text |
| Success | #14754F on #EDF8F2 | Verified commitment/payment/refund, savings |
| Changed terms | #895611 on #FFF7E8; edge #E59A24 | Review required, uncertainty; not a payment failure |
| Failure | #B23838 on #FFF0F0 | Genuine failure requiring attention |
| Hosted payment link | #173D78 | Ordinary link into official PayPal checkout |

Do not use a success background for a whole page. Text always carries state. Low-contrast decorative colors never carry essential information alone.

## Consumer app shell

Center content inside an 880px usable desktop canvas (928px outer shell including gutters). It remains a social app on desktop. The selected proposal may use a recommendation + personal receipt column above 900px. Other pages use a focused vertical flow.

**Group / Plan / You** link to the existing group, proposal and personal-needs routes. On phones up to 700px, these are persistent bottom navigation with small original line icons, textual names and `aria-current`. The navigation has safe-area padding; the document reserves bottom space so its last action remains reachable. Desktop uses the same three destinations in the compact header. Commitment and progress routes keep Group active. No new route or commercial step exists.

The top header contains only the wordmark and the explicit **Demo as** persona control. It is a synthetic preview control, not authentication. The footer is a quiet fictional-merchant/Sandbox disclosure rather than website navigation. A skip link and route h1 focus remain available.

## Consumer hierarchy and social presence

1. Group/person identity, exact dates and overlapping circular initials.
2. Human current state and the meaningful dollar amount.
3. Current next action.
4. Compact participant rows, plan, savings and supporting details.

Group Room leads with the group name. A commitment state shows the owner's exact share plus verified group count. Ready shows all-four authorized total and zero capture; confirmed shows the exact total and verified payments. Confirmation says **demo purchase**, never promises a real reservation. Participant status rows use an avatar, name, exact share and human status; they are not four nested financial cards.

My Needs uses **What matters to you?**, a private statement and **Here’s what I understood**. Must have / Nice to have remain separate sections, without inner boxed cards. Sharing checkboxes begin unchecked. Only the existing explicit **Looks right** confirmation saves boundaries. Edit my words, clarifications and private-budget semantics stay unchanged. AI has no decorative glow or dominant branding.

## Proposal

The recommendation owns the primary surface: compact original property illustration, package name, declared rating/reviews, distance, exact refund deadline, exact group total and share-review action. The art is decorative, locally authored vector geometry; no hotel photography or asset claim.

Dates, amenities and cancellation details use a native disclosure. All saved attributes remain accessible. Individual allocations use simple avatar/name/money columns. The rationale is deterministic plain language; no model prose, formulas or private participant facts are interpolated. Category labels may honestly coincide. Feasible alternatives show price and key quality facts with an expandable full comparison. Unavailable options use muted native disclosures with an explicit unavailable label and no selection/payment action. Owner-only unmet checks remain owner-only.

## Commitment, fresh consent and receipts

The commitment is a calm white surface with a dark 48–52px exact amount. Saved package, dates, refund policy and maximum commitment appear before the action. Quality/material attributes and the exact component receipt remain accessible through native disclosures. Hold vs charge and organizer finalization are explicit. The Commit CTA initiates the existing workflow; the actual buyer interaction remains official PayPal-hosted Sandbox checkout through an ordinary link. Never recreate a PayPal/Venmo brand button.

Changed terms use an amber edge, crossed-out previous amount, exact new amount and an explicit no-reuse/fresh-approval statement. Saved old/new dates, refund terms and material attributes remain inspectable. Lower shares still require fresh approval. Previous hold management remains explicit.

Progress places authorized/captured totals and the existing organizer action before the social outcome rows. Payment processing, uncertainty, refund pending and release outcomes retain their accurate human wording and exact gross/refund totals. Full Purchase Details retains every participant outcome; the Group Room's terminal receipt is compact. Recovery is not completed until the server reports completion. No animation promises settlement or booking fulfillment.

## Merchant desktop shell

Merchant Studio is a commerce console, with a 60px header, compact Group Demand title, quiet safe-data/authority context, a compact offer summary and the actual AG Studio workspace. The dashboard is primary; the native analyst is collapsed initially and can be opened through its existing control. GMV is first and wider; other native KPIs are secondary. Widgets, queries, filters, scoped simulation, tool allowlist and IDs are unchanged.

Use dense 11–14px supporting type, 26px simulator figures, 7px controls and 10px major/native widget radii. Published terms expand through a keyboard-operable native disclosure. AI-prepared unpublished drafts and exact human publication reviews remain expanded and visually distinct. The checkbox, trusted click, server confirmation and every commercial boundary are unchanged. No AI publication capability exists.

Simulations have clear numerical hierarchy for newly feasible groups, discounted incremental GMV, discount cost and revenue, followed by **Feasibility estimate, not a purchase forecast** and the existing accuracy language. All values remain server facts. The selected scope must match the native filtered dashboard.

Desktop is the intended analytics environment. Tablet stacks existing native widgets. Phone page width must fit; the 720px internal AG canvas can scroll sideways. Do not fake the native Studio UI or add a mobile consumer shell around merchant analytics.

## Type, spacing and shape

| Role | Consumer | Merchant |
| --- | --- | --- |
| Page title | 28px phone / 32px desktop | 26–28px |
| Section title | 20–24px | 13–19px depending on widget/review |
| Money | 38–52px hero; 20–28px secondary | 24px native KPI; 26px simulation |
| Body | 13–15px | 12–13px |
| Labels/status | 11–12px | 11–12px |
| Primary action | 48px minimum | 44px surrounding controls |
| Major surface radius | 16px | 10px |
| Control radius | 10px | 6–7px |

Use a 4px spacing rhythm: 4/8/12/16/20/24/32/40. Avatars alone remain circular. Dividers and typographic hierarchy replace redundant boxes, pills and inner-card backgrounds. No drop shadows, gradients or glowing AI effects. Money uses tabular numerals and the existing integer-cent formatter; nonzero cents always remain exact.

## Accessibility and motion

Semantic landmarks, one h1, labeled controls, textual status, accessible progress count, 3px deep-blue focus, skip links and native keyboard disclosures. Phone inputs remain 16px. Color never determines availability alone. Reduced-motion media rules disable animations/transitions; existing review/edit focus and scrolling honor the preference. Motion is limited to existing feedback/loading, not decorative effects.

The broader visual candidate is recorded in the [final visual report](final-visual-redesign-report.md); the later authorized Common Yes identity and blue update are recorded in the [logo implementation record](common-yes-logo-report.md). Cold-testing freeze remains held because browser verification found a manual merchant simulation scope mismatch. Do not describe this candidate as freeze-ready until that functional gate is resolved and verified in a separately authorized follow-up. A builder visual review is not external usability, accessibility certification or production-commerce validation.

## Current consumer app interaction patterns — October 4, 2026

These patterns supersede the earlier consumer navigation and page-hierarchy descriptions above. Brand, palette, fonts, tokens and merchant analytics presentation remain as previously accepted.

Consumer is a mobile-first app, with **Group → Plan → Activity → You** as its only primary navigation. Joined phone screens use persistent bottom tabs with labels, current-page state and safe-area clearance. At 900px and above, the same destinations become a compact sticky rail beside content constrained to 600px. The header contains the existing wordmark and the participant’s name, with no competing header links, journey navigation, persona control or demo banner. Create/join and focused needs/payment reviews omit the tabs and provide Back. Joined root entry restores Group; the unchanged installed manifest starts at `/group`.

Group leads with name, dates, friends, human progress, exact own share and one state-appropriate action. Missing needs, approval, waiting, readiness, confirmed purchase and unexpected charges have distinct messages. Confirmation returns to an inhabited Group home; the trip plan and receipt remain separate existing views. Social rows precede normal accounting. Recovery preserves pending and uncertain outcomes, exact gross captures and confirmed refunds.

Plan uses one recommendation object and **Best fit / Lowest cost / Best experience** pressed-button segments. A selection replaces the main panel using the server’s comparison labels; it never ranks prices or quality locally. Alternative inspection does not replace the commercial proposal or authorize payment. Coincident category winners are explained. Unavailable options retain explicit labels and private-safe failure information. Full terms, own calculation, versions and deterministic rationale use native disclosures. The package illustration is decorative local vector geometry using the accepted palette.

You owns the confirmed private needs summary, focused Edit needs flow, coordination switches, organizer setting, notification preferences and installation guidance. A switch changes an unsaved selection; the existing explicit confirmation plus Save grants or changes authority. Payment approval remains locked to the buyer. Natural-language interpretation separates Must have from Nice to have, retains clarification and explicit confirmation, and returns to You after saving. Group members never receive another participant’s private maximum or checks.

Activity is an immediate inbox with Now/Recent sections, unread state, timestamps and focused actions. Permission/setup/installation belong in You. The display reads saved server state every ten seconds while visible, and on focus/reconnection. It avoids editing flows, expanded details and review confirmations; identical state does not repaint. Activity actions preserve group/proposal parameters. Existing changed-term push targets are resolved to fresh consent against the matching stored event; foreign-group and earlier-version protections remain in force. This is display refresh, not a new payment reconciliation capability.

Available offers lead with group/own before-and-after amounts and exact savings. Review updated plan opens a focused review; **Accept updated plan** retains the existing explicit acceptance action. Offer eligibility, versions, dates, redemption limit and expiry stay in Offer details. Already-approved owners see compact savings, not another fresh-approval request. Fresh consent uses amber, exact old/new amounts, no-reuse language and a review CTA; its bounded-consent explanation and saved terms are secondary. Payment shows exact package, dates, refund deadline and ceiling before the ordinary official-hosted PayPal action. Hold and charge stay distinct. The frozen implementation still requires **Finish my approval** after PayPal and diagnostic reconciliation for some outcomes; presentation does not imply a new background provider operation.

Demo controls are available through a discreet link in You only when `session.demo` is true. Persona switching, provider checks and historical replay live there. Replay says **Verified demo replay**, keeps the historical receipt distinct from current financial state, and creates no new evidence. A small local-interpretation notice appears only in focused needs editing. Actual offline financial warnings remain intact.

Use semantic landmarks, one h1, focusable skip target, labeled native fields, switch semantics, textual statuses and 44px-or-larger authored interaction targets. Navigation focuses the new route heading; segment selection restores focus to the selected button. Native disclosures provide keyboard expansion without modal focus management. Existing reduced-motion rules disable loading and switch transitions. No custom drawer or modal was added. Browser checks are builder verification, not accessibility certification or cold-test evidence.

The implementation, screenshots, isolation checks and remaining limitations are recorded in [the consumer app IA report](consumer-app-ia-report.md).
