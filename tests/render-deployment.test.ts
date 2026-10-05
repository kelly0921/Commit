import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {mkdirSync,mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createECDH} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {ProductDatabase} from '../src/product/db.js';
import {ProductService} from '../src/product/service.js';
import {OfflineDemoProvider} from '../src/product/ai.js';
import {CommitmentService} from '../src/product/commitments.js';
import {OfferGateway} from './offer-gateway.js';
import type {AuthorizationOrderInput} from '../src/model.js';
const configuration=await import(new URL('../deploy/render/config.mjs',import.meta.url).href);
const {startLauncher}=await import(new URL('../deploy/render/launcher.mjs',import.meta.url).href);
const {resetDatabase}=await import(new URL('../deploy/render/storage.mjs',import.meta.url).href);
const {createGateway,publicRoute}=await import(new URL('../deploy/render/gateway.mjs',import.meta.url).href);
const {generateVapidFile}=await import(new URL('../deploy/render/generate-vapid.mjs',import.meta.url).href);
const {RenderCommunicationService}=await import(new URL('../deploy/render/communication.mjs',import.meta.url).href);
const consumer='https://commit-staging.onrender.com',merchant=consumer;
const credentials={accessUser:'reviewer',accessPassword:'synthetic-test-access-password'};
const access='Basic '+Buffer.from(credentials.accessUser+':'+credentials.accessPassword).toString('base64');
function root(){mkdirSync('.staging',{recursive:true});return mkdtempSync(resolve('.staging/render-local-'));}
async function freePort(){const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;await new Promise<void>(r=>server.close(()=>r()));return port;}
async function fixture(){return {root:root(),port:0,bind:'127.0.0.1',consumerOrigin:consumer,merchantOrigin:merchant,consumerPort:await freePort(),merchantPort:await freePort(),platformHost:'commit-staging.onrender.com',...credentials,accessEnabled:false,pushEnabled:false,childEnv:{WEB_PUSH_ENABLED:'false'},aiMode:'offline-demo',localVerification:true,shutdownMs:1500};}
function databaseConfig(config:any){return {...config,database:join(config.root,'staging.sqlite')};}
async function start(overrides:any={}){const config={...databaseConfig(await fixture()),...overrides},events:string[]=[];return {config,events,runtime:await startLauncher(config,{control:false,onEvent:(event:string)=>events.push(event)})};}
async function get(runtime:any,host:string,path:string,options:{method?:string;headers?:Record<string,string>;body?:unknown}={}){
  const payload=options.body===undefined?undefined:JSON.stringify(options.body),port=runtime.gateway.address().port;
  return await new Promise<{status:number;headers:any;body:string}>((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path,method:options.method??'GET',headers:{host,authorization:access,...(payload?{'content-type':'application/json','content-length':Buffer.byteLength(payload)}:{}),...options.headers}},res=>{let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body}));});req.on('error',reject);req.end(payload);
  });
}
function values(){return {RENDER:'true',RENDER_EXTERNAL_HOSTNAME:'commit-staging.onrender.com',PORT:'10000',NODE_ENV:'production',COMMIT_STAGING:'true',DATABASE_PATH:configuration.DATABASE,AI_MODE:'openai',PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CLIENT_ID:'synthetic-id',PAYPAL_CLIENT_SECRET:'synthetic-secret',OPENAI_API_KEY:'synthetic-key',AG_STUDIO_LICENSE_KEY:'synthetic-license'};}

