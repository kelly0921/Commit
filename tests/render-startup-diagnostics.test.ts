import test from 'node:test';
import assert from 'node:assert/strict';
import {fork,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdirSync,mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const configuration=await import(new URL('../deploy/render/config.mjs',import.meta.url).href);
const diagnostics=await import(new URL('../deploy/render/diagnostics.mjs',import.meta.url).href);
const {startLauncher}=await import(new URL('../deploy/render/launcher.mjs',import.meta.url).href);
const privateText='synthetic-private-value cookie=synthetic-session /private/operator/path raw-provider-response';
function values(){return {RENDER:'true',RENDER_EXTERNAL_HOSTNAME:'commit-staging.onrender.com',PORT:'10000',NODE_ENV:'production',COMMIT_STAGING:'true',DATABASE_PATH:configuration.DATABASE,AI_MODE:'openai',PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CLIENT_ID:'synthetic-id',PAYPAL_CLIENT_SECRET:'synthetic-secret',OPENAI_API_KEY:'synthetic-key',AG_STUDIO_LICENSE_KEY:'synthetic-license'};}
function record(error:unknown,stage='launcher',fallback='startup_failed'){const result=diagnostics.startupFailureRecord(error,stage,fallback);assert.deepEqual(Object.keys(result),['event','stage','reason']);assert.doesNotMatch(JSON.stringify(result),/synthetic-private|synthetic-session|\/private\/|raw-provider|stack|cause|message/);return result;}
async function listening(){const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));return {server,port:(server.address() as {port:number}).port};}
async function freePort(){const listener=await listening();await new Promise<void>(r=>listener.server.close(()=>r()));return listener.port;}
async function fixture(){mkdirSync('.staging',{recursive:true});const root=mkdtempSync(resolve('.staging/render-local-diagnostic-'));return {root,database:join(root,'staging.sqlite'),port:0,bind:'127.0.0.1',consumerOrigin:'https://commit-staging.onrender.com',merchantOrigin:'https://commit-staging.onrender.com',consumerPort:await freePort(),merchantPort:await freePort(),platformHost:'commit-staging.onrender.com',accessEnabled:false,pushEnabled:false,childEnv:{WEB_PUSH_ENABLED:'false'},aiMode:'offline-demo',localVerification:true,shutdownMs:1500};}

test('startup records discard raw exceptions, provider bodies and forged diagnostic labels',()=>{
  const error=Object.assign(new Error(privateText),{stage:privateText,reason:privateText,cause:{response:privateText},stack:privateText});
  assert.deepEqual(record(error,privateText,privateText),{event:'render_start_failed',stage:'launcher',reason:'startup_failed'});
  assert.deepEqual(record(new diagnostics.StartupFailure(privateText,privateText)),{event:'render_start_failed',stage:'launcher',reason:'startup_failed'});
  assert.deepEqual(record({get code(){throw Error(privateText);}},'database','database_initialization_failed'),{event:'render_start_failed',stage:'database',reason:'database_initialization_failed'});
});

test('configuration diagnoses distinct rejected requirements without printing environment values',()=>{
  const cases:[Record<string,unknown>,string][]=[
    [{PAYPAL_CLIENT_SECRET:''},'missing_required_env'],[{RENDER:'false'},'invalid_render_environment'],[{NODE_ENV:'development'},'invalid_node_environment'],[{COMMIT_STAGING:'false'},'invalid_staging_mode'],[{PAYPAL_ENVIRONMENT:'live'},'non_sandbox_payment_environment'],[{AI_MODE:'offline-demo'},'invalid_ai_mode'],[{DATABASE_PATH:privateText},'invalid_database_path'],[{RENDER_EXTERNAL_HOSTNAME:privateText},'invalid_render_hostname'],[{PORT:privateText},'invalid_port'],[{WEB_PUSH_ENABLED:privateText},'invalid_capability_flag'],[{STAGING_ACCESS_ENABLED:'true'},'invalid_access_user'],[{WEB_PUSH_ENABLED:'true'},'invalid_push_contact']
  ];
  for(const [patch,reason] of cases){let failure:unknown;try{configuration.renderConfig({...values(),...patch});}catch(error){failure=error;}assert.ok(failure);assert.deepEqual(record(failure),{event:'render_start_failed',stage:'config',reason});}
  assert.equal(configuration.renderConfig(values()).consumerOrigin,'https://commit-staging.onrender.com');
});

