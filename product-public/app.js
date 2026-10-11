import {escape} from './views.js';
import {createAppViews,createInteraction} from './app-views.js';
import {offerBanner,offerReview} from './offers.js';
import {activityPage,focusedNotificationPath,youPage,startPage,joinPage,emptyGroupPage} from './agent-ui.js';
import {registerPwa,decorateOffline,enablePush,disablePush,install,badge} from './pwa.js';
const views=()=>createAppViews({session,draft,statementInput,error,path:reviewOpen?'/commit/review':location.pathname,planSegment});
const landing=(...args)=>views().landing(...args);
const createPage=(...args)=>views().createPage(...args);
const merchantPage=(...args)=>views().merchantPage(...args);
const groupPage=(group)=>views().groupPage(group,offerBanner(group,session.persona));
const constraintsPage=(...args)=>views().constraintsPage(...args);
const proposalPage=(group)=>views().proposalPage(group,offerBanner(group,session.persona));
const commitPage=(group,ledger)=>views().commitPage(group,ledger,offerBanner(group,session.persona));
const waitingPage=(group)=>views().waitingPage(group,offerBanner(group,session.persona));
const sagaProgress=(...args)=>views().sagaProgress(...args);
const finalizeReview=(...args)=>views().finalizeReview(...args);
function shell(content){const meaningful=!content.startsWith('<div class="loading');const context={scope:session?.groupId+'/'+session?.persona,path:location.pathname};const ticket=meaningful?interaction.prepare(context):null;document.body.classList.remove('sheet-open');root.innerHTML=views().shell(content);decorateOffline(root);if(ticket)interaction.commit(ticket,context);}
const root=document.querySelector('#app');
const interaction=createInteraction(root);
let session=null,epoch=0,controller=new AbortController(),draft=null,statementInput=null,error='',busy=false,planSegment='best',renderSequence=0,lastRendered='',reviewOpen=false;
const errorMessages={INVITE_FOUR_PARTICIPANTS_FIRST:'Invite three friends first. This payment demo requires exactly four participants.',INVITE_IDENTITY_CANNOT_USE_DEMO:'Your invitation identity is private. Use a separate browser session to explore seeded demo personas.',AI_KEY_REQUIRED:'The AI service needs to be configured before it can interpret or explain this plan.',AI_CREDENTIALS_REJECTED:'The AI service could not authenticate. Your saved needs have not changed.',AI_PROVIDER_ERROR:'The AI service could not complete the request. Try again later.',AI_RATE_LIMITED:'The AI service is busy. Please try again shortly.',AI_PROVIDER_UNAVAILABLE:'The AI service could not be reached. Your saved needs have not changed.',AI_INCOMPLETE_RESPONSE:'The AI response was incomplete. Please try again.',PLAN_CHANGED_TRY_AGAIN:'Someone updated the plan while this request was running. Review the current plan and try again.',PERSONA_CHANGED:'Your demo persona changed. Start this request again from your own profile.',CLARIFY_BEFORE_CONFIRMING:'Rephrase your needs to answer the clarification before confirming.',PREFERENCE_EXCEEDS_CEILING:'Your preferred budget must be at or below your hard maximum.',HARD_MAX_REQUIRED:'Enter a hard maximum before confirming.',FRACTIONAL_CENT_NOT_ALLOWED:'Use whole cents for your budget.',CATALOG_CHANGED_TRY_AGAIN:'Merchant terms changed while the plan was being explained. Review the catalog and find a fresh fit.',CREATE_OR_TRY_DEMO_FIRST:'Create a plan or try the demo first.'};
async function api(path,data){if(data!==undefined&&!navigator.onLine)throw Error('Reconnect before changing anything. No action was queued.');const generation=epoch;const response=await fetch(path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'content-type':'application/json','x-csrf-token':session?.csrfToken??''},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});const result=await response.json();if(generation!==epoch)throw new DOMException('Persona changed','AbortError');if(!response.ok)throw Error(errorMessages[result.error]??'We couldn’t complete that step. Check your plan and try again.');return result;}
async function render({quiet=false}={}){
 const generation=epoch,sequence=++renderSequence;
 if(!quiet)shell('<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div><p>Gathering your group…</p></div>');
 try{
  let path=location.pathname,content='';const target=new URL(location.href).searchParams;
  if(target.has('group')&&target.get('group')!==session.groupId){content='<div class="empty"><h1 tabindex="-1">This update belongs to another group</h1><p>Open it in the original participant session.</p><a class="btn secondary" href="/activity" data-nav>Current group Activity</a></div>';}
  else{
   if(session.persona==='merchant'&&path!=='/'){path='/merchant';history.replaceState({},'',path);}
   if(path==='/'&&session.hasGroup&&session.persona!=='merchant'){path='/group';history.replaceState({},'',path);}
   if(['/agent','/updates'].includes(path)){path='/you';history.replaceState({},'',path+location.search);}
   if(path==='/')content=landing();
   else if(path==='/start'||path==='/create')content=startPage({inviteStep:session.hasGroup&&target.get('step')==='invite'});
   else if(path==='/join'){try{content=joinPage(await api('/api/invites/preview?invite='+encodeURIComponent(target.get('invite')??'')));}catch{content=joinPage(null,true);}}
   else if(path==='/replay'){const replay=await api('/api/replay');content='<div class="notice">Verified demo replay · historical Sandbox receipt, not current financial status. Read-only; no actions are available.</div>'+sagaProgress(replay,true);}
   else if(path==='/merchant')content=merchantPage(await api('/api/catalog'));
   else if(path==='/demo'&&session.demo){const g=session.hasGroup?await api('/api/group'):null;const ledger=g?.paymentsAvailable?await api('/api/commitments/me'):null;content=views().demoPage(g,ledger);}
   else if(!session.hasGroup)content=emptyGroupPage();
   else if(path==='/activity'){const activity=await api('/api/activity');content=activityPage(activity);await badge(activity.unreadActionable);}
   else if(path==='/you'){const own=await api('/api/constraints/me'),agent=await api('/api/agent'),updates=await api('/api/updates');content=youPage(own,agent,updates,session);}
   else if(path==='/constraints')content=constraintsPage(await api('/api/constraints/me'));
   else{const group=await api('/api/group');if(group.ready)group.autoFinalize=(await api('/api/agent')).autoFinalize;
    if(path==='/proposal'&&target.has('group')&&target.has('proposal')){const activity=await api('/api/activity');const focused=focusedNotificationPath(path,location.search,activity.items);if(focused!==path){path=focused;history.replaceState({},'',path+location.search);}}
    if(target.has('proposal')&&target.get('proposal')!==group.proposal?.id)error='This update refers to an earlier plan. Review the current exact terms before approving.';
    if(path.startsWith('/commit'))content=commitPage(group,await api('/api/commitments/me'));
    else content=path==='/proposal'?proposalPage(group):path==='/waiting'?waitingPage(group):groupPage(group);
   }
  }
  if(sequence!==renderSequence||generation!==epoch)return;
  const fingerprint=location.href+'\n'+error+'\n'+content;
  if(!quiet||fingerprint!==lastRendered){const focused=document.activeElement,focusKey=focused&&root.contains(focused)?{href:focused.getAttribute('href'),action:focused.dataset?.action,segment:focused.dataset?.planSegment,id:focused.dataset?.id,activityId:focused.dataset?.activityId,inNav:!!focused.closest('nav')}:null;shell(content);lastRendered=fingerprint;if(quiet&&focusKey){const replacement=[...root.querySelectorAll('a,button')].find(el=>focusKey.href?el.getAttribute('href')===focusKey.href&&el.dataset.activityId===focusKey.activityId&&!!el.closest('nav')===focusKey.inNav:focusKey.action?el.dataset.action===focusKey.action&&el.dataset.id===focusKey.id:focusKey.segment&&el.dataset.planSegment===focusKey.segment);(replacement??(focusKey.action==='activity-read'?[...root.querySelectorAll('[data-activity-id]')].find(el=>el.dataset.activityId===focusKey.id):null))?.focus({preventScroll:true});}}
 }catch(e){if(sequence===renderSequence&&generation===epoch&&e.name!=='AbortError'){if(quiet)return;error=e.message;shell('<div class="empty"><a class="btn" href="/group" data-nav>Back to Group</a></div>');}}
}
async function navigate(path){draft=null;statementInput=null;error='';reviewOpen=false;if(!path.startsWith('/proposal'))planSegment='best';history.pushState({},'',path);await render();window.scrollTo({top:0,behavior:'instant'});root.querySelector('h1')?.focus({preventScroll:true});}
async function action(work,after,{inline=false}={}){if(busy)return;busy=true;error='';const generation=epoch;const inlineEvent=inline?document.activeElement?.closest('[data-event-id]')?.dataset.eventId:null;const buttons=[...root.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);const notice=document.createElement('div');notice.className=inline?'notice inline-action-notice':'notice';notice.setAttribute('role','status');notice.textContent='Working on your plan…';root.querySelector('main').prepend(notice);try {const value=await work();if(generation!==epoch)return;await after(value);}catch(e){if(generation===epoch&&e.name!=='AbortError'){error=e.message;await render();}}finally{if(generation===epoch){busy=false;notice.remove();buttons.forEach(([b,disabled])=>b.disabled=disabled);if(inlineEvent&&document.activeElement===document.body)[...root.querySelectorAll('[data-activity-id]')].find(el=>el.dataset.activityId===inlineEvent)?.focus({preventScroll:true});}}}
Object.assign(errorMessages,{PAYPAL_SANDBOX_NOT_CONFIGURED:'PayPal Sandbox needs to be configured before you can commit.',APPROVAL_NOT_READY:'PayPal has not confirmed approval yet. Finish the Sandbox checkout, then check again.',COMMITMENT_IN_PROGRESS:'Your commitment is being processed. Wait a moment, then refresh its status.',PROPOSAL_CHANGED_REVIEW_AGAIN:'The proposal changed. Review the new share before approving again.',COMMITMENT_STALE:'This approval belongs to an earlier proposal. Review and approve your new share.',FRESH_PROPOSAL_REQUIRED_AFTER_VOID:'This authorization was voided. Confirm your needs and find a fresh proposal before committing again.',PAYPAL_RETRY_WINDOW_EXPIRED_RECONCILE:'This checkout needs reconciliation before another attempt. Refresh your PayPal status.'});
root.addEventListener('click',event=>{const link=event.target.closest('[data-nav]');if(link){event.preventDefault();if(link.dataset.activityId)void api('/api/activity/read',{id:link.dataset.activityId}).catch(()=>{});navigate(link.getAttribute('href'));return;}const button=event.target.closest('[data-action]');if(!button)return;if(button.dataset.action==='edit-interpretation'){draft=null;void render().then(()=>root.querySelector('[name=statement]')?.focus());return;}if(button.dataset.action==='example'){root.querySelector('[name=statement]').value="I’d prefer to stay near $350, but I absolutely cannot go over $400. I own my equipment.";return;}if(button.dataset.action==='demo')action(()=>api('/api/demo',{}),async()=>{session=await api('/api/session');await navigate('/group');});if(button.dataset.action==='solve')action(()=>api('/api/solve',{}),()=>navigate('/proposal'));if(button.dataset.action==='commit-create')action(()=>api('/api/commitments/create',{proposalId:button.dataset.proposalId}),()=>navigate('/commit'));if(button.dataset.action==='commit-authorize')action(()=>api('/api/commitments/authorize',{proposalId:button.dataset.proposalId}),async()=>{await api('/api/commitments/refresh',{});await render();});if(button.dataset.action==='commit-verify')action(()=>api('/api/commitments/verify',{commitmentId:button.dataset.commitmentId}),()=>render());if(button.dataset.action==='commit-void')action(()=>api('/api/commitments/void',{commitmentId:button.dataset.commitmentId}),()=>render());if(button.dataset.action==='refresh-payments')action(()=>api('/api/commitments/refresh',{}),()=>render());});
root.addEventListener('change',async event=>{if(event.target.id!=='persona')return;const persona=event.target.value;controller.abort();controller=new AbortController();epoch++;const generation=epoch;busy=false;draft=null;statementInput=null;error='';shell('<div class="loading"><div class="spinner"></div><p>Switching to your private view…</p></div>');try{session=await api('/api/persona',{persona});await navigate(persona==='merchant'?'/merchant':session.hasGroup?'/group':'/');}catch(e){if(generation===epoch&&e.name!=='AbortError'){error=e.message;await render();}}});
root.addEventListener('submit',event=>{event.preventDefault();const form=event.target;const data=new FormData(form);if(form.id==='create-form')action(()=>api('/api/groups',{name:data.get('name'),goal:data.get('goal')}),async()=>{session=await api('/api/session');await navigate('/group');});if(form.id==='interpret-form'){statementInput=data.get('statement');}if(form.id==='interpret-form')action(()=>api('/api/constraints/interpret',{statement:data.get('statement')}),async value=>{draft={...value,statement:data.get('statement')};statementInput=data.get('statement');await render();window.scrollTo({top:0,behavior:'instant'});root.querySelector('h1')?.focus({preventScroll:true});});if(form.id==='confirm-form'&&draft){const parsed=structuredClone(draft.parsed);parsed.hardMax=Number(data.get('hardMax'));parsed.preferredMax=data.get('preferredMax')===''?null:Number(data.get('preferredMax'));for(const kind of ['requirements','preferences'])parsed[kind].forEach((r,i)=>r.visibility=data.has(`public-${kind}-${i}`)?'PUBLIC':'PRIVATE');action(()=>api('/api/constraints/confirm',{draftId:draft.draftId,parsed}),()=>navigate('/you'));}});
window.addEventListener('popstate',()=>{draft=null;statementInput=null;reviewOpen=false;error='';void render();});
root.addEventListener('click',event=>{const b=event.target.closest('[data-action]');if(!b)return;
if(b.dataset.action==='review-finalize')action(()=>api('/api/group'),g=>{if(!g.ready)throw new Error('Refresh all approvals before finalizing.');reviewOpen=true;shell(finalizeReview(g));root.querySelector('h1')?.focus({preventScroll:true});});
if(b.dataset.action==='cancel-finalize'){reviewOpen=false;void render();}
if(b.dataset.action==='confirm-finalize'){const negativeTest=!!root.querySelector('#negative-saga')?.checked;action(async()=>{const generation=epoch;const poll=setInterval(async()=>{try{const g=await api('/api/group');if(generation===epoch&&g.saga)shell(sagaProgress(g));}catch{}},1500);try{return await api('/api/capture-sagas/finalize',{proposalId:b.dataset.proposalId,negativeTest});}finally{clearInterval(poll);}},()=>navigate('/waiting'));}
if(b.dataset.action==='resume-saga')action(()=>api('/api/capture-sagas/resume',{sagaId:b.dataset.sagaId}),()=>render());
if(b.dataset.action==='refresh-saga')render();
});
Object.assign(errorMessages,{TRANSACTION_TERMS_FROZEN:'This purchase is processing. Its approved terms are frozen until payment recovery is complete.',ORGANIZER_ONLY:'Only the organizer can finalize this purchase.',USE_SAGA_RECONCILIATION:'Use the group payment reconciliation action to check this resource.'});
root.addEventListener('click',event=>{const b=event.target.closest('[data-action]');if(!b)return;
if(b.dataset.action==='offer-demo')action(()=>api('/api/offer-demo',{}),async()=>{session=await api('/api/session');await navigate('/group');});
if(b.dataset.action==='offer-apply'&&event.isTrusted)action(()=>api('/api/offers/apply',{offerId:b.dataset.offerId,previousProposalId:b.dataset.proposalId,confirmNewProposal:true}),()=>navigate('/commit'));
if(b.dataset.action==='offer-cleanup')action(()=>api('/api/offers/cleanup',{proposalId:b.dataset.proposalId}),()=>render());
});
Object.assign(errorMessages,{STALE_AUTHORIZATION_CLEANUP_REQUIRED:'Previous holds need verified release before you can approve this new share. Ask Kelly to retry cleanup.',PAYMENT_IN_PROGRESS_TRY_AGAIN:'A payment request is still processing. Check it before accepting a new proposal.',OFFER_REDEMPTION_LIMIT:'This offer has reached its group redemption limit.',OFFER_NOT_ACTIVE:'This offer is no longer available for new acceptance.'});
window.addEventListener('focus',refreshSavedState);
try{session=await api('/api/session');await render();}catch(e){root.innerHTML=`<div class="empty"><h1>Commit is taking a moment.</h1><p>${escape(e.message)}</p></div>`;}