test('Render config derives one authoritative HTTPS origin with only four application secrets',()=>{
  const env=values(),config=configuration.renderConfig(env);assert.equal(config.bind,'0.0.0.0');assert.equal(config.consumerPort,3010);assert.equal(config.merchantPort,3011);assert.equal(config.database,'/var/data/commit/staging.sqlite');
  assert.equal(config.consumerOrigin,consumer);assert.equal(config.merchantOrigin,consumer);assert.equal(config.pushEnabled,false);assert.equal(config.accessEnabled,false);assert.equal(config.shutdownMs,25000);assert.equal(config.childEnv.WEB_PUSH_ENABLED,'false');assert.equal(config.childEnv.WEB_PUSH_VAPID_PRIVATE_KEY,undefined);
  assert.equal(configuration.renderConfig({...env,PUBLIC_CONSUMER_ORIGIN:'https://forged.invalid',PUBLIC_MERCHANT_ORIGIN:'https://merchant.invalid'}).consumerOrigin,consumer);
  for(const patch of [{RENDER:'false'},{DATABASE_PATH:'data/phase-6.sqlite'},{PRODUCT_DATABASE_PATH:'data/phase-6-1a/product.sqlite'},{PAYPAL_ENVIRONMENT:'live'},{RENDER_EXTERNAL_HOSTNAME:undefined},{RENDER_EXTERNAL_HOSTNAME:'custom-domain.org'},{RENDER_EXTERNAL_HOSTNAME:'commit-staging.onrender.com/merchant'},{RENDER_EXTERNAL_HOSTNAME:'user@commit-staging.onrender.com'},{PORT:'3010'},{STAGING_ACCESS_ENABLED:'true'},{WEB_PUSH_ENABLED:'true'},{WEB_PUSH_ENABLED:'yes'},{AI_MODE:'offline-demo'},{ENABLE_SANDBOX_SAGA_NEGATIVE_TEST:'true'}])assert.throws(()=>configuration.renderConfig({...env,...patch}));
});

test('push and access gate require complete credentials only when explicitly enabled',()=>{
  const env=values(),ec=createECDH('prime256v1');ec.generateKeys();
  const push={WEB_PUSH_ENABLED:'true',WEB_PUSH_CONTACT:'mailto:operations@commit-demo.org',WEB_PUSH_VAPID_PUBLIC_KEY:ec.getPublicKey().toString('base64url'),WEB_PUSH_VAPID_PRIVATE_KEY:ec.getPrivateKey().toString('base64url')};
  const enabled=configuration.renderConfig({...env,...push,STAGING_ACCESS_ENABLED:'true',STAGING_ACCESS_USERNAME:credentials.accessUser,STAGING_ACCESS_PASSWORD:credentials.accessPassword});assert.equal(enabled.pushEnabled,true);assert.equal(enabled.accessEnabled,true);assert.equal(enabled.childEnv.WEB_PUSH_VAPID_PUBLIC_KEY,push.WEB_PUSH_VAPID_PUBLIC_KEY);
  assert.throws(()=>configuration.renderConfig({...env,...push,WEB_PUSH_VAPID_PRIVATE_KEY:'mismatch'}));assert.throws(()=>configuration.renderConfig({...env,STAGING_ACCESS_ENABLED:'true',STAGING_ACCESS_USERNAME:'reviewer',STAGING_ACCESS_PASSWORD:'short'}));
  const disabled=configuration.renderConfig({...env,...push,WEB_PUSH_ENABLED:'false'});assert.equal(disabled.childEnv.WEB_PUSH_VAPID_PRIVATE_KEY,undefined);assert.equal(disabled.childEnv.WEB_PUSH_CONTACT,undefined);
});

test('path routing has fixed surface boundaries and rejects normalization ambiguity',()=>{
  assert.deepEqual(publicRoute('/merchant?surface=consumer'),{surface:'merchant',path:'/merchant/group-demand?surface=consumer'});
  assert.equal(publicRoute('/api/group?surface=merchant&port=3011').surface,'consumer');assert.equal(publicRoute('/api/merchant/simulate?surface=consumer').surface,'merchant');assert.equal(publicRoute('/merchantish').surface,'consumer');
  for(const path of ['//evil.com/merchant','https://evil.com/merchant','/merchant/../api/group','/api/merchant/%2e%2e/group','/api%2fmerchant/session','/merchant\\group-demand','/group#merchant'])assert.throws(()=>publicRoute(path),path);
});

