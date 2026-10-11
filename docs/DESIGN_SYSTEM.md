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

## Current visual system — October 9, 2026

This authorized visual pass supersedes the earlier blue palette, surface, typography and component-presentation values. The October 4 consumer information architecture and the accepted Phase 6.1A payment behavior remain in place. Earlier sections and acceptance receipts are retained as historical records.

Commit uses a warm, primarily neutral canvas with a deep mulberry accent. The first supplied inspiration board informed the warmth and tactile surfaces; the second informed social presence, active-tab clarity and scanning. The implementation retains the Common Yes mark geometry and existing modern sans-serif stack. Typography, initials and locally authored illustrations carry the identity. Photography, handwritten fonts, new product screens and third-party brand assets were not introduced.

| Role | Current value | Use |
| --- | --- | --- |
| Canvas | #FAF8F4 | Warm ivory app background |
| Surface | #FFFDF9 | Consumer cards and authored merchant surfaces |
| Quiet surface | #F1EDE7 | Supporting information, switches and financial explanation |
| Brand | #57384F | Common Yes, primary actions, active navigation and analytical charts |
| Brand hover | #432A3D | Primary interaction feedback |
| Brand tint | #EFE6EE | Selected tabs, progress chips, profile and unread icons |
| Supporting coral | #C6674B | Decorative chart series and social accents |
| Text | #29252B | Headings, amounts and essential terms |
| Secondary text | #746F69 | Supporting copy and metadata |
| Border | #E5DFD7 | Surface separation |
| Control border | #9F958E | Authored inputs |
| Verified positive | #47634D on #EDF3EB | Existing verified success and commitment states |
| Changed terms | #865A19 on #FBF3E3 | Fresh approval and attention states |
| Failure | #A13E3A on #FBEDEA | Existing failure/recovery states |

Headings use the existing sans-serif stack with stronger weight and restrained negative tracking. Supporting copy is visually quieter while its content stays intact. Main money amounts use 46–56px type; personal/group totals use tabular numerals and the unchanged integer-cent formatter. Major consumer surfaces use 20px radii, primary actions 14px, comparison segments 14px and a very soft shadow. The spacing rhythm remains based on four pixels. The profile target remains 44px; primary consumer actions are at least 50px tall. Existing reduced-motion rules remain effective.

Group places social progress in a tactile surface, with distinct participant initials, verified status text and a compact commitment-count chip. Plan retains the same three category selectors and deterministic recommendation, using a stronger selected state and clearer group-total/own-share hierarchy. The same original package illustration is recolored with plum, stone and sage. You has a quiet private-needs summary and the existing explicit permission controls. Activity emphasizes unread items with subtle surfaces, icons, metadata and existing actions. Commitment has a strong exact amount, a grouped hold explanation and its existing full-terms sheet. Fresh consent retains amber, struck-through previous amount, exact new amount and no-reuse language. Confirmed and recovery states keep their distinct, accurate financial wording.

Consumer navigation remains Group / Plan / Activity / You: bottom tabs on phones and the same app rail on desktop. Focused needs and payment routes retain Back and omit the tabs. No route, step, content field, disclosure behavior or financial action changed.

Merchant Studio shares the palette, typography, surfaces and authored control treatment. Actual AG Studio widgets, grid, charts, analyst, policies and simulator remain native. Its supported theme parameters set plum/rose/coral/stone chart colors, a warm canvas, 14px widget radii and 28px KPI values. Widget placement, queries, scope binding, tool definitions, policy confirmations and publication rules are unchanged. Native internal analytical controls retain their own density.

Manifest/theme colors and the three PWA icons match the new palette. The Common Yes geometry is unchanged. The maskable icon uses a visible white mark on plum within the existing safe-area geometry. Manifest identity, start URL, scope, display mode, service worker and installation behavior are unchanged.