window.addEventListener('offline',()=>decorateOffline(root));
window.addEventListener('online',()=>{decorateOffline(root);refreshSavedState();});
void registerPwa();
root.addEventListener('click',event=>{const b=event.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;if(a==='activity-refresh')void render();if(a==='activity-read')action(()=>api('/api/activity/read',{id:b.dataset.id}),()=>render({quiet:true}),{inline:true});if(a==='pwa-install')void install();if(a==='push-enable'&&event.isTrusted)action(()=>enablePush(api),()=>render());if(a==='push-disable')action(()=>disablePush(api),()=>render());if(a==='invite-create')action(()=>api('/api/groups/invite',{}),value=>{const el=root.querySelector('#invite-output');const link=new URL(value.invitePath,location.origin).href;el.textContent='Invite link (expires in 7 days): ';const input=document.createElement('input');input.value=link;input.readOnly=true;input.setAttribute('aria-label','Invite link');input.className='invite-link';el.append(input);input.select();});});
root.addEventListener('submit',event=>{const form=event.target,d=new FormData(form);if(form.id==='fresh-form')action(()=>api('/api/groups/fresh',{displayName:d.get('displayName'),name:d.get('name'),goal:d.get('goal')}),async()=>{session=await api('/api/session');await navigate('/start?step=invite');});if(form.id==='join-form')action(()=>api('/api/groups/join',{invite:new URLSearchParams(location.search).get('invite'),displayName:d.get('displayName')}),async()=>{session=await api('/api/session');await navigate('/constraints');});if(form.id==='mandate-form'){if(!d.has('confirm')){error='Confirm the selected coordination permission before saving.';void render();return;}action(()=>api('/api/agent/mandate',{status:d.get('status'),allowAutomaticReplan:d.has('replan'),allowAutomaticBetterOffers:d.has('offers'),confirmDelegation:true}),()=>render());}if(form.id==='auto-finalize-form'){if(!d.has('confirm')){error='Confirm the organizer permission before saving.';void render();return;}action(()=>api('/api/agent/auto-finalize',{enabled:d.has('enabled'),confirmDelegation:true}),()=>render());}if(form.id==='preferences-form')action(()=>api('/api/updates/preferences',{pushEnabled:d.get('pushEnabled')==='1',progress:d.has('progress'),recommendations:d.has('recommendations')}),()=>render());});