test('all consumer routes and real merchant bootstrap/assets load publicly on the Render hostname',async()=>{
  const f=await start();try{const host=new URL(consumer).host;
    for(const path of ['/','/group','/proposal','/activity','/you','/commit','/waiting','/start','/join','/replay','/demo','/commit/return','/commit/cancel','/merchant','/merchant/','/merchant/group-demand']){const reply=await get(f.runtime,host,path,{headers:{authorization:''}});assert.equal(reply.status,200,path);assert.match(reply.headers['content-type'],/text\/html/);assert.equal(reply.headers['www-authenticate'],undefined);assert.equal(reply.headers['set-cookie'],undefined);}
    const page=await get(f.runtime,host,'/merchant');assert.match(page.body,/id="merchant-root"/);assert.match(page.body,/src="\/merchant.js"/);assert.match(page.body,/href="\/merchant.css"/);
    const script=await get(f.runtime,host,'/merchant.js');assert.equal(script.status,200);assert.match(script.headers['content-type'],/javascript/);assert.ok(script.body.length>100000);assert.match(script.body,/simulate_group_offer/);assert.match(script.body,/draft_group_offer/);
    for(const path of ['/merchant.css','/app.js','/styles.css','/manifest.webmanifest','/sw.js','/offline.html','/icons/commit-192.png'])assert.equal((await get(f.runtime,host,path)).status,200,path);
    const manifest=JSON.parse((await get(f.runtime,host,'/manifest.webmanifest')).body);assert.equal(manifest.start_url,'/group');assert.equal(manifest.display,'standalone');assert.equal((await get(f.runtime,host,'/sw.js')).headers['service-worker-allowed'],'/');
    assert.equal((await get(f.runtime,host,'/api%2fmerchant/session')).status,400);
  }finally{await f.runtime.stop();}
});

test('optional Basic gate protects business routes only when explicitly enabled',async()=>{
  const f=await start({accessEnabled:true});try{const host=new URL(consumer).host;assert.equal((await get(f.runtime,host,'/group',{headers:{authorization:''}})).status,401);assert.equal((await get(f.runtime,host,'/merchant',{headers:{authorization:''}})).status,401);assert.equal((await get(f.runtime,host,'/health',{headers:{authorization:''}})).status,200);assert.equal((await get(f.runtime,host,'/merchant')).status,200);}finally{await f.runtime.stop();}
});

test('same-origin cookies and CSRF remain separate capabilities; navigation grants no merchant session',async()=>{
  const f=await start();try{const host=new URL(consumer).host,cs=await get(f.runtime,host,'/api/session'),cc=cs.headers['set-cookie'][0].split(';')[0],consumerCsrf=JSON.parse(cs.body).csrfToken;
    assert.equal((await get(f.runtime,host,'/merchant',{headers:{cookie:cc}})).headers['set-cookie'],undefined);
    for(const path of ['/api/merchant/demand','/api/merchant/offers','/api/merchant/policy'])assert.equal((await get(f.runtime,host,path,{headers:{cookie:cc}})).status,401);
    assert.equal((await get(f.runtime,host,'/api/merchant/offers/publish?surface=consumer',{method:'POST',body:{},headers:{cookie:cc,origin:consumer,'x-csrf-token':consumerCsrf}})).status,401);
    const ms=await get(f.runtime,host,'/api/merchant/session',{headers:{cookie:cc}}),mc=ms.headers['set-cookie'][0].split(';')[0],merchantCsrf=JSON.parse(ms.body).csrf;assert.notEqual(cc.split('=')[1],mc.split('=')[1]);assert.notEqual(consumerCsrf,merchantCsrf);
    assert.equal((await get(f.runtime,host,'/api/demo',{method:'POST',body:{},headers:{cookie:mc,origin:consumer,'x-csrf-token':merchantCsrf}})).status,401);
    const both=cc+'; '+mc;assert.equal((await get(f.runtime,host,'/api/demo',{method:'POST',body:{},headers:{cookie:both,origin:consumer,'x-csrf-token':consumerCsrf}})).status,200);
    assert.equal((await get(f.runtime,host,'/api/group?surface=merchant',{headers:{cookie:both}})).status,200);
    const demand=await get(f.runtime,host,'/api/merchant/demand',{headers:{cookie:both}});assert.equal(demand.status,200);assert.doesNotMatch(demand.body,/parsed_json|paypal_order_id|csrfToken/);
    const args={discountPercent:8,minimumGroupSize:4};
    assert.equal((await get(f.runtime,host,'/api/merchant/simulate',{method:'POST',body:args,headers:{cookie:both,origin:consumer,'x-csrf-token':consumerCsrf}})).status,403);
    assert.equal((await get(f.runtime,host,'/api/merchant/simulate',{method:'POST',body:args,headers:{cookie:both,origin:'https://evil.onrender.com','x-csrf-token':merchantCsrf}})).status,403);
    const simulation=await get(f.runtime,host,'/api/merchant/simulate',{method:'POST',body:args,headers:{cookie:both,origin:merchant,'x-csrf-token':merchantCsrf}});assert.equal(simulation.status,200);assert.equal(JSON.parse(simulation.body).accepted,true);
    assert.equal((await get(f.runtime,host,'/api/group',{headers:{cookie:cc+'; '+cc}})).status,400);
    const db=new DatabaseSync(f.config.database,{readOnly:true});try{assert.equal((db.prepare('SELECT COUNT(*) AS n FROM merchant_offers').get() as any).n,0);assert.equal((db.prepare('SELECT COUNT(*) AS n FROM commitments WHERE paypal_order_id IS NOT NULL').get() as any).n,0);}finally{db.close();}
  }finally{await f.runtime.stop();}
});

