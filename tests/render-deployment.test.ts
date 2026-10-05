import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {mkdirSync,mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createECDH} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const configuration=await import(new URL('../deploy/render/config.mjs',import.meta.url).href);
const {startLauncher}=await import(new URL('../deploy/render/launcher.mjs',import.meta.url).href);
const {resetDatabase}=await import(new URL('../deploy/render/storage.mjs',import.meta.url).href);
const {createGateway}=await import(new URL('../deploy/render/gateway.mjs',import.meta.url).href);
const {generateVapidFile}=await import(new URL('../deploy/render/generate-vapid.mjs',import.meta.url).href);
const consumer='https://consumer.commit-demo.org',merchant='https://merchant.commit-demo.org';
const credentials={accessUser:'reviewer',accessPassword:'synthetic-test-access-password'};
const access='Basic '+Buffer.from(credentials.accessUser+':'+credentials.accessPassword).toString('base64');
function root(){mkdirSync('.staging',{recursive:true});return mkdtempSync(resolve('.staging/render-local-'));}
async function freePort(){const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;await new Promise<void>(r=>server.close(()=>r()));return port;}
async function fixture(){return {root:root(),port:0,bind:'127.0.0.1',consumerOrigin:consumer,merchantOrigin:merchant,consumerPort:await freePort(),merchantPort:await freePort(),platformHost:'commit-staging.onrender.com',...credentials,childEnv:{},aiMode:'offline-demo',localVerification:true,shutdownMs:1500};}
function databaseConfig(config:any){return {...config,database:join(config.root,'staging.sqlite')};}
async function start(){const config=databaseConfig(await fixture()),events:string[]=[];return {config,events,runtime:await startLauncher(config,{control:false,onEvent:(event:string)=>events.push(event)})};}
async function get(runtime:any,host:string,path:string,options:{method?:string;headers?:Record<string,string>;body?:unknown}={}){
  const payload=options.body===undefined?undefined:JSON.stringify(options.body),port=runtime.gateway.address().port;
  return await new Promise<{status:number;headers:any;body:string}>((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path,method:options.method??'GET',headers:{host,authorization:access,...(payload?{'content-type':'application/json','content-length':Buffer.byteLength(payload)}:{}),...options.headers}},res=>{let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body}));});req.on('error',reject);req.end(payload);
  });
}
function values(){const ec=createECDH('prime256v1');ec.generateKeys();return {RENDER:'true',PORT:'10000',NODE_ENV:'production',COMMIT_STAGING:'true',DATABASE_PATH:configuration.DATABASE,AI_MODE:'openai',PUBLIC_CONSUMER_ORIGIN:consumer,PUBLIC_MERCHANT_ORIGIN:merchant,PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CLIENT_ID:'synthetic-id',PAYPAL_CLIENT_SECRET:'synthetic-secret',OPENAI_API_KEY:'synthetic-key',AG_STUDIO_LICENSE_KEY:'synthetic-license',WEB_PUSH_CONTACT:'mailto:operations@commit-demo.org',WEB_PUSH_VAPID_PUBLIC_KEY:ec.getPublicKey().toString('base64url'),WEB_PUSH_VAPID_PRIVATE_KEY:ec.getPrivateKey().toString('base64url'),STAGING_ACCESS_USERNAME:credentials.accessUser,STAGING_ACCESS_PASSWORD:credentials.accessPassword};}

