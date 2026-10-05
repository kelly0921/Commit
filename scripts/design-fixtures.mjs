// Isolated presentation fixtures. No .env, PayPal adapter, financial POST or runtime DB.
import { ProductDatabase } from '../src/product/db.ts';
import { ProductService } from '../src/product/service.ts';
import { CommitmentService } from '../src/product/commitments.ts';
import { OfflineDemoProvider } from '../src/product/ai.ts';
import { createViews } from '../product-public/views.js';

export async function designFixtures() {
  const db=new ProductDatabase(':memory:');
  try {
    const payment=new CommitmentService(db,undefined,'http://localhost:3003');
    const service=new ProductService(db,new OfflineDemoProvider(),'offline-demo',payment);
    const identity=db.createSession();service.create(identity,'Vermont Ski Weekend','Book a ski weekend in Vermont with our four friends.',true);
    const law=db.constraintRows(db.session(identity.id).group_id).find(r=>r.user_id==='lawrence');
    const parsed=JSON.parse(law.parsed_json);parsed.requirements.push({key:'ownBed',value:true,visibility:'PRIVATE'});
    db.run('UPDATE constraints SET parsed_json=? WHERE user_id=? AND group_id=?',JSON.stringify(parsed),law.user_id,law.group_id);
    // Recreate the documented Phase 3 commercial needs; no catalog or solver changes.
    const group=await service.solve(identity), ledger=payment.own(identity);
    if(group.proposal.totalCents!==151500)throw new Error('Design fixture must conserve the Phase 3 allocation.');
    const session={...service.sessionView(identity),aiMode:'openai'};
    const own=service.ownConstraint(identity);
    const approved=structuredClone(group);approved.paymentsAvailable=true;
    const setCount=(g,n)=>{g.committedCount=n;g.authorizedCents=g.members.slice(0,n).reduce((a,m)=>a+m.shareCents,0);g.members.forEach((m,i)=>m.commitmentStatus=i<n?'AUTHORIZED':'NOT_STARTED');g.ready=n===4;g.state=g.ready?'READY_TO_CAPTURE':'AWAITING_COMMITMENTS';return g;};
    setCount(approved,3);const ready=setCount(structuredClone(approved),4);
    const commitment=structuredClone(ledger);commitment.available=true;
    const initial=structuredClone(group);initial.paymentsAvailable=true;
    const changed=structuredClone(commitment);const previous=structuredClone(changed.current);
    previous.id='design-previous';previous.state='STALE';previous.proposalVersion=1;previous.amountCents=41500;previous.authorizedAmountCents=41500;previous.authorizationId='DESIGN_ONLY';
    previous.envelope.proposalVersion=1;previous.envelope.amountCeilingCents=41500;
    previous.envelope.packageTerms.terms.cancelBy='2026-12-01';
    changed.current.proposalVersion=2;changed.current.envelope.proposalVersion=2;changed.history=[previous];
    const draft={source:'OPENAI',statement:'I prefer $350, cannot go above $400, and own my snowboard gear.',parsed:{hardMax:400,preferredMax:350,requirements:[{key:'rentalsRequired',value:false,visibility:'PRIVATE'}],preferences:[],clarifications:[],confidence:.98}};
    const saga=(state,captures,refunds,voids)=>({id:'design-only',proposalVersion:1,state,packageName:group.proposal.package.name,totalCents:151500,capturedCents:captures.reduce((a,x,i)=>a+(x==='SUCCEEDED'?group.members[i].shareCents:0),0),refundedCents:refunds.reduce((a,x,i)=>a+(x==='SUCCEEDED'?group.members[i].shareCents:0),0),negativeTest:false,participants:group.members.map((m,i)=>({userId:m.id,name:m.name,amountCents:m.shareCents,steps:[{operation:'CAPTURE',state:captures[i],providerStatus:null},{operation:'REFUND',state:refunds[i],providerStatus:null},{operation:'VOID',state:voids[i],providerStatus:null}]}))});
    const progressing={...structuredClone(ready),saga:saga('CAPTURING',['SUCCEEDED','SUCCEEDED','REQUESTING','PENDING'],Array(4).fill('PENDING'),Array(4).fill('PENDING'))};
    const completed={...structuredClone(ready),saga:saga('CONFIRMED',Array(4).fill('SUCCEEDED'),Array(4).fill('PENDING'),Array(4).fill('PENDING'))};
    const recovering={...structuredClone(ready),saga:saga('COMPENSATING',['SUCCEEDED','SUCCEEDED','FAILED','PENDING'],['SUCCEEDED','UNKNOWN','PENDING','PENDING'],['PENDING','PENDING','SUCCEEDED','SUCCEEDED'])};
    recovering.saga.participants[1].steps[1].providerStatus='PENDING';
    const compensated={...structuredClone(ready),saga:saga('COMPENSATED',['SUCCEEDED','SUCCEEDED','FAILED','PENDING'],['SUCCEEDED','SUCCEEDED','PENDING','PENDING'],['PENDING','PENDING','SUCCEEDED','SUCCEEDED'])};
    const scenarios={
      landing:{path:'/',method:'landing'},
      group:{path:'/group',method:'groupPage',args:[approved]},
      interpretation:{path:'/constraints',method:'constraintsPage',args:[own],draft},
      proposal:{path:'/proposal',method:'proposalPage',args:[initial]},
      alternatives:{path:'/proposal',method:'proposalPage',args:[initial],anchor:'alternatives'},
      commitment:{path:'/commit',method:'commitPage',args:[initial,commitment]},
      waiting:{path:'/waiting',method:'waitingPage',args:[approved]},
      ready:{path:'/waiting',method:'waitingPage',args:[ready]},
      finalizing:{path:'/waiting',method:'waitingPage',args:[progressing]},
      confirmed:{path:'/waiting',method:'waitingPage',args:[completed]},
      stale:{path:'/commit',method:'commitPage',args:[initial,changed]},
      compensation:{path:'/waiting',method:'waitingPage',args:[compensated]},
      recovery:{path:'/waiting',method:'waitingPage',args:[recovering]},
      finalize:{path:'/waiting',method:'finalizeReview',args:[ready]},
    };
    const render=name=>{const s=scenarios[name];const view=createViews({session,...s});return view.shell(view[s.method](...(s.args??[])));};
    return {session,group:initial,ledger:commitment,approved,ready,progressing,completed,changed,recovering,compensated,draft,own,scenarios,render};
  } finally {db.close();}
}