test('push-off startup preserves Activity and reports notifications unavailable even for a saved enabled preference',async()=>{
  const f=await start();try{const host=new URL(consumer).host,s=await get(f.runtime,host,'/api/session'),headers={cookie:s.headers['set-cookie'][0].split(';')[0],origin:consumer,'x-csrf-token':JSON.parse(s.body).csrfToken};assert.equal((await get(f.runtime,host,'/api/demo',{method:'POST',body:{},headers})).status,200);
    assert.equal((await get(f.runtime,host,'/api/updates/preferences',{method:'POST',body:{pushEnabled:true,progress:true,recommendations:true},headers})).status,200);
    const prefs=JSON.parse((await get(f.runtime,host,'/api/updates',{headers})).body);assert.equal(prefs.pushConfigured,false);assert.equal(prefs.pushEnabled,false);assert.equal(prefs.publicKey,null);
    assert.equal((await get(f.runtime,host,'/api/updates/subscribe',{method:'POST',body:{},headers})).status,503);assert.equal((await get(f.runtime,host,'/api/activity',{headers})).status,200);
  }finally{await f.runtime.stop();}
});

test('disabled delivery retains Activity and original push consent without constructing a sender',async()=>{
  const db=new ProductDatabase(':memory:');try{const service=new ProductService(db,new OfflineDemoProvider(),'offline-demo'),session=db.createSession();service.create(session,'Optional push','Plan a ski weekend.',true);const groupId=db.session(session.id)!.group_id!,communication=new RenderCommunicationService(db,{publicKey:'ignored',privateKey:'ignored',contact:'ignored'},false);
    communication.setPreferences(session,{pushEnabled:true,progress:true,recommendations:true});db.run('INSERT INTO push_subscriptions VALUES(?,?,?,?,?,?,?)','local-sub',groupId,'kelly','local-endpoint-hash',JSON.stringify({endpoint:'https://fcm.googleapis.com/local-fixture',keys:{p256dh:'local',auth:'local'}}),null,new Date().toISOString());
    communication.create('CONSUMER','kelly',groupId,'NEEDS_ACTION','Review your plan','Open the latest plan.','/proposal?sheet=terms','optional-push-fixture',true);
    assert.equal(communication.sender,undefined);assert.equal(await communication.deliver(),0);assert.equal(communication.list(session).items.length,1);assert.equal(communication.preferences(session).pushEnabled,false);assert.equal(db.get<{push_enabled:number}>('SELECT push_enabled FROM notification_preferences')!.push_enabled,1);assert.equal(db.get<{state:string}>('SELECT state FROM notification_outbox')!.state,'PENDING');
  }finally{db.close();}
});