test('Render config uses exact HTTPS origins, one disk, loopback children and Sandbox only',()=>{
  const env=values(),config=configuration.renderConfig(env);assert.equal(config.bind,'0.0.0.0');assert.equal(config.consumerPort,3010);assert.equal(config.merchantPort,3011);assert.equal(config.database,'/var/data/commit/staging.sqlite');
  for(const patch of [{RENDER:'false'},{DATABASE_PATH:'data/phase-6.sqlite'},{PRODUCT_DATABASE_PATH:'data/phase-6-1a/product.sqlite'},{PAYPAL_ENVIRONMENT:'live'},{PUBLIC_CONSUMER_ORIGIN:'http://consumer.commit-demo.org'},{PUBLIC_MERCHANT_ORIGIN:consumer},{PUBLIC_CONSUMER_ORIGIN:'https://user:pass@consumer.commit-demo.org'},{PUBLIC_CONSUMER_ORIGIN:'https://localhost'},{PORT:'3010'},{STAGING_ACCESS_PASSWORD:'short'},{WEB_PUSH_VAPID_PRIVATE_KEY:'mismatch'},{AI_MODE:'offline-demo'},{ENABLE_SANDBOX_SAGA_NEGATIVE_TEST:'true'}])assert.throws(()=>configuration.renderConfig({...env,...patch}));
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
test('gateway ignores forged forwarded hosts and blocks unknown host/API crossover',async()=>{
  const f=await start();try{const c=new URL(consumer).host,m=new URL(merchant).host;assert.equal((await get(f.runtime,'unknown.commit-demo.org','/group',{headers:{'x-forwarded-host':c}})).status,421);assert.equal((await get(f.runtime,c,'/merchant/group-demand',{headers:{'x-forwarded-host':m}})).status,404);assert.equal((await get(f.runtime,m,'/group',{headers:{'x-forwarded-host':c}})).status,404);assert.equal((await get(f.runtime,'commit-staging.onrender.com','/group')).status,421);assert.equal((await get(f.runtime,c,'/group',{headers:{authorization:''}})).status,401);assert.equal((await get(f.runtime,c,'/api/replay')).status,404);}finally{await f.runtime.stop();}
});
test('gateway preserves Secure host-only cookie separation, Origin and CSRF checks',async()=>{
  const f=await start();try{const c=new URL(consumer).host,m=new URL(merchant).host,cs=await get(f.runtime,c,'/api/session'),ms=await get(f.runtime,m,'/api/merchant/session');assert.equal(cs.status,200);assert.equal(ms.status,200);
    for(const [reply,name] of [[cs,'commit_demo_phase6'],[ms,'commit_merchant_phase6']] as const){assert.match(reply.headers['set-cookie'][0],new RegExp('^'+name+'='));assert.match(reply.headers['set-cookie'][0],/Secure/);assert.match(reply.headers['set-cookie'][0],/HttpOnly/);assert.match(reply.headers['set-cookie'][0],/SameSite=Strict/);assert.doesNotMatch(reply.headers['set-cookie'][0],/Domain=/i);}
    const cookie=cs.headers['set-cookie'][0].split(';')[0],csrf=JSON.parse(cs.body).csrfToken;
    assert.equal((await get(f.runtime,c,'/api/demo',{method:'POST',body:{},headers:{cookie,origin:merchant,'x-csrf-token':csrf,'x-forwarded-host':m,'x-forwarded-proto':'https'}})).status,403);
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
  const yaml=readFileSync('render.yaml','utf8');assert.equal((yaml.match(/^  - type: web$/gm)||[]).length,1);assert.match(yaml,/numInstances: 1/);assert.match(yaml,/plan: 1c-2g/);assert.match(yaml,/mountPath: \/var\/data\/commit/);assert.match(yaml,/healthCheckPath: \/health/);assert.doesNotMatch(yaml,/^\s*maxShutdownDelaySeconds:/m,'Render rejects custom shutdown delay with a disk');assert.match(yaml,/autoDeployTrigger: 'off'/);assert.doesNotMatch(yaml,/^\s+(?:domains|preDeployCommand|scaling):/m);for(const key of ['PAYPAL_CLIENT_SECRET','OPENAI_API_KEY','AG_STUDIO_LICENSE_KEY','WEB_PUSH_VAPID_PRIVATE_KEY','STAGING_ACCESS_PASSWORD'])assert.match(yaml,new RegExp('key: '+key+'\\s+sync: false'));
});