Eight representative normal-text combinations passed a 4.5:1 contrast check, including primary actions, secondary copy, selected tabs and semantic statuses. This is a token check, not an accessibility certification. Every captured core screen had one h1 and no document-level horizontal overflow at its measured viewport. Standalone installation, physical-device rendering and external usability remain separate verification work.

See the [visual pass report](visual-system-redesign-report.md) and [24-image evidence bundle](assets/visual-system-2026-10-09/README.md).
## Final visual depth and Connected Path — October 9, 2026

This is the current presentation specification. Earlier sections remain historical. The complete pre-depth version is preserved in [previous-design-system.md](assets/visual-depth-2026-10-09/previous-design-system.md). This pass changes presentation only; routes, commercial facts, authorities, financial actions, and consent rules retain their existing behavior.

### Final tokens

| Token | Value | Role |
| --- | --- | --- |
| Primary plum | `#6E2148` | Primary action, selection, brand |
| Deep plum | `#42152F` | Display type, primary hover |
| Ivory | `#FBF7F2` | App canvas and navigation |
| Surface | `#FFFDFA` | Focused content and controls |
| Sand | `#F3E9DF` | Amount bands and inset groups |
| Plum tint | `#F1E3EB` | Selected and private surfaces |
| Coral | `#E98B7D` | Small connecting nodes; no body text |
| Sage / deep sage | `#4F8A72` / `#376B58` | Accent / readable confirmed status |
| Success surface | `#E8F2ED` | Verified readiness and trust inset |
| Amber / readable warning | `#D99A43` / `#855419` | Changed terms, pending, recovery |
| Warning surface | `#FFF0DB` | Material change treatment |
| Text / muted text | `#1F1A1D` / `#6E6468` | Main / supporting text |
| Border / control border | `#E6DDD7` / `#95868D` | Grouping / identifiable form boundary |
| Connected path | `#D4A8B6` | Quiet decorative connection |

### Type, path, and surfaces

Georgia with a Times New Roman/serif fallback provides the display layer. Use it for major page titles, the selected package, key commitment amounts, and purchase outcome moments. Existing Inter/system sans remains on forms, navigation, Activity entries, detailed financial facts, merchant controls, native charts and grids. No font downloads or new font dependencies are introduced.

The Connected Path links the existing participant initials and verified approval markers. Its complete green treatment requires every existing marker to be verified. Activity icons become timeline nodes. The exact commitment amount sits beside a small converging path. Ready uses an authoritative ready-state band; confirmed joins the verified participant markers into a completed path. Merchant keeps its native commitment funnel, with shared colors, simulator bands, and a quiet policy-boundary line. Decorative paths do not calculate progress or communicate success independently of text.

Surface hierarchy is deliberately varied: Group uses one warm composition; Plan sits directly on the canvas with an inset price band; You gets one private needs surface; Activity uses open feed rows and a tinted action inset; Commitment has a restrained plum amount gradient; changed terms use amber and coral warmth; Ready uses sage; recovery remains neutral with an amber boundary. Shadows are reserved for imagery, the commitment surface, and sheets. Avoid nested white cards.

### Imagery, status, and motion

The existing decorative Plan and confirmed art slots now use one locally generated fictional Vermont lodge photograph. A visible caption and accessible image label identify it as illustrative. It is not evidence of a real property, available inventory, or a reservation. The original PNG, optimized JPEG, exact prompt, and provenance are in [assets/visual-depth](../assets/visual-depth/README.md). The JPEG is embedded in the existing stylesheet to preserve the frozen static-route allowlist. Group, You, Activity, needs, payment, recovery, and merchant analytics remain free of decorative photography.

Only approved/CAPTURED participant states retain verified markers. Pending approval has an amber edge and the unchanged explicit “not confirmed yet” disclosure. Fresh consent displays previous amount → current amount, exact savings where present, and the unchanged non-reuse statement. Recovery never gets a completed hero or celebratory treatment.

Motion remains limited to existing short hover/press transitions. Reduced-motion rules disable animation, transitions, and smooth scrolling. No orchestration or state transition is added.

### Accessibility and responsive rules

