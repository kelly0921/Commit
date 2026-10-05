import test from 'node:test';
import assert from 'node:assert/strict';
// Browser-native JS is intentionally outside the server TypeScript build.
// @ts-expect-error JavaScript presentation module
import { createViews, dollars, participantOutcome } from '../product-public/views.js';
// @ts-expect-error Isolated JavaScript fixture builder
import { designFixtures } from '../scripts/design-fixtures.mjs';

const f=await designFixtures();
const view=(persona='kelly',draft=null)=>createViews({session:{...f.session,persona},draft});
const text=(html:string)=>html.replace(/<[^>]*>/g,' ');

test('interpretation is private, reviewed explicitly, and distinguishes boundaries from preferences',()=>{
  const html=view('kelly',f.draft).constraintsPage(f.own);
  assert.match(html,/Only you can see your private preferences/);
  assert.match(html,/Here’s what I understood/);assert.match(html,/Must have/);assert.match(html,/Nice to have/);
  assert.match(html,/Absolute maximum/);assert.match(html,/Preferred budget/);assert.match(html,/Looks right/);
  assert.match(html,/Rentals · not needed/);assert.match(html,/does not approve a payment/);
  assert.doesNotMatch(html,/<input[^>]+type="checkbox"[^>]+checked/);
  assert.doesNotMatch(html,/data-action="commit-create"/);
});
test('unresolved AI interpretation cannot be confirmed',()=>{
  const draft=structuredClone(f.draft);draft.parsed.clarifications=['Please clarify the required transfer.'];
  assert.match(view('kelly',draft).review(draft),/type="submit" disabled/);
});
test('commitment shows exact owner amount, current envelope and separated hold/charge actions',()=>{
  const html=view().commitPage(f.group,f.ledger);
  assert.match(html,/class="commit-amount">\$390</);assert.match(html,/Dec 11, 2026/);assert.match(html,/Dec 4, 2026/);
  assert.match(html,/Rentals/);assert.match(html,/\$55/);assert.match(html,/exact approved ceiling/);
  assert.match(html,/Commit \$390 with PayPal/);assert.match(html,/organizer must separately finalize/);
  assert.match(html,/Maximum commitment: \$390 · USD/);
  assert.ok(html.indexOf('100% refund by')<html.indexOf('data-action="commit-create"'));
  assert.match(html,/<summary>Package quality & included amenities<\/summary>/);
  assert.doesNotMatch(html,/paypal-link/);assert.equal(dollars(37501),'$375.01');
});
test('proposal checks and allocation components never expose another participant’s private needs',()=>{
  const html=view().proposalPage(f.group);
  const checks=html.split('class="my-checks"')[1].split('</section>')[0];
  assert.match(checks,/Rentals/);assert.doesNotMatch(checks,/A bed of my own/);
  assert.doesNotMatch(html,/Lawrence[^<]*needs his own bed|Sarah[^<]*needs her own bed/);
  assert.doesNotMatch(html,/hardMaxCents|buyerHardMax|\$450|\$500/);
  assert.match(html,/Private limits stay private/);
});
test('recommendation is deterministic, does not display formulas and never promotes unavailable options',()=>{
  const g=structuredClone(f.group);g.proposal.explanation='Injected free prose $1, irrelevant private needs and weights 25%.';
  const html=view().proposalPage(g);
  assert.doesNotMatch(html,/Injected free prose|25%|1,000|price efficiency [0-9]/);
  assert.match(html,/ranks first for best value among feasible options/);
  assert.match(html,/also Lowest Cost and Best Experience/);
  const alternative=g.proposal.evaluations.find((e:{feasible:boolean})=>!e.feasible);
  const card=view().comparisonCard(alternative,g.proposal);
  assert.match(card,/Unavailable for this group/);assert.doesNotMatch(card,/Recommended|data-action="commit-create"/);
  assert.match(card,/<details class="alternative unavailable">/);
  assert.doesNotMatch(card,/<button|data-nav|href="\/commit"/);
});
test('three commitments report exact authorized sum and do not expose finalization',()=>{
  const html=view().waitingPage(f.approved);
  assert.match(html,/Almost there/);assert.match(html,/3 of 4 committed/);assert.match(html,/\$1,180/);
  assert.match(html,/Waiting for Alex/);
  assert.doesNotMatch(html,/data-action="review-finalize"/);assert.match(html,/Captured<\/span><strong>\$0/);
});
test('four valid commitments allow only the organizer to review finalization',()=>{
  const organizer=view().waitingPage(f.ready),participant=view('sarah').waitingPage(f.ready);
  assert.match(organizer,/Everyone’s in/);assert.match(organizer,/4 of 4 committed/);assert.match(organizer,/\$1,515/);
  assert.match(organizer,/data-action="review-finalize" >Finalize group purchase/);
  assert.match(participant,/data-action="review-finalize" disabled/);
  const stale=structuredClone(f.ready);stale.ready=false;stale.members[0].commitmentStatus='NEEDS_VERIFICATION';
  assert.doesNotMatch(view().waitingPage(stale),/data-action="review-finalize"/);
});
test('stale approvals display previous and current terms and require new approval even for a decrease',()=>{
  const html=view().commitPage(f.group,f.changed);
  assert.match(html,/Your plan changed/);assert.match(html,/previous approval won’t be used/);
  assert.match(html,/\$415/);assert.match(html,/\$390/);assert.match(html,/even if the price went down/);
  assert.match(html,/Dec 1, 2026/);assert.match(html,/Dec 4, 2026/);assert.match(html,/Review changes/);
  assert.match(html,/Release previous authorization/);assert.doesNotMatch(text(html),/\bSTALE\b/);
});
test('unknown and pending provider outcomes never render confirmed success',()=>{
  const participant={steps:[{operation:'CAPTURE',state:'UNKNOWN',providerStatus:'PENDING'},{operation:'REFUND',state:'PENDING'},{operation:'VOID',state:'PENDING'}]};
  assert.equal(participantOutcome(participant).text,'Payment pending');
  participant.steps[0]!.state='SUCCEEDED';participant.steps[1]!.state='UNKNOWN';participant.steps[1]!.providerStatus='PENDING';
  assert.equal(participantOutcome(participant).text,'Refund pending');
  const html=view().waitingPage(f.recovering);
  assert.match(html,/Refund pending/);assert.match(html,/We couldn’t complete/);
  assert.doesNotMatch(html,/All four payments completed|Nothing was finalized/);
});
test('confirmed and compensated views accurately distinguish booking fiction, gross captures and refunds',()=>{
  const success=view().waitingPage(f.completed),compensated=view().waitingPage(f.compensated);
  assert.match(success,/demo booking is confirmed/);assert.match(success,/No accommodation reservation/);
  const summary=view().paymentProgress(f.completed);
  assert.match(summary,/Purchase confirmed/);assert.match(summary,/\$1,515/);assert.match(summary,/Refunds confirmed/);
  assert.match(summary,/no accommodation reservation/);assert.match(summary,/href="\/waiting"/);
  assert.doesNotMatch(summary,/allocation-list|data-action="confirm-finalize"|data-action="resume-saga"/);
  assert.match(view().paymentProgress(f.recovering),/Refund pending/);
  assert.match(compensated,/Nothing was finalized/);assert.match(compensated,/\$785/);
  assert.match(compensated,/Refund confirmed/);assert.match(compensated,/authorization released/);
  assert.match(compensated,/bank or card may take additional time/);
  assert.doesNotMatch(text(compensated),/CAPTURE_FAILED|COMPENSATING|SUCCEEDED/);
  assert.doesNotMatch(compensated,/data-action="confirm-finalize"|data-action="resume-saga"/);
});
test('final review preserves exact shares and explicit cancel/confirmation; group navigation only reviews',()=>{
  const html=view().finalizeReview(f.ready);
  assert.match(html,/Finalize \$1,515 group purchase/);assert.match(html,/data-action="cancel-finalize"/);
  assert.match(html,/\$390/);assert.match(html,/\$395/);assert.match(html,/\$335/);
  assert.doesNotMatch(html,/id="negative-saga"/);
  assert.doesNotMatch(view().groupPage(f.group),/data-action="commit-create"/);
  const shell=createViews({session:f.session,path:'/commit'}).shell(html);
  assert.match(shell,/href="\/group" data-nav aria-current="page"/);
  assert.match(shell,/aria-label="Main navigation"/);
  assert.match(shell,/>Group<\/a>/);assert.match(shell,/>Plan<\/a>/);assert.match(shell,/>You<\/a>/);
});