test('real launcher CLI emits only a safe configuration failure and exits one',()=>{
  const env={...process.env,...values(),PAYPAL_CLIENT_SECRET:'',OPENAI_API_KEY:privateText};
  const result=spawnSync(process.execPath,['deploy/render/launcher.mjs'],{env,encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);assert.equal(result.stderr,'');assert.deepEqual(JSON.parse(result.stdout.trim()),{event:'render_start_failed',stage:'config',reason:'missing_required_env'});assert.doesNotMatch(result.stdout,/synthetic-private|synthetic-session|\/private\//);
});

test('OS and SQLite diagnostics use codes only, including extended SQLite error codes',()=>{
  for(const [code,reason] of [['EACCES','permission_denied'],['ENOENT','resource_missing'],['ENOSPC','disk_full'],['EROFS','read_only_filesystem'],['EADDRINUSE','address_in_use'],['ERR_MODULE_NOT_FOUND','module_missing']])assert.equal(record(Object.assign(new Error(privateText),{code}),'storage').reason,reason);
  for(const [errcode,reason] of [[5,'sqlite_busy'],[11,'sqlite_corrupt'],[14,'sqlite_open_failed'],[26,'sqlite_not_database'],[2067,'sqlite_constraint_failed']] as const)assert.equal(record({code:'ERR_SQLITE_ERROR',errcode,message:privateText},'database').reason,reason);
  assert.equal(record({code:privateText},'storage','storage_prepare_failed').reason,'storage_prepare_failed');
});

test('child IPC accepts only the correct runtime and finite diagnostic labels',()=>{
  assert.deepEqual(record(diagnostics.childStartupFailure('consumer',{type:'failed',stage:'consumer_listen',reason:'address_in_use',message:privateText,stack:privateText})),{event:'render_start_failed',stage:'consumer_listen',reason:'address_in_use'});
  for(const message of [{stage:privateText,reason:privateText},{stage:'merchant_services',reason:'runtime_initialization_failed'},{stage:'consumer_services',reason:privateText},{}])assert.deepEqual(record(diagnostics.childStartupFailure('consumer',message)),{event:'render_start_failed',stage:'consumer',reason:'runtime_start_failed'});
});

test('real storage preparation failure retains its stage without disclosing paths',async()=>{
  const config=await fixture();writeFileSync(join(config.root,'runtime'),privateText);
  await assert.rejects(startLauncher(config,{control:false,onEvent:()=>{}}),(error:unknown)=>{const result=record(error);assert.equal(result.stage,'storage');assert.equal(result.reason,'storage_prepare_failed');return true;});
  const fs={realpathSync:()=>{throw Object.assign(new Error(privateText),{code:'EACCES'});}};
  assert.throws(()=>diagnostics.startupStep('storage',()=>configuration.exactDisk(configuration.DISK,fs),'storage_prepare_failed'),(error:unknown)=>{assert.deepEqual(record(error),{event:'render_start_failed',stage:'storage',reason:'permission_denied'});return true;});
});

test('real invalid SQLite file is diagnosed without deleting or printing its contents',async()=>{
  const config=await fixture();writeFileSync(config.database,privateText);
  await assert.rejects(startLauncher(config,{control:false,onEvent:()=>{}}),(error:unknown)=>{const result=record(error);assert.equal(result.stage,'database');assert.equal(result.reason,'sqlite_not_database');return true;});
});

test('real gateway address collision is diagnosed before runtime startup',async()=>{
  const occupied=await listening();try{const config={...await fixture(),port:occupied.port};await assert.rejects(startLauncher(config,{control:false,onEvent:()=>{}}),(error:unknown)=>{assert.deepEqual(record(error),{event:'render_start_failed',stage:'gateway',reason:'address_in_use'});return true;});}finally{await new Promise<void>(r=>occupied.server.close(()=>r()));}
});

test('real consumer listen failure arrives through sanitized child IPC',async()=>{
  const occupied=await listening();try{const config={...await fixture(),consumerPort:occupied.port};await assert.rejects(startLauncher(config,{control:false,onEvent:()=>{}}),(error:unknown)=>{assert.deepEqual(record(error),{event:'render_start_failed',stage:'consumer_listen',reason:'address_in_use'});return true;});}finally{await new Promise<void>(r=>occupied.server.close(()=>r()));}
});

test('real merchant listen failure retains its own stage and shuts down the sibling',async()=>{
  const occupied=await listening();try{const config={...await fixture(),merchantPort:occupied.port};await assert.rejects(startLauncher(config,{control:false,onEvent:()=>{}}),(error:unknown)=>{assert.deepEqual(record(error),{event:'render_start_failed',stage:'merchant_listen',reason:'address_in_use'});return true;});}finally{await new Promise<void>(r=>occupied.server.close(()=>r()));}
});

test('startup shutdown exits cleanly in either IPC ordering without financial state',async()=>{
  const config=await fixture(),messages:any[]=[];
  const child=fork(resolve('deploy/render/child.mjs'),['consumer'],{env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_ENV:'production',AI_MODE:'offline-demo',PAYPAL_ENVIRONMENT:'sandbox',PRODUCT_DATABASE_PATH:config.database,PUBLIC_CONSUMER_ORIGIN:config.consumerOrigin,PRODUCT_PORT:'0',WEB_PUSH_ENABLED:'false'},execArgv:[],stdio:['ignore','ignore','ignore','ipc']});
  child.on('message',message=>messages.push(message));
  const result=new Promise<number|null>(r=>child.once('exit',code=>r(code)));
  child.send({type:'shutdown'});
  const deadline=setTimeout(()=>child.kill('SIGKILL'),15000);
  try{
    assert.equal(await result,0);assert.ok(messages.some(message=>message?.type==='stopped'));
    const stopped=messages.findIndex(message=>message?.type==='stopped');assert.ok(!messages.slice(stopped+1).some(message=>message?.type==='ready'));
    if(existsSync(config.database)){const db=new DatabaseSync(config.database,{readOnly:true});try{for(const table of ['groups','commitments','capture_sagas','payment_events'])assert.equal((db.prepare('SELECT COUNT(*) AS n FROM '+table).get() as {n:number}).n,0);}finally{db.close();}}
  }finally{clearTimeout(deadline);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
});