Maintain visible keyboard focus, existing dialog semantics, labels, heading structure, and financial disclosures. Main authored action/navigation/sheet targets measured at least 44×44 CSS pixels. Text/status contrast meets 4.5:1 for the checked tokens; form boundaries meet 3:1. Coral and the path tint are decorative and do not carry information alone. Escape closes the terms sheet and returns visible focus to its trigger.

Phone captures use measured 390×844 CSS viewports, with additional overflow checks at 320px. Consumer desktop retains the existing constrained app and rail. Merchant retains its broad native analytical workspace and internal scrolling. The visual pass does not change the navigation model, manifest start URL, service worker, install behavior, or routing.

See the [depth report](visual-system-redesign-report.md) and [24-screen evidence bundle](assets/visual-depth-2026-10-09/README.md). Standalone PWA, physical devices, and hosted deployment of this new presentation are not verified by these local captures.

## Signature state composition — October 9, 2026

This scoped pass preserves the final palette, typography, components and near-final Plan/Commitment/Changed Terms/Confirmed compositions. Group connects its existing participant initials to a prominent authoritative count and four contribution segments. You presents private boundaries separately from delegated coordination, whose path ends at the locked human payment-approval row. Activity distinguishes unresolved approval, Commit plan, anonymous person and informational nodes on the existing feed.

Waiting presents four independent commitment segments; Ready converges them into the exact group total only when the existing ready flag is true. Finalizing connects the existing independent provider outcomes vertically and styles processing only while CAPTURING. The existing non-atomicity disclosure remains visible. Names, amounts, dates, statuses and actions are never generated by the motif.

Checking approval introduces a CSS-only indeterminate amber pulse between external approval and Commit verification. Finalizing uses a restrained indeterminate processing ring. Neither motion predicts completion or changes business state. Explicit prefers-reduced-motion rules disable both; they remain stateful static glyphs. This extends the earlier hover/press-only motion guidance for these two pending states.

See the [composition report](signature-state-composition-report.md) and [seven-screen before/after bundle](assets/signature-state-2026-10-09/README.md). All imagery and prior evidence remain unchanged. No provider operations or deployment are part of this pass.

## Final reference direction — October 10, 2026

The current consumer palette supersedes the plum consumer colors in the dated sections above. Those sections and their screenshots remain historical evidence. The final reference combines the attached brown/orange board's warmth and contrast with the existing restrained composition and serif/sans hierarchy. Merchant presentation, native PWA assets, manifest metadata and service worker remain unchanged in this scoped consumer pass.

| Token | Current value | Use |
| --- | --- | --- |
| Background | `#F6F0E7` | Warm ivory canvas |
| Surface | `#FFFDFC` | Main app surfaces |
| Espresso | `#2D211B` | Text, state headings and money |
| Rust | `#9E4720` | Primary actions, focus and approval-required text |
| Burnt orange | `#C7652E` | Indeterminate progress accent |
| Terracotta | `#D88B68` | Decorative secondary accent |
| Sage / deep sage | `#71856B` / `#4F6650` | Verified outcomes; deep sage for readable text |
| Sand | `#E8DCCB` | Secondary surfaces and held-share bands |
| Private surface | `#EEE6D9` | Owned private needs |
| Muted text | `#685E56` | Accessible utility text on tinted surfaces |
| Border / control border | `#DDD2C5` / `#8C7A6A` | Surface edges / interactive boundaries |

Rust and muted text are slightly darker than the suggested starting colors to retain text contrast on sand and private surfaces. Orange, terracotta and the light path tint never carry financial state alone. Utility text and controls remain Inter/system sans; major state headings and money retain Georgia/Times/serif. No new fonts or image assets are introduced.

Group integrates its existing name, dates, count, people, own held share and plan into one layered composition. You uses a private boundary surface with a lock glyph, then a separate permission path terminating at human-required payment approval. Activity is an open timeline with distinct rust consent, neutral Commit and sage person nodes. Participant identities remain existing initials or an anonymous person glyph; photos are not inferred from Activity text.