window.addEventListener('commit-pwa-ready',()=>{if(session?.hasGroup&&['/you','/updates'].includes(location.pathname)&&!busy)void render();});

// Display refresh only: no provider mutation, automatic payment decision or authority change.
function refreshSavedState(){
 if(!session?.hasGroup||busy||reviewOpen||document.visibilityState!=='visible'||!navigator.onLine)return;
 if(!['/group','/proposal','/activity','/waiting','/commit','/commit/return','/commit/cancel'].includes(location.pathname))return;
 if(root.querySelector('details[open],dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
 void render({quiet:true});
}
setInterval(refreshSavedState,10000);
document.addEventListener('visibilitychange',refreshSavedState);
root.addEventListener('click',event=>{
 const segment=event.target.closest('[data-plan-segment]');
 if(segment){planSegment=segment.dataset.planSegment;void render({quiet:true}).then(()=>root.querySelector('[data-plan-segment="'+planSegment+'"]')?.focus({preventScroll:true}));return;}
 const button=event.target.closest('[data-action]');if(!button)return;
 if(button.dataset.action==='offer-review')action(()=>api('/api/group'),group=>{reviewOpen=true;shell(offerReview(group,session.persona,button.dataset.offerId));window.scrollTo({top:0,behavior:'instant'});root.querySelector('h1')?.focus({preventScroll:true});});
 if(['start-next','start-back'].includes(button.dataset.action)){
  const current=button.closest('fieldset'),next=button.dataset.action==='start-next';
  if(next&&[...current.querySelectorAll('input,textarea')].some(control=>!control.reportValidity()))return;
  const index=Number(current.dataset.onboardingStep)+(next?1:-1),target=root.querySelector('[data-onboarding-step="'+index+'"]');
  current.hidden=true;target.hidden=false;root.querySelector('h1').textContent=target.dataset.stepTitle;target.querySelector('input,textarea')?.focus();
 }
 if(button.dataset.action==='join-intro'){root.querySelector('[data-invite-intro]').hidden=true;root.querySelector('h1').textContent='Join your group';const form=root.querySelector('#join-form');form.hidden=false;form.querySelector('input').focus();}
 if(button.dataset.action==='join-back'){root.querySelector('#join-form').hidden=true;root.querySelector('[data-invite-intro]').hidden=false;root.querySelector('h1').textContent='You’ve been invited';root.querySelector('[data-action="join-intro"]').focus();}
});
let sheetOpener=null;
root.addEventListener('click',event=>{
 const open=event.target.closest('[data-sheet]');if(open){const dialog=document.getElementById(open.dataset.sheet);if(dialog?.tagName==='DIALOG'){sheetOpener=open;dialog.showModal();document.body.classList.add('sheet-open');}return;}
 if(event.target.closest('[data-sheet-close]'))event.target.closest('dialog').close();
 if(event.target.tagName==='DIALOG'){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}
});
root.addEventListener('close',()=>{document.body.classList.remove('sheet-open');if(sheetOpener?.isConnected)sheetOpener.focus({preventScroll:true});sheetOpener=null;},true);
root.addEventListener('keydown',event=>{
 const dialog=event.target.closest('dialog[open]');if(!dialog||event.key!=='Tab')return;
 const controls=[...dialog.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(el=>!el.disabled&&el.getClientRects().length);
 if(!controls.length)return;
 if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}
 else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus();}
});
root.addEventListener('change',event=>{if(event.target.closest('#mandate-form')&&event.target.name!=='confirm'){const review=root.querySelector('.permission-review');review.open=true;review.querySelector('[name="confirm"]').checked=false;}});