test('frozen commitment flow generates exact consumer PayPal URLs from the derived Render origin with a fake gateway',async()=>{
  const db=new ProductDatabase(':memory:'),gateway=new OfferGateway();let input:AuthorizationOrderInput|undefined;const create=gateway.createAuthorizationOrder.bind(gateway);gateway.createAuthorizationOrder=async(id,key,value)=>{input=value;return create(id,key,value);};
  try{const payments=new CommitmentService(db,gateway,configuration.renderConfig(values()).consumerOrigin),service=new ProductService(db,new OfflineDemoProvider(),'offline-demo',payments),session=db.createSession();service.create(session,'Render URL fixture','Plan a ski weekend.',true);await service.solve(session);await payments.create(session,service.group(session).proposal!.id);
    assert.equal(input!.returnUrl,consumer+'/commit/return');assert.equal(input!.cancelUrl,consumer+'/commit/cancel');assert.equal(new URL(input!.returnUrl).origin,consumer);assert.equal(input!.amount.currencyCode,'USD');assert.equal(gateway.calls.filter(c=>['authorize','capture','void'].includes(c.op)).length,0);
  }finally{db.close();}
});
test('Render disk guard rejects traversal, alternate roots and symlinks',()=>{
  const fs={realpathSync:()=>configuration.DISK,lstatSync:()=>({isDirectory:()=>true,isSymbolicLink:()=>false})};configuration.exactDisk(configuration.DISK,fs);
  for(const path of ['/','/var/data/commit/../other','/var/lib/commit-staging','data/phase-6-1a'])assert.throws(()=>configuration.exactDisk(path,fs));
  assert.throws(()=>configuration.exactDisk(configuration.DISK,{...fs,realpathSync:()=>'/historical'}));assert.throws(()=>configuration.exactDisk(configuration.DISK,{...fs,lstatSync:()=>({isDirectory:()=>true,isSymbolicLink:()=>true})}));
});
test('VAPID generation writes a matched private pair without overwrite or stdout values',()=>{
  const dir=root(),path=join(dir,'vapid.env');assert.equal(generateVapidFile(path),path);const content=readFileSync(path,'utf8'),pair=Object.fromEntries(content.trim().split('\n').map(line=>line.split('=')));
  configuration.validateVapid(pair.WEB_PUSH_VAPID_PUBLIC_KEY,pair.WEB_PUSH_VAPID_PRIVATE_KEY);assert.throws(()=>generateVapidFile(path));assert.throws(()=>generateVapidFile('docs/not-a-secret-location.env'));
});
test('fresh staging runtime seeds fictional catalog and migrations without financial data',async()=>{
  const f=await start();try{assert.equal(f.runtime.initialization.fresh,true);assert.equal(await f.runtime.health(),true);const db=new DatabaseSync(f.config.database,{readOnly:true});try{assert.equal((db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as any).v,6);assert.ok((db.prepare('SELECT COUNT(*) AS n FROM merchant_packages').get() as any).n>0);for(const table of ['commitments','capture_sagas','push_subscriptions'])assert.equal((db.prepare('SELECT COUNT(*) AS n FROM '+table).get() as any).n,0);}finally{db.close();}assert.equal((await get(f.runtime,new URL(consumer).host,'/group')).status,200);assert.equal((await get(f.runtime,new URL(merchant).host,'/merchant/group-demand')).status,200);}finally{await f.runtime.stop();}
});
test('gateway serves the actual Render host by fixed path and ignores forged surface headers',async()=>{
  const f=await start();try{const c=new URL(consumer).host;assert.equal((await get(f.runtime,'unknown.commit-demo.org','/group',{headers:{'x-forwarded-host':c}})).status,421);assert.equal((await get(f.runtime,c,'/merchant',{headers:{'x-forwarded-host':'unknown.commit-demo.org'}})).status,200);assert.equal((await get(f.runtime,c,'/group?surface=merchant',{headers:{authorization:'','x-upstream-port':String(f.config.merchantPort)}})).status,200);assert.equal((await get(f.runtime,c,'/api/replay')).status,404);assert.equal((await get(f.runtime,c,'/merchant/api/group')).status,404);}finally{await f.runtime.stop();}
});
test('gateway preserves Secure host-only cookie separation, Origin and CSRF checks',async()=>{
  const f=await start();try{const c=new URL(consumer).host,m=new URL(merchant).host,cs=await get(f.runtime,c,'/api/session'),ms=await get(f.runtime,m,'/api/merchant/session');assert.equal(cs.status,200);assert.equal(ms.status,200);
    for(const [reply,name] of [[cs,'commit_demo_phase6'],[ms,'commit_merchant_phase6']] as const){assert.match(reply.headers['set-cookie'][0],new RegExp('^'+name+'='));assert.match(reply.headers['set-cookie'][0],/Secure/);assert.match(reply.headers['set-cookie'][0],/HttpOnly/);assert.match(reply.headers['set-cookie'][0],/SameSite=Strict/);assert.doesNotMatch(reply.headers['set-cookie'][0],/Domain=/i);}
    const cookie=cs.headers['set-cookie'][0].split(';')[0],csrf=JSON.parse(cs.body).csrfToken;
    assert.equal((await get(f.runtime,c,'/api/demo',{method:'POST',body:{},headers:{cookie,origin:'https://other.onrender.com','x-csrf-token':csrf,'x-forwarded-host':m,'x-forwarded-proto':'https'}})).status,403);
    assert.equal((await get(f.runtime,c,'/api/demo',{method:'POST',body:{},headers:{cookie,origin:consumer}})).status,403);
    assert.equal((await get(f.runtime,m,'/api/merchant/demand',{headers:{cookie}})).status,401);
    assert.equal((await get(f.runtime,c,'/api/group',{headers:{cookie:ms.headers['set-cookie'][0].split(';')[0]}})).status,401);
  }finally{await f.runtime.stop();}
});
test('gateway health probes both runtimes and SQLite without credentials or provider calls',async()=>{
  const f=await start();try{for(const host of [new URL(consumer).host,new URL(merchant).host,'commit-staging.onrender.com']){const reply=await get(f.runtime,host,'/health',{headers:{authorization:''}});assert.equal(reply.status,200);assert.deepEqual(JSON.parse(reply.body),{status:'ok'});}assert.equal((await get(f.runtime,'unknown.commit-demo.org','/health')).status,421);
    const down=createGateway(f.config,{health:async()=>false,available:()=>true});await new Promise<void>(r=>down.listen(0,'127.0.0.1',r));try{assert.equal((await get({gateway:down},new URL(consumer).host,'/health')).status,503);}finally{await new Promise<void>(r=>down.close(()=>r()));}
  }finally{await f.runtime.stop();}
});
test('restart preserves consumer session/group state and does not reseed existing rows',async()=>{
  const f=await start();let current=f.runtime;
  try{const host=new URL(consumer).host,s=await get(current,host,'/api/session'),cookie=s.headers['set-cookie'][0].split(';')[0],csrf=JSON.parse(s.body).csrfToken;
    const created=await get(current,host,'/api/demo',{method:'POST',body:{},headers:{cookie,origin:consumer,'x-csrf-token':csrf}});assert.equal(created.status,200);const before=JSON.parse((await get(current,host,'/api/group',{headers:{cookie}})).body),savedGroup=JSON.parse((await get(current,host,'/api/session',{headers:{cookie}})).body).groupId;
    await current.stop();const reopened=await startLauncher(f.config,{control:false,onEvent:()=>{}});current=reopened;assert.equal(reopened.initialization.fresh,false);const after=JSON.parse((await get(current,host,'/api/group',{headers:{cookie}})).body);assert.equal(after.name,before.name);assert.equal(after.revision,before.revision);assert.equal(after.goal,before.goal);assert.equal(JSON.parse((await get(current,host,'/api/session',{headers:{cookie}})).body).groupId,savedGroup);
    const db=new DatabaseSync(f.config.database,{readOnly:true});try{assert.equal((db.prepare('SELECT COUNT(*) AS n FROM groups').get() as any).n,1);assert.equal((db.prepare('SELECT COUNT(*) AS n FROM commitments').get() as any).n,0);}finally{db.close();}
  }finally{await current.stop();}
});
test('unexpected child exit closes gateway and sibling so no half application remains',async()=>{
  const f=await start();f.runtime.children().get('merchant').kill('SIGKILL');assert.equal(await f.runtime.closed,1);assert.equal(f.runtime.gateway.listening,false);assert.equal(f.runtime.children().size,0);assert.ok(f.events.includes('child_exit'));
});
test('graceful deployment stop closes both children, SQLite and public listener',async()=>{
  const config=databaseConfig(await fixture()),shutdown=new AbortController(),runtime=await startLauncher(config,{control:false,onEvent:()=>{},signal:shutdown.signal});shutdown.abort();assert.equal(await runtime.closed,0);assert.equal(runtime.children().size,0);assert.equal(runtime.gateway.listening,false);const db=new DatabaseSync(config.database);try{assert.equal((db.prepare('PRAGMA integrity_check').get() as any).integrity_check,'ok');}finally{db.close();}
});