Waiting and Ready share one horizontal four-person path, rather than duplicate avatar rows and 2×2 cards. Only the existing authoritative ready flag connects all contributions into the group total. Checking has an open, indeterminate rust/orange path before the exact receipt, with no success marker, percentage or countdown. Finalizing retains separate vertical provider outcomes and a processing ring only for the existing processing state. All motion is CSS-only and disabled by `prefers-reduced-motion`.

Plan, non-checking Commitment, Changed Terms, Confirmed and their sheets retain their composition and markup, with palette harmonization only. All copy, actions, routes, amounts, disclosures, authority and financial logic remain unchanged. See the [final report](final-visual-reference-report.md) and [before/after gallery](assets/final-reference-2026-10-10/README.md).


## Reference-led refinement — October 10, 2026

This direction supersedes the consumer-only token values immediately above and now harmonizes the Merchant Studio shell and native theme. Previous dated sections and evidence remain historical. Current tokens: cream `#FAF6EF`, white surface `#FFFDFC`, espresso `#2A211C`, rust `#A64B1F`, clay `#C7683A`, sand `#EADCCB`, olive success text `#556242`, sage `#788263`, muted text `#685E56`, border `#DDD2C5`, control border `#8C7A6A`. Rust text on sand uses `#91421E` for AA contrast. Native charts use rust, muted gold `#B88746`, olive `#5D6847` and taupe `#A99883`.

Group combines a small contextual fictional image with an open social-progress composition, a held-share band and the existing plan link. Plan gains a tactile framed recommendation and inset prices. You separates sand private needs, an open coordination path and an espresso human-approval endpoint. Activity uses rust outstanding-consent insets and open system/person timeline rows. Waiting has an unfinished fourth node; Ready converges only on the authoritative ready flag. Each olive link requires both adjacent participant markers to be verified. Finalizing keeps individual provider outcomes on a vertical spine and marks processing without claiming collective success. Checking uses an open indeterminate path and an unconfirmed endpoint. The inherited decorative commitment arc is removed. No percentages or timers communicate financial certainty.

The existing local fictional lodge image is reused only in Group, Plan and Confirmed, always with a visible illustrative caption and accessible label. No new portraits or package evidence are invented. Confirmed uses an espresso photo surface, cream total and verified group markers; its fictional/no-reservation disclosure remains intact. Georgia/Times serif remains on major state/amount moments; Inter/system sans remains on utility UI and detailed financial facts. Dark-surface focus rings use light cream. Reduced-motion overrides remain explicit. Merchant component behavior, source instructions, chart/grid mappings, simulator and commercial controls are unchanged; only theme color parameters and shell CSS change.

See [the reference rebuild report](reference-visual-rebuild-report.md) and [the browser evidence bundle](assets/reference-refinement-2026-10-10/README.md). No deployment or provider operation is part of this pass.


## Interaction personality — October 10, 2026

The accepted reference-led palette, typography and composition remain fixed. Consumer motion expresses the Connected Path only when rendered state changes: a participant resolves, an event arrives, the selected comparison changes, exact approval verifies, readiness converges or an independent settlement outcome advances. Unchanged polling stays still.

Use 140 ms for touch/switch feedback, 220 ms for content/inline transitions and 400 ms for meaningful collective progression, with cubic-bezier(.2,.8,.2,1). All staged reveals finish within 400 ms. Exact money/text stays opaque and changes immediately; no count-up, fake percentages, time estimates or haptics. Payment approval remains human-required. Existing active verification/processing states may use restrained indeterminate motion. Waiting people never pulse.

Reduced motion removes all transforms/travel/active loops in the consumer shell and cancels running Web Animations. Status labels, colors, nodes, controls and unsaved feedback remain immediate. Person events use current verified data only; do not infer a portrait from a title.

See [interaction report](interaction-personality-report.md) and [paired sampled-browser playback](assets/interaction-personality-2026-10-10/README.md).