test('shutdown deadline terminates an unresponsive child and preserves database integrity',async()=>{
  const f=await start(),child=f.runtime.children().get('merchant'),send=child.send.bind(child);
  child.send=(message:any,...args:any[])=>message?.type==='shutdown'?true:send(message,...args);
  const started=Date.now();await f.runtime.stop();
  assert.equal(await f.runtime.closed,0);assert.equal(child.signalCode,'SIGKILL');assert.equal(f.runtime.gateway.listening,false);assert.equal(f.runtime.children().size,0);assert.ok(Date.now()-started<10000);
  const db=new DatabaseSync(f.config.database,{readOnly:true});try{assert.equal((db.prepare('PRAGMA integrity_check').get() as any).integrity_check,'ok');assert.equal((db.prepare('SELECT COUNT(*) AS n FROM commitments').get() as any).n,0);}finally{db.close();}
});
test('protected disposable reset quiesces children, retains a private backup and restarts cleanly',async()=>{
  const f=await start();try{const host=new URL(consumer).host,s=await get(f.runtime,host,'/api/session');await get(f.runtime,host,'/api/demo',{method:'POST',body:{},headers:{cookie:s.headers['set-cookie'][0].split(';')[0],origin:consumer,'x-csrf-token':JSON.parse(s.body).csrfToken}});
    const result=await f.runtime.reset();assert.ok(result.backup.startsWith(join(f.config.root,'backups')));assert.ok(existsSync(join(result.backup,'staging.sqlite')));assert.equal(await f.runtime.health(),true);
    const db=new DatabaseSync(f.config.database,{readOnly:true});try{for(const table of ['groups','demo_sessions','commitments','push_subscriptions'])assert.equal((db.prepare('SELECT COUNT(*) AS n FROM '+table).get() as any).n,0);}finally{db.close();}
    assert.equal((await get(f.runtime,host,'/api/reset',{method:'POST',body:{}})).status,401);
  }finally{await f.runtime.stop();}
});
test('reset refuses an ambiguous payment attempt without provider cleanup or deleting the ledger',async()=>{
  const f=await start();let current=f.runtime;
  try{const host=new URL(consumer).host,s=await get(current,host,'/api/session'),headers={cookie:s.headers['set-cookie'][0].split(';')[0],origin:consumer,'x-csrf-token':JSON.parse(s.body).csrfToken};assert.equal((await get(current,host,'/api/demo',{method:'POST',body:{},headers})).status,200);assert.equal((await get(current,host,'/api/solve',{method:'POST',body:{},headers})).status,200);await get(current,host,'/api/group',{headers});await current.stop();
    const db=new DatabaseSync(f.config.database);try{assert.ok((db.prepare('SELECT COUNT(*) AS n FROM commitments').get() as any).n>0);db.prepare("UPDATE commitments SET pending_operation='create',create_attempt_at='2026-10-05T00:00:00Z' WHERE id=(SELECT id FROM commitments LIMIT 1)").run();}finally{db.close();}
    assert.throws(()=>resetDatabase(f.config),/financial ledger/);assert.ok(existsSync(f.config.database));current=await startLauncher(f.config,{control:false,onEvent:()=>{}});await assert.rejects(current.reset());assert.equal(await current.health(),true);
  }finally{await current.stop();}
});
test('Render blueprint declares only one paid Node web service/disk with operator-supplied secrets',()=>{
  const yaml=readFileSync('render.yaml','utf8');assert.equal((yaml.match(/^  - type: web$/gm)||[]).length,1);assert.match(yaml,/numInstances: 1/);assert.match(yaml,/plan: 1c-2g/);assert.match(yaml,/mountPath: \/var\/data\/commit/);assert.match(yaml,/healthCheckPath: \/health/);assert.doesNotMatch(yaml,/^\s*maxShutdownDelaySeconds:/m,'Render rejects custom shutdown delay with a disk');assert.match(yaml,/autoDeployTrigger: 'off'/);assert.doesNotMatch(yaml,/^\s+(?:domains|preDeployCommand|scaling):/m);for(const key of ['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','OPENAI_API_KEY','AG_STUDIO_LICENSE_KEY'])assert.match(yaml,new RegExp('key: '+key+'\\s+sync: false'));assert.equal((yaml.match(/sync: false/g)||[]).length,4);assert.doesNotMatch(yaml,/key: (?:PUBLIC_CONSUMER_ORIGIN|PUBLIC_MERCHANT_ORIGIN|WEB_PUSH_VAPID|WEB_PUSH_CONTACT|STAGING_ACCESS_USERNAME|STAGING_ACCESS_PASSWORD|PAYPAL_MERCHANT_ID)/);assert.match(yaml,/key: WEB_PUSH_ENABLED\s+value: 'false'/);assert.match(yaml,/key: STAGING_ACCESS_ENABLED\s+value: 'false'/);
});
